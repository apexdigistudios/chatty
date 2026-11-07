import type { Metadata } from "next";
import { ConfessionsPage } from "@/views/ConfessionsPage";

export const metadata: Metadata = {
  title: "Anonymous SHS Confessions | Gist me",
  description:
    "Read moderated anonymous confessions and student stories from Ghanaian Senior High School communities.",
  alternates: { canonical: "https://www.gistme.online/confessions" },
  openGraph: {
    title: "Anonymous SHS Confessions | Gist me",
    description:
      "Read moderated anonymous confessions and student stories from Ghanaian SHS communities.",
    url: "https://www.gistme.online/confessions",
    type: "website",
  },
};

export default ConfessionsPage;
