"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Check, Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useAuthGateStore } from "@/store/authGateStore";
import { castPollVote, fetchPollsForPosts } from "@/services/pollsService";
import { supabase } from "@/lib/supabase";
import type { PostPoll } from "@/types/models";
import { useToast } from "@/components/ui/Toast";

export function PostPollCard({ postId, poll }: { postId: string; poll: PostPoll }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const openAuthGate = useAuthGateStore((state) => state.openAuthGate);
  const { toast } = useToast();
  const [results, setResults] = useState(poll);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setResults(poll);
  }, [poll]);

  useEffect(() => {
    const channel = supabase
      .channel(`poll-results:${poll.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "poll_options",
          filter: `poll_id=eq.${poll.id}`,
        },
        (payload) => {
          const optionId = payload.new.id;
          const voteCount = payload.new.vote_count;
          if (typeof optionId !== "string" || typeof voteCount !== "number") return;
          setResults((current) => {
            const options = current.options.map((option) =>
              option.id === optionId ? { ...option, voteCount } : option
            );
            return {
              ...current,
              options,
              totalVotes: options.reduce((total, option) => total + option.voteCount, 0),
            };
          });
        }
      )
      .subscribe((status, error) => {
        if ((status === "CHANNEL_ERROR" || status === "TIMED_OUT") && error) {
          console.error("Could not subscribe to live poll results.", error);
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [poll.id]);

  useEffect(() => {
    let active = true;
    if (!userId) {
      setResults((current) => ({ ...current, votedOptionId: null }));
      return;
    }
    void fetchPollsForPosts([postId], userId)
      .then((polls) => {
        const refreshed = polls.get(postId);
        if (active && refreshed) setResults(refreshed);
      })
      .catch((error: unknown) => {
        console.error("Could not load the viewer's poll vote.", error);
      });
    return () => {
      active = false;
    };
  }, [postId, userId]);

  const vote = async (optionId: string) => {
    if (!user) {
      openAuthGate({
        title: "Vote in this poll",
        speech: "Create your student pass to share your opinion with your campus.",
        outfit: "shs_welcome",
      });
      return;
    }
    if (submitting) return;

    const previous = results;
    const selectedOption = previous.options.find((option) => option.id === optionId);
    if (!selectedOption) return;
    setSubmitting(true);
    setResults({
      ...previous,
      votedOptionId: optionId,
      totalVotes: previous.votedOptionId ? previous.totalVotes : previous.totalVotes + 1,
      options: previous.options.map((option) => ({
        ...option,
        voteCount: option.voteCount +
          (option.id === optionId ? 1 : 0) -
          (option.id === previous.votedOptionId ? 1 : 0),
      })),
    });

    try {
      const updated = await castPollVote(poll.id, optionId);
      setResults(updated);
    } catch (error) {
      setResults(previous);
      console.error("Could not cast a poll vote.", error);
      toast(error instanceof Error ? error.message : "Could not cast your vote.", "danger");
    } finally {
      setSubmitting(false);
    }
  };

  const showResults = Boolean(results.votedOptionId);

  return (
    <section className="mt-3 rounded-2xl border border-line bg-card p-3" aria-label="Poll">
      <h3 className="text-sm font-extrabold leading-snug text-ink">{results.question}</h3>
      <div className="mt-3 space-y-2">
        {results.options.map((option) => {
          const percentage = results.totalVotes > 0
            ? Math.round((option.voteCount / results.totalVotes) * 100)
            : 0;
          const selected = results.votedOptionId === option.id;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => void vote(option.id)}
              disabled={submitting}
              aria-pressed={selected}
              className="relative flex min-h-11 w-full items-center overflow-hidden rounded-xl border border-line bg-page px-3 text-left transition-colors hover:border-brand-soft disabled:cursor-wait"
            >
              {showResults && (
                <motion.span
                  initial={false}
                  animate={{ width: `${percentage}%` }}
                  transition={{ type: "spring", stiffness: 120, damping: 20 }}
                  className={`absolute inset-y-0 left-0 rounded-lg ${selected ? "bg-brand-wash" : "bg-line/70"}`}
                  aria-hidden
                />
              )}
              <span className="relative z-10 flex min-w-0 flex-1 items-center gap-2 text-xs font-bold text-ink">
                {selected ? <Check size={15} className="shrink-0 text-brand-deep" strokeWidth={3} aria-label="Your vote" /> : <span className="size-[15px] shrink-0" />}
                <span className="truncate">{option.text}</span>
              </span>
              {showResults && (
                <span className="relative z-10 ml-2 shrink-0 text-[10px] font-extrabold tabular-nums text-ink-muted">
                  {percentage}%
                </span>
              )}
            </button>
          );
        })}
      </div>
      <p className="mt-2 flex items-center gap-1.5 text-[10px] font-semibold text-ink-muted" aria-live="polite">
        {submitting && <Loader2 size={12} className="animate-spin" aria-hidden />}
        {results.totalVotes.toLocaleString()} {results.totalVotes === 1 ? "vote" : "votes"}
        {results.votedOptionId && " · You can change your vote"}
      </p>
    </section>
  );
}
