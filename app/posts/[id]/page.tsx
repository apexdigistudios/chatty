import type { Metadata } from "next";
import { SharedContentPage } from "@/views/SharedContentPage";
import { generateSharedContentMetadata } from "@/lib/socialMetadata";
import { fetchPublicPost } from "@/lib/publicContent.server";
import type { Post } from "@/types/models";

type RouteProps = { params: Promise<{ id: string }> };
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: RouteProps): Promise<Metadata> {
  const { id } = await params;
  return generateSharedContentMetadata("post", id);
}

export default async function PostPage({ params }: RouteProps) {
  const { id } = await params;
  let initialPost: Post | null = null;
  let initialError: string | null = null;
  try {
    initialPost = await fetchPublicPost(id);
    if (!initialPost) initialError = "This gist is no longer available.";
  } catch (error) {
    console.error("Could not preload the public gist.", error);
    initialError = "This public gist could not be loaded right now.";
  }
  return <SharedContentPage key={id} kind="post" id={id} initialPost={initialPost} initialError={initialError} />;
}
