import type { Metadata } from "next";
import { SchoolGroupCreatePage } from "@/views/SchoolGroupCreatePage";

export const metadata: Metadata = {
  title: "Create a school club | Gist me",
  description: "Start a club in your school community.",
  robots: { index: false, follow: true },
};

export default function NewSchoolGroupRoute() {
  return <SchoolGroupCreatePage />;
}
