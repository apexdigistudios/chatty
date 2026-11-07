import type { Metadata } from "next";
import { ShoutoutsPage } from "@/views/ShoutoutsPage";

export const metadata: Metadata = {
  title: "Student Shoutouts | Gist me",
  description:
    "Send and discover public shoutouts for Ghanaian Senior High School students and campus communities.",
  alternates: { canonical: "https://www.gistme.online/shoutouts" },
};

export default ShoutoutsPage;
