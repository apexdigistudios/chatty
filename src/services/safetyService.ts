import { supabase } from "../lib/supabase";

export interface SafetyPost {
  id: string;
  user_id: string;
  content: string;
  status: string;
  created_at: string;
  author: { username: string } | null;
}

export interface SafetyReport {
  id: string;
  gist_id: string;
  reporter_id: string;
  reason: string;
  details: string | null;
  is_serious_safety: boolean;
  created_at: string;
}

export interface FlaggedPromotion {
  id: string;
  post_id: string;
  user_id: string;
  package_type: string;
  created_at: string;
  post: SafetyPost | null;
  moderation: {
    flagged_categories: Record<string, boolean> | null;
    category_scores: Record<string, number> | null;
    created_at: string;
  } | null;
}

export interface PausedGist {
  post: SafetyPost;
  reports: SafetyReport[];
}

export async function fetchSafetyQueue(): Promise<{
  flaggedPromotions: FlaggedPromotion[];
  pausedGists: PausedGist[];
  seriousReports: Array<{ report: SafetyReport; post: SafetyPost | null }>;
}> {
  const [promotionsResult, hiddenResult, seriousResult] = await Promise.all([
    supabase
      .from("spotlight_promotions")
      .select("id, post_id, user_id, package_type, created_at")
      .eq("status", "flagged")
      .order("created_at", { ascending: false })
      .limit(100)
      .returns<Array<Omit<FlaggedPromotion, "post" | "moderation">>>(),
    supabase
      .from("posts")
      .select("id, user_id, content, status, created_at, author:profiles(username)")
      .eq("is_hidden", true)
      .neq("status", "removed")
      .order("created_at", { ascending: false })
      .limit(100)
      .returns<SafetyPost[]>(),
    supabase
      .from("gist_reports")
      .select("id, gist_id, reporter_id, reason, details, is_serious_safety, created_at")
      .eq("is_serious_safety", true)
      .order("created_at", { ascending: false })
      .limit(100)
      .returns<SafetyReport[]>(),
  ]);
  if (promotionsResult.error) throw new Error(promotionsResult.error.message);
  if (hiddenResult.error) throw new Error(hiddenResult.error.message);
  if (seriousResult.error) throw new Error(seriousResult.error.message);

  const promotions = promotionsResult.data ?? [];
  const hiddenPosts = hiddenResult.data ?? [];
  const seriousReports = seriousResult.data ?? [];
  const promotionPostIds = [...new Set(promotions.map((item) => item.post_id))];
  const hiddenPostIds = hiddenPosts.map((item) => item.id);
  const seriousPostIds = [...new Set(seriousReports.map((item) => item.gist_id))];
  const allPostIds = [...new Set([...promotionPostIds, ...hiddenPostIds, ...seriousPostIds])];

  if (allPostIds.length === 0) {
    return { flaggedPromotions: [], pausedGists: [], seriousReports: [] };
  }

  const [postResult, logResult, hiddenReportResult] = await Promise.all([
    supabase
      .from("posts")
      .select("id, user_id, content, status, created_at, author:profiles(username)")
      .in("id", allPostIds)
      .returns<SafetyPost[]>(),
    promotions.length > 0
      ? supabase
          .from("moderation_logs")
          .select("promotion_id, flagged_categories, category_scores, created_at")
          .in("promotion_id", promotions.map((item) => item.id))
          .order("created_at", { ascending: false })
          .returns<Array<{
            promotion_id: string;
            flagged_categories: Record<string, boolean> | null;
            category_scores: Record<string, number> | null;
            created_at: string;
          }>>()
      : Promise.resolve({ data: [], error: null }),
    hiddenPostIds.length > 0
      ? supabase
          .from("gist_reports")
          .select("id, gist_id, reporter_id, reason, details, is_serious_safety, created_at")
          .in("gist_id", hiddenPostIds)
          .order("created_at", { ascending: false })
          .returns<SafetyReport[]>()
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (postResult.error) throw new Error(postResult.error.message);
  if (logResult.error) throw new Error(logResult.error.message);
  if (hiddenReportResult.error) throw new Error(hiddenReportResult.error.message);

  const postsById = new Map((postResult.data ?? []).map((post) => [post.id, post]));
  const latestLogByPromotion = new Map<string, NonNullable<FlaggedPromotion["moderation"]>>();
  for (const log of logResult.data ?? []) {
    if (!latestLogByPromotion.has(log.promotion_id)) {
      latestLogByPromotion.set(log.promotion_id, {
        flagged_categories: log.flagged_categories,
        category_scores: log.category_scores,
        created_at: log.created_at,
      });
    }
  }
  const reportsByPost = new Map<string, SafetyReport[]>();
  for (const report of hiddenReportResult.data ?? []) {
    const list = reportsByPost.get(report.gist_id) ?? [];
    list.push(report);
    reportsByPost.set(report.gist_id, list);
  }

  return {
    flaggedPromotions: promotions.map((promotion) => ({
      ...promotion,
      post: postsById.get(promotion.post_id) ?? null,
      moderation: latestLogByPromotion.get(promotion.id) ?? null,
    })),
    pausedGists: hiddenPosts.map((post) => ({ post, reports: reportsByPost.get(post.id) ?? [] })),
    seriousReports: seriousReports.map((report) => ({
      report,
      post: postsById.get(report.gist_id) ?? null,
    })),
  };
}

export type SafetyAdminAction = "dismiss_reports" | "remove_post" | "suspend_creator";

export async function runSafetyAdminAction(
  action: SafetyAdminAction,
  target: { postId?: string; creatorId?: string }
): Promise<void> {
  const { data, error } = await supabase.functions.invoke<{ success?: boolean; error?: string }>(
    "safety-admin-action",
    {
      body: {
        action,
        ...(target.postId ? { post_id: target.postId } : {}),
        ...(target.creatorId ? { creator_id: target.creatorId } : {}),
      },
    }
  );
  if (error) throw new Error(error.message);
  if (!data?.success) throw new Error(data?.error ?? "The safety action could not be completed.");
}
