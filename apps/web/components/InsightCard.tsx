"use client";

import type { Insight } from "@/lib/types";
import { getConfidenceLevel, getConfidenceLabel } from "@/lib/types";
import ShareButton from "./ShareButton";

interface InsightCardProps {
  insight: Insight;
  rank: number;
}

const TREND_LABELS: Record<string, string> = {
  emerging: "Emerging",
  growing: "Growing",
  stable: "Stable",
  declining: "Declining",
};

const TREND_COLORS: Record<string, string> = {
  emerging: "text-purple-700 bg-purple-50 border-purple-200",
  growing: "text-red-700 bg-red-50 border-red-200",
  stable: "text-gray-700 bg-gray-50 border-gray-200",
  declining: "text-green-700 bg-green-50 border-green-200",
};

export default function InsightCard({ insight, rank }: InsightCardProps) {
  const confLevel = getConfidenceLevel(insight.confidence);

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          {/* Badges row */}
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="text-xs font-bold text-gray-400">#{rank}</span>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full border badge-severity-${insight.severity}`}>
              {insight.severity.toUpperCase()}
            </span>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full border badge-confidence-${confLevel}`}>
              {getConfidenceLabel(insight.confidence)}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded-full border ${TREND_COLORS[insight.trend] || ""}`}>
              {TREND_LABELS[insight.trend] || insight.trend}
            </span>
            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
              {insight.post_count} posts
            </span>
          </div>

          {/* Topic */}
          <h3 className="text-base font-semibold text-gray-900 mb-2">
            {insight.topic}
          </h3>

          {/* Summary */}
          <p className="text-sm text-gray-600 mb-3 leading-relaxed">
            {insight.summary}
          </p>

          {/* Impact */}
          <div className="mb-3">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Impact on Sellers
            </h4>
            <p className="text-sm text-gray-700 leading-relaxed">
              {insight.impact_assessment}
            </p>
          </div>

          {/* Recommendation */}
          <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
            <h4 className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-1">
              Recommendation
            </h4>
            <p className="text-sm text-blue-800">{insight.recommendation}</p>
          </div>
        </div>

        <ShareButton
          title={`Ecomm Sniffer Insight: ${insight.topic}`}
          text={`${insight.summary}\n\nImpact: ${insight.impact_assessment}\n\nRecommendation: ${insight.recommendation}\n\nConfidence: ${Math.round(insight.confidence * 100)}% | Severity: ${insight.severity}`}
        />
      </div>
    </div>
  );
}
