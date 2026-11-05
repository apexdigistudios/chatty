import type { Metadata } from "next";
import { SharedContentPage } from "@/views/SharedContentPage";
import { generateSharedContentMetadata } from "@/lib/socialMetadata";

type RouteProps = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: RouteProps): Promise<Metadata> {
  const { id } = await params;
  return generateSharedContentMetadata("post", id);
}

export default async function PostPage({ params }: RouteProps) {
  const { id } = await params;
  return <SharedContentPage kind="post" id={id} />;
}
