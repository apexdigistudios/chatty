/**
 * Guest-friendly "Save gist" bookmarks for Step 9.
 * Stored locally (no auth required), keyed per browser.
 */

const STORAGE_KEY = "lets-gist-saved-posts";
const CHANGE_EVENT = "lets-gist-saved-posts-changed";

export function readSavedPostIds(): string[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function writeSavedPostIds(ids: string[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    // Private-mode storage failures are non-fatal — saving simply won't persist.
  }
}

export function isPostSaved(postId: string): boolean {
  return readSavedPostIds().includes(postId);
}

/** Returns the new saved state. */
export function toggleSavedPost(postId: string): boolean {
  const ids = readSavedPostIds();
  const saved = !ids.includes(postId);
  writeSavedPostIds(saved ? [postId, ...ids] : ids.filter((id) => id !== postId));
  return saved;
}

export function subscribeToSavedPosts(listener: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}
