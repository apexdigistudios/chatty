'use client';

import { useEffect, useState } from "react";
import { Link } from "@/lib/router";
import { Loader2, Users, X } from "lucide-react";
import { describeError } from "@/lib/supabase";
import { fetchFollowProfiles, type FollowProfile } from "@/services/followsService";
import { Avatar } from "@/components/ui/Avatar";
import { useToast } from "@/components/ui/Toast";
import { VerifiedBadge } from "@/components/profile/VerifiedBadge";

interface FollowListModalProps {
  profileId: string;
  relation: "followers" | "following";
  onClose: () => void;
}

export function FollowListModal({ profileId, relation, onClose }: FollowListModalProps) {
  const { toast } = useToast();
  const [profiles, setProfiles] = useState<FollowProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void fetchFollowProfiles(profileId, relation)
      .then((result) => {
        if (active) setProfiles(result);
      })
      .catch((error: unknown) => {
        if (active) toast(describeError(error, `Could not load ${relation}.`), "danger");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [profileId, relation, toast]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-100 flex items-end justify-center bg-black/55 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="follow-list-title"
        className="flex max-h-[85dvh] w-full max-w-md flex-col rounded-t-3xl border-2 border-line bg-card p-4 shadow-2xl sm:rounded-3xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-line pb-3">
          <h2 id="follow-list-title" className="text-base font-black capitalize text-ink">
            {relation}
          </h2>
          <button type="button" onClick={onClose} aria-label="Close list" className="flex size-11 items-center justify-center rounded-full text-ink-muted hover:bg-page">
            <X size={18} aria-hidden />
          </button>
        </div>
        {loading ? (
          <div className="flex min-h-32 items-center justify-center text-brand-deep">
            <Loader2 size={20} className="animate-spin" aria-label="Loading profiles" />
          </div>
        ) : profiles.length === 0 ? (
          <div className="py-10 text-center">
            <Users size={22} className="mx-auto text-ink-muted" aria-hidden />
            <p className="mt-2 text-sm font-bold text-ink-muted">No {relation} yet.</p>
          </div>
        ) : (
          <ul className="mt-2 space-y-1 overflow-y-auto">
            {profiles.map((profile) => (
              <li key={profile.id}>
                <Link
                  to={`/profile/${profile.id}`}
                  onClick={onClose}
                  className="flex min-h-14 items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-page"
                >
                  <Avatar name={profile.username} src={profile.avatarUrl} size="md" />
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-center gap-1">
                      <span className="truncate text-sm font-extrabold text-ink">@{profile.username}</span>
                      <VerifiedBadge
                        isVerified={profile.isVerified}
                        verifiedExpiresAt={profile.verifiedExpiresAt}
                        verifiedTitle={profile.verifiedTitle}
                        isAdmin={profile.isAdmin}
                        role={profile.role}
                      />
                    </span>
                    <span className="block truncate text-xs font-semibold text-ink-muted">{profile.schoolName ?? "Student"}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
