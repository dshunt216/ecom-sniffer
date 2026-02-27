/**
 * Share content using Web Share API with clipboard fallback.
 * Returns true if shared successfully.
 */
export async function shareContent(data: {
  title: string;
  text: string;
  url?: string;
}): Promise<boolean> {
  // Try native Web Share API first (mobile + some desktop)
  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share(data);
      return true;
    } catch (err: unknown) {
      // User cancelled — that's fine
      if (err instanceof Error && err.name === "AbortError") return false;
    }
  }

  // Fallback: copy to clipboard
  const shareText = data.url
    ? `${data.title}\n\n${data.text}\n\n${data.url}`
    : `${data.title}\n\n${data.text}`;

  try {
    await navigator.clipboard.writeText(shareText);
    return true;
  } catch {
    return false;
  }
}
