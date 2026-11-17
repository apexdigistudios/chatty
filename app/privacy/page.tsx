import type { Metadata } from "next";
import { LegalPage } from "@/views/LegalPage";

export const metadata: Metadata = {
  title: "Privacy Policy | GistMe",
  description:
    "Learn how GistMe handles account information, Google OAuth data, public posts, and data deletion.",
  alternates: { canonical: "https://www.gistme.online/privacy" },
};

export default function PrivacyPage() {
  return <LegalPage kind="privacy" />;
}
