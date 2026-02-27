# Ecomm Sniffer — Development Plan

**Version:** 1.0
**Date:** February 27, 2026
**Author:** Daniel / USA Wholesale Supplies

---

## 1. What This App Does (Plain English)

Ecomm Sniffer is a private intelligence dashboard for your team. It pulls posts and articles from X, Reddit, Google Alerts, Amazon Seller Forums, and any source you add in the future. Once a day, Claude reads everything that came in, clusters it by topic, identifies what matters to you as an ecommerce seller, scores its confidence, and publishes a daily briefing. Your team logs in, reads the feed, reads the AI briefing, and can share any item or insight with one click.

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND                             │
│              Next.js 14 + Tailwind CSS                      │
│              Deployed on Vercel                             │
│                                                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐  │
│  │Aggregate │  │  Hero /  │  │  AI      │  │  Settings  │  │
│  │  Feed    │  │ Trending │  │ Briefing │  │  & Sources │  │
│  └──────────┘  └──────────┘  └──────────┘  └────────────┘  │
└─────────────────────┬───────────────────────────────────────┘
                      │ Supabase Client SDK
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                     SUPABASE                                │
│                                                             │
│  Auth (email/password, magic link)                          │
│  Postgres DB (posts, sources, keywords, briefings, users)   │
│  Row-Level Security (multi-user access)                     │
│  Realtime subscriptions (live feed updates)                 │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                BACKEND WORKERS (Railway)                     │
│                   Node.js Services                          │
│                                                             │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  INGESTION WORKERS (run every 30 min via cron)         │ │
│  │                                                        │ │
│  │  • Reddit Worker      (Reddit API — free tier)         │ │
│  │  • X/Twitter Worker   (TwitterAPI.io — pay per use)    │ │
│  │  • Google Alerts Worker (RSS feed polling)             │ │
│  │  • Generic RSS Worker  (any RSS/Atom feed)             │ │
│  │  • Web Scraper Worker  (Puppeteer for forums)          │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                             │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  DAILY INTELLIGENCE JOB (runs once at 6:00 AM ET)      │ │
│  │                                                        │ │
│  │  1. Pull last 24h of posts from Supabase               │ │
│  │  2. Cluster by topic (embedding similarity)            │ │
│  │  3. Send clusters to Claude Sonnet 4.5 via Batch API   │ │
│  │  4. Claude returns: insights, confidence scores,       │ │
│  │     hero topic, seller impact assessment               │ │
│  │  5. Write briefing back to Supabase                    │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Tech Stack Decisions & Rationale

| Layer | Choice | Why |
|-------|--------|-----|
| **Frontend** | Next.js 14 (App Router) + Tailwind | Fast to build, great DX, deploys to Vercel in one click |
| **Auth** | Supabase Auth | Built-in email/password + magic links, zero extra services |
| **Database** | Supabase Postgres | You already have an account; RLS handles multi-user; Realtime built in |
| **Backend Workers** | Railway (Node.js) | Supports cron jobs natively, cheap, simple deploys from GitHub |
| **X/Twitter Data** | TwitterAPI.io | 97% cheaper than official X API. $0.15/1K tweets vs $200/mo minimum |
| **Reddit Data** | Official Reddit API (free tier) | 100 req/min free for non-commercial/personal use, plenty for monitoring |
| **Google Alerts** | RSS feeds (free) | Set up alerts in Google, deliver as RSS, we poll the feed |
| **Amazon Seller Forums** | Puppeteer scraper on Railway | No API exists. Light scraping of public forum pages only. Fragile but workable |
| **Generic Forums/Blogs** | RSS + Puppeteer fallback | Most forums have RSS. Puppeteer for ones that don't |
| **AI Intelligence** | Claude Sonnet 4.5 via Batch API | Best price/performance. Batch API = 50% discount. ~$1.50/1M input tokens |
| **Sharing** | Web Share API + clipboard fallback | Native sharing on mobile, copy-to-clipboard on desktop. Zero cost |
| **Hosting** | Vercel (frontend) + Railway (workers) | Both deploy from GitHub. Both have generous free/cheap tiers |

---

## 4. Data Model (Supabase Postgres)

### Core Tables

```sql
-- Sources: where we pull data from
CREATE TABLE sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,                    -- "Reddit r/FBAOnline"
  type TEXT NOT NULL,                    -- "reddit" | "twitter" | "rss" | "scraper"
  config JSONB NOT NULL DEFAULT '{}',   -- subreddit name, RSS URL, scraper target, etc.
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Posts: every item pulled from every source
CREATE TABLE posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID REFERENCES sources(id),
  external_id TEXT,                      -- dedupe key (reddit post id, tweet id, etc.)
  title TEXT,
  body TEXT,
  author TEXT,
  url TEXT,                              -- link back to original
  published_at TIMESTAMPTZ,
  fetched_at TIMESTAMPTZ DEFAULT now(),
  metadata JSONB DEFAULT '{}',           -- upvotes, retweets, hashtags, etc.
  matched_keywords TEXT[] DEFAULT '{}',  -- which of our watched keywords hit
  UNIQUE(source_id, external_id)
);

-- Keywords: terms and hashtags to watch across all sources
CREATE TABLE keywords (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  term TEXT NOT NULL UNIQUE,             -- "FBA fee increase", "#amazonseller"
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Daily Briefings: Claude's intelligence output
CREATE TABLE briefings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL UNIQUE,
  hero_topic TEXT,                       -- top story of the day
  hero_summary TEXT,                     -- Claude's distillation
  hero_post_count INT,                   -- how many posts about this topic
  hero_confidence NUMERIC(3,2),          -- 0.00–1.00
  insights JSONB NOT NULL DEFAULT '[]',  -- array of insight objects (see below)
  raw_cluster_data JSONB,                -- for debugging
  model_used TEXT,                       -- "claude-sonnet-4-5"
  tokens_used INT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Insight object shape (inside briefings.insights JSONB):
-- {
--   "topic": "Amazon FBA fee restructuring",
--   "summary": "...",
--   "impact_assessment": "...",
--   "confidence": 0.85,
--   "severity": "high" | "medium" | "low",
--   "post_count": 34,
--   "sample_post_ids": ["uuid1", "uuid2"],
--   "recommendation": "..."
-- }

-- User profiles (extends Supabase auth.users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  display_name TEXT,
  role TEXT DEFAULT 'viewer',            -- "admin" | "viewer"
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### Row-Level Security

```sql
-- Everyone who is authenticated can read posts, briefings, sources, keywords
-- Only admins can insert/update/delete sources and keywords
-- Profiles: users can read all, update only their own
```

---

## 5. Feature Breakdown & Implementation Plan

### Feature 1: Aggregate Feed Display

**What it does:** A single scrollable feed showing all posts from all sources, newest first. Filter by source, keyword match, and date range.

**Implementation:**
- Next.js page at `/feed`
- Server component fetches initial page from Supabase (paginated, 50 posts)
- Client component subscribes to Supabase Realtime for new posts
- Filter sidebar: source checkboxes, keyword tags, date picker
- Each post card shows: source icon, title, snippet, author, time ago, matched keywords as tags, and a share button

**Effort:** ~2 days

---

### Feature 2: Hero Topic / Trending Display

**What it does:** At the top of the feed, a prominent card shows the #1 topic of the day with Claude's distillation, the count of how many posts/people are talking about it, and a confidence badge.

**Implementation:**
- Pulls from `briefings` table (today's date)
- Hero card component with: topic title, AI-generated summary, post count badge, confidence score pill (color-coded: green >0.8, yellow 0.5–0.8, red <0.5)
- "See all posts about this" button filters the feed to that topic's posts
- Falls back to "Briefing pending..." if today's briefing hasn't run yet

**Effort:** ~1 day

---

### Feature 3: Claude Intelligence Engine (NOT just summaries)

**What it does:** Once daily, Claude receives the last 24 hours of posts, grouped by topic cluster. Claude acts as a senior ecommerce analyst and returns:

- **Impact assessment:** What does this mean for Amazon/Walmart/Shopify sellers?
- **Severity rating:** How urgent is this? (high/medium/low)
- **Confidence score:** How certain is Claude about this conclusion? (0–1)
- **Recommendation:** What should sellers do or watch for?
- **Trend detection:** Is this new, growing, or dying down?

**Implementation:**
- Railway cron job at 6:00 AM ET daily
- Step 1: Pull all posts from last 24h
- Step 2: Lightweight topic clustering using keyword overlap + simple TF-IDF (no vector DB needed at this scale)
- Step 3: Build a structured prompt for Claude with the seller-analyst persona and all clusters
- Step 4: Use Claude Batch API (Sonnet 4.5) for 50% cost savings
- Step 5: Parse Claude's structured JSON response
- Step 6: Write to `briefings` table

**Claude Prompt Design (core of the intelligence):**

```
You are a senior ecommerce intelligence analyst who has sold on Amazon,
Walmart, and Shopify for 10+ years. You work for a wholesale supply
company that sells across all three platforms.

Below are today's clustered posts from seller communities, social media,
and news sources. For each cluster:

1. IMPACT: What does this mean for sellers like us? Be specific.
2. SEVERITY: high / medium / low — would this change how we operate?
3. CONFIDENCE: 0.0 to 1.0 — how confident are you in this assessment?
   Consider: source quality, post volume, corroboration across sources.
4. RECOMMENDATION: One concrete action or thing to watch.
5. TREND: "emerging" | "growing" | "stable" | "declining"

Pick the single most important topic as the HERO. This is the one thing
the team should read first today.

Return valid JSON matching this schema: [schema provided]
```

**Effort:** ~3 days

---

### Feature 4: One-Click Sharing

**What it does:** Any post or AI insight can be shared via text message, copied to clipboard, or shared through native OS share sheet.

**Implementation:**
- Share button on every post card and every insight card
- Uses the Web Share API (`navigator.share()`) on supported devices (iOS, Android, some desktop)
- Falls back to copy-to-clipboard with a toast notification
- For AI briefings: generates a clean text block with the insight + source links
- Share format: "🔍 Ecomm Sniffer Alert: [Topic] — [Summary] — [Link to full briefing]"

**Effort:** ~0.5 days

---

### Feature 5: Add/Manage Sources

**What it does:** Admin users can add new sources to the feed from a settings page. A source can be a subreddit, a Twitter/X search query, an RSS feed URL, or a forum URL to scrape.

**Implementation:**
- Settings page at `/settings/sources`
- "Add Source" form with type selector:
  - **Reddit:** Enter subreddit name(s)
  - **X/Twitter:** Enter search query or hashtag
  - **RSS Feed:** Paste URL (covers Google Alerts, blogs, news sites)
  - **Web Scraper:** Paste forum URL + CSS selector hints
- Sources table with enable/disable toggle and delete
- Backend: when a new source is added, its worker picks it up on the next cron cycle
- The generic RSS worker handles any standard RSS/Atom feed, making it easy to add most news/blog sources

**Effort:** ~2 days

---

### Feature 6: Multi-User Access

**What it does:** Multiple team members can log in and see the same feed, briefings, and insights. Admin users manage sources and keywords. Viewer users read and share.

**Implementation:**
- Supabase Auth with email/password (or magic link for convenience)
- Two roles: `admin` and `viewer` (stored in `profiles` table)
- RLS policies enforce read-access for all authenticated users, write-access for admins on sources/keywords
- Invite flow: admin enters email → Supabase sends invite link → user sets password → they're in
- No per-seat pricing. Supabase free tier supports 50,000 MAU

**Effort:** ~1.5 days

---

### Feature 7: Confidence Scoring (Daily)

**What it does:** Every AI insight includes a confidence score (0–1.0) that tells your team how certain Claude is. Factors: number of sources confirming, post volume, source credibility, specificity of claims.

**Implementation:**
- Built into the Claude prompt (Feature 3). Claude is instructed to reason about confidence explicitly.
- Confidence displayed as a color-coded badge: green (0.8+), yellow (0.5–0.79), red (<0.5)
- Briefings page shows all insights sorted by severity, with confidence visible
- Historical briefings accessible by date picker

**Effort:** Included in Feature 3

---

### Feature 8: Keyword & Hashtag Watchlist

**What it does:** Your team adds keywords and hashtags to a watchlist. Every ingestion worker checks incoming posts against the watchlist and tags matches. The feed can filter by keyword.

**Implementation:**
- Settings page at `/settings/keywords`
- Add/remove keywords and hashtags
- Backend: each ingestion worker runs a simple text match (case-insensitive) against the keyword list on every incoming post
- Matched keywords stored in `posts.matched_keywords` array
- Feed filter: click a keyword tag to see all posts matching it
- Keyword match count displayed on keyword settings page (how many posts hit this keyword today/this week)

**Effort:** ~1 day

---

## 6. Source-by-Source Ingestion Strategy

### Reddit (Free, Reliable)
- **API:** Official Reddit API, OAuth2 app (free for non-commercial personal use)
- **Rate limit:** 100 requests/min — more than enough
- **What we pull:** Posts from target subreddits (r/FulfillmentByAmazon, r/AmazonSeller, r/shopify, r/WalmartSellers, r/ecommerce, etc.)
- **Signup required:** Register a Reddit "script" app at reddit.com/prefs/apps
- **Cost:** $0
- **Reliability:** High. Reddit's API is stable and well-documented.

### X / Twitter (Low Cost via Third-Party)
- **API:** TwitterAPI.io (third-party, $0.15 per 1,000 tweets)
- **What we pull:** Search results for keywords like "Amazon seller", "FBA fees", "Walmart marketplace", #amazonseller, #ecommerce
- **Signup required:** Create a TwitterAPI.io account, get API key
- **Cost:** ~$5–15/month at moderate volume (30K–100K tweets/month)
- **Reliability:** High. Third-party APIs have been stable and are widely used.
- **Why not official X API:** Official Basic tier is $200/mo with harsh limits. Third-party gives us more data for less.

### Google Alerts (Free, Easy)
- **Method:** Create Google Alerts for your terms, set delivery to RSS feed, add the RSS URLs as sources
- **What we pull:** News articles, blog posts, web mentions matching your alert terms
- **Signup required:** None (uses your Google account)
- **Cost:** $0
- **Reliability:** High for news. Medium for niche topics (Google's coverage varies).

### Amazon Seller Forums (Free, Fragile)
- **Method:** Puppeteer-based scraper running on Railway
- **What we pull:** New threads from the "News for Amazon Sellers" and general discussion sections
- **Signup required:** None (public pages)
- **Cost:** $0 (just Railway compute)
- **Reliability:** LOW. Amazon can change their HTML at any time. This will break periodically and need maintenance. Plan for it.
- **Mitigation:** The scraper logs errors to Supabase. You get a Slack/email alert when it fails. Fixing is usually updating a CSS selector.

### Generic RSS / Blogs / News (Free, Reliable)
- **Method:** Standard RSS/Atom feed parser
- **Good sources to add:** Seller Central news page, Shopify blog, Walmart Marketplace blog, ecommerce news sites (Practical Ecommerce, EcommerceBytes, Marketplace Pulse)
- **Cost:** $0
- **Reliability:** High. RSS is a decades-old standard.

---

## 7. Accounts & API Access You'll Need to Set Up

| Service | What to do | Time | Cost |
|---------|-----------|------|------|
| **Supabase** | You have this. Create a new project for Ecomm Sniffer | 5 min | Free to start, $25/mo Pro when ready |
| **Vercel** | You have this. Connect your GitHub repo | 2 min | Free tier works to start |
| **Railway** | You have this. Deploy worker service from GitHub | 5 min | ~$5–10/mo |
| **GitHub** | You have this. Create the repo | 2 min | Free |
| **Anthropic API** | Sign up at console.anthropic.com, add payment, get API key | 10 min | ~$15–40/mo depending on post volume |
| **Reddit App** | Go to reddit.com/prefs/apps → create "script" type app | 5 min | Free |
| **TwitterAPI.io** | Sign up, add payment, get API key | 10 min | ~$5–15/mo |
| **Google Alerts** | Create alerts at google.com/alerts, set to RSS delivery | 15 min | Free |

**Total setup time:** ~1 hour
**Total accounts to create:** 2 new (Anthropic API, TwitterAPI.io) + 1 Reddit app registration

---

## 8. Monthly Cost Estimate

| Item | Low Estimate | High Estimate | Notes |
|------|-------------|---------------|-------|
| Supabase Pro | $25 | $25 | Fixed. Covers DB, auth, realtime |
| Vercel | $0 | $20 | Free tier likely sufficient. Pro if traffic grows |
| Railway | $5 | $15 | Worker compute. Scales with source count |
| Claude API (Batch) | $15 | $40 | Sonnet 4.5 via Batch. Depends on daily post volume |
| TwitterAPI.io | $5 | $15 | Depends on search query volume |
| Reddit API | $0 | $0 | Free tier |
| Google Alerts | $0 | $0 | Free |
| **TOTAL** | **$50** | **$115** | |

---

## 9. Development Phases & Timeline

### Phase 1: Foundation (Week 1)
- Set up GitHub repo with Next.js 14 + Tailwind
- Set up Supabase project: tables, RLS policies, auth
- Deploy blank app to Vercel
- Deploy worker skeleton to Railway
- Build auth flow (login, signup, invite)

### Phase 2: Ingestion (Week 2)
- Build Reddit ingestion worker
- Build RSS/Google Alerts ingestion worker
- Build TwitterAPI.io ingestion worker
- Build Amazon Seller Forum scraper (Puppeteer)
- Build keyword matching logic
- Set up cron schedules on Railway (every 30 min)
- Build source management admin page

### Phase 3: Feed & UI (Week 3)
- Build aggregate feed page with filtering
- Build source filter sidebar
- Build keyword filter tags
- Build post card component with share button
- Build keyword management settings page
- Implement Supabase Realtime for live feed updates

### Phase 4: AI Intelligence (Week 4)
- Build topic clustering logic
- Design and test Claude prompt
- Build daily cron job for intelligence pipeline
- Build briefing display page with hero topic
- Build insight cards with confidence scores
- Build historical briefing browser (by date)

### Phase 5: Polish & Launch (Week 5)
- One-click sharing (Web Share API + clipboard)
- Mobile responsiveness pass
- Error handling and monitoring
- Source health dashboard (which scrapers are working)
- Team invite flow
- Testing with real data for 3–5 days
- Go live

---

## 10. Stress Test: Risks & Mitigations

### Risk 1: Amazon Forum Scraper Breaks
- **Likelihood:** HIGH (will happen eventually)
- **Impact:** One source goes dark temporarily
- **Mitigation:** Error alerting, graceful degradation (feed still works without it), CSS selector updates are usually a 15-minute fix. Consider replacing with EcommerceBytes RSS as a backup source for Amazon seller news.

### Risk 2: TwitterAPI.io Goes Down or Changes Pricing
- **Likelihood:** LOW-MEDIUM
- **Impact:** X/Twitter data goes dark
- **Mitigation:** The source architecture is modular. Swap to another provider (SocialData.tools, Bright Data) or the official X API with minimal code changes. The worker interface is the same.

### Risk 3: Claude API Costs Spike
- **Likelihood:** LOW (Batch API pricing is predictable)
- **Impact:** Monthly costs increase
- **Mitigation:** We use Batch API (50% off). We use Sonnet not Opus (cheaper). We process once daily not continuously. We can add a token budget cap. At 500 posts/day, expect ~$15–20/mo in Claude costs.

### Risk 4: Reddit Flags Commercial Use
- **Likelihood:** LOW-MEDIUM (depends on how Reddit interprets "commercial")
- **Impact:** May need to switch to paid Reddit API tier ($0.24/1K calls)
- **Mitigation:** Even at paid rates, the cost would be <$5/month for our volume. We also only read, never write.

### Risk 5: Source Volume Overwhelms Claude
- **Likelihood:** LOW initially, MEDIUM as sources grow
- **Impact:** Daily briefing takes too long or costs too much
- **Mitigation:** Pre-filter posts by keyword relevance before sending to Claude. Summarize low-signal posts in batches. Only send the top 200–300 most relevant posts to Claude each day.

### Risk 6: Data Quality Varies Wildly
- **Likelihood:** HIGH (social media is noisy)
- **Impact:** AI insights may be based on noise
- **Mitigation:** The confidence score system exists precisely for this. Claude is instructed to rate confidence based on source quality and corroboration. Low-confidence insights are visually de-emphasized.

---

## 11. What's NOT in V1 (Future Enhancements)

These are explicitly out of scope for the first version to keep the build lean:

- **Real-time AI processing** (V1 is daily batch only)
- **Sentiment analysis charts** (could add in V2 with historical data)
- **Custom AI personas** (V1 uses one fixed seller-analyst persona)
- **Slack/Discord integration** (V1 uses in-app sharing only)
- **Mobile app** (V1 is responsive web, which works fine on mobile)
- **Email digest** (could add as a Railway cron job in V2)
- **Competitor price monitoring** (different product entirely)

---

## 12. Deployment Checklist

```
[ ] GitHub repo created
[ ] Supabase project created, schema migrated
[ ] Supabase RLS policies applied
[ ] Vercel project connected to GitHub
[ ] Railway project connected to GitHub
[ ] Environment variables set in Vercel and Railway
[ ] Reddit app registered, credentials stored
[ ] TwitterAPI.io account created, key stored
[ ] Anthropic API key created, stored
[ ] Google Alerts created and RSS URLs added as sources
[ ] Initial keyword watchlist populated
[ ] First ingestion run successful
[ ] First Claude briefing generated
[ ] Team members invited
[ ] Go live
```

---

## 13. File Structure (Proposed)

```
ecomm-sniffer/
├── apps/
│   └── web/                          # Next.js frontend (Vercel)
│       ├── app/
│       │   ├── (auth)/
│       │   │   ├── login/
│       │   │   └── signup/
│       │   ├── feed/                 # Aggregate feed page
│       │   ├── briefing/             # AI intelligence page
│       │   │   └── [date]/           # Historical briefings
│       │   ├── settings/
│       │   │   ├── sources/          # Manage sources
│       │   │   ├── keywords/         # Manage keywords
│       │   │   └── team/             # Manage users
│       │   └── layout.tsx
│       ├── components/
│       │   ├── PostCard.tsx
│       │   ├── HeroTopic.tsx
│       │   ├── InsightCard.tsx
│       │   ├── ShareButton.tsx
│       │   ├── SourceFilter.tsx
│       │   └── KeywordBadge.tsx
│       └── lib/
│           ├── supabase.ts
│           └── share.ts
│
├── workers/                          # Railway backend
│   ├── src/
│   │   ├── ingestion/
│   │   │   ├── reddit.ts
│   │   │   ├── twitter.ts
│   │   │   ├── rss.ts
│   │   │   ├── scraper.ts
│   │   │   └── keyword-matcher.ts
│   │   ├── intelligence/
│   │   │   ├── cluster.ts
│   │   │   ├── prompt.ts
│   │   │   └── daily-briefing.ts
│   │   └── index.ts                  # Cron scheduler
│   └── package.json
│
├── supabase/
│   └── migrations/                   # SQL migration files
│
└── README.md
```

---

## 14. Stress Test Findings & Required Fixes

This plan was reviewed by a simulated senior engineer. The following issues were identified and **must be addressed during development** (not after):

### CRITICAL — Block Launch Without These

**A. Database indexes are required.** Without them, the feed page will lag badly once you pass 10K posts:
```sql
CREATE INDEX idx_posts_fetched_at ON posts(fetched_at DESC);
CREATE INDEX idx_posts_source_id ON posts(source_id);
CREATE INDEX idx_posts_keywords ON posts USING GIN(matched_keywords);
CREATE INDEX idx_briefings_date ON briefings(date DESC);
```

**B. RLS policies must be written as actual SQL,** not just comments. Without them, any authenticated user can delete all your sources and keywords. These will be part of the migration file.

**C. Cross-source deduplication.** The same article posted on Reddit, Twitter, and a news RSS will appear 3x in the feed and inflate Claude's post counts. Fix: add a `normalized_url` column and deduplicate on URL across sources.

**D. Monitoring & alerting.** Add Sentry (free tier) or Axiom. Every worker must log success/failure. If a worker hasn't succeeded in 2 hours, fire an alert. Without this, things break silently for days.

### HIGH — Build Into the Timeline

**E. Briefing retry logic.** If the 6 AM job fails (API timeout, etc.), retry at 6:15, 6:30, 7:00 with exponential backoff. Add a manual "Re-run Briefing" button for admins. If briefing fails entirely, show a raw digest of post titles as a fallback.

**F. Puppeteer deployment config.** Railway needs a Dockerfile or nixpacks config that pre-installs Chromium. Without this, the scraper worker hangs on first deploy. Add explicit 30-second timeouts on all Puppeteer operations.

**G. Token budget control.** Send post title + first 200 chars of body to Claude, NOT full text. At 300 posts/day × ~300 tokens per post = 90K input tokens/day ≈ $4/month via Batch API. If you sent full post text, this could be 10x higher. Add a hard cap: if posts exceed 500 in a day, only send the top 300 by engagement (upvotes/retweets).

**H. Rate-limit handling on all API calls.** Every ingestion worker needs exponential backoff (retry on 429 status). Without this, a rate-limit event crashes the worker and you lose data.

**I. Post staleness guard.** When adding a new source, only fetch the last 24 hours of posts (configurable). Without this, a new Reddit source backfills 6 months and Claude's briefing explodes in cost.

### MEDIUM — Add to Phase 5

**J. Supabase backups.** Enable Point-in-Time Recovery ($10/mo) or add a weekly export job. Without backups, a bad RLS policy or accidental delete = permanent data loss.

**K. Schema versioning on briefings.** Add a `schema_version` field. When you change the AI output format in V2, old briefings still render correctly.

**L. Source adapter pattern.** All ingestion workers should implement the same interface. When you grow to 15+ sources, this prevents spaghetti code:
```typescript
interface SourceAdapter {
  fetch(): Promise<Post[]>;
  healthCheck(): Promise<boolean>;
  getLastError(): string | null;
}
```

### Environment Variables Required

```bash
# .env.example — ALL of these must be set before deploy

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...          # Workers only, never in frontend

# Anthropic
ANTHROPIC_API_KEY=sk-ant-...

# Reddit
REDDIT_CLIENT_ID=xxxxxxxxxx
REDDIT_CLIENT_SECRET=xxxxxxxxxx
REDDIT_USER_AGENT=ecomm-sniffer/1.0

# TwitterAPI.io
TWITTER_API_KEY=xxxxxxxxxx

# Railway (set in Railway dashboard, not .env)
CRON_SCHEDULE_INGESTION=*/30 * * * *          # Every 30 min
CRON_SCHEDULE_BRIEFING=0 11 * * *             # 6 AM ET = 11:00 UTC
```

### Revised Cost Estimate (Post Stress-Test)

| Item | Low | High | Notes |
|------|-----|------|-------|
| Supabase Pro | $25 | $25 | Fixed |
| Supabase PITR Backup | $10 | $10 | Recommended |
| Vercel | $0 | $20 | Free tier likely fine |
| Railway | $5 | $20 | Higher if Puppeteer needs more RAM |
| Claude API (Batch) | $4 | $25 | Token-controlled. See item G above |
| TwitterAPI.io | $5 | $15 | Pay per use |
| Sentry | $0 | $0 | Free tier (5K events/mo) |
| **TOTAL** | **$49** | **$115** | |

### Revised Timeline (Post Stress-Test)

| Phase | Duration | Key Addition |
|-------|----------|-------------|
| Phase 1: Foundation | Week 1 | + Write full migration SQL with indexes, RLS policies, .env.example |
| Phase 2: Ingestion | Week 2 | + Source adapter pattern, retry logic, rate-limit handling, Dockerfile for Puppeteer |
| Phase 3: Feed & UI | Week 3 | + Cross-source deduplication, normalized_url |
| Phase 4: AI Intelligence | Week 4 | + Token budget cap, briefing retry/fallback, schema versioning |
| Phase 5: Polish & Launch | Week 5 | + Sentry monitoring, source health dashboard, backup setup, 3-day burn-in test |

---

## Summary

This is a 5-week build to a working V1. Monthly operating cost is $50–115. You need to create 2 new accounts (Anthropic API, TwitterAPI.io) and register a Reddit app. Everything else uses services you already have. The riskiest piece is the Amazon forum scraper, which *will* break occasionally — but the system degrades gracefully when any single source goes down. The AI intelligence layer is the core value and it's designed to think like a seller, not just summarize.
