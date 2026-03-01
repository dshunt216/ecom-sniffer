import type { SourceAdapter, SourceConfig, RawPost } from "./types";

/**
 * Reddit ingestion via OAuth2 API.
 * Uses Reddit's official OAuth endpoint which works reliably from cloud servers.
 * The public JSON API (reddit.com/r/xxx.json) blocks cloud IPs with 403.
 */

let lastError: string | null = null;
let accessToken: string | null = null;
let tokenExpiry = 0;

async function getAccessToken(): Promise<string | null> {
  // Return cached token if still valid
  if (accessToken && Date.now() < tokenExpiry) {
    return accessToken;
  }

  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;

  // If no OAuth credentials, try unauthenticated with old.reddit.com
  if (!clientId || !clientSecret) {
    return null;
  }

  try {
    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const res = await fetch("https://www.reddit.com/api/v1/access_token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": process.env.REDDIT_USER_AGENT || "ecomm-sniffer/1.0",
      },
      body: "grant_type=client_credentials",
    });

    if (!res.ok) {
      console.warn(`    [Reddit] OAuth token request failed: ${res.status}`);
      return null;
    }

    const data: any = await res.json();
    accessToken = data.access_token;
    tokenExpiry = Date.now() + (data.expires_in - 60) * 1000; // Refresh 60s early
    console.log("    [Reddit] OAuth token acquired");
    return accessToken;
  } catch (err: any) {
    console.warn(`    [Reddit] OAuth error: ${err.message}`);
    return null;
  }
}

async function fetchWithRetry(fn: () => Promise<Response>, maxRetries = 3): Promise<Response> {
  for (let i = 0; i < maxRetries; i++) {
    const res = await fn();
    if (res.status === 429) {
      const backoff = Math.pow(2, i) * 1000;
      console.log(`    [Reddit] Rate limited, retrying in ${backoff}ms...`);
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
      const token = await getAccessToken();
      let res: Response;

      if (token) {
        // Use OAuth endpoint (works from cloud servers)
        res = await fetchWithRetry(() =>
          fetch(`https://oauth.reddit.com/r/${subreddit}/new?limit=50`, {
            headers: {
              Authorization: `Bearer ${token}`,
              "User-Agent": process.env.REDDIT_USER_AGENT || "ecomm-sniffer/1.0",
            },
          })
        );
        console.log(`    [Reddit] OAuth API response: ${res.status} for r/${subreddit}`);
      } else {
        // Fallback: try old.reddit.com which is less aggressive with blocking
        const userAgent =
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
        res = await fetchWithRetry(() =>
          fetch(`https://old.reddit.com/r/${subreddit}/new.json?limit=50`, {
            headers: { "User-Agent": userAgent },
          })
        );
        console.log(`    [Reddit] Public API response: ${res.status} for r/${subreddit}`);
      }

      if (!res.ok) {
        lastError = `Reddit API error: ${res.status}`;
        console.warn(`    [Reddit] Error body: ${(await res.text()).slice(0, 200)}`);
        return [];
      }

      const data: any = await res.json();
      const rawCount = data?.data?.children?.length || 0;
      console.log(`    [Reddit] Got ${rawCount} raw posts from r/${subreddit}`);

      if (!rawCount) return [];

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

      // Filter: only posts from the last 48 hours
      const cutoff = Date.now() - 48 * 60 * 60 * 1000;
      const filtered = posts.filter(
        (p) => p.published_at && new Date(p.published_at).getTime() > cutoff
      );
      console.log(`    [Reddit] ${filtered.length}/${posts.length} posts within 48h window`);
      return filtered;
    } catch (err: any) {
      lastError = err.message || "Unknown Reddit error";
      console.error(`    [Reddit] Exception: ${lastError}`);
      return [];
    }
  },

  async healthCheck(source: SourceConfig): Promise<boolean> {
    const subreddit = source.config.subreddit as string;
    if (!subreddit) return false;
    try {
      const res = await fetch(
        `https://old.reddit.com/r/${subreddit}/about.json`,
        {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          },
        }
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
