import type { Metadata } from "next";
import { ExplorePage } from "@/views/ExplorePage";
import { fetchPopularPublicPosts } from "@/lib/publicContent.server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Explore Ghana SHS Gists | Gist me",
  description:
    "Explore student conversations, campus communities, and gists from Senior High Schools across Ghana.",
  alternates: { canonical: "https://www.gistme.online/explore" },
  openGraph: {
    title: "Explore Ghana SHS Gists | Gist me",
    description:
      "Explore student conversations and campus communities across Ghana.",
    url: "https://www.gistme.online/explore",
    type: "website",
  },
};

export default async function ExploreRoute() {
  try {
    return <ExplorePage initialGists={await fetchPopularPublicPosts(8)} />;
  } catch (error) {
    console.error("Could not preload public Explore gists.", error);
    return <ExplorePage initialGists={null} initialGistsError="Public gists could not be loaded right now." />;
  }
}
