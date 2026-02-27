"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase";
import type { Post, Source, Briefing } from "@/lib/types";
import PostCard from "@/components/PostCard";
import HeroTopic from "@/components/HeroTopic";
import SourceFilter from "@/components/SourceFilter";
import KeywordBadge from "@/components/KeywordBadge";

const PAGE_SIZE = 50;

export default function FeedPage() {
  const supabase = createClient();
  const [posts, setPosts] = useState<(Post & { source: Source })[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [loading, setLoading] = useState(true);

  // Filters
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [selectedKeyword, setSelectedKeyword] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);

    // Fetch sources
    const { data: sourcesData } = await supabase
      .from("sources")
      .select("*")
      .eq("enabled", true)
      .order("name");

    if (sourcesData) setSources(sourcesData);

    // Fetch keywords
    const { data: keywordsData } = await supabase
      .from("keywords")
      .select("term")
      .order("term");

    if (keywordsData) setKeywords(keywordsData.map((k) => k.term));

    // Fetch today's briefing
    const today = new Date().toISOString().split("T")[0];
    const { data: briefingData } = await supabase
      .from("briefings")
      .select("*")
      .eq("date", today)
      .single();

    if (briefingData) setBriefing(briefingData);

    // Fetch posts with source join
    let query = supabase
      .from("posts")
      .select("*, source:sources(*)")
      .is("deleted_at", null)
      .order("fetched_at", { ascending: false })
      .limit(PAGE_SIZE);

    if (selectedSources.length > 0) {
      query = query.in("source_id", selectedSources);
    }

    if (selectedKeyword) {
      query = query.contains("matched_keywords", [selectedKeyword]);
    }

    const { data: postsData } = await query;
    if (postsData) setPosts(postsData as (Post & { source: Source })[]);

    setLoading(false);
  }, [selectedSources, selectedKeyword]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Realtime subscription for new posts
  useEffect(() => {
    const channel = supabase
      .channel("posts-feed")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "posts" },
        async (payload) => {
          // Fetch the full post with source join
          const { data } = await supabase
            .from("posts")
            .select("*, source:sources(*)")
            .eq("id", payload.new.id)
            .single();

          if (data) {
            setPosts((prev) => [data as Post & { source: Source }, ...prev]);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      {/* Page header */}
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Feed</h2>
        <p className="text-sm text-gray-500">
          Real-time posts from all your sources
        </p>
      </div>

      {/* Hero topic */}
      {briefing && briefing.hero_topic && (
        <div className="mb-6">
          <HeroTopic briefing={briefing} />
        </div>
      )}

      <div className="flex gap-6">
        {/* Sidebar filters */}
        <div className="w-52 flex-shrink-0 space-y-6">
          <SourceFilter
            sources={sources}
            selected={selectedSources}
            onChange={setSelectedSources}
          />

          {keywords.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Keywords
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {keywords.map((kw) => (
                  <KeywordBadge
                    key={kw}
                    keyword={kw}
                    active={selectedKeyword === kw}
                    onClick={() =>
                      setSelectedKeyword(selectedKeyword === kw ? null : kw)
                    }
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Post list */}
        <div className="flex-1 space-y-3">
          {loading ? (
            <div className="text-sm text-gray-400 py-12 text-center">
              Loading feed...
            </div>
          ) : posts.length === 0 ? (
            <div className="text-sm text-gray-400 py-12 text-center">
              No posts yet. Workers will start populating the feed shortly.
            </div>
          ) : (
            posts.map((post) => <PostCard key={post.id} post={post} />)
          )}
        </div>
      </div>
    </div>
  );
}
