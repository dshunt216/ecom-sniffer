"use client";

interface KeywordBadgeProps {
  keyword: string;
  active: boolean;
  onClick: () => void;
}

export default function KeywordBadge({ keyword, active, onClick }: KeywordBadgeProps) {
  return (
    <button
      onClick={onClick}
      className={`text-xs px-2 py-1 rounded-full border transition-colors ${
        active
          ? "bg-brand-100 text-brand-700 border-brand-300"
          : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100"
      }`}
    >
      {keyword}
    </button>
  );
}
