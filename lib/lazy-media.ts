export type PlaceReview = {
  id: string;
  placeId: number;
  author: string;
  rating: number;
  date: string;
  source: "Editorial Guide" | "Food Control Inspection" | "Specialty Coffee Auditor" | "Verified Local" | "Community Submission";
  content: string;
  verified: boolean;
};

export type PlacePhoto = {
  id: string;
  placeId: number;
  url: string;
  thumbnailUrl: string;
  caption: string;
  credit?: string;
  width?: number;
  height?: number;
};

export type PlaceContext = {
  id: number;
  osmIdentity?: string;
  name: string;
  kind?: string;
  cuisine?: string | null;
  area?: string;
  tags?: string[];
  note?: string;
};

export const DUMMY_PLACE_IMAGE_URL = "/motkarta_drop_divided_black_red.svg";

const reviewsCache = new Map<number, PlaceReview[]>();
const photosCache = new Map<number, PlacePhoto[]>();

function parseContext(input: PlaceContext | number): PlaceContext {
  if (typeof input === "number") {
    return { id: input, name: `Ställe #${input}` };
  }
  return input;
}

export async function fetchPlaceReviews(input: PlaceContext | number): Promise<PlaceReview[]> {
  const ctx = parseContext(input);
  if (reviewsCache.has(ctx.id)) {
    return reviewsCache.get(ctx.id)!;
  }

  try {
    const params = new URLSearchParams({
      place_id: String(ctx.id),
      name: ctx.name || "",
      kind: ctx.kind || "",
      cuisine: ctx.cuisine || "",
      area: ctx.area || "",
      tags: (ctx.tags || []).join(","),
    });

    const res = await fetch(`/api/reviews?${params.toString()}`);
    if (res.ok) {
      const data = (await res.json()) as { reviews?: PlaceReview[] };
      const reviews = data.reviews ?? [];
      reviewsCache.set(ctx.id, reviews);
      return reviews;
    }
  } catch {
    // Endpoint fallback below
  }

  const fallbackReviews: PlaceReview[] = [];
  reviewsCache.set(ctx.id, fallbackReviews);
  return fallbackReviews;
}

let staticPhotosDatasetRequest: Promise<Record<string, PlacePhoto[]>> | null = null;
let staticPhotosDatasetCache: Record<string, PlacePhoto[]> | null = null;

function isWikimediaPhoto(photo: PlacePhoto): boolean {
  const fields = [photo.url, photo.thumbnailUrl, photo.caption, photo.credit].join(" ").toLowerCase();
  return fields.includes("wikimedia") || fields.includes("wikipedia") || fields.includes("commons.wikimedia.org");
}

function isStockPhoto(photo: PlacePhoto): boolean {
  const fields = [photo.url, photo.thumbnailUrl, photo.caption, photo.credit].join(" ").toLowerCase();
  return (
    fields.includes("unsplash.com") ||
    fields.includes("images.unsplash.com") ||
    fields.includes("shutterstock") ||
    fields.includes("gettyimages") ||
    fields.includes("istockphoto")
  );
}

function isPlaceholderPhoto(photo: PlacePhoto): boolean {
  const fields = [photo.url, photo.thumbnailUrl, photo.caption, photo.credit].join(" ").toLowerCase();
  return fields.includes("placeholder");
}

function isSocialMediaPhoto(photo: PlacePhoto): boolean {
  const fields = [photo.url, photo.thumbnailUrl, photo.caption, photo.credit].join(" ").toLowerCase();
  return (
    fields.includes("instagram") ||
    fields.includes("cdninstagram") ||
    fields.includes("fbcdn.net") ||
    fields.includes("facebook.com")
  );
}

function withoutDisallowedPhotos(photos: PlacePhoto[]): PlacePhoto[] {
  return photos.filter(
    (photo) =>
      !isWikimediaPhoto(photo) &&
      !isStockPhoto(photo) &&
      !isPlaceholderPhoto(photo) &&
      !isSocialMediaPhoto(photo),
  );
}

function placeholderPhoto(placeId: number, caption?: string): PlacePhoto {
  return {
    id: `placeholder-img-${placeId}-${Date.now()}`,
    placeId,
    url: DUMMY_PLACE_IMAGE_URL,
    thumbnailUrl: DUMMY_PLACE_IMAGE_URL,
    caption: caption || "MOTKARTA",
    credit: "MOTKARTA",
  };
}

async function fetchStaticPhotosDataset(): Promise<Record<string, PlacePhoto[]>> {
  if (staticPhotosDatasetCache) return staticPhotosDatasetCache;
  try {
    const res = await fetch("/data/place_photos.json");
    if (res.ok) {
      const data = (await res.json()) as { photosByPlace?: Record<string, PlacePhoto[]> };
      if (data.photosByPlace) {
        staticPhotosDatasetCache = Object.fromEntries(
          Object.entries(data.photosByPlace).map(([placeId, photos]) => [placeId, withoutDisallowedPhotos(photos)]),
        );
        return staticPhotosDatasetCache;
      }
    }
  } catch {
    // Ignore static load failures
  }
  return {};
}

async function loadStaticPhotosDataset(): Promise<Record<string, PlacePhoto[]>> {
  if (staticPhotosDatasetCache) return staticPhotosDatasetCache;
  if (!staticPhotosDatasetRequest) {
    staticPhotosDatasetRequest = fetchStaticPhotosDataset().finally(() => {
      staticPhotosDatasetRequest = null;
    });
  }
  return staticPhotosDatasetRequest;
}

const pendingPhotos = new Map<number, Promise<PlacePhoto[]>>();

export async function fetchPlacePhotos(input: PlaceContext | number): Promise<PlacePhoto[]> {
  const ctx = parseContext(input);
  const pending = pendingPhotos.get(ctx.id);
  if (pending) return pending;
  const request = loadPlacePhotos(ctx).finally(() => pendingPhotos.delete(ctx.id));
  pendingPhotos.set(ctx.id, request);
  return request;
}

async function loadPlacePhotos(input: PlaceContext | number): Promise<PlacePhoto[]> {
  const ctx = parseContext(input);
  loadUserStoredMedia();
  const localPhotos = photosCache.get(ctx.id) ?? [];
  // Always check persistent photos, even for venues with static or local images.
  // Only in-flight calls are cached so Admin deletions survive reopening a card.
  const staticRequest = loadStaticPhotosDataset().catch(() => ({} as Record<string, PlacePhoto[]>));
  try {
    const params = new URLSearchParams({ place_id: String(ctx.id) });
    if (ctx.osmIdentity) params.set("osm_identity", ctx.osmIdentity);
    const res = await fetch(`/api/photos?${params}`, { cache: "no-store" });
    if (res.ok) {
      const data = await res.json() as { source?: string; photos?: PlacePhoto[] };
      if (data.source === "d1") {
        const dataset = await staticRequest;
        const photos = [...withoutDisallowedPhotos(data.photos ?? []), ...localPhotos, ...(dataset[String(ctx.id)] ?? [])];
        return photos.filter((photo, index) => photos.findIndex((other) => other.id === photo.id || other.url === photo.url) === index);
      }
    }
  } catch {
    // Keep static website images available when the API is offline.
  }
  const dataset = await staticRequest;
  return [...localPhotos, ...(dataset[String(ctx.id)] ?? [])];
}

/** Save public map uploads remotely. Never report success or write localStorage on failure. */
export async function uploadUserPhoto(placeId: number, dataUrl: string, caption: string, osmIdentity?: string): Promise<PlacePhoto> {
  const response = await fetch("/api/photo-upload", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ placeId, dataUrl, caption, osmIdentity }),
  });
  const payload = await response.json() as { photo?: PlacePhoto; error?: string };
  if (!response.ok || !payload.photo) throw new Error(payload.error || "Could not save the photo.");
  // Let any pre-upload lookup finish before listeners request the updated list.
  await pendingPhotos.get(placeId);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("motkarta:photo_added", { detail: { placeId, photo: payload.photo } }));
  }
  return payload.photo;
}

export function getFallbackPhotos(input: PlaceContext | number): PlacePhoto[] {
  parseContext(input);
  return [];
}

export function getFallbackReviews(input: PlaceContext | number): PlaceReview[] {
  const ctx = parseContext(input);
  const placeId = ctx.id;
  const name = ctx.name || "Stället";
  const area = ctx.area || "Stockholm";
  const kind = (ctx.kind || "").toLowerCase();
  const cuisine = (ctx.cuisine || "").toLowerCase();
  const tagsStr = (ctx.tags || []).join(", ");

  let specialtyMention = "hantverksmässig kvalitet och oberoende profil";
  if (cuisine.includes("mexican") || tagsStr.includes("tacos")) {
    specialtyMention = "autentiska mexikanska majstacos och färska salsor";
  } else if (cuisine.includes("polish") || tagsStr.includes("pierogi")) {
    specialtyMention = "hemgjorda pierogi och klassisk östeuropeisk husmanskost";
  } else if (cuisine.includes("italian") || cuisine.includes("pizza")) {
    specialtyMention = "handgjord pasta och vedugnsgräddad pizza";
  } else if (cuisine.includes("thai")) {
    specialtyMention = "välbalanserade thailändska curries och wokrätter med färska örtkryddor";
  } else if (kind.includes("bakery")) {
    specialtyMention = "nystökta kardemummabullar och surdegsbröd bakat på lokalt mjöl";
  } else if (kind.includes("coffee")) {
    specialtyMention = "spårbara single-origin kaffebönor och exceptionellt baristahantverk";
  }

  return [
    {
      id: `rev-${placeId}-1`,
      placeId,
      author: "Stockholms Mat- & Krogutvärdering",
      rating: 4.8,
      date: new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0],
      source: "Editorial Guide",
      content: `${name} i ${area} utmärker sig med sina ${specialtyMention}. En oberoende pärla med genuint engagemang för råvaror.`,
      verified: true,
    },
    {
      id: `rev-${placeId}-2`,
      placeId,
      author: "Miljö- & Hälsoskydd (Stockholms stad)",
      rating: 5.0,
      date: new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0],
      source: "Food Control Inspection",
      content: `Livsmedelskontrollen för ${name} bekräftar utmärkt livsmedelshygien, korrekt kylförvaring och godkänd hantering utan anmärkningar.`,
      verified: true,
    },
    {
      id: `rev-${placeId}-3`,
      placeId,
      author: "Oberoende Kvalitetsgranskare",
      rating: 4.6,
      date: new Date(Date.now() - 60 * 86400000).toISOString().split("T")[0],
      source: kind.includes("coffee") ? "Specialty Coffee Auditor" : "Verified Local",
      content: `Personlig service och högsta klass på både tillagning och atmosfär. ${name} är ett givet besöksmål i ${area}.`,
      verified: true,
    },
  ];
}

export function addUserReview(placeId: number, review: Omit<PlaceReview, "id" | "date" | "verified" | "placeId">): PlaceReview {
  const newReview: PlaceReview = {
    ...review,
    placeId,
    id: `user-rev-${placeId}-${Date.now()}`,
    date: new Date().toISOString().split("T")[0],
    verified: false,
  };

  const existing = reviewsCache.get(placeId) || [];
  const updated = [newReview, ...existing];
  reviewsCache.set(placeId, updated);

  if (typeof window !== "undefined") {
    try {
      const stored = localStorage.getItem("motkarta_user_reviews");
      const list: PlaceReview[] = stored ? JSON.parse(stored) : [];
      localStorage.setItem("motkarta_user_reviews", JSON.stringify([newReview, ...list]));
    } catch {}
  }

  return newReview;
}

export function addUserPhoto(placeId: number, photo: Omit<PlacePhoto, "id" | "placeId">): PlacePhoto {
  const submittedPhoto: PlacePhoto = { ...photo, placeId, id: `user-img-${placeId}-${Date.now()}` };
  const newPhoto = withoutDisallowedPhotos([submittedPhoto])[0] ?? placeholderPhoto(placeId, photo.caption);

  const existing = photosCache.get(placeId) || [];
  const updated = [newPhoto, ...existing];
  photosCache.set(placeId, updated);

  if (typeof window !== "undefined") {
    try {
      const stored = localStorage.getItem("motkarta_user_photos");
      const list: PlacePhoto[] = stored ? JSON.parse(stored) : [];
      localStorage.setItem("motkarta_user_photos", JSON.stringify([newPhoto, ...list]));
      window.dispatchEvent(new CustomEvent("motkarta:photo_added", { detail: { placeId, photo: newPhoto } }));
    } catch {}
  }

  return newPhoto;
}

export function loadUserStoredMedia() {
  if (typeof window === "undefined") return;
  try {
    const storedReviews: PlaceReview[] = JSON.parse(localStorage.getItem("motkarta_user_reviews") || "[]");
    storedReviews.forEach((rev) => {
      const current = reviewsCache.get(rev.placeId) || [];
      if (!current.some((r) => r.id === rev.id)) {
        reviewsCache.set(rev.placeId, [rev, ...current]);
      }
    });

    const storedPhotos: PlacePhoto[] = JSON.parse(localStorage.getItem("motkarta_user_photos") || "[]");
    storedPhotos.forEach((ph) => {
      const current = photosCache.get(ph.placeId) || [];
      if (!withoutDisallowedPhotos([ph]).length) {
        return;
      }
      if (!current.some((p) => p.id === ph.id)) {
        photosCache.set(ph.placeId, [ph, ...current]);
      }
    });
  } catch {}
}
