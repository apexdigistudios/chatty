import type { Metadata } from "next";
import { SharedContentPage } from "@/views/SharedContentPage";
import { generateSharedContentMetadata } from "@/lib/socialMetadata";
import { fetchPublicConfession } from "@/lib/publicContent.server";
import type { Confession } from "@/types/models";

type RouteProps = { params: Promise<{ id: string }> };
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: RouteProps): Promise<Metadata> {
  const { id } = await params;
  return generateSharedContentMetadata("confession", id);
}

export default async function ConfessionPage({ params }: RouteProps) {
  const { id } = await params;
  let initialConfession: Confession | null = null;
  let initialError: string | null = null;
  try {
    initialConfession = await fetchPublicConfession(id);
    if (!initialConfession) initialError = "This confession is no longer available.";
  } catch (error) {
    console.error("Could not preload the approved confession.", error);
    initialError = "This public confession could not be loaded right now.";
  }
  return <SharedContentPage key={id} kind="confession" id={id} initialConfession={initialConfession} initialError={initialError} />;
}
