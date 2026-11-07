import type { Metadata } from "next";
import { SchoolsPage } from "@/views/SchoolsPage";
import { fetchPublicSchools } from "@/lib/publicSchools";
import type { School } from "@/types/models";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Ghana SHS School Directory | Gist me",
  description:
    "Find Ghanaian Senior High School and TVET communities by school and region. Explore campus gists and join your SHS community.",
  alternates: { canonical: "https://www.gistme.online/schools" },
  openGraph: {
    title: "Ghana SHS School Directory | Gist me",
    description:
      "Find Ghanaian Senior High School and TVET communities by school and region.",
    url: "https://www.gistme.online/schools",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Ghana SHS School Directory | Gist me",
    description:
      "Find Ghanaian Senior High School and TVET communities by school and region.",
  },
};

export default async function SchoolsRoute() {
  let schools: School[] = [];
  try {
    schools = await fetchPublicSchools();
  } catch (error) {
    console.error("Could not preload public school communities.", error);
  }
  return <SchoolsPage initialSchools={schools} />;
}
