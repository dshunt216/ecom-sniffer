/**
 * Lightweight topic clustering using keyword overlap.
 * Groups posts that share significant keyword overlap.
 *
 * This is intentionally simple — TF-IDF or embedding-based clustering
 * can replace this if post volume exceeds 1000/day.
 */

interface ClusterablePost {
  id: string;
  title: string | null;
  body: string | null;
  source_name: string;
  engagement: number;
  matched_keywords: string[];
}

interface Cluster {
  topic: string;
  posts: Array<{
    id: string;
    title: string;
    body: string;
    source: string;
    engagement: number;
  }>;
}

// Common words to ignore when building topic labels
const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "is", "it", "this", "that", "are", "was",
  "be", "been", "being", "have", "has", "had", "do", "does", "did",
  "will", "would", "could", "should", "may", "might", "can", "just",
  "not", "no", "so", "if", "my", "your", "i", "you", "we", "they",
  "me", "us", "them", "he", "she", "his", "her", "its", "our", "their",
  "what", "which", "who", "when", "where", "how", "all", "each", "any",
  "both", "few", "more", "most", "other", "some", "about", "up", "out",
  "get", "got", "new", "now", "one", "two", "also", "than", "very",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s#]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

function getTopTerms(texts: string[], topN = 3): string {
  const freq: Record<string, number> = {};
  for (const text of texts) {
    const tokens = new Set(tokenize(text));
    tokens.forEach((t) => (freq[t] = (freq[t] || 0) + 1));
  }
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([term]) => term)
    .join(" + ");
}

function similarity(a: Set<string>, b: Set<string>): number {
  let intersection = 0;
  a.forEach((token) => { if (b.has(token)) intersection++; });
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function clusterPosts(posts: ClusterablePost[], threshold = 0.15): Cluster[] {
  if (posts.length === 0) return [];

  // Tokenize each post
  const tokenizedPosts = posts.map((p) => ({
    post: p,
    tokens: new Set(tokenize([p.title || "", p.body || ""].join(" "))),
  }));

  // Simple agglomerative clustering
  const assigned = new Set<number>();
  const clusters: Array<{ indices: number[] }> = [];

  for (let i = 0; i < tokenizedPosts.length; i++) {
    if (assigned.has(i)) continue;

    const cluster: number[] = [i];
    assigned.add(i);

    for (let j = i + 1; j < tokenizedPosts.length; j++) {
      if (assigned.has(j)) continue;

      // Check if this post is similar to any post in the cluster
      const isSimilar = cluster.some(
        (ci) => similarity(tokenizedPosts[ci].tokens, tokenizedPosts[j].tokens) > threshold
      );

      // Also cluster if they share matched keywords
      const shareKeywords =
        posts[i].matched_keywords.length > 0 &&
        posts[j].matched_keywords.length > 0 &&
        posts[i].matched_keywords.some((kw) => posts[j].matched_keywords.includes(kw));

      if (isSimilar || shareKeywords) {
        cluster.push(j);
        assigned.add(j);
      }
    }

    clusters.push({ indices: cluster });
  }

  // Build output clusters
  return clusters
    .map((c) => {
      const clusterPosts = c.indices.map((i) => posts[i]);
      const texts = clusterPosts.map((p) => [p.title || "", p.body || ""].join(" "));
      const topic = getTopTerms(texts);

      return {
        topic,
        posts: clusterPosts.map((p) => ({
          id: p.id,
          title: p.title || "(no title)",
          body: (p.body || "").slice(0, 200),
          source: p.source_name,
          engagement: p.engagement,
        })),
      };
    })
    .filter((c) => c.posts.length >= 1)
    .sort((a, b) => b.posts.length - a.posts.length);
}
