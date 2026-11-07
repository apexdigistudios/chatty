import type { Metadata } from "next";
import { LegalPage } from "@/views/LegalPage";

export const metadata: Metadata = {
  title: "Privacy Information | Gist me",
  description:
    "Learn how Gist me handles student account information, public posts, and safety reports.",
  alternates: { canonical: "https://www.gistme.online/privacy" },
};

export default function PrivacyPage() {
  return <LegalPage kind="privacy" />;
}
