"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import type { Source, SourceType } from "@/lib/types";
import { SOURCE_LABELS } from "@/lib/types";

const SOURCE_CONFIGS: Record<SourceType, { fields: { key: string; label: string; placeholder: string }[] }> = {
  reddit: {
    fields: [{ key: "subreddit", label: "Subreddit name", placeholder: "FulfillmentByAmazon" }],
  },
  twitter: {
    fields: [{ key: "query", label: "Search query or hashtag", placeholder: "#amazonseller OR \"FBA fees\"" }],
  },
  rss: {
    fields: [{ key: "url", label: "RSS feed URL", placeholder: "https://example.com/feed/" }],
  },
  scraper: {
    fields: [
      { key: "url", label: "Forum/page URL", placeholder: "https://sellercentral.amazon.com/forums/..." },
      { key: "selector", label: "CSS selector for posts (optional)", placeholder: ".forum-post" },
    ],
  },
};

export default function SourcesPage() {
  const supabase = createClient();
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [newType, setNewType] = useState<SourceType>("reddit");
  const [newName, setNewName] = useState("");
  const [newConfig, setNewConfig] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchSources();
  }, []);

  async function fetchSources() {
    const { data } = await supabase
      .from("sources")
      .select("*")
      .order("created_at", { ascending: false });
    if (data) setSources(data);
    setLoading(false);
  }

  async function handleAddSource(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase.from("sources").insert({
      name: newName,
      type: newType,
      config: newConfig,
    });
    if (!error) {
      setShowForm(false);
      setNewName("");
      setNewConfig({});
      fetchSources();
    }
    setSaving(false);
  }

  async function toggleSource(id: string, enabled: boolean) {
    await supabase.from("sources").update({ enabled: !enabled }).eq("id", id);
    fetchSources();
  }

  async function deleteSource(id: string) {
    if (!confirm("Remove this source? Posts from it will remain in the feed.")) return;
    await supabase.from("sources").delete().eq("id", id);
    fetchSources();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Sources</h2>
          <p className="text-sm text-gray-500">Manage where the feed pulls data from</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-md hover:bg-brand-700"
        >
          {showForm ? "Cancel" : "Add Source"}
        </button>
      </div>

      {/* Add source form */}
      {showForm && (
        <form onSubmit={handleAddSource} className="bg-white border border-gray-200 rounded-lg p-5 mb-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Source type</label>
              <select
                value={newType}
                onChange={(e) => { setNewType(e.target.value as SourceType); setNewConfig({}); }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              >
                {(Object.keys(SOURCE_LABELS) as SourceType[]).map((t) => (
                  <option key={t} value={t}>{SOURCE_LABELS[t]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Display name</label>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                placeholder="e.g., Reddit r/FBAOnline"
              />
            </div>
          </div>

          {SOURCE_CONFIGS[newType].fields.map((field) => (
            <div key={field.key}>
              <label className="block text-sm font-medium text-gray-700 mb-1">{field.label}</label>
              <input
                value={newConfig[field.key] || ""}
                onChange={(e) => setNewConfig({ ...newConfig, [field.key]: e.target.value })}
                required={!field.label.includes("optional")}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                placeholder={field.placeholder}
              />
            </div>
          ))}

          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-md hover:bg-brand-700 disabled:opacity-50"
          >
            {saving ? "Adding..." : "Add Source"}
          </button>
        </form>
      )}

      {/* Sources list */}
      {loading ? (
        <div className="text-sm text-gray-400 py-8 text-center">Loading...</div>
      ) : sources.length === 0 ? (
        <div className="text-sm text-gray-400 py-8 text-center">No sources configured yet.</div>
      ) : (
        <div className="space-y-2">
          {sources.map((source) => (
            <div key={source.id} className="bg-white border border-gray-200 rounded-lg p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className={`w-2 h-2 rounded-full ${source.enabled ? "bg-green-400" : "bg-gray-300"}`} />
                <div>
                  <p className="text-sm font-medium text-gray-900">{source.name}</p>
                  <p className="text-xs text-gray-400">{SOURCE_LABELS[source.type as SourceType] || source.type}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => toggleSource(source.id, source.enabled)}
                  className={`text-xs px-3 py-1 rounded-md border ${
                    source.enabled
                      ? "text-yellow-700 border-yellow-300 hover:bg-yellow-50"
                      : "text-green-700 border-green-300 hover:bg-green-50"
                  }`}
                >
                  {source.enabled ? "Disable" : "Enable"}
                </button>
                <button
                  onClick={() => deleteSource(source.id)}
                  className="text-xs px-3 py-1 rounded-md border text-red-700 border-red-300 hover:bg-red-50"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
