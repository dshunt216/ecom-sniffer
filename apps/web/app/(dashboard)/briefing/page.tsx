"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import type { Briefing, Insight } from "@/lib/types";
import InsightCard from "@/components/InsightCard";
import HeroTopic from "@/components/HeroTopic";

export default function BriefingPage() {
  const supabase = createClient();
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [dates, setDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );
  const [loading, setLoading] = useState(true);

  // Fetch available briefing dates
  useEffect(() => {
    async function fetchDates() {
      const { data } = await supabase
        .from("briefings")
        .select("date")
        .order("date", { ascending: false })
        .limit(30);

      if (data) {
        setDates(data.map((d) => d.date));
        // If today has no briefing, select the most recent one
        if (data.length > 0 && !data.find((d) => d.date === selectedDate)) {
          setSelectedDate(data[0].date);
        }
      }
    }
    fetchDates();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch briefing for selected date
  useEffect(() => {
    async function fetchBriefing() {
      setLoading(true);
      const { data } = await supabase
        .from("briefings")
        .select("*")
        .eq("date", selectedDate)
        .single();

      setBriefing(data);
      setLoading(false);
    }
    fetchBriefing();
  }, [selectedDate]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sort insights by severity (high first), then by confidence (desc)
  const sortedInsights: Insight[] = briefing?.insights
    ? [...briefing.insights].sort((a, b) => {
        const severityOrder = { high: 0, medium: 1, low: 2 };
        const aSev = severityOrder[a.severity] ?? 1;
        const bSev = severityOrder[b.severity] ?? 1;
        if (aSev !== bSev) return aSev - bSev;
        return b.confidence - a.confidence;
      })
    : [];

  return (
    <div>
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">AI Briefing</h2>
          <p className="text-sm text-gray-500">
            Daily intelligence powered by Claude
          </p>
        </div>

        {/* Date picker */}
        <div className="flex items-center gap-2">
          <label htmlFor="date" className="text-sm text-gray-500">
            Date:
          </label>
          <select
            id="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="text-sm border border-gray-300 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            {dates.map((d) => (
              <option key={d} value={d}>
                {new Date(d + "T12:00:00").toLocaleDateString("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                })}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-gray-400 py-12 text-center">
          Loading briefing...
        </div>
      ) : !briefing ? (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
          <p className="text-sm text-gray-500 mb-1">
            No briefing available for this date.
          </p>
          <p className="text-xs text-gray-400">
            Briefings are generated daily at 6:00 AM ET.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Hero */}
          {briefing.hero_topic && <HeroTopic briefing={briefing} />}

          {/* Model info */}
          <div className="text-xs text-gray-400 flex items-center gap-4">
            {briefing.model_used && <span>Model: {briefing.model_used}</span>}
            {briefing.tokens_used && (
              <span>Tokens: {briefing.tokens_used.toLocaleString()}</span>
            )}
          </div>

          {/* All insights */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-700">
              All Insights ({sortedInsights.length})
            </h3>
            {sortedInsights.map((insight, i) => (
              <InsightCard key={i} insight={insight} rank={i + 1} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
