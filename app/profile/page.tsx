import type { Metadata } from "next";
import { ProfilePage } from "@/views/ProfilePage";

export const metadata: Metadata = {
  title: "Your Profile | Gist me",
  robots: { index: false, follow: false },
};

export default ProfilePage;
