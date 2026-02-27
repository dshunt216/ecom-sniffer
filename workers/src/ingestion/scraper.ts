import type { SourceAdapter, SourceConfig, RawPost } from "./types";

/**
 * Generic web scraper using Puppeteer.
 * Used for Amazon Seller Forums and other pages without APIs or RSS.
 *
 * NOTE: This is the most fragile adapter. It WILL break when target sites
 * change their HTML. Plan for periodic maintenance.
 */

let lastError: string | null = null;

export const scraperAdapter: SourceAdapter = {
  async fetch(source: SourceConfig): Promise<RawPost[]> {
    lastError = null;
    const targetUrl = source.config.url as string;
    const selector = (source.config.selector as string) || "article, .discussion-item, .forum-post, .thread-item";

    if (!targetUrl) {
      lastError = "No URL configured for scraper";
      return [];
    }

    let browser;
    try {
      // Dynamic import — Puppeteer may not be installed in all environments
      const puppeteer = await import("puppeteer");
      browser = await puppeteer.default.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
        timeout: 30000,
      });

      const page = await browser.newPage();
      page.setDefaultTimeout(30000);
      page.setDefaultNavigationTimeout(30000);
      await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36");

      await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 30000 });

      // Wait a bit for dynamic content
      await new Promise((r) => setTimeout(r, 2000));

      // Extract posts using the configured selector
      const posts = await page.evaluate((sel: string) => {
        const elements = document.querySelectorAll(sel);
        const results: Array<{
          title: string | null;
          body: string | null;
          url: string | null;
          author: string | null;
        }> = [];

        elements.forEach((el, i) => {
          if (i >= 50) return; // Cap at 50 posts per scrape

          const linkEl = el.querySelector("a[href]");
          const titleEl = el.querySelector("h1, h2, h3, h4, .title, .subject");

          results.push({
            title: titleEl?.textContent?.trim() || linkEl?.textContent?.trim() || null,
            body: el.textContent?.trim()?.slice(0, 500) || null,
            url: linkEl?.getAttribute("href") || null,
            author: el.querySelector(".author, .username, .user")?.textContent?.trim() || null,
          });
        });

        return results;
      }, selector);

      return posts.map((post, i) => ({
        external_id: `${targetUrl}-${i}-${post.title?.slice(0, 30) || i}`,
        title: post.title,
        body: post.body,
        author: post.author,
        url: post.url
          ? post.url.startsWith("http")
            ? post.url
            : new URL(post.url, targetUrl).href
          : targetUrl,
        published_at: new Date().toISOString(), // Scraped pages rarely have dates
        metadata: { scraped_from: targetUrl },
      }));
    } catch (err: any) {
      lastError = err.message || "Unknown scraper error";
      return [];
    } finally {
      if (browser) await browser.close();
    }
  },

  async healthCheck(source: SourceConfig): Promise<boolean> {
    const targetUrl = source.config.url as string;
    if (!targetUrl) return false;
    try {
      const res = await fetch(targetUrl, {
        headers: { "User-Agent": "Mozilla/5.0" },
      });
      return res.ok;
    } catch {
      return false;
    }
  },

  getLastError() {
    return lastError;
  },
};
