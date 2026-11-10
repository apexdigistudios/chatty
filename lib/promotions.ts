import type { Post } from "@/types/models";

export function isPostPromoted(
  post: Pick<Post, "isPromoted" | "promotedUntil">,
  now = Date.now()
): boolean {
  return post.isPromoted === true &&
    typeof post.promotedUntil === "string" &&
    Date.parse(post.promotedUntil) > now;
}
