const DATABASE_NAME = "gist_me_local_cache";
const DATABASE_VERSION = 1;
const STORE_NAME = "entries";
const MEDIA_DATABASE_NAME = "gist_me_media_store";
const MEDIA_DATABASE_VERSION = 1;
const MEDIA_STORE_NAME = "images";

interface CacheEntry<T> {
  key: string;
  value: T;
  savedAt: number;
}

let databasePromise: Promise<IDBDatabase> | null = null;
let mediaDatabasePromise: Promise<IDBDatabase> | null = null;

function openMediaDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB is unavailable in this browser."));
  }
  if (!mediaDatabasePromise) {
    const opening = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(MEDIA_DATABASE_NAME, MEDIA_DATABASE_VERSION);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(MEDIA_STORE_NAME)) {
          request.result.createObjectStore(MEDIA_STORE_NAME);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Could not open offline media storage."));
      request.onblocked = () => reject(new Error("Offline media storage upgrade is blocked."));
    });
    mediaDatabasePromise = opening.catch((error: unknown) => {
      mediaDatabasePromise = null;
      throw error;
    });
  }
  const pending = mediaDatabasePromise;
  if (!pending) throw new Error("Offline media storage could not be initialized.");
  return pending;
}

async function requestMediaValue<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const database = await openMediaDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(MEDIA_STORE_NAME, mode);
    const request = operation(transaction.objectStore(MEDIA_STORE_NAME));
    request.onerror = () => reject(request.error ?? new Error("Offline media storage request failed."));
    transaction.oncomplete = () => resolve(request.result);
    transaction.onerror = () => reject(transaction.error ?? new Error("Offline media storage transaction failed."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Offline media storage transaction aborted."));
  });
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB is unavailable in this browser."));
  }
  if (!databasePromise) {
    const opening = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          database.createObjectStore(STORE_NAME, { keyPath: "key" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Could not open offline storage."));
      request.onblocked = () => reject(new Error("Offline storage upgrade is blocked."));
    });
    databasePromise = opening.catch((error: unknown) => {
      databasePromise = null;
      throw error;
    });
  }
  const pending = databasePromise;
  if (!pending) throw new Error("Offline storage could not be initialized.");
  return pending;
}

async function requestValue<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const request = operation(transaction.objectStore(STORE_NAME));
    request.onsuccess = () => undefined;
    request.onerror = () => reject(request.error ?? new Error("Offline storage request failed."));
    transaction.oncomplete = () => resolve(request.result);
    transaction.onerror = () => reject(transaction.error ?? new Error("Offline storage transaction failed."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Offline storage transaction aborted."));
  });
}

export async function readOfflineValue<T>(key: string): Promise<T | null> {
  const entry = await requestValue<CacheEntry<T> | undefined>("readonly", (store) =>
    store.get(key)
  );
  return entry?.value ?? null;
}

export async function writeOfflineValue<T>(key: string, value: T): Promise<void> {
  await requestValue<IDBValidKey>("readwrite", (store) =>
    store.put({ key, value, savedAt: Date.now() } satisfies CacheEntry<T>)
  );
}

export function isBrowserOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

export async function persistImageBlob(url: string, blob: Blob): Promise<void> {
  if (blob.size === 0 || !blob.type.startsWith("image/")) return;
  await requestMediaValue<IDBValidKey>("readwrite", (store) =>
    store.put(blob, normalizeUrl(url))
  );
}

export async function readImageBlob(url: string): Promise<Blob | null> {
  const normalizedUrl = normalizeUrl(url);
  const blob = await requestMediaValue<Blob | undefined>("readonly", (store) =>
    store.get(normalizedUrl)
  );
  if (blob) return blob;

  // Read image blobs written by earlier app versions before the media store existed.
  return readOfflineValue<Blob>(`image:${normalizedUrl}`);
}

export async function cacheLoadedImage(url: string): Promise<void> {
  if (typeof fetch === "undefined" || url.startsWith("data:") || url.startsWith("blob:")) return;
  try {
    const normalizedUrl = normalizeUrl(url);
    if ("caches" in globalThis) {
      const cachedResponse = await caches.match(normalizedUrl);
      if (cachedResponse) {
        if (cachedResponse.type !== "opaque") {
          await persistImageBlob(url, await cachedResponse.blob());
        }
        return;
      }
    }
    if (isBrowserOffline()) return;
    const response = await fetch(normalizedUrl, { credentials: "omit" });
    if (!response.ok || response.type === "opaque") return;
    await persistImageBlob(url, await response.blob());
  } catch (error) {
    console.warn("Could not persist image for offline use.", error);
  }
}

function normalizeUrl(url: string): string {
  return new URL(url, typeof location === "undefined" ? "https://gistme.online" : location.href).href;
}
