import type { Metadata } from "next";
import { SchoolPage } from "@/views/SchoolPage";
import { fetchPublicSchool } from "@/lib/publicSchools";
import { fetchPublicPosts } from "@/lib/publicContent.server";
import { cloudflareMediaUrl } from "@/lib/mediaUrl";
import type { Post, School } from "@/types/models";

export const dynamic = "force-dynamic";

type RouteProps = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: RouteProps): Promise<Metadata> {
  const { id } = await params;
  try {
    const school = await fetchPublicSchool(id);
    if (!school) {
      return {
        title: "School community not found | Gist me",
        robots: { index: false, follow: false },
      };
    }

    const title = `${school.name} SHS Community | Gist me`;
    const description = `Join the ${school.name} community in ${school.region}. Discover campus gists and connect with students on Gist me.`;
    const canonical = `https://www.gistme.online/schools/${encodeURIComponent(school.id)}`;
    const image = cloudflareMediaUrl(school.crestUrl || "/logo.png");

    return {
      title,
      description,
      alternates: { canonical },
      openGraph: {
        siteName: "Gist me",
        title,
        description,
        url: canonical,
        type: "website",
        images: [{ url: image, alt: `${school.name} community` }],
      },
      twitter: {
        card: "summary",
        title,
        description,
        images: [image],
      },
    };
  } catch (error) {
    console.error("Could not generate school community metadata.", error);
    return {
      title: "Ghana SHS Community | Gist me",
      description: "Explore a Ghanaian Senior High School community on Gist me.",
      robots: { index: false, follow: true },
    };
  }
}

export default async function SchoolRoute({ params }: RouteProps) {
  const { id } = await params;
  let initialSchool: School | null = null;
  let initialSchoolError: string | null = null;
  let initialPosts: Post[] | null = null;
  let initialPostsError: string | null = null;
  try {
    initialSchool = await fetchPublicSchool(id);
  } catch (error) {
    console.error("Could not preload public school community.", error);
    initialSchoolError = "This public school community could not be loaded right now.";
  }
  try {
    initialPosts = await fetchPublicPosts({ schoolId: id, limit: 30 });
  } catch (error) {
    console.error("Could not preload public school gists.", error);
    initialPostsError = "Public campus gists could not be loaded right now.";
  }
  return <SchoolPage key={id} initialSchool={initialSchool} initialSchoolError={initialSchoolError} initialPosts={initialPosts} initialPostsError={initialPostsError} />;
}
