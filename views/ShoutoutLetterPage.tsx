"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Send, Stamp } from "lucide-react";
import { useNavigate, useParams } from "@/lib/router";
import { VerifiedBadge } from "@/components/profile/VerifiedBadge";
import { Button } from "@/components/ui/Button";
import { PageSpinner } from "@/components/ui/PageSpinner";
import { useToast } from "@/components/ui/Toast";
import { ENVELOPE_THEME_BY_ID } from "@/components/shoutouts/postalThemes";
import { envelopePalette } from "@/components/shoutouts/PostalEnvelope";
import { useAuth } from "@/context/AuthContext";
import { describeError } from "@/lib/supabase";
import { markShoutoutOpened, fetchInbox } from "@/services/shoutoutsService";
import { useGistStore } from "@/store/gistStore";
import type { Shoutout } from "@/types/models";

export function ShoutoutLetterPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, profile } = useAuth();
  const schools = useGistStore((state) => state.schools);
  const [letter, setLetter] = useState<Shoutout | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!user) {
      setLoading(false);
      setLetter(null);
      return () => {
        active = false;
      };
    }

    setLoading(true);
    setError(null);
    void fetchInbox(profile)
      .then(async (inbox) => {
        if (!active) return;
        const found = inbox.find((item) => item.id === id);
        if (!found) {
          setError("This letter is not in your inbox.");
          return;
        }
        setLetter(found);
        if (!found.openedAt) {
          try {
            await markShoutoutOpened(found.id);
            if (active) {
              setLetter({ ...found, openedAt: new Date().toISOString(), status: "delivered" });
            }
          } catch (markError) {
            toast(describeError(markError, "The read receipt could not be saved."), "danger");
          }
        }
      })
      .catch((loadError: unknown) => {
        if (active) setError(describeError(loadError, "This letter could not be loaded."));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [id, profile?.classForm, profile?.fullName, profile?.schoolId, profile?.username, toast, user]);

  if (loading) return <PageSpinner label="Opening your letter" className="min-h-[60vh]" />;

  if (!user || error || !letter) {
    return (
      <main className="mx-auto w-full max-w-[760px] px-4 py-10 sm:px-6">
        <Button variant="outline" leftIcon={<ArrowLeft size={15} aria-hidden />} onClick={() => navigate("/shoutouts")}>
          Back to inbox
        </Button>
        <div className="mt-5 rounded-2xl border-2 border-line bg-card p-6 text-center">
          <p className="text-sm font-extrabold text-ink">
            {!user ? "Sign in to read this letter" : error ?? "Letter not found"}
          </p>
        </div>
      </main>
    );
  }

  const school = schools.find((item) => item.id === letter.recipientSchoolId) ?? null;
  const palette = envelopePalette(school, letter.envelopeTheme);
  const themeName = ENVELOPE_THEME_BY_ID.get(letter.envelopeTheme)?.label ?? "School colors";
  const replyTo = () => {
    const params = new URLSearchParams();
    if (letter.senderId) params.set("to", letter.senderId);
    else {
      if (letter.senderSchoolId) params.set("school", letter.senderSchoolId);
      params.set("name", letter.senderName);
    }
    navigate(`/shoutouts/create?${params.toString()}`);
  };

  return (
    <main className="mx-auto w-full max-w-[760px] px-4 pb-10 pt-5 sm:px-6 sm:pt-7">
      <Button variant="outline" leftIcon={<ArrowLeft size={15} aria-hidden />} onClick={() => navigate("/shoutouts")}>
        Back to inbox
      </Button>
      <article
        className="relative mx-auto mt-5 max-w-[680px] overflow-hidden rounded-sm border-y-8 border-double bg-[#fffdf7] p-6 shadow-[0_12px_36px_rgba(24,24,27,0.18)] sm:p-10"
        style={{
          borderColor: palette.primary,
          backgroundColor: palette.accent,
          backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent 33px, ${palette.secondary}35 34px, transparent 35px)`,
        }}
      >
        <div className="pointer-events-none absolute inset-y-0 left-0 w-2.5 opacity-80" style={{ background: `repeating-linear-gradient(0deg, ${palette.primary} 0 9px, #fff 9px 14px, ${palette.secondary} 14px 23px, #fff 23px 28px)` }} aria-hidden />
        <div className="relative">
          <header className="flex flex-wrap items-start justify-between gap-4 border-b border-black/15 pb-5">
            <div>
              <p className="flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.16em]" style={{ color: palette.primary }}>
                <Stamp size={12} aria-hidden />
                {themeName}
              </p>
              <h1 className="mt-2 text-2xl font-black tracking-tight text-[#18181B] sm:text-3xl">A letter for you</h1>
              <p className="mt-1 text-xs font-semibold text-[#52525B]">{school?.name ?? "Campus mail"} · {letter.recipientClass || "Student"}</p>
            </div>
            <p className="rounded-full border border-black/15 bg-white/70 px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider text-[#3F3F46]">
              {letter.stamp.replace(/_/g, " ")}
            </p>
          </header>

          <div className="py-6 sm:py-8">
            <p className="flex flex-wrap items-center gap-1 text-sm font-extrabold text-[#27272A]">
              Dear {letter.recipientName},
            </p>
            <p className="mt-5 min-h-40 whitespace-pre-wrap wrap-break-word text-[15px] font-medium leading-[2.1rem] text-[#27272A] sm:text-base">
              {letter.message}
            </p>
            <div className="mt-8 text-right">
              <p className="text-xs font-semibold text-[#52525B]">Yours,</p>
              <p className="mt-1 inline-flex items-center gap-1 text-lg font-black text-[#18181B]">
                {letter.senderName}
                <VerifiedBadge
                  isVerified={letter.senderIsVerified}
                  verifiedExpiresAt={letter.senderVerifiedExpiresAt}
                  verifiedTitle={letter.senderVerifiedTitle}
                  isAdmin={letter.senderIsAdmin}
                  role={letter.senderRole}
                />
              </p>
            </div>
          </div>

          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-black/15 pt-4">
            <p className="text-[10px] font-semibold text-[#52525B]">Delivered {letter.deliveredAt ? new Date(letter.deliveredAt).toLocaleDateString() : ""}</p>
            {letter.senderId && (
              <Button size="sm" leftIcon={<Send size={13} aria-hidden />} onClick={replyTo}>
                Reply by paper plane
              </Button>
            )}
          </footer>
        </div>
      </article>
    </main>
  );
}
