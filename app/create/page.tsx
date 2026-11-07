import type { Metadata } from "next";
import { CreatePage } from "@/views/CreatePage";

export const metadata: Metadata = {
  title: "Create a Gist | Gist me",
  robots: { index: false, follow: false },
};

export default CreatePage;
