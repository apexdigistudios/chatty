/**
 * Read receipts for the notification centre.
 *
 * Notifications are derived from `likes` / `comments` / `shoutouts` / `posts`
 * rather than a dedicated table, so "read" state lives on the device. This keeps
 * the feature working without a schema change; a `notification_reads` table can
 * replace it later without touching any caller.
 */

const READ_KEY = "lets-gist-notification-reads";
const SEEN_KEY = "lets-gist-notifications-seen-at";
const MAX_STORED = 400;

function readSet(): Set<string> {
  try {
    const raw = window.localStorage.getItem(READ_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : []);
  } catch {
    return new Set();
  }
}

function writeReadSet(ids: Set<string>): void {
  try {
    // Keep the most recently marked entries only.
    const trimmed = Array.from(ids).slice(-MAX_STORED);
    window.localStorage.setItem(READ_KEY, JSON.stringify(trimmed));
  } catch {
    // Storage-full or private mode: notifications stay unread, nothing breaks.
  }
}

export function isNotificationRead(id: string): boolean {
  return readSet().has(id);
}

export function markNotificationRead(id: string): void {
  const ids = readSet();
  if (ids.has(id)) return;
  ids.add(id);
  writeReadSet(ids);
}

/** Marks everything currently loaded as read in one write. */
export function markNotificationsRead(ids: string[]): void {
  const stored = readSet();
  for (const id of ids) stored.add(id);
  writeReadSet(stored);
}

/** Timestamp used so older campus news does not arrive pre-unread forever. */
export function readSeenAt(): number {
  try {
    const raw = window.localStorage.getItem(SEEN_KEY);
    const parsed = raw ? Number(raw) : 0;
    return Number.isFinite(parsed) ? parsed : 0;
  } catch {
    return 0;
  }
}

export function writeSeenAt(value: number): void {
  try {
    window.localStorage.setItem(SEEN_KEY, String(value));
  } catch {
    // Non-fatal.
  }
}
