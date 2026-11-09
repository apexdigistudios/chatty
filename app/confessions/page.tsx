import type { Metadata } from "next";
import { ConfessionsPage } from "@/views/ConfessionsPage";
import { fetchPublicConfessions } from "@/lib/publicContent.server";

export const dynamic = "force-dynamic";

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

export default async function ConfessionsRoute() {
  try {
    return <ConfessionsPage initialConfessions={await fetchPublicConfessions(15)} />;
  } catch (error) {
    console.error("Could not preload approved public confessions.", error);
    return <ConfessionsPage initialConfessions={null} initialConfessionsError="Approved confessions could not be loaded right now." />;
  }
}
