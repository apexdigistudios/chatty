import type { Metadata } from "next";
import { SpotlightPage } from "@/views/SpotlightPage";

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

export default SpotlightPage;
