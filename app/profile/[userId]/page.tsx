import type { Metadata } from "next";
import { PublicProfilePage } from "@/views/PublicProfilePage";
import { fetchPublicPosts, fetchPublicProfileData } from "@/lib/publicContent.server";
import type { Post, PublicProfile } from "@/types/models";

export const dynamic = "force-dynamic";
type RouteProps = { params: Promise<{ userId: string }> };

export async function generateMetadata({ params }: RouteProps): Promise<Metadata> {
  const { userId } = await params;
  try {
    const profile = await fetchPublicProfileData(userId);
    if (!profile) return { title: "Student Profile | Gist me", robots: { index: false, follow: false } };

    const title = `${profile.fullName?.trim() || `@${profile.username}`} on Gist me`;
    const description = profile.bio?.trim().slice(0, 160) || `View @${profile.username}'s profile and campus gists on Gist me.`;
    const profilePath = `/profile/${encodeURIComponent(profile.username)}`;
    const imagePath = `/api/og/profile/${encodeURIComponent(profile.username)}`;
    return {
      title,
      description,
      alternates: { canonical: profilePath },
      openGraph: {
        type: "profile",
        siteName: "Gist me",
        title,
        description,
        url: profilePath,
        images: [{ url: imagePath, width: 1200, height: 630, alt: `${title} QR profile card` }],
      },
      twitter: { card: "summary_large_image", title, description, images: [imagePath] },
    };
  } catch (error) {
    console.error("Could not generate public profile metadata.", error);
    return { title: "Student Profile | Gist me", robots: { index: false, follow: false } };
  }
}

export default async function PublicProfileRoute({ params }: RouteProps) {
  const { userId } = await params;
  const [profileResult] = await Promise.allSettled([fetchPublicProfileData(userId)]);
  const postsResult = profileResult.status === "fulfilled" && profileResult.value
    ? (await Promise.allSettled([fetchPublicPosts({ authorId: profileResult.value.id, limit: 30 })]))[0]
    : { status: "fulfilled" as const, value: [] as Post[] };
  if (profileResult.status === "rejected") console.error("Could not preload public profile data.", profileResult.reason);
  if (postsResult.status === "rejected") console.error("Could not preload public profile gists.", postsResult.reason);
  const initialProfile: PublicProfile | null | undefined =
    profileResult.status === "fulfilled" ? profileResult.value : undefined;
  const initialPosts: Post[] | null = postsResult.status === "fulfilled" ? postsResult.value : null;
  const initialError =
    profileResult.status === "fulfilled" && !initialProfile
      ? "This student profile does not exist."
      : profileResult.status === "fulfilled" && postsResult.status === "rejected"
        ? "Public gists could not be loaded right now."
        : null;

  return <PublicProfilePage key={userId} initialUserId={userId} initialProfile={initialProfile} initialPosts={initialPosts} initialError={initialError} />;
}
