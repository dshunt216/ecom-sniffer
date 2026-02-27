"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import type { Keyword } from "@/lib/types";

export default function KeywordsPage() {
  const supabase = createClient();
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [newTerm, setNewTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchKeywords(); }, []);

  async function fetchKeywords() {
    const { data } = await supabase.from("keywords").select("*").order("term");
    if (data) setKeywords(data);
    setLoading(false);
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newTerm.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("keywords").insert({ term: newTerm.trim() });
    if (!error) {
      setNewTerm("");
      fetchKeywords();
    }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    await supabase.from("keywords").delete().eq("id", id);
    fetchKeywords();
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Keywords & Hashtags</h2>
        <p className="text-sm text-gray-500">
          Terms to watch for across all sources. Posts matching these keywords get tagged in the feed.
        </p>
      </div>

      {/* Add keyword */}
      <form onSubmit={handleAdd} className="flex gap-2 mb-6">
        <input
          value={newTerm}
          onChange={(e) => setNewTerm(e.target.value)}
          className="flex-1 max-w-sm px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          placeholder="Enter keyword or #hashtag"
        />
        <button
          type="submit"
          disabled={saving || !newTerm.trim()}
          className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-md hover:bg-brand-700 disabled:opacity-50"
        >
          {saving ? "Adding..." : "Add"}
        </button>
      </form>

      {/* Keywords list */}
      {loading ? (
        <div className="text-sm text-gray-400 py-8 text-center">Loading...</div>
      ) : keywords.length === 0 ? (
        <div className="text-sm text-gray-400 py-8 text-center">No keywords yet. Add some above.</div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {keywords.map((kw) => (
            <div
              key={kw.id}
              className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-full px-3 py-1.5"
            >
              <span className="text-sm text-gray-700">{kw.term}</span>
              <button
                onClick={() => handleDelete(kw.id)}
                className="text-gray-400 hover:text-red-500 transition-colors"
                title="Remove keyword"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
