import type { Metadata } from "next";
import { AuthWizardPage } from "@/views/AuthWizardPage";

export const metadata: Metadata = {
  title: "Log in | Gist me",
  description: "Log in to your Gist me student account.",
  robots: { index: false, follow: false },
};

export default AuthWizardPage;
