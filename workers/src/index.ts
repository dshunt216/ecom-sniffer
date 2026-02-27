import "dotenv/config";
import cron from "node-cron";
import { createClient } from "@supabase/supabase-js";
import { redditAdapter } from "./ingestion/reddit";
import { twitterAdapter } from "./ingestion/twitter";
import { rssAdapter } from "./ingestion/rss";
import { scraperAdapter } from "./ingestion/scraper";
import { matchKeywords } from "./ingestion/keyword-matcher";
import { normalizeUrl } from "./ingestion/types";
import { runDailyBriefing } from "./intelligence/daily-briefing";
import type { SourceAdapter, SourceConfig } from "./ingestion/types";

// ============================================================
// Setup
// ============================================================

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const ADAPTERS: Record<string, SourceAdapter> = {
  reddit: redditAdapter,
  twitter: twitterAdapter,
  rss: rssAdapter,
  scraper: scraperAdapter,
};

// ============================================================
// Ingestion runner
// ============================================================

async function runIngestion() {
  const startTime = Date.now();
  console.log(`\n[Ingestion] Starting run at ${new Date().toISOString()}`);

  // Fetch all enabled sources
  const { data: sources, error: sourcesError } = await supabase
    .from("sources")
    .select("*")
    .eq("enabled", true);

  if (sourcesError || !sources) {
    console.error("[Ingestion] Failed to fetch sources:", sourcesError);
    return;
  }

  // Fetch all keywords
  const { data: keywordsData } = await supabase.from("keywords").select("term");
  const keywords = (keywordsData || []).map((k) => k.term);

  console.log(`[Ingestion] Processing ${sources.length} sources, ${keywords.length} keywords`);

  let totalPosts = 0;

  for (const source of sources) {
    const adapter = ADAPTERS[source.type];
    if (!adapter) {
      console.warn(`[Ingestion] No adapter for source type: ${source.type}`);
      continue;
    }

    const workerStart = Date.now();
    try {
      const posts = await adapter.fetch(source as SourceConfig);
      console.log(`  [${source.name}] Fetched ${posts.length} posts`);

      if (posts.length === 0) {
        await logWorkerResult(source.name, "success", 0, Date.now() - workerStart, null);
        continue;
      }

      // Process each post
      let inserted = 0;
      for (const post of posts) {
        const matched = matchKeywords(post, keywords);
        const normUrl = normalizeUrl(post.url);

        // Check for cross-source duplicate by normalized URL
        if (normUrl) {
          const { data: existing } = await supabase
            .from("posts")
            .select("id")
            .eq("normalized_url", normUrl)
            .limit(1)
            .single();

          if (existing) {
            continue; // Skip duplicate
          }
        }

        const { error: insertError } = await supabase.from("posts").upsert(
          {
            source_id: source.id,
            external_id: post.external_id,
            title: post.title,
            body: post.body,
            author: post.author,
            url: post.url,
            normalized_url: normUrl,
            published_at: post.published_at,
            metadata: post.metadata,
            matched_keywords: matched,
          },
          { onConflict: "source_id,external_id", ignoreDuplicates: true }
        );

        if (!insertError) inserted++;
      }

      totalPosts += inserted;
      console.log(`  [${source.name}] Inserted ${inserted} new posts`);
      await logWorkerResult(source.name, "success", inserted, Date.now() - workerStart, null);
    } catch (err: any) {
      const errorMsg = adapter.getLastError() || err.message;
      console.error(`  [${source.name}] ERROR: ${errorMsg}`);
      await logWorkerResult(source.name, "error", 0, Date.now() - workerStart, errorMsg);
    }
  }

  const duration = Date.now() - startTime;
  console.log(`[Ingestion] Complete. ${totalPosts} new posts in ${duration}ms\n`);
}

async function logWorkerResult(
  workerName: string,
  status: "success" | "error",
  postsFetched: number,
  durationMs: number,
  errorMessage: string | null
) {
  await supabase.from("worker_logs").insert({
    worker_name: workerName,
    status,
    posts_fetched: postsFetched,
    duration_ms: durationMs,
    error_message: errorMessage,
  });
}

// ============================================================
// Cron schedules
// ============================================================

// Ingestion: every 30 minutes
const ingestionSchedule = process.env.CRON_SCHEDULE_INGESTION || "*/30 * * * *";
cron.schedule(ingestionSchedule, () => {
  runIngestion().catch((err) => console.error("[Cron] Ingestion failed:", err));
});

// Daily briefing: 6 AM ET = 11:00 UTC
const briefingSchedule = process.env.CRON_SCHEDULE_BRIEFING || "0 11 * * *";
cron.schedule(briefingSchedule, () => {
  runDailyBriefing().catch((err) => console.error("[Cron] Briefing failed:", err));
});

// ============================================================
// Startup
// ============================================================

console.log("=== Ecomm Sniffer Workers ===");
console.log(`Ingestion schedule: ${ingestionSchedule}`);
console.log(`Briefing schedule:  ${briefingSchedule}`);
console.log("Running initial ingestion...");

// Run ingestion immediately on startup
runIngestion().catch((err) => console.error("[Startup] Initial ingestion failed:", err));
