import { currentUserId, requireUserId, supabase } from "@/lib/supabase";
import { isBrowserOffline, readOfflineValue, writeOfflineValue } from "@/lib/offlineCache";
import { shortNameOf } from "@/lib/media";

export interface FollowProfile {
  id: string;
  username: string;
  avatarUrl: string | null;
  schoolName: string | null;
}

let followsTableUnavailable = false;
const EMPTY_FOLLOW_SUMMARY: FollowSummary = {
  followerCount: 0,
  followingCount: 0,
  isFollowing: false,
};

export interface FollowSummary {
  followerCount: number;
  followingCount: number;
  isFollowing: boolean;
}

export async function fetchFollowProfiles(
  profileId: string,
  relation: "followers" | "following"
): Promise<FollowProfile[]> {
  const idColumn = relation === "followers" ? "follower_id" : "following_id";
  const filterColumn = relation === "followers" ? "following_id" : "follower_id";
  const { data: relations, error: relationError } = await supabase
    .from("follows")
    .select("follower_id, following_id")
    .eq(filterColumn, profileId)
    .order("created_at", { ascending: false });
  if (relationError) throw new Error(relationError.message);
  const ids = (relations ?? []).map((item) => item[idColumn]);
  if (ids.length === 0) return [];

  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, avatar_url, school:schools!school_id(name)")
    .in("id", ids)
    .returns<Array<{ id: string; username: string; avatar_url: string | null; school: { name: string } | null }>>();
  if (error) throw new Error(error.message);
  const profilesById = new Map((data ?? []).map((profile) => [profile.id, profile]));
  return ids.flatMap((id) => {
    const profile = profilesById.get(id);
    return profile
      ? [{
          id: profile.id,
          username: profile.username,
          avatarUrl: profile.avatar_url,
          schoolName: profile.school ? shortNameOf(profile.school.name) : null,
        }]
      : [];
  });
}

export async function fetchFollowingIds(userId?: string | null): Promise<string[]> {
  const viewerId = userId === undefined ? await currentUserId() : userId;
  if (!viewerId || followsTableUnavailable) return [];
  const cacheKey = `following:${viewerId}`;
  if (isBrowserOffline()) return (await readOfflineValue<string[]>(cacheKey)) ?? [];

  const { data, error } = await supabase
    .from("follows")
    .select("following_id")
    .eq("follower_id", viewerId)
    .returns<Array<{ following_id: string }>>();
  if (error && (error.code === "42P01" || error.code === "PGRST205")) {
    followsTableUnavailable = true;
    console.warn("The follows table is not available; apply follows_and_personalized_feed.sql to enable followed feeds.");
    return [];
  }
  if (error) throw new Error(error.message);
  const ids = (data ?? []).map((row) => row.following_id);
  try {
    await writeOfflineValue(cacheKey, ids);
  } catch (cacheError) {
    console.warn("Could not cache followed accounts for offline feed ranking.", cacheError);
  }
  return ids;
}

export async function fetchFollowSummary(
  profileId: string,
  viewerId?: string | null
): Promise<FollowSummary> {
  const currentId = viewerId === undefined ? await currentUserId() : viewerId;
  const [followers, following, relation] = await Promise.all([
    supabase.from("follows").select("id", { count: "exact", head: true }).eq("following_id", profileId),
    supabase.from("follows").select("id", { count: "exact", head: true }).eq("follower_id", profileId),
    currentId
      ? supabase
          .from("follows")
          .select("id")
          .eq("follower_id", currentId)
          .eq("following_id", profileId)
          .maybeSingle<{ id: string }>()
      : Promise.resolve({ data: null, error: null }),
  ]);
  for (const result of [followers, following, relation]) {
    if (result.error && (result.error.code === "42P01" || result.error.code === "PGRST205")) {
      followsTableUnavailable = true;
      console.warn("The follows table is not available; apply follows_and_personalized_feed.sql to enable follow profiles.");
      return EMPTY_FOLLOW_SUMMARY;
    }
    if (result.error) throw new Error(result.error.message);
  }
  return {
    followerCount: followers.count ?? 0,
    followingCount: following.count ?? 0,
    isFollowing: Boolean(relation.data),
  };
}

export async function followUser(profileId: string): Promise<void> {
  const followerId = await requireUserId();
  if (profileId === followerId) throw new Error("You cannot follow your own account.");
  const { error } = await supabase.from("follows").insert({
    follower_id: followerId,
    following_id: profileId,
  });
  if (error && error.code !== "23505") throw new Error(error.message);
  const ids = await fetchFollowingIds(followerId);
  if (!ids.includes(profileId)) {
    try {
      await writeOfflineValue(`following:${followerId}`, [...ids, profileId]);
    } catch (cacheError) {
      console.warn("Could not update the offline followed-account cache.", cacheError);
    }
  }
}

export async function unfollowUser(profileId: string): Promise<void> {
  const followerId = await requireUserId();
  const { error } = await supabase
    .from("follows")
    .delete()
    .eq("follower_id", followerId)
    .eq("following_id", profileId);
  if (error) throw new Error(error.message);
  const ids = await fetchFollowingIds(followerId);
  try {
    await writeOfflineValue(`following:${followerId}`, ids.filter((id) => id !== profileId));
  } catch (cacheError) {
    console.warn("Could not update the offline followed-account cache.", cacheError);
  }
}

export async function recordPostShare(postId: string): Promise<void> {
  const userId = await currentUserId();
  if (!userId) return;
  const { error } = await supabase.from("post_shares").insert({ post_id: postId, user_id: userId });
  if (error && error.code !== "23505") throw new Error(error.message);
}
