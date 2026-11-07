import type { Metadata } from "next";
import { HomePage } from "@/views/HomePage";

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

export default HomePage;
