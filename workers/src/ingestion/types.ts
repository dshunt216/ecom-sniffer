/**
 * Source Adapter Pattern
 * Every ingestion worker implements this interface.
 * This keeps the codebase maintainable as sources grow.
 */

export interface RawPost {
  external_id: string;
  title: string | null;
  body: string | null;
  author: string | null;
  url: string | null;
  published_at: string | null;
  metadata: Record<string, unknown>;
}

export interface SourceConfig {
  id: string;
  name: string;
  type: string;
  config: Record<string, unknown>;
}

export interface SourceAdapter {
  /** Fetch new posts from this source */
  fetch(source: SourceConfig): Promise<RawPost[]>;

  /** Quick health check — can we reach this source? */
  healthCheck(source: SourceConfig): Promise<boolean>;

  /** Last error encountered, if any */
  getLastError(): string | null;
}

/**
 * Normalize a URL for deduplication.
 * Strips tracking params, trailing slashes, protocol variations.
 */
export function normalizeUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    // Remove common tracking params
    const stripParams = [
      "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term",
      "ref", "source", "fbclid", "gclid", "mc_cid", "mc_eid",
    ];
    stripParams.forEach((p) => parsed.searchParams.delete(p));
    // Normalize
    let normalized = parsed.origin + parsed.pathname;
    // Remove trailing slash
    if (normalized.endsWith("/")) normalized = normalized.slice(0, -1);
    // Add remaining search params if any
    const search = parsed.searchParams.toString();
    if (search) normalized += "?" + search;
    return normalized.toLowerCase();
  } catch {
    return url.toLowerCase().trim();
  }
}
