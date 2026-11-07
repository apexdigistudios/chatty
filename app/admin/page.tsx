import type { Metadata } from "next";
import { AdminPage } from "@/views/AdminPage";

export const metadata: Metadata = {
  title: "Admin Dashboard | Gist me",
  robots: { index: false, follow: false },
};

export default AdminPage;
