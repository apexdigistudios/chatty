import type { Metadata } from "next";
import { AuthWizardPage } from "@/views/AuthWizardPage";

export const metadata: Metadata = {
  title: "Join Gist me",
  description: "Create a student account to join Ghanaian SHS communities on Gist me.",
  robots: { index: false, follow: false },
};

export default AuthWizardPage;
