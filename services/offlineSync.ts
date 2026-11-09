import { currentUserId } from "@/lib/supabase";
import {
  cachePublicMedia,
  isBrowserOffline,
  writeLatestOfflineFeed,
  writeOfflineValue,
} from "@/lib/offlineCache";
import type { Post } from "@/types/models";
import { fetchFeed } from "@/services/postsService";
import { fetchProfile, fetchPublicProfiles } from "@/services/profilesService";
import { fetchSchools } from "@/services/schoolsService";

const SYNC_INTERVAL_MS = 2 * 60 * 1000;
const SYNC_FEED_LIMIT = 100;
let lastSyncAt = 0;
let syncInFlight: Promise<void> | null = null;

function mediaForPost(post: Post): Array<{ url: string; type: "image" | "video" }> {
  return post.mediaUrls.map((url, index) => ({
    url,
    type: post.mediaTypes?.[index] ?? (index === 0 ? post.mediaType : "image"),
  }));
}

async function preCachePostMedia(posts: Post[]): Promise<void> {
  const media = new Map<string, "image" | "video">();
  let videoCount = 0;
  for (const post of posts.slice(0, 10)) {
    if (post.authorAvatar) media.set(post.authorAvatar, "image");
    if (post.schoolCrest) media.set(post.schoolCrest, "image");
    for (const item of mediaForPost(post)) {
      if (item.type === "video") {
        if (videoCount >= 2) continue;
        videoCount += 1;
      }
      media.set(item.url, item.type);
      if (media.size >= 24) break;
    }
    if (media.size >= 24) break;
  }

  for (const [url, type] of media) {
    if (isBrowserOffline()) return;
    await cachePublicMedia(url, type);
  }
}

/** Refreshes shared offline snapshots when the app is online and active. */
export function syncOfflineData(force = false): Promise<void> {
  if (isBrowserOffline()) return Promise.resolve();
  if (syncInFlight) return syncInFlight;
  if (!force && Date.now() - lastSyncAt < SYNC_INTERVAL_MS) return Promise.resolve();

  syncInFlight = (async () => {
    const userId = await currentUserId();
    const [feedResult, schoolsResult] = await Promise.allSettled([
      fetchFeed({ limit: SYNC_FEED_LIMIT, includeSpotlight: false }),
      fetchSchools(),
    ]);

    if (schoolsResult.status === "fulfilled") {
      try {
        await writeOfflineValue("schools:all", schoolsResult.value);
      } catch (error) {
        console.warn("Could not save school communities for offline use.", error);
      }
    } else {
      console.warn("Could not refresh school communities for offline use.", schoolsResult.reason);
    }

    if (feedResult.status === "rejected") throw feedResult.reason;
    const posts = feedResult.value;
    try {
      await writeLatestOfflineFeed(userId, posts);
    } catch (error) {
      console.warn("Could not save the latest feed for offline use.", error);
    }

    if (userId) {
      try {
        await fetchProfile(userId);
      } catch (error) {
        console.warn("Could not refresh your profile for offline use.", error);
      }
    }

    const authors = [...new Set(posts.slice(0, 20).map((post) => post.authorId))]
      .filter((authorId) => authorId !== userId)
      .slice(0, 12);
    try {
      await fetchPublicProfiles(authors);
    } catch (error) {
      console.warn("Could not cache public author profiles for offline use.", error);
    }

    lastSyncAt = Date.now();
    void preCachePostMedia(posts).catch((error: unknown) => {
      console.warn("Could not pre-cache feed media for offline use.", error);
    });
  })().finally(() => {
    syncInFlight = null;
  });
  return syncInFlight;
}
