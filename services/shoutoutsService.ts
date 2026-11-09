import { currentUserId, requireUserId, supabase } from "@/lib/supabase";
import { trackEvent } from "@/lib/mixpanel";
import type { Profile } from "@/types/models";
import type { Shoutout, ShoutoutStatus } from "@/types/models";

interface RawShoutout {
  id: string;
  sender_id: string;
  sender_name: string;
  sender_school_id: string | null;
  recipient_user_id: string | null;
  recipient_school_id: string;
  recipient_name: string;
  recipient_class: string | null;
  message: string;
  envelope_theme: string | null;
  stamp: string | null;
  status: ShoutoutStatus;
  created_at: string;
  arrived_at: string | null;
  delivered_at: string | null;
  opened_at: string | null;
}

const SHOUTOUT_SELECT = `id, sender_id, sender_name, sender_school_id, recipient_user_id,
  recipient_school_id, recipient_name, recipient_class, message, envelope_theme, stamp,
  status, created_at, arrived_at, delivered_at, opened_at`;

function mapShoutout(row: RawShoutout): Shoutout {
  return {
    id: row.id,
    senderId: row.sender_id,
    senderName: row.sender_name,
    senderSchoolId: row.sender_school_id,
    recipientUserId: row.recipient_user_id,
    recipientSchoolId: row.recipient_school_id,
    recipientName: row.recipient_name,
    recipientClass: row.recipient_class ?? "",
    message: row.message,
    envelopeTheme: row.envelope_theme ?? "school_crest",
    stamp: row.stamp ?? "priority",
    status: row.status,
    createdAt: row.created_at,
    arrivedAt: row.arrived_at,
    deliveredAt: row.delivered_at,
    openedAt: row.opened_at,
  };
}

interface RawVerificationProfile {
  id: string;
  is_verified: boolean | null;
  verified_title: string | null;
  verified_expires_at: string | null;
  is_admin: boolean | null;
  role: string | null;
}

async function mapShoutouts(rows: RawShoutout[]): Promise<Shoutout[]> {
  if (rows.length === 0) return [];
  const profileIds = [...new Set(rows.flatMap((row) =>
    [row.sender_id, row.recipient_user_id].filter((id): id is string => Boolean(id))
  ))];
  const { data, error } = await supabase
    .from("profiles")
    .select("id, is_verified, verified_title, verified_expires_at, is_admin, role")
    .in("id", profileIds)
    .returns<RawVerificationProfile[]>();
  if (error) {
    if (error.code === "42703" || error.code === "PGRST204") return rows.map(mapShoutout);
    throw new Error(error.message);
  }
  const profiles = new Map((data ?? []).map((profile) => [profile.id, profile]));
  return rows.map((row) => {
    const shoutout = mapShoutout(row);
    const sender = profiles.get(row.sender_id);
    const recipient = row.recipient_user_id ? profiles.get(row.recipient_user_id) : undefined;
    return {
      ...shoutout,
      senderIsVerified: sender?.is_verified ?? false,
      senderVerifiedTitle: sender?.verified_title ?? null,
      senderVerifiedExpiresAt: sender?.verified_expires_at ?? null,
      senderIsAdmin: sender?.is_admin ?? false,
      senderRole: sender?.role ?? null,
      recipientIsVerified: recipient?.is_verified ?? false,
      recipientVerifiedTitle: recipient?.verified_title ?? null,
      recipientVerifiedExpiresAt: recipient?.verified_expires_at ?? null,
      recipientIsAdmin: recipient?.is_admin ?? false,
      recipientRole: recipient?.role ?? null,
    };
  });
}

export interface CreateShoutoutInput {
  recipientSchoolId: string;
  recipientName: string;
  recipientClass?: string;
  recipientUserId?: string | null;
  message: string;
  envelopeTheme?: string;
  stamp?: string;
}

/** Sends an open inter-school letter. No follow or friendship is required. */
export async function createShoutout(input: CreateShoutoutInput): Promise<Shoutout> {
  const userId = await requireUserId();
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("username, full_name, school_id")
    .eq("id", userId)
    .single<{ username: string; full_name: string | null; school_id: string | null }>();
  if (profileError) throw new Error(profileError.message);

  const { data, error } = await supabase
    .from("shoutouts")
    .insert({
      sender_id: userId,
      sender_name: profile.full_name || profile.username,
      sender_school_id: profile.school_id,
      recipient_user_id: input.recipientUserId ?? null,
      recipient_school_id: input.recipientSchoolId,
      recipient_name: input.recipientName.trim(),
      recipient_class: input.recipientClass?.trim() ?? "",
      message: input.message.trim(),
      envelope_theme: input.envelopeTheme ?? "school_crest",
      stamp: input.stamp ?? "priority",
      status: "in_transit",
    })
    .select(SHOUTOUT_SELECT)
    .single<RawShoutout>();
  if (error) {
    trackEvent("confession_shoutout_interaction", {
      interaction_type: "shoutout_sent",
      interaction_result: "failed",
      timestamp_source: new Date().toISOString(),
    });
    if (error.code === "PGRST205" || error.code === "42P01") {
      throw new Error("Shoutouts need migration-step10.sql to be applied first.");
    }
    throw new Error(error.message);
  }
  trackEvent("confession_shoutout_interaction", {
    interaction_type: "shoutout_sent",
    interaction_result: "submitted",
    timestamp_source: new Date().toISOString(),
  });
  return mapShoutout(data);
}

/** Inbox: direct account mail plus exact open-postal matches for this student. */
export async function fetchInbox(profile: Profile | null): Promise<Shoutout[]> {
  const userId = await requireUserId();
  const requests = [
    supabase
      .from("shoutouts")
      .select(SHOUTOUT_SELECT)
      .eq("recipient_user_id", userId)
      .order("created_at", { ascending: false })
      .returns<RawShoutout[]>(),
  ];

  const officialName = profile?.fullName?.trim() || profile?.username?.trim();
  if (profile?.schoolId && officialName) {
    let named = supabase
      .from("shoutouts")
      .select(SHOUTOUT_SELECT)
      .eq("recipient_school_id", profile.schoolId)
      .ilike("recipient_name", officialName)
      .order("created_at", { ascending: false });
    if (profile.classForm?.trim()) named = named.eq("recipient_class", profile.classForm.trim());
    requests.push(named.returns<RawShoutout[]>());
  }

  const results = await Promise.all(requests);
  const rows: RawShoutout[] = [];
  const seen = new Set<string>();
  for (const result of results) {
    if (result.error) {
      if (result.error.code === "PGRST205" || result.error.code === "42P01") return [];
      throw new Error(result.error.message);
    }
    for (const row of result.data ?? []) {
      if (!seen.has(row.id)) {
        seen.add(row.id);
        rows.push(row);
      }
    }
  }
  rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
  return mapShoutouts(rows);
}

/** Outbox: every letter this student has dispatched, with its delivery stage. */
export async function fetchOutbox(): Promise<Shoutout[]> {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from("shoutouts")
    .select(SHOUTOUT_SELECT)
    .eq("sender_id", userId)
    .order("created_at", { ascending: false })
    .returns<RawShoutout[]>();
  if (error) {
    if (error.code === "PGRST205" || error.code === "42P01") return [];
    throw new Error(error.message);
  }
  return mapShoutouts(data ?? []);
}

export async function fetchSentShoutoutCount(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from("shoutouts")
    .select("id", { count: "exact", head: true })
    .eq("sender_id", userId);
  if (error) {
    if (error.code === "PGRST205" || error.code === "42P01") return 0;
    throw new Error(error.message);
  }
  return count ?? 0;
}

/** Moves a letter forward one delivery stage and persists timestamps in Supabase. */
export async function advanceShoutoutDelivery(id: string, current: ShoutoutStatus): Promise<ShoutoutStatus> {
  const next: ShoutoutStatus = current === "in_transit" ? "arrived" : "delivered";
  if (current === "delivered") return "delivered";
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("shoutouts")
    .update({
      status: next,
      ...(next === "arrived" ? { arrived_at: now } : { delivered_at: now }),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
  return next;
}

/** Wax-seal opening is also recorded so a sender can see the letter was opened. */
export async function markShoutoutOpened(id: string): Promise<void> {
  const { error } = await supabase
    .from("shoutouts")
    .update({ opened_at: new Date().toISOString(), status: "delivered", delivered_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

/** Lightweight availability probe for the optional Step 10 table. */
export async function shoutoutsAvailable(): Promise<boolean> {
  const userId = await currentUserId();
  if (!userId) return false;
  const { error } = await supabase.from("shoutouts").select("id").limit(1);
  return !(error && (error.code === "PGRST205" || error.code === "42P01"));
}
