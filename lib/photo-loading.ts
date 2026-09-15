import type { PlacePhoto } from "./lazy-media";

export function canLoadPhoto(url: string, signal: AbortSignal, timeoutMs = 8000): Promise<boolean> {
  if (signal.aborted) return Promise.resolve(false);
  return new Promise((resolve) => {
    const image = new Image();
    const finish = (loaded: boolean) => {
      clearTimeout(timer);
      image.onload = null;
      image.onerror = null;
      signal.removeEventListener("abort", abort);
      if (!loaded) image.src = "";
      resolve(loaded);
    };
    const abort = () => finish(false);
    const timer = setTimeout(abort, timeoutMs);
    image.onload = () => finish(true);
    image.onerror = abort;
    signal.addEventListener("abort", abort, { once: true });
    image.src = url;
  });
}

/** Try every venue photo, then distinct thumbnails, before showing the badge. */
export async function firstAvailablePhoto(photos: PlacePhoto[], signal: AbortSignal): Promise<PlacePhoto | null> {
  const tried = new Set<string>();
  for (const photo of photos) {
    for (const url of [photo.url, photo.thumbnailUrl]) {
      if (signal.aborted) return null;
      if (!url || tried.has(url)) continue;
      tried.add(url);
      if (await canLoadPhoto(url, signal)) return { ...photo, url };
    }
  }
  return null;
}
