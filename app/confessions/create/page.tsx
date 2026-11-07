import type { Metadata } from "next";
import { ConfessionComposerPage } from "@/views/ConfessionComposerPage";

export const metadata: Metadata = {
  title: "Write an Anonymous Confession | Gist me",
  robots: { index: false, follow: false },
};

export default ConfessionComposerPage;
