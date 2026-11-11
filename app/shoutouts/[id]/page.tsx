import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSpinner } from "@/components/ui/PageSpinner";
import { ShoutoutLetterPage } from "@/views/ShoutoutLetterPage";

export const metadata: Metadata = {
  title: "Read a Shoutout | Gist me",
  description: "Open your private campus letter.",
};

export default function ShoutoutLetterRoute() {
  return (
    <Suspense fallback={<PageSpinner label="Opening your letter" className="min-h-[60vh]" />}>
      <ShoutoutLetterPage />
    </Suspense>
  );
}
