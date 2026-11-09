import { HomePage } from "@/views/HomePage";
import { fetchPublicConfessions, fetchPublicPosts } from "@/lib/publicContent.server";

export const dynamic = "force-dynamic";

export default async function HomeRoute() {
  const [postsResult, confessionsResult] = await Promise.allSettled([
    fetchPublicPosts({ limit: 10 }),
    fetchPublicConfessions(15),
  ]);
  if (postsResult.status === "rejected") console.error("Could not preload the public home feed.", postsResult.reason);
  if (confessionsResult.status === "rejected") console.error("Could not preload public confessions for the home feed.", confessionsResult.reason);

  return (
    <HomePage
      initialPosts={postsResult.status === "fulfilled" ? postsResult.value : null}
      initialConfessions={confessionsResult.status === "fulfilled" ? confessionsResult.value : null}
      initialPostsError={postsResult.status === "rejected" ? "Public gists could not be loaded right now." : null}
      initialConfessionsError={confessionsResult.status === "rejected" ? "Approved confessions could not be loaded right now." : null}
    />
  );
}
