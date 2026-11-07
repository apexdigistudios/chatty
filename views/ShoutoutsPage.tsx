'use client';

import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "@/lib/router";
import { motion } from "framer-motion";
import { Inbox, Loader2, Mail, Mailbox, PackageOpen, Send } from "lucide-react";
import { ShoutoutCard } from "@/components/shoutouts/ShoutoutCard";
import { PostalEnvelope } from "@/components/shoutouts/PostalEnvelope";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/context/AuthContext";
import { describeError } from "@/lib/supabase";
import { fetchInbox, fetchOutbox, markShoutoutOpened } from "@/services/shoutoutsService";
import { useAuthGateStore } from "@/store/authGateStore";
import { useGistStore } from "@/store/gistStore";
import { springs } from "@/theme/tokens";
import type { Shoutout } from "@/types/models";
import { cn } from "@/utils/cn";

type PostalTab = "inbox" | "outbox";

/** Digital inter-school postal service: compose, inbox and delivery-tracked outbox. */
export function ShoutoutsPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, profile } = useAuth();
  const openAuthGate = useAuthGateStore((state) => state.openAuthGate);
  const schools = useGistStore((state) => state.schools);

  const [tab, setTab] = useState<PostalTab>(
    searchParams.get("tab") === "outbox" ? "outbox" : "inbox"
  );
  useEffect(() => {
    if (searchParams.get("tab") === "outbox") setTab("outbox");
  }, [searchParams]);
  const [inbox, setInbox] = useState<Shoutout[]>([]);
  const [outbox, setOutbox] = useState<Shoutout[]>([]);
  const [loadingMail, setLoadingMail] = useState(false);

  const schoolFor = useCallback(
    (schoolId: string | null | undefined) => schools.find((school) => school.id === schoolId) ?? null,
    [schools]
  );
  const schoolShortFor = useCallback(
    (schoolId: string | null | undefined) => schoolFor(schoolId)?.shortName ?? "your SHS",
    [schoolFor]
  );

  // Profile deep links are forwarded to the dedicated full-screen wizard.
  useEffect(() => {
    const to = searchParams.get("to");
    if (to) navigate(`/shoutouts/create?to=${encodeURIComponent(to)}`, { replace: true });
  }, [searchParams, navigate]);

  const loadMail = useCallback(async () => {
    if (!user) return;
    setLoadingMail(true);
    try {
      const [received, sent] = await Promise.all([fetchInbox(profile), fetchOutbox()]);
      setInbox(received);
      setOutbox(sent);
    } catch (error) {
      toast(describeError(error, "Could not load your campus mail."), "danger");
    } finally {
      setLoadingMail(false);
    }
  }, [user, profile, toast]);

  useEffect(() => {
    void loadMail();
  }, [loadMail]);

  const openLetter = async (letter: Shoutout) => {
    setInbox((prev) => prev.map((item) => item.id === letter.id ? { ...item, openedAt: new Date().toISOString(), status: "delivered" } : item));
    setOutbox((prev) => prev.map((item) => item.id === letter.id ? { ...item, openedAt: new Date().toISOString(), status: "delivered" } : item));
    try {
      await markShoutoutOpened(letter.id);
    } catch {
      // The letter is readable even when the optional read receipt cannot be saved.
    }
  };

  const replyTo = (letter: Shoutout) => {
    const params = new URLSearchParams();
    if (letter.senderId) params.set("to", letter.senderId);
    else {
      if (letter.senderSchoolId) params.set("school", letter.senderSchoolId);
      params.set("name", letter.senderName);
    }
    navigate(`/shoutouts/create?${params.toString()}`);
  };

  const tabs: Array<{ id: PostalTab; label: string; icon: typeof Mail; count?: number }> = [
    { id: "inbox", label: "Inbox", icon: Inbox, count: inbox.filter((item) => !item.openedAt).length },
    { id: "outbox", label: "Outbox", icon: PackageOpen, count: outbox.length },
  ];

  return (
    <div className="mx-auto w-full max-w-[1000px] min-w-0 px-4 pb-10 pt-5 sm:px-6 sm:pt-7">
      {/* Playful digital post office masthead */}
      <header className="relative overflow-hidden rounded-[26px] border-2 border-line bg-card p-4 shadow-[0_4px_0_var(--border-color)] sm:p-5">
        <span className="pointer-events-none absolute -right-12 -top-16 size-52 rounded-full opacity-80" style={{ background: "radial-gradient(circle, var(--brand-wash), transparent 70%)" }} aria-hidden />
        <div className="relative flex flex-col items-center gap-6 text-center md:flex-row md:items-center md:gap-4 md:text-left">
          <div className="w-full min-w-0 flex-1">
            <span className="inline-flex max-w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-[#8B5CF6] px-6 py-2 text-[9px] font-black uppercase tracking-widest text-white sm:text-[10px] sm:tracking-[0.14em]">
              <Mailbox size={11} strokeWidth={2.7} aria-hidden />
              Inter-School Post Office
            </span>
            <h1 className="mt-2.5 text-3xl font-black leading-tight tracking-tight text-ink sm:text-4xl">
              Paper Plane Shoutouts
            </h1>
            <p className="mt-1.5 max-w-[48ch] pl-2 text-sm font-semibold leading-relaxed text-ink-muted sm:pl-0 sm:text-base">
              A private student mailbox for sending and receiving sealed digital envelopes across SHSs. Only you and the recipient can read your letters.
            </p>
          </div>
          <div className="w-[80%] max-w-xs sm:w-[210px]">
            <PostalEnvelope school={schoolFor(profile?.schoolId)} stampLabel="Priority Campus Mail" recipientName="A friend at another SHS" recipientClass="Special delivery" senderName="@CampusKing" compact />
          </div>
        </div>
      </header>

      <div className="mt-5 grid grid-cols-2 gap-1 rounded-2xl border-2 border-line bg-surface-muted p-1" role="tablist" aria-label="Shoutout mail sections">
        {tabs.map(({ id, label, icon: Icon, count }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={cn("relative z-0 flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-2 text-[11px] font-extrabold transition-colors sm:text-xs", tab === id ? "text-brand-deep" : "text-ink-muted hover:text-ink")}
          >
            {tab === id && <motion.span layoutId="postal-tab" transition={springs.bouncy} className="absolute inset-0 -z-10 rounded-xl border border-line bg-card shadow-[0_2px_0_var(--border-color)]" aria-hidden />}
            <Icon size={14} strokeWidth={2.6} aria-hidden />
            <span className="truncate">{label}</span>
            {typeof count === "number" && count > 0 && <Badge tone="brand" className="px-1.5 py-0 text-[8px]">{count}</Badge>}
          </button>
        ))}
      </div>

      <div className="mb-4">
        <Button
          fullWidth
          size="lg"
          onClick={() => navigate("/shoutouts/create")}
          leftIcon={<Send size={17} strokeWidth={2.7} aria-hidden />}
        >
          Write a Paper Plane Shoutout
        </Button>
        <p className="mt-1.5 text-center text-[11px] font-semibold text-ink-muted">
          Opens the full-screen 4-step postal wizard.
        </p>
      </div>

      <div className="mt-5">
        {!user ? (
          <div className="rounded-3xl border-2 border-dashed border-line bg-card px-5 py-12 text-center">
            <Mailbox size={26} className="mx-auto text-brand-deep" aria-hidden />
            <p className="mt-3 text-sm font-extrabold text-ink">Sign in to open your campus mail</p>
            <p className="mx-auto mt-1 max-w-[32ch] text-xs font-semibold leading-relaxed text-ink-muted">Your Inbox and Outbox are private to your student account.</p>
            <Button className="mt-4" onClick={() => openAuthGate({ title: "Open your campus mail", speech: "Create your student pass to receive sealed shoutouts and track your paper planes.", returnTo: "/shoutouts" })}>Get started</Button>
          </div>
        ) : loadingMail ? (
          <div className="flex items-center justify-center gap-2 py-14 text-xs font-extrabold text-ink-muted">
            <Loader2 size={18} className="animate-spin" aria-hidden />
            Sorting your campus mail…
          </div>
        ) : tab === "inbox" ? (
          inbox.length > 0 ? (
            <div className="space-y-4">
              {inbox.map((letter) => (
                <ShoutoutCard key={letter.id} shoutout={letter} mode="inbox" school={schoolFor(letter.recipientSchoolId)} senderSchoolName={schoolShortFor(letter.senderSchoolId)} onOpen={openLetter} onReply={replyTo} />
              ))}
            </div>
          ) : (
            <EmptyMail title="Your inbox is empty" detail="When another SHS student sends you a paper plane, its wax seal will appear here." action="Write the first letter" onAction={() => navigate("/shoutouts/create")} />
          )
        ) : outbox.length > 0 ? (
          <div className="space-y-4">
            {outbox.map((letter) => (
              <ShoutoutCard key={letter.id} shoutout={letter} mode="outbox" school={schoolFor(letter.recipientSchoolId)} senderSchoolName={schoolShortFor(profile?.schoolId)} />
            ))}
          </div>
        ) : (
          <EmptyMail title="No paper planes sent yet" detail="Write your first inter-school shoutout and watch its delivery stages here." action="Write a letter" onAction={() => navigate("/shoutouts/create")} />
        )}
      </div>

    </div>
  );
}

function EmptyMail({ title, detail, action, onAction }: { title: string; detail: string; action: string; onAction: () => void }) {
  return (
    <div className="rounded-3xl border-2 border-dashed border-line bg-card px-5 py-12 text-center">
      <Mail size={25} className="mx-auto text-brand-deep" aria-hidden />
      <p className="mt-3 text-sm font-extrabold text-ink">{title}</p>
      <p className="mx-auto mt-1 max-w-[34ch] text-xs font-semibold leading-relaxed text-ink-muted">{detail}</p>
      <Button size="sm" variant="outline" className="mt-4" onClick={onAction}>{action}</Button>
    </div>
  );
}
