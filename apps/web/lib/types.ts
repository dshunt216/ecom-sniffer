// ============================================================
// Ecomm Sniffer — Core Types
// ============================================================

export type SourceType = "reddit" | "twitter" | "rss" | "scraper";
export type UserRole = "admin" | "viewer";
export type Severity = "high" | "medium" | "low";
export type Trend = "emerging" | "growing" | "stable" | "declining";

// ------------------------------------------------------------
// Database row types
// ------------------------------------------------------------

export interface Source {
  id: string;
  name: string;
  type: SourceType;
  config: Record<string, unknown>;
  enabled: boolean;
  created_at: string;
}

export interface Post {
  id: string;
  source_id: string;
  external_id: string | null;
  title: string | null;
  body: string | null;
  author: string | null;
  url: string | null;
  normalized_url: string | null;
  published_at: string | null;
  fetched_at: string;
  metadata: Record<string, unknown>;
  matched_keywords: string[];
  deleted_at: string | null;
  // Joined fields
  source?: Source;
}

export interface Keyword {
  id: string;
  term: string;
  created_by: string | null;
  created_at: string;
}

export interface Insight {
  topic: string;
  summary: string;
  impact_assessment: string;
  confidence: number;
  severity: Severity;
  trend: Trend;
  post_count: number;
  sample_post_ids: string[];
  recommendation: string;
}

export interface Briefing {
  id: string;
  date: string;
  hero_topic: string | null;
  hero_summary: string | null;
  hero_post_count: number | null;
  hero_confidence: number | null;
  insights: Insight[];
  raw_cluster_data: unknown;
  model_used: string | null;
  tokens_used: number | null;
  schema_version: number;
  created_at: string;
}

export interface Profile {
  id: string;
  display_name: string | null;
  role: UserRole;
  created_at: string;
}

// ------------------------------------------------------------
// UI helper types
// ------------------------------------------------------------

export function getConfidenceLevel(score: number): "high" | "medium" | "low" {
  if (score >= 0.8) return "high";
  if (score >= 0.5) return "medium";
  return "low";
}

export function getConfidenceLabel(score: number): string {
  const level = getConfidenceLevel(score);
  const pct = Math.round(score * 100);
  if (level === "high") return `High confidence (${pct}%)`;
  if (level === "medium") return `Medium confidence (${pct}%)`;
  return `Low confidence (${pct}%)`;
}

export const SOURCE_ICONS: Record<SourceType, string> = {
  reddit: "/icons/reddit.svg",
  twitter: "/icons/twitter.svg",
  rss: "/icons/rss.svg",
  scraper: "/icons/globe.svg",
};

export const SOURCE_LABELS: Record<SourceType, string> = {
  reddit: "Reddit",
  twitter: "X / Twitter",
  rss: "RSS Feed",
  scraper: "Web Scraper",
};
