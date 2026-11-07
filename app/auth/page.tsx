import type { Metadata } from "next";
import { AuthWizardPage } from "@/views/AuthWizardPage";

export const metadata: Metadata = {
  title: "Student Sign In | Gist me",
  description: "Log in or create your Gist me student account.",
  robots: { index: false, follow: false },
};

export default AuthWizardPage;
