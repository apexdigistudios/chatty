import type { Metadata } from "next";
import { ShareProfilePage } from "@/views/ShareProfilePage";
import { fetchPublicProfileData } from "@/lib/publicContent.server";

export const dynamic = "force-dynamic";
type RouteProps = { params: Promise<{ username: string }> };

export async function generateMetadata({ params }: RouteProps): Promise<Metadata> {
  const { username } = await params;
  return {
    title: `Share @${username} | Gist me`,
    robots: { index: false, follow: true },
  };
}

export default async function ShareProfileRoute({ params }: RouteProps) {
  const { username } = await params;
  try {
    const profile = await fetchPublicProfileData(username);
    return <ShareProfilePage profile={profile} error={profile ? null : "This profile does not exist."} />;
  } catch (error) {
    console.error("Could not load the profile share card.", error);
    return <ShareProfilePage profile={null} error="This profile could not be loaded right now." />;
  }
}
