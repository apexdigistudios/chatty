import { requireUserId, supabase } from "@/lib/supabase";

export const CONFESSION_REPORT_REASONS = [
  "Bullying",
  "Sexual content",
  "Personal information exposure",
  "Threats",
  "Hate speech",
  "False accusations",
  "Other inappropriate content",
] as const;

export type ConfessionReportReason = (typeof CONFESSION_REPORT_REASONS)[number];
export type ConfessionReportResult = "submitted" | "duplicate";

export async function submitConfessionReport(input: {
  confessionId: string;
  reason: ConfessionReportReason;
  details: string;
}): Promise<ConfessionReportResult> {
  await requireUserId();
  const { data, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw new Error(sessionError.message);
  const accessToken = data.session?.access_token;
  if (!accessToken) throw new Error("Please sign in to report this confession.");

  const response = await fetch("/api/confessions/report", {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      confessionId: input.confessionId,
      reason: input.reason,
      details: input.details.trim() || null,
    }),
  });
  const result = await response.json() as { status?: string; error?: string };
  if (response.status === 409) return "duplicate";
  if (!response.ok || result.status !== "submitted") {
    throw new Error(result.error ?? "Could not submit your report.");
  }
  return "submitted";
}
