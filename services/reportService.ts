import { requireUserId, supabase } from "@/lib/supabase";

export const GIST_REPORT_REASONS = [
  { value: "bullying", label: "Bullying / Harassment" },
  { value: "hate_speech", label: "Hate Speech" },
  { value: "violence", label: "Violence / Threats" },
  { value: "sexual", label: "Sexual Content" },
  { value: "scam", label: "Scam / Impersonation" },
  { value: "privacy", label: "Privacy Violation" },
  { value: "spam", label: "Spam" },
  { value: "other", label: "Other" },
] as const;

export type GistReportReason = (typeof GIST_REPORT_REASONS)[number]["value"];
export type GistReportResult = "submitted" | "duplicate";

export async function submitGistReport(input: {
  gistId: string;
  reason: GistReportReason;
  details?: string;
}): Promise<GistReportResult> {
  const cleanDetails = input.details?.trim() || null;
  if (cleanDetails && cleanDetails.length > 1000) {
    throw new Error("Report details must be 1,000 characters or fewer.");
  }
  const reporterId = await requireUserId();
  const { error } = await supabase.from("gist_reports").insert({
    gist_id: input.gistId,
    reporter_id: reporterId,
    reason: input.reason,
    details: cleanDetails,
  });

  if (error && (error.code === "23505" || error.message.includes("gist_reports_gist_reporter_unique"))) {
    return "duplicate";
  }
  if (error) throw new Error(error.message);
  return "submitted";
}
