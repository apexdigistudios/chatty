import type { Metadata } from "next";
import { ProfileEditPage } from "@/views/ProfileEditPage";

export const metadata: Metadata = {
  title: "Edit Profile | Gist me",
  robots: { index: false, follow: false },
};

export default ProfileEditPage;
