"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import type { Profile } from "@/lib/types";

export default function TeamPage() {
  const supabase = createClient();
  const [members, setMembers] = useState<Profile[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [inviting, setInviting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setCurrentUserId(user.id);

      const { data } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at");
      if (data) setMembers(data);
      setLoading(false);
    }
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviting(true);
    setMessage(null);

    // Invite via Supabase Auth (sends magic link email)
    const { error } = await supabase.auth.signInWithOtp({
      email: inviteEmail,
      options: { shouldCreateUser: true },
    });

    if (error) {
      setMessage(`Error: ${error.message}`);
    } else {
      setMessage(`Invite sent to ${inviteEmail}`);
      setInviteEmail("");
    }
    setInviting(false);
  }

  async function toggleRole(memberId: string, currentRole: string) {
    const newRole = currentRole === "admin" ? "viewer" : "admin";
    await supabase
      .from("profiles")
      .update({ role: newRole })
      .eq("id", memberId);

    setMembers((prev) =>
      prev.map((m) => (m.id === memberId ? { ...m, role: newRole } : m))
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Team</h2>
        <p className="text-sm text-gray-500">
          Manage who has access to Ecomm Sniffer. Admins can manage sources and keywords.
        </p>
      </div>

      {/* Invite form */}
      <form onSubmit={handleInvite} className="flex gap-2 mb-6">
        <input
          type="email"
          value={inviteEmail}
          onChange={(e) => setInviteEmail(e.target.value)}
          className="flex-1 max-w-sm px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          placeholder="colleague@company.com"
        />
        <button
          type="submit"
          disabled={inviting || !inviteEmail}
          className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-md hover:bg-brand-700 disabled:opacity-50"
        >
          {inviting ? "Sending..." : "Invite"}
        </button>
      </form>

      {message && (
        <div className={`text-sm mb-4 p-2 rounded-md border ${
          message.startsWith("Error")
            ? "bg-red-50 border-red-200 text-red-700"
            : "bg-green-50 border-green-200 text-green-700"
        }`}>
          {message}
        </div>
      )}

      {/* Members list */}
      {loading ? (
        <div className="text-sm text-gray-400 py-8 text-center">Loading...</div>
      ) : (
        <div className="space-y-2">
          {members.map((member) => (
            <div
              key={member.id}
              className="bg-white border border-gray-200 rounded-lg p-4 flex items-center justify-between"
            >
              <div>
                <p className="text-sm font-medium text-gray-900">
                  {member.display_name || "Unnamed"}
                  {member.id === currentUserId && (
                    <span className="text-xs text-gray-400 ml-2">(you)</span>
                  )}
                </p>
                <p className="text-xs text-gray-400 capitalize">{member.role}</p>
              </div>
              {member.id !== currentUserId && (
                <button
                  onClick={() => toggleRole(member.id, member.role)}
                  className="text-xs px-3 py-1 rounded-md border text-gray-600 border-gray-300 hover:bg-gray-50"
                >
                  Make {member.role === "admin" ? "Viewer" : "Admin"}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
