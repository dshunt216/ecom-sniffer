import Parser from "rss-parser";
import type { SourceAdapter, SourceConfig, RawPost } from "./types";

/**
 * RSS/Atom feed ingestion.
 * Covers: Google Alerts, blogs, news sites, Shopify blog, etc.
 */

const parser = new Parser({
  timeout: 15000,
  headers: { "User-Agent": "ecomm-sniffer/1.0" },
});

let lastError: string | null = null;

export const rssAdapter: SourceAdapter = {
  async fetch(source: SourceConfig): Promise<RawPost[]> {
    lastError = null;
    const feedUrl = source.config.url as string;
    if (!feedUrl) {
      lastError = "No RSS URL configured";
      return [];
    }

    try {
      const feed = await parser.parseURL(feedUrl);
      console.log(`    [RSS] Feed returned ${feed.items?.length || 0} items from ${feedUrl}`);
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

      return (feed.items || [])
        .map((item) => {
          const pubDate = item.pubDate || item.isoDate;
          return {
            external_id: item.guid || item.link || item.title || "",
            title: item.title || null,
            body: (item.contentSnippet || item.content || "")?.slice(0, 2000) || null,
            author: item.creator || item["dc:creator"] || null,
            url: item.link || null,
            published_at: pubDate ? new Date(pubDate).toISOString() : null,
            metadata: {
              categories: item.categories || [],
            },
          } as RawPost;
        })
        .filter((post) => {
          // Only posts from the last 7 days
          if (!post.published_at) return true; // Keep undated posts
          return new Date(post.published_at).getTime() > sevenDaysAgo;
        });
    } catch (err: any) {
      lastError = err.message || "Unknown RSS error";
      return [];
    }
  },

  async healthCheck(source: SourceConfig): Promise<boolean> {
    const feedUrl = source.config.url as string;
    if (!feedUrl) return false;
    try {
      await parser.parseURL(feedUrl);
      return true;
    } catch {
      return false;
    }
  },

  getLastError() {
    return lastError;
  },
};
