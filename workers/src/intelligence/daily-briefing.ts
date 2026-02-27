import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { clusterPosts } from "./cluster";
import { SYSTEM_PROMPT, buildAnalysisPrompt } from "./prompt";

const MAX_POSTS_TO_CLAUDE = 300;

/**
 * Run the daily intelligence briefing.
 * Pulls posts from the last 24h, clusters them, sends to Claude, saves the result.
 *
 * Includes retry logic with exponential backoff.
 */
export async function runDailyBriefing() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

  const today = new Date().toISOString().split("T")[0];
  console.log(`[Briefing] Starting daily briefing for ${today}`);

  // Check if briefing already exists for today
  const { data: existing } = await supabase
    .from("briefings")
    .select("id")
    .eq("date", today)
    .single();

  if (existing) {
    console.log(`[Briefing] Briefing already exists for ${today}, skipping.`);
    return;
  }

  // Fetch posts from the last 24 hours
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: posts, error: postsError } = await supabase
    .from("posts")
    .select("id, title, body, source_id, metadata, matched_keywords, sources(name)")
    .is("deleted_at", null)
    .gte("fetched_at", oneDayAgo)
    .order("fetched_at", { ascending: false });

  if (postsError || !posts || posts.length === 0) {
    console.log(`[Briefing] No posts found for the last 24h. Skipping.`);
    return;
  }

  console.log(`[Briefing] Found ${posts.length} posts from the last 24 hours`);

  // Prepare posts for clustering
  const clusterablePosts = posts.map((p: any) => ({
    id: p.id,
    title: p.title,
    body: p.body?.slice(0, 200) || null, // Token budget: only first 200 chars
    source_name: p.sources?.name || "Unknown",
    engagement: (p.metadata?.score || 0) + (p.metadata?.like_count || 0) + (p.metadata?.num_comments || 0),
    matched_keywords: p.matched_keywords || [],
  }));

  // If too many posts, keep only the most engaging ones
  let postsForClaude = clusterablePosts;
  if (postsForClaude.length > MAX_POSTS_TO_CLAUDE) {
    postsForClaude = clusterablePosts
      .sort((a, b) => b.engagement - a.engagement)
      .slice(0, MAX_POSTS_TO_CLAUDE);
    console.log(`[Briefing] Capped to top ${MAX_POSTS_TO_CLAUDE} posts by engagement`);
  }

  // Cluster posts
  const clusters = clusterPosts(postsForClaude);
  console.log(`[Briefing] Created ${clusters.length} clusters`);

  if (clusters.length === 0) {
    console.log(`[Briefing] No clusters formed. Skipping.`);
    return;
  }

  // Send to Claude with retry logic
  let claudeResponse: any = null;
  let tokensUsed = 0;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      console.log(`[Briefing] Sending to Claude (attempt ${attempt + 1})...`);

      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: buildAnalysisPrompt(clusters) }],
      });

      tokensUsed = (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0);

      // Extract JSON from response
      const textContent = response.content.find((c) => c.type === "text");
      if (!textContent || textContent.type !== "text") throw new Error("No text in Claude response");

      // Parse JSON — handle possible markdown code blocks
      let jsonStr = textContent.text.trim();
      if (jsonStr.startsWith("```")) {
        jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
      }

      claudeResponse = JSON.parse(jsonStr);
      break; // Success
    } catch (err: any) {
      console.error(`[Briefing] Attempt ${attempt + 1} failed:`, err.message);
      if (attempt < 2) {
        const backoff = Math.pow(2, attempt) * 5000; // 5s, 10s
        console.log(`[Briefing] Retrying in ${backoff / 1000}s...`);
        await new Promise((r) => setTimeout(r, backoff));
      }
    }
  }

  if (!claudeResponse) {
    console.error("[Briefing] All Claude attempts failed. Writing fallback briefing.");

    // Fallback: just list the top clusters without AI analysis
    await supabase.from("briefings").insert({
      date: today,
      hero_topic: `${posts.length} posts collected — AI analysis failed`,
      hero_summary: `We collected ${posts.length} posts today but the AI analysis failed. The top discussed topics were: ${clusters.slice(0, 5).map((c) => c.topic).join(", ")}. Check the feed for details.`,
      hero_post_count: posts.length,
      hero_confidence: 0,
      insights: [],
      raw_cluster_data: clusters.slice(0, 10),
      model_used: "fallback",
      tokens_used: 0,
      schema_version: 1,
    });
    return;
  }

  // Build the briefing record
  const heroIdx = claudeResponse.hero_index || 0;
  const heroInsight = claudeResponse.insights?.[heroIdx];

  // Map sample_post_ids from cluster data
  const insightsWithPostIds = (claudeResponse.insights || []).map((insight: any, i: number) => ({
    ...insight,
    sample_post_ids: clusters[i]?.posts.slice(0, 5).map((p) => p.id) || [],
  }));

  await supabase.from("briefings").insert({
    date: today,
    hero_topic: heroInsight?.topic || claudeResponse.insights?.[0]?.topic || "Daily Briefing",
    hero_summary: claudeResponse.hero_summary || heroInsight?.summary || null,
    hero_post_count: heroInsight?.post_count || posts.length,
    hero_confidence: heroInsight?.confidence || 0,
    insights: insightsWithPostIds,
    raw_cluster_data: clusters.slice(0, 20),
    model_used: "claude-sonnet-4-5-20250929",
    tokens_used: tokensUsed,
    schema_version: 1,
  });

  console.log(`[Briefing] Saved briefing for ${today} with ${insightsWithPostIds.length} insights (${tokensUsed} tokens)`);

  // Log success
  await supabase.from("worker_logs").insert({
    worker_name: "daily-briefing",
    status: "success",
    posts_fetched: insightsWithPostIds.length,
    duration_ms: 0,
  });
}
