const IMAGE_CACHE = "gist-me-image-cache-v1";
const IMAGE_META_CACHE = "gist-me-image-cache-meta-v1";
const MAX_IMAGE_ENTRIES = 500;
const MAX_IMAGE_AGE_MS = 60 * 24 * 60 * 60 * 1000;

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("gist-me-image-cache-") &&
              key !== IMAGE_CACHE && key !== IMAGE_META_CACHE)
            .map((key) => caches.delete(key))
        )
      ),
    ])
  );
});

function metadataRequest(url) {
  return new Request(`${self.location.origin}/__gist_me_cache_meta__?url=${encodeURIComponent(url)}`);
}

async function readCachedAt(metadataCache, url) {
  const response = await metadataCache.match(metadataRequest(url));
  if (!response) return null;
  const value = await response.json();
  return typeof value.savedAt === "number" ? value.savedAt : null;
}

async function pruneCache(imageCache, metadataCache) {
  const requests = await imageCache.keys();
  const entries = await Promise.all(
    requests.map(async (request) => ({
      request,
      savedAt: await readCachedAt(metadataCache, request.url),
    }))
  );
  const now = Date.now();
  const stale = entries.filter(({ savedAt }) => savedAt === null || now - savedAt > MAX_IMAGE_AGE_MS);
  await Promise.all(
    stale.flatMap(({ request }) => [
      imageCache.delete(request),
      metadataCache.delete(metadataRequest(request.url)),
    ])
  );
  const remaining = entries
    .filter(({ savedAt }) => savedAt !== null && now - savedAt <= MAX_IMAGE_AGE_MS)
    .sort((left, right) => (left.savedAt ?? 0) - (right.savedAt ?? 0));
  const excess = remaining.length - MAX_IMAGE_ENTRIES;
  await Promise.all(
    remaining.slice(0, Math.max(0, excess)).flatMap(({ request }) => [
      imageCache.delete(request),
      metadataCache.delete(metadataRequest(request.url)),
    ])
  );
}

async function cacheFirstImage(request) {
  const imageCache = await caches.open(IMAGE_CACHE);
  const metadataCache = await caches.open(IMAGE_META_CACHE);
  let cached = await imageCache.match(request, { ignoreVary: true });
  if (cached) {
    const savedAt = await readCachedAt(metadataCache, request.url);
    if (savedAt !== null && Date.now() - savedAt <= MAX_IMAGE_AGE_MS) return cached;
    await Promise.all([
      imageCache.delete(request),
      metadataCache.delete(metadataRequest(request.url)),
    ]);
    cached = null;
  }

  try {
    const response = await fetch(request);
    if (response.ok || response.type === "opaque") {
      await imageCache.put(request, response.clone());
      await metadataCache.put(
        metadataRequest(request.url),
        new Response(JSON.stringify({ savedAt: Date.now() }), {
          headers: { "Content-Type": "application/json" },
        })
      );
      await pruneCache(imageCache, metadataCache);
    }
    return response;
  } catch (error) {
    if (cached) return cached;
    throw error;
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || request.destination !== "image") return;
  const url = new URL(request.url);
  if (url.protocol !== "https:" && url.hostname !== "localhost") return;
  event.respondWith(cacheFirstImage(request));
});
