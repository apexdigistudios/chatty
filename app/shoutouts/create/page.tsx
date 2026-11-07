import type { Metadata } from "next";
import { ShoutoutCreatePage } from "@/views/ShoutoutCreatePage";

export const metadata: Metadata = {
  title: "Create a Shoutout | Gist me",
  robots: { index: false, follow: false },
};

export default ShoutoutCreatePage;
