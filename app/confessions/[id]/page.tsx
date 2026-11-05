import type { Metadata } from "next";
import { SharedContentPage } from "@/views/SharedContentPage";
import { generateSharedContentMetadata } from "@/lib/socialMetadata";

type RouteProps = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: RouteProps): Promise<Metadata> {
  const { id } = await params;
  return generateSharedContentMetadata("confession", id);
}

export default async function ConfessionPage({ params }: RouteProps) {
  const { id } = await params;
  return <SharedContentPage kind="confession" id={id} />;
}
