import type { Metadata } from "next";
import { PublicProfilePage } from "@/views/PublicProfilePage";
import { fetchPublicPosts, fetchPublicProfileData } from "@/lib/publicContent.server";
import type { Post, PublicProfile } from "@/types/models";

export const metadata: Metadata = {
  title: "Student Profile | Gist me",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";
type RouteProps = { params: Promise<{ userId: string }> };

export default async function PublicProfileRoute({ params }: RouteProps) {
  const { userId } = await params;
  const [profileResult, postsResult] = await Promise.allSettled([
    fetchPublicProfileData(userId),
    fetchPublicPosts({ authorId: userId, limit: 30 }),
  ]);
  if (profileResult.status === "rejected") console.error("Could not preload public profile data.", profileResult.reason);
  if (postsResult.status === "rejected") console.error("Could not preload public profile gists.", postsResult.reason);
  const initialProfile: PublicProfile | null = profileResult.status === "fulfilled" ? profileResult.value : null;
  const initialPosts: Post[] | null = postsResult.status === "fulfilled" ? postsResult.value : null;
  const initialError = profileResult.status === "rejected"
    ? "This public profile could not be loaded right now."
    : !initialProfile
      ? "This student profile does not exist."
      : postsResult.status === "rejected"
        ? "Public gists could not be loaded right now."
        : null;

  return <PublicProfilePage key={userId} initialUserId={userId} initialProfile={initialProfile} initialPosts={initialPosts} initialError={initialError} />;
}
