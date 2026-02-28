import type { SourceAdapter, SourceConfig, RawPost } from "./types";

/**
 * Reddit ingestion via the official API (OAuth2).
 * Uses snoowrap for authenticated access.
 */

let lastError: string | null = null;

async function fetchWithRetry(fn: () => Promise<Response>, maxRetries = 3): Promise<Response> {
  for (let i = 0; i < maxRetries; i++) {
    const res = await fn();
    if (res.status === 429) {
      const backoff = Math.pow(2, i) * 1000;
      console.log(`Reddit rate limited, retrying in ${backoff}ms...`);
      await new Promise((r) => setTimeout(r, backoff));
      continue;
    }
    return res;
  }
  return fn();
}

export const redditAdapter: SourceAdapter = {
  async fetch(source: SourceConfig): Promise<RawPost[]> {
    lastError = null;
    const subreddit = source.config.subreddit as string;
    if (!subreddit) {
      lastError = "No subreddit configured";
      return [];
    }

    try {
      // Use Reddit's JSON API (no auth needed for public subreddits)
      const res = await fetchWithRetry(() =>
        fetch(`https://www.reddit.com/r/${subreddit}/new.json?limit=50`, {
          headers: {
            "User-Agent": process.env.REDDIT_USER_AGENT || "ecomm-sniffer/1.0",
          },
        })
      );

      if (!res.ok) {
        lastError = `Reddit API error: ${res.status}`;
        return [];
      }

      const data: any = await res.json();
      console.log(`    [Reddit] API returned ${data?.data?.children?.length || 0} raw posts from r/${subreddit}`);
      const posts: RawPost[] = data.data.children.map((child: any) => {
        const post = child.data;
        return {
          external_id: post.id,
          title: post.title,
          body: post.selftext?.slice(0, 2000) || null,
          author: post.author,
          url: `https://www.reddit.com${post.permalink}`,
          published_at: new Date(post.created_utc * 1000).toISOString(),
          metadata: {
            score: post.score,
            num_comments: post.num_comments,
            upvote_ratio: post.upvote_ratio,
            subreddit: post.subreddit,
            link_flair_text: post.link_flair_text,
          },
        };
      });

      // Filter: only posts from the last 48 hours (generous window for timezone safety)
      const oneDayAgo = Date.now() - 48 * 60 * 60 * 1000;
      return posts.filter(
        (p) => p.published_at && new Date(p.published_at).getTime() > oneDayAgo
      );
    } catch (err: any) {
      lastError = err.message || "Unknown Reddit error";
      return [];
    }
  },

  async healthCheck(source: SourceConfig): Promise<boolean> {
    const subreddit = source.config.subreddit as string;
    if (!subreddit) return false;
    try {
      const res = await fetch(
        `https://www.reddit.com/r/${subreddit}/about.json`,
        { headers: { "User-Agent": process.env.REDDIT_USER_AGENT || "ecomm-sniffer/1.0" } }
      );
      return res.ok;
    } catch {
      return false;
    }
  },

  getLastError() {
    return lastError;
  },
};
