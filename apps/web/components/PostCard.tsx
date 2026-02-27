"use client";

import { formatDistanceToNow } from "date-fns";
import type { Post, Source } from "@/lib/types";
import { SOURCE_LABELS } from "@/lib/types";
import ShareButton from "./ShareButton";

interface PostCardProps {
  post: Post & { source: Source };
}

export default function PostCard({ post }: PostCardProps) {
  const timeAgo = post.published_at
    ? formatDistanceToNow(new Date(post.published_at), { addSuffix: true })
    : formatDistanceToNow(new Date(post.fetched_at), { addSuffix: true });

  const sourceLabel = SOURCE_LABELS[post.source.type as keyof typeof SOURCE_LABELS] || post.source.type;
  const snippet = post.body ? post.body.slice(0, 200) + (post.body.length > 200 ? "..." : "") : null;

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 hover:border-gray-300 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* Source + Time */}
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-xs font-medium text-brand-600 bg-brand-50 px-2 py-0.5 rounded">
              {post.source.name}
            </span>
            <span className="text-xs text-gray-400">{timeAgo}</span>
            {post.author && (
              <span className="text-xs text-gray-400">by {post.author}</span>
            )}
          </div>

          {/* Title */}
          {post.title && (
            <h3 className="text-sm font-medium text-gray-900 mb-1 leading-snug">
              {post.url ? (
                <a
                  href={post.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-brand-600 hover:underline"
                >
                  {post.title}
                </a>
              ) : (
                post.title
              )}
            </h3>
          )}

          {/* Snippet */}
          {snippet && (
            <p className="text-sm text-gray-500 leading-relaxed">{snippet}</p>
          )}

          {/* Matched keywords */}
          {post.matched_keywords.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {post.matched_keywords.map((kw) => (
                <span
                  key={kw}
                  className="text-xs bg-yellow-50 text-yellow-700 border border-yellow-200 px-1.5 py-0.5 rounded"
                >
                  {kw}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Share button */}
        <ShareButton
          title={post.title || "Ecomm Sniffer Post"}
          text={snippet || post.title || ""}
          url={post.url || undefined}
        />
      </div>
    </div>
  );
}
