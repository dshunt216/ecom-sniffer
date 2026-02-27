import type { SourceAdapter, SourceConfig, RawPost } from "./types";

/**
 * Twitter/X ingestion via TwitterAPI.io (third-party, $0.15/1K tweets).
 * Docs: https://twitterapi.io/docs
 */

let lastError: string | null = null;

async function fetchWithRetry(fn: () => Promise<Response>, maxRetries = 3): Promise<Response> {
  for (let i = 0; i < maxRetries; i++) {
    const res = await fn();
    if (res.status === 429) {
      const backoff = Math.pow(2, i) * 1000;
      console.log(`Twitter API rate limited, retrying in ${backoff}ms...`);
      await new Promise((r) => setTimeout(r, backoff));
      continue;
    }
    return res;
  }
  return fn();
}

export const twitterAdapter: SourceAdapter = {
  async fetch(source: SourceConfig): Promise<RawPost[]> {
    lastError = null;
    const query = source.config.query as string;
    const apiKey = process.env.TWITTER_API_KEY;

    if (!query) {
      lastError = "No search query configured";
      return [];
    }
    if (!apiKey) {
      lastError = "TWITTER_API_KEY not set";
      return [];
    }

    try {
      const res = await fetchWithRetry(() =>
        fetch(`https://api.twitterapi.io/twitter/tweet/advanced_search?query=${encodeURIComponent(query)}&queryType=Latest`, {
          headers: {
            "X-API-Key": apiKey,
            "Content-Type": "application/json",
          },
        })
      );

      if (!res.ok) {
        lastError = `TwitterAPI.io error: ${res.status}`;
        return [];
      }

      const data: any = await res.json();
      const tweets = data.tweets || data.data || [];

      return tweets.map((tweet: any) => ({
        external_id: tweet.id || tweet.id_str,
        title: null,
        body: (tweet.text || tweet.full_text)?.slice(0, 2000) || null,
        author: tweet.author?.userName || tweet.user?.screen_name || null,
        url: tweet.url || (tweet.id ? `https://x.com/i/status/${tweet.id}` : null),
        published_at: tweet.createdAt || tweet.created_at || null,
        metadata: {
          retweet_count: tweet.retweetCount ?? tweet.retweet_count ?? 0,
          like_count: tweet.likeCount ?? tweet.favorite_count ?? 0,
          reply_count: tweet.replyCount ?? 0,
          quote_count: tweet.quoteCount ?? 0,
          hashtags: tweet.entities?.hashtags?.map((h: any) => h.tag || h.text) || [],
          is_retweet: tweet.isRetweet ?? false,
        },
      }));
    } catch (err: any) {
      lastError = err.message || "Unknown Twitter error";
      return [];
    }
  },

  async healthCheck(): Promise<boolean> {
    const apiKey = process.env.TWITTER_API_KEY;
    if (!apiKey) return false;
    try {
      const res = await fetch(
        "https://api.twitterapi.io/twitter/tweet/advanced_search?query=test&queryType=Latest",
        { headers: { "X-API-Key": apiKey } }
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
