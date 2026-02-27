"use client";

import type { Briefing } from "@/lib/types";
import { getConfidenceLevel, getConfidenceLabel } from "@/lib/types";
import ShareButton from "./ShareButton";

interface HeroTopicProps {
  briefing: Briefing;
}

export default function HeroTopic({ briefing }: HeroTopicProps) {
  if (!briefing.hero_topic) return null;

  const confidence = briefing.hero_confidence ?? 0;
  const level = getConfidenceLevel(confidence);

  return (
    <div className="bg-white rounded-lg border-2 border-brand-200 p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          {/* Label */}
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-brand-600">
              Top Story Today
            </span>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full badge-confidence-${level}`}>
              {getConfidenceLabel(confidence)}
            </span>
            {briefing.hero_post_count && (
              <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                {briefing.hero_post_count} posts
              </span>
            )}
          </div>

          {/* Topic */}
          <h2 className="text-lg font-semibold text-gray-900 mb-2">
            {briefing.hero_topic}
          </h2>

          {/* Summary */}
          {briefing.hero_summary && (
            <p className="text-sm text-gray-600 leading-relaxed">
              {briefing.hero_summary}
            </p>
          )}
        </div>

        <ShareButton
          title={`Ecomm Sniffer: ${briefing.hero_topic}`}
          text={briefing.hero_summary || briefing.hero_topic}
        />
      </div>
    </div>
  );
}
