import type { Metadata } from "next";
import { ExplorePage } from "@/views/ExplorePage";

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

export default ExplorePage;
