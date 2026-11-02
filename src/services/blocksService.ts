import { currentUserId, requireUserId, supabase } from "../lib/supabase";

interface UserBlockRow {
  blocker_id: string;
  blocked_id: string;
}

let userBlocksTableAvailable: boolean | null = null;

/** Returns accounts blocked by or blocking the current student. */
export async function fetchBlockedUserIds(): Promise<string[]> {
  const userId = await currentUserId();
  if (!userId || userBlocksTableAvailable === false) return [];

  const { data, error } = await supabase
    .from("user_blocks")
    .select("blocker_id, blocked_id")
    .or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`)
    .returns<UserBlockRow[]>();
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") {
      userBlocksTableAvailable = false;
      return [];
    }
    throw new Error(error.message);
  }
  userBlocksTableAvailable = true;

  return [...new Set((data ?? []).map((row) =>
    row.blocker_id === userId ? row.blocked_id : row.blocker_id
  ))];
}

export async function blockUser(blockedId: string): Promise<void> {
  const userId = await requireUserId();
  if (blockedId === userId) throw new Error("You cannot block your own account.");

  const { error } = await supabase
    .from("user_blocks")
    .upsert({ blocker_id: userId, blocked_id: blockedId }, {
      onConflict: "blocker_id,blocked_id",
      ignoreDuplicates: true,
    });
  if (error) throw new Error(error.message);
}

export async function unblockUser(blockedId: string): Promise<void> {
  const userId = await requireUserId();
  const { error } = await supabase
    .from("user_blocks")
    .delete()
    .eq("blocker_id", userId)
    .eq("blocked_id", blockedId);
  if (error) throw new Error(error.message);
}
