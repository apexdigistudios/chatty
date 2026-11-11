import type { Metadata } from "next";
import { SchoolCreatePage } from "@/views/SchoolCreatePage";

export const metadata: Metadata = {
  title: "Create a school community | Gist me",
  description: "Create a community for your Ghanaian Senior High School.",
  robots: { index: false, follow: true },
};

export default function NewSchoolRoute() {
  return <SchoolCreatePage />;
}
