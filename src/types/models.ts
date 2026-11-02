/* ───────────── Database enums (mirror schema.sql check constraints) ───────────── */

export type PostType = "public" | "confession";
export type PostStatus = "active" | "flagged" | "removed";
export type ModerationStatus = "pending" | "approved" | "rejected";
export type ReportTargetType = "post" | "comment" | "confession";
export type ReportStatus = "pending" | "resolved";
export type AdminRoleKind = "global_admin" | "school_moderator";
/** Stored lowercase in the live database. Use `schoolTypeLabel()` for display. */
export type SchoolType = "public" | "private" | "mission" | "technical";
export type ReactionKind = "laugh" | "shock" | "heart" | "relatable";
export type ConfessionCategory =
  | "Crush Confession"
  | "School Secret"
  | "Relationship Gist"
  | "Friendship Gist";

export const CONFESSION_CATEGORIES: ConfessionCategory[] = [
  "Crush Confession",
  "School Secret",
  "Relationship Gist",
  "Friendship Gist",
];

export const SCHOOL_TYPES: SchoolType[] = ["public", "private", "mission", "technical"];

export function schoolTypeLabel(type: string | null | undefined): string {
  if (!type) return "School";
  return type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();
}

export const MAX_POST_LENGTH = 300;

/* ───────────── Raw rows (as stored) ───────────── */

export interface ProfileRow {
  id: string;
  username: string;
  school_id: string | null;
  avatar_url: string | null;
  cover_url?: string | null;
  bio: string;
  full_name?: string | null;
  class_form?: string | null;
  created_at: string;
}

export interface SchoolRow {
  id: string;
  name: string;
  region: string;
  school_type: SchoolType;
  crest_url: string | null;
  creator_id: string | null;
  created_at: string;
}

export interface AdminRoleRow {
  role: AdminRoleKind;
  school_id: string | null;
}

/* ───────────── View models consumed by the UI ───────────── */

export interface Profile {
  id: string;
  username: string;
  schoolId: string | null;
  avatarUrl: string | null;
  coverUrl: string | null;
  bio: string;
  /** Optional identity fields managed in Account Settings, not onboarding. */
  fullName?: string | null;
  classForm?: string | null;
  createdAt: string;
}

export interface School {
  id: string;
  name: string;
  /** Derived client-side from `name` (see `shortNameOf`). */
  shortName: string;
  region: string;
  schoolType: SchoolType;
  crestUrl: string | null;
  creatorId: string | null;
  createdAt: string;
  memberCount: number;
  postCount: number;
}

export type MediaType = "image" | "video";

export interface Post {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatar: string | null;
  authorSchoolId: string | null;
  schoolId: string;
  schoolName: string;
  schoolShort: string;
  schoolCrest: string | null;
  /** Optional sub-community (club/squad) this gist belongs to. */
  groupId: string | null;
  groupName: string | null;
  groupEmoji: string | null;
  content: string;
  mediaUrls: string[];
  /** Video posts get a custom autoplay-on-scroll player. */
  mediaType: MediaType;
  videoDurationSeconds?: number | null;
  status: PostStatus;
  createdAt: string;
  spotlightStatus?: "active" | null;
  spotlightExpiresAt?: string | null;
  spotlightTargetSchoolIds?: string[] | null;
  likeCount: number;
  likedByMe: boolean;
  commentCount: number;
}

/** A sub-community inside one SHS (club, squad, geng). */
export interface SchoolGroup {
  id: string;
  schoolId: string;
  name: string;
  description: string;
  emoji: string;
  createdBy: string;
  createdAt: string;
  memberCount: number;
  isMember: boolean;
  postCount: number;
}

/** Public profile view model (no private fields). */
export interface PublicProfile {
  id: string;
  username: string;
  avatarUrl: string | null;
  coverUrl: string | null;
  bio: string;
  fullName?: string | null;
  classForm?: string | null;
  schoolId: string | null;
  schoolName: string | null;
  schoolShort: string | null;
  schoolCrest: string | null;
  createdAt: string;
}

/* ───────────── Digital Shoutout Postal System ───────────── */

export type ShoutoutStatus = "in_transit" | "arrived" | "delivered";

export interface Shoutout {
  id: string;
  senderId: string;
  senderName: string;
  senderSchoolId: string | null;
  recipientUserId: string | null;
  recipientSchoolId: string;
  recipientName: string;
  recipientClass: string;
  message: string;
  envelopeTheme: string;
  stamp: string;
  status: ShoutoutStatus;
  createdAt: string;
  arrivedAt: string | null;
  deliveredAt: string | null;
  openedAt: string | null;
}

export interface Comment {
  id: string;
  postId: string;
  authorId: string;
  authorName: string;
  authorAvatar: string | null;
  authorSchoolId: string | null;
  authorSchoolShort: string | null;
  content: string;
  createdAt: string;
}

export interface Confession {
  id: string;
  content: string;
  category: ConfessionCategory;
  schoolId: string | null;
  moderationStatus: ModerationStatus;
  createdAt: string;
  publishedAt: string | null;
  reactions: Record<ReactionKind, number>;
  myReaction: ReactionKind | null;
}

export interface ReportTarget {
  preview: string;
  authorName: string | null;
  status: string | null;
  /** For comments, the parent post id so moderators can jump to context. */
  postId?: string;
}

export interface Report {
  id: string;
  reporterId: string;
  reporterName: string;
  targetType: ReportTargetType;
  targetId: string;
  schoolId: string | null;
  reason: string;
  status: ReportStatus;
  createdAt: string;
  target: ReportTarget | null;
}

export const emptyReactions = (): Record<ReactionKind, number> => ({
  laugh: 0,
  shock: 0,
  heart: 0,
  relatable: 0,
});
