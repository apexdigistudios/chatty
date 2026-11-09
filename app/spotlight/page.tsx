import type { Metadata } from "next";
import { SpotlightPage } from "@/views/SpotlightPage";
import { fetchPublicConfessions, fetchPublicPosts } from "@/lib/publicContent.server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "SHS Spotlight Gists | Gist me",
  description:
    "Discover active Spotlight gists shared with Ghanaian Senior High School communities.",
  alternates: { canonical: "https://www.gistme.online/spotlight" },
  openGraph: {
    title: "SHS Spotlight Gists | Gist me",
    description:
      "Discover active Spotlight gists shared with Ghanaian Senior High School communities.",
    url: "https://www.gistme.online/spotlight",
    type: "website",
  },
};

export default async function SpotlightRoute() {
  const [postsResult, confessionsResult] = await Promise.allSettled([
    fetchPublicPosts({ limit: 15 }),
    fetchPublicConfessions(15),
  ]);
  if (postsResult.status === "rejected") console.error("Could not preload public Spotlight gists.", postsResult.reason);
  if (confessionsResult.status === "rejected") console.error("Could not preload approved Spotlight confessions.", confessionsResult.reason);
  return (
    <SpotlightPage
      initialPosts={postsResult.status === "fulfilled" ? postsResult.value : null}
      initialConfessions={confessionsResult.status === "fulfilled" ? confessionsResult.value : null}
      initialError={postsResult.status === "rejected" || confessionsResult.status === "rejected" ? "Public Spotlight videos could not be loaded right now." : null}
    />
  );
}
