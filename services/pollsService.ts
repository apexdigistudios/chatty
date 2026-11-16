import { supabase } from "@/lib/supabase";
import type { PostPoll } from "@/types/models";

interface PollRow {
  id: string;
  post_id: string;
  question: string;
}

interface PollOptionRow {
  id: string;
  poll_id: string;
  text: string;
  sort_order: number;
  vote_count: number;
}

interface PollVoteRow {
  poll_id: string;
  option_id: string;
}

const MISSING_TABLE_CODES = new Set(["42P01", "PGRST205"]);

export async function fetchPollsForPosts(
  postIds: string[],
  userId: string | null
): Promise<Map<string, PostPoll>> {
  const result = new Map<string, PostPoll>();
  if (postIds.length === 0) return result;

  const { data: polls, error: pollError } = await supabase
    .from("polls")
    .select("id, post_id, question")
    .in("post_id", postIds)
    .returns<PollRow[]>();
  if (pollError) {
    if (MISSING_TABLE_CODES.has(pollError.code)) return result;
    throw new Error(pollError.message);
  }
  if (!polls?.length) return result;

  const pollIds = polls.map((poll) => poll.id);
  const [optionResult, voteResult] = await Promise.all([
    supabase
      .from("poll_options")
      .select("id, poll_id, text, sort_order, vote_count")
      .in("poll_id", pollIds)
      .order("sort_order", { ascending: true })
      .returns<PollOptionRow[]>(),
    userId
      ? supabase
          .from("poll_votes")
          .select("poll_id, option_id")
          .in("poll_id", pollIds)
          .eq("user_id", userId)
          .returns<PollVoteRow[]>()
      : Promise.resolve({ data: [] as PollVoteRow[], error: null }),
  ]);
  if (optionResult.error) throw new Error(optionResult.error.message);
  if (voteResult.error) throw new Error(voteResult.error.message);

  const optionsByPoll = new Map<string, PollOptionRow[]>();
  for (const option of optionResult.data ?? []) {
    const options = optionsByPoll.get(option.poll_id) ?? [];
    options.push(option);
    optionsByPoll.set(option.poll_id, options);
  }
  const votesByPoll = new Map((voteResult.data ?? []).map((vote) => [vote.poll_id, vote.option_id]));

  for (const poll of polls) {
    const options = (optionsByPoll.get(poll.id) ?? []).map((option) => ({
      id: option.id,
      text: option.text,
      voteCount: option.vote_count,
    }));
    result.set(poll.post_id, {
      id: poll.id,
      question: poll.question,
      options,
      totalVotes: options.reduce((total, option) => total + option.voteCount, 0),
      votedOptionId: votesByPoll.get(poll.id) ?? null,
    });
  }
  return result;
}

export async function castPollVote(pollId: string, optionId: string): Promise<PostPoll> {
  const { error } = await supabase.rpc("vote_on_poll", {
    p_poll_id: pollId,
    p_option_id: optionId,
  });
  if (error) throw new Error(error.message);

  const { data: poll, error: pollError } = await supabase
    .from("polls")
    .select("post_id")
    .eq("id", pollId)
    .single<{ post_id: string }>();
  if (pollError) throw new Error(pollError.message);
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw new Error(authError.message);
  const polls = await fetchPollsForPosts([poll.post_id], authData.user?.id ?? null);
  const refreshed = polls.get(poll.post_id);
  if (!refreshed) throw new Error("The poll results could not be refreshed.");
  return refreshed;
}
