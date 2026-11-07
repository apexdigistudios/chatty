import type { Metadata } from "next";
import { PublicProfilePage } from "@/views/PublicProfilePage";

export const metadata: Metadata = {
  title: "Student Profile | Gist me",
  robots: { index: false, follow: false },
};

export default PublicProfilePage;
