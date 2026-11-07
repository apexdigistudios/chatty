import type { Metadata } from "next";
import { HomePage } from "@/views/HomePage";
import { fetchPublicConfessions, fetchPublicTrendingContent } from "@/lib/publicContent.server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Trending Ghana SHS Gists | Gist me",
  description:
    "See popular student conversations and trending campus gists from Ghanaian Senior High Schools.",
  alternates: { canonical: "https://www.gistme.online/trending" },
  openGraph: {
    title: "Trending Ghana SHS Gists | Gist me",
    description:
      "See popular student conversations and trending campus gists from Ghanaian Senior High Schools.",
    url: "https://www.gistme.online/trending",
    type: "website",
  },
};

export default async function TrendingPage() {
  const [trendingResult, confessionsResult] = await Promise.allSettled([
    fetchPublicTrendingContent(),
    fetchPublicConfessions(20),
  ]);
  if (trendingResult.status === "rejected") console.error("Could not preload public trending gists.", trendingResult.reason);
  if (confessionsResult.status === "rejected") console.error("Could not preload approved confessions for trending.", confessionsResult.reason);

  return (
    <HomePage
      initialTrendingPosts={trendingResult.status === "fulfilled" ? trendingResult.value.trendingPosts : null}
      initialTrendingFallback={trendingResult.status === "fulfilled" ? trendingResult.value.trendingFallback : null}
      initialConfessions={confessionsResult.status === "fulfilled" ? confessionsResult.value : null}
      initialPostsError={trendingResult.status === "rejected" ? "Public trending gists could not be loaded right now." : null}
      initialConfessionsError={confessionsResult.status === "rejected" ? "Approved confessions could not be loaded right now." : null}
    />
  );
}
