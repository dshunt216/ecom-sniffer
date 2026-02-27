import type { RawPost } from "./types";

/**
 * Check a post against the keyword watchlist.
 * Returns an array of matched keyword terms.
 */
export function matchKeywords(
  post: RawPost,
  keywords: string[]
): string[] {
  if (keywords.length === 0) return [];

  const searchText = [post.title, post.body, post.author]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return keywords.filter((kw) => {
    const term = kw.toLowerCase();
    // Handle hashtags
    if (term.startsWith("#")) {
      return searchText.includes(term);
    }
    // Case-insensitive substring match
    return searchText.includes(term);
  });
}
