import type { Metadata } from "next";
import { LegalPage } from "@/views/LegalPage";

export const metadata: Metadata = {
  title: "Terms of Service | GistMe",
  description:
    "Read the terms and community safety expectations for using GistMe.",
  alternates: { canonical: "https://www.gistme.online/terms" },
};

export default function TermsPage() {
  return <LegalPage kind="terms" />;
}
