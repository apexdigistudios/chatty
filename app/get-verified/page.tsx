import type { Metadata } from "next";
import { GetVerifiedPage } from "@/views/GetVerifiedPage";

export const metadata: Metadata = {
  title: "Get Verified | Gist me",
  robots: { index: false, follow: false },
};

export default GetVerifiedPage;
