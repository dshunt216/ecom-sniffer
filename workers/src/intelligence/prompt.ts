/**
 * Claude prompt for daily intelligence briefing.
 * This is the core of the product — not just summaries, but seller-focused intelligence.
 */

export const SYSTEM_PROMPT = `You are a senior ecommerce intelligence analyst who has sold on Amazon, Walmart, and Shopify for 10+ years. You work for a wholesale supply company called USA Wholesale Supplies that sells across all three platforms.

Your job is to analyze today's posts from seller communities, social media, and news sources, then brief the team on what matters. You think like a seller, not a journalist. You care about:

- Policy changes that affect how we list, price, or ship
- Fee changes that affect our margins
- Platform outages or bugs affecting operations
- New programs, features, or tools we should adopt
- Enforcement actions, account suspensions, or compliance risks
- Supply chain disruptions, tariff changes, or logistics shifts
- Competitor trends and market shifts
- Community sentiment and emerging frustrations

Be specific. Don't say "sellers should monitor this" — say what WE should do. Give us the "so what" on every topic.`;

export function buildAnalysisPrompt(clusters: Array<{ topic: string; posts: Array<{ title: string; body: string; source: string; engagement: number }> }>) {
  const clusterText = clusters.map((c, i) => {
    const postSummaries = c.posts.slice(0, 10).map((p) =>
      `  - [${p.source}] ${p.title || "(no title)"}: ${p.body?.slice(0, 200) || "(no body)"}` +
      (p.engagement > 0 ? ` (${p.engagement} engagement)` : "")
    ).join("\n");

    return `CLUSTER ${i + 1}: "${c.topic}" (${c.posts.length} posts)\n${postSummaries}`;
  }).join("\n\n");

  return `Here are today's ${clusters.reduce((sum, c) => sum + c.posts.length, 0)} posts from seller communities, grouped into ${clusters.length} topic clusters:

${clusterText}

For EACH cluster, provide:
1. TOPIC: A clear, concise name for this topic (5-10 words)
2. SUMMARY: What is happening? (2-3 sentences)
3. IMPACT_ASSESSMENT: What does this mean for Amazon/Walmart/Shopify sellers like us? Be specific about operations, margins, compliance, or strategy.
4. SEVERITY: "high" (change operations now), "medium" (watch closely), or "low" (informational)
5. CONFIDENCE: 0.0 to 1.0 — how confident are you?
   - 0.9+: Multiple credible sources confirm; concrete evidence
   - 0.7-0.89: Strong signals from 2+ sources, some detail gaps
   - 0.5-0.69: Single source or speculation-heavy; may be early signal
   - <0.5: Rumors, unverified claims, or too little data
6. TREND: "emerging" (just appeared), "growing" (gaining traction), "stable" (ongoing), "declining" (fading)
7. RECOMMENDATION: One concrete action or decision for the team
8. POST_COUNT: How many posts in this cluster

Also pick the single most important cluster as the HERO — the one thing the team must read today.

Return ONLY valid JSON matching this exact schema:
{
  "hero_index": 0,
  "hero_summary": "string — 2-3 sentence briefing for the hero topic, written for sellers",
  "insights": [
    {
      "topic": "string",
      "summary": "string",
      "impact_assessment": "string",
      "severity": "high|medium|low",
      "confidence": 0.0,
      "trend": "emerging|growing|stable|declining",
      "recommendation": "string",
      "post_count": 0
    }
  ]
}`;
}
