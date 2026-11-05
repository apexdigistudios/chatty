import { countOf, currentUserId, requireUserId, supabase } from "@/lib/supabase";
import type { SchoolGroup } from "@/types/models";

const GROUP_SELECT = `id, school_id, name, description, emoji, created_by, created_at,
  memberships:group_memberships(count)`;

interface RawGroup {
  id: string;
  school_id: string;
  name: string;
  description: string;
  emoji: string;
  created_by: string;
  created_at: string;
  memberships: { count: number }[];
}

function mapGroup(row: RawGroup, memberIds: Set<string>): SchoolGroup {
  return {
    id: row.id,
    schoolId: row.school_id,
    name: row.name,
    description: row.description ?? "",
    emoji: row.emoji || "👥",
    createdBy: row.created_by,
    createdAt: row.created_at,
    memberCount: countOf(row.memberships),
    isMember: memberIds.has(row.id),
    postCount: 0,
  };
}

/** Reads the viewer's memberships; guests simply get an empty set. */
async function fetchMyMembershipIds(): Promise<Set<string>> {
  const userId = await currentUserId();
  if (!userId) return new Set();
  const { data, error } = await supabase
    .from("group_memberships")
    .select("group_id")
    .eq("user_id", userId);
  if (error) {
    if (error.code === "PGRST205" || error.code === "42P01") return new Set();
    throw new Error(error.message);
  }
  return new Set((data ?? []).map((row: { group_id: string }) => row.group_id));
}

/** All clubs/squads for one SHS, newest first, with live member counts. */
export async function fetchSchoolGroups(schoolId: string): Promise<SchoolGroup[]> {
  const [result, memberIds] = await Promise.all([
    supabase
      .from("school_groups")
      .select(GROUP_SELECT)
      .eq("school_id", schoolId)
      .order("created_at", { ascending: false })
      .returns<RawGroup[]>(),
    fetchMyMembershipIds(),
  ]);

  if (result.error) {
    // Step 9 migration not applied yet → show an empty Groups tab rather than an error.
    if (result.error.code === "PGRST205" || result.error.code === "42P01") return [];
    throw new Error(result.error.message);
  }
  return (result.data ?? []).map((row) => mapGroup(row, memberIds));
}

export async function fetchGroup(groupId: string): Promise<SchoolGroup | null> {
  const [result, memberIds] = await Promise.all([
    supabase.from("school_groups").select(GROUP_SELECT).eq("id", groupId).maybeSingle<RawGroup>(),
    fetchMyMembershipIds(),
  ]);
  if (result.error) throw new Error(result.error.message);
  return result.data ? mapGroup(result.data, memberIds) : null;
}

export interface CreateGroupInput {
  schoolId: string;
  name: string;
  description?: string;
  emoji?: string;
}

export async function createGroup(input: CreateGroupInput): Promise<SchoolGroup> {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from("school_groups")
    .insert({
      school_id: input.schoolId,
      name: input.name.trim(),
      description: input.description?.trim() ?? "",
      emoji: input.emoji || "👥",
      created_by: userId,
    })
    .select(GROUP_SELECT)
    .single<RawGroup>();

  if (error) {
    if (error.code === "23505") throw new Error("A club with that name already exists on this campus.");
    if (error.code === "PGRST205" || error.code === "42P01") {
      throw new Error("Clubs need migration-step9.sql to be applied first.");
    }
    throw new Error(error.message);
  }

  // Founders automatically join their new club.
  const { error: joinError } = await supabase
    .from("group_memberships")
    .insert({ group_id: data.id, user_id: userId });
  if (joinError && joinError.code !== "23505") throw new Error(joinError.message);

  return mapGroup(data, new Set([data.id]));
}

export async function joinGroup(groupId: string): Promise<void> {
  const userId = await requireUserId();
  const { error } = await supabase
    .from("group_memberships")
    .insert({ group_id: groupId, user_id: userId });
  if (error && error.code !== "23505") throw new Error(error.message);
}

export async function leaveGroup(groupId: string): Promise<void> {
  const userId = await requireUserId();
  const { error } = await supabase
    .from("group_memberships")
    .delete()
    .eq("group_id", groupId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

/** Clubs the signed-in student belongs to (used on the profile). */
export async function fetchMyGroups(): Promise<SchoolGroup[]> {
  const userId = await currentUserId();
  if (!userId) return [];
  const { data: memberships, error } = await supabase
    .from("group_memberships")
    .select("group_id")
    .eq("user_id", userId);
  if (error) {
    if (error.code === "PGRST205" || error.code === "42P01") return [];
    throw new Error(error.message);
  }
  const ids = (memberships ?? []).map((row: { group_id: string }) => row.group_id);
  if (ids.length === 0) return [];

  const { data, error: groupsError } = await supabase
    .from("school_groups")
    .select(GROUP_SELECT)
    .in("id", ids)
    .returns<RawGroup[]>();
  if (groupsError) throw new Error(groupsError.message);
  return (data ?? []).map((row) => mapGroup(row, new Set(ids)));
}
