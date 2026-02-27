"use client";

import type { Source } from "@/lib/types";
import { SOURCE_LABELS } from "@/lib/types";

interface SourceFilterProps {
  sources: Source[];
  selected: string[];
  onChange: (ids: string[]) => void;
}

export default function SourceFilter({ sources, selected, onChange }: SourceFilterProps) {
  function toggleSource(id: string) {
    if (selected.includes(id)) {
      onChange(selected.filter((s) => s !== id));
    } else {
      onChange([...selected, id]);
    }
  }

  return (
    <div>
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
        Sources
      </h3>
      <div className="space-y-1">
        {sources.map((source) => (
          <label
            key={source.id}
            className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-gray-50 cursor-pointer text-sm"
          >
            <input
              type="checkbox"
              checked={selected.length === 0 || selected.includes(source.id)}
              onChange={() => toggleSource(source.id)}
              className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
            />
            <span className="text-gray-700 truncate">{source.name}</span>
          </label>
        ))}
      </div>
      {selected.length > 0 && (
        <button
          onClick={() => onChange([])}
          className="text-xs text-brand-600 hover:underline mt-2 px-2"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
