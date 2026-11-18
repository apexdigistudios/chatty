import type { Metadata } from "next";
import { ConfessionModerationPage } from "@/views/admin/ConfessionModerationPage";

export const metadata: Metadata = {
  title: "Confession Moderation | GistMe",
  robots: { index: false, follow: false },
};

export default ConfessionModerationPage;
