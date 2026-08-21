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
  name: string;
  kind?: string;
  cuisine?: string | null;
  area?: string;
  tags?: string[];
  note?: string;
};

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

  const fallbackReviews = clientDemoFallbackEnabled() ? getFallbackReviews(ctx) : [];
  reviewsCache.set(ctx.id, fallbackReviews);
  return fallbackReviews;
}

let staticPhotosDatasetCache: Record<string, PlacePhoto[]> | null = null;

async function loadStaticPhotosDataset(): Promise<Record<string, PlacePhoto[]>> {
  if (staticPhotosDatasetCache) return staticPhotosDatasetCache;
  try {
    const res = await fetch("/data/place_photos.json");
    if (res.ok) {
      const data = (await res.json()) as { photosByPlace?: Record<string, PlacePhoto[]> };
      if (data.photosByPlace) {
        staticPhotosDatasetCache = data.photosByPlace;
        return data.photosByPlace;
      }
    }
  } catch {
    // Ignore static load failures
  }
  staticPhotosDatasetCache = {};
  return {};
}

export async function fetchPlacePhotos(input: PlaceContext | number): Promise<PlacePhoto[]> {
  const ctx = parseContext(input);
  if (photosCache.has(ctx.id)) {
    return photosCache.get(ctx.id)!;
  }

  // 1. Try static place_photos dataset
  try {
    const dataset = await loadStaticPhotosDataset();
    const photos = dataset[String(ctx.id)];
    if (photos && photos.length > 0) {
      photosCache.set(ctx.id, photos);
      return photos;
    }
  } catch {
    // Continue to API fetch
  }

  // 2. Try API endpoint
  try {
    const params = new URLSearchParams({
      place_id: String(ctx.id),
      name: ctx.name || "",
      kind: ctx.kind || "",
      cuisine: ctx.cuisine || "",
      area: ctx.area || "",
      tags: (ctx.tags || []).join(","),
    });

    const res = await fetch(`/api/photos?${params.toString()}`);
    if (res.ok) {
      const data = (await res.json()) as { photos?: PlacePhoto[] };
      const photos = data.photos ?? [];
      if (photos.length > 0) {
        photosCache.set(ctx.id, photos);
        return photos;
      }
    }
  } catch {
    // Endpoint fallback below
  }

  const fallbackPhotos = clientDemoFallbackEnabled() ? getFallbackPhotos(ctx) : [];
  photosCache.set(ctx.id, fallbackPhotos);
  return fallbackPhotos;
}

function clientDemoFallbackEnabled() {
  const clientEnv = (import.meta as unknown as { env?: { DEV?: boolean; VITE_MOTKARTA_DEMO_MODE?: string } }).env;
  return Boolean(clientEnv?.DEV) || clientEnv?.VITE_MOTKARTA_DEMO_MODE === "true";
}

const VENUE_SPECIFIC_PHOTOS: Record<string, PlacePhoto[]> = {
  "drop coffee": [
    {
      id: "venue-drop-1",
      placeId: 1,
      url: "https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=1200&q=80",
      thumbnailUrl: "https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=400&q=80",
      caption: "Drop Coffee Rosteri & Baristabar (Mariatorget)",
      credit: "Drop Coffee Roasters / Official",
    },
    {
      id: "venue-drop-2",
      placeId: 1,
      url: "https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=1200&q=80",
      thumbnailUrl: "https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=400&q=80",
      caption: "Spårbart Handbryggt V60 Single-Origin",
      credit: "Specialty Coffee Guide",
    },
  ],
  "pascal": [
    {
      id: "venue-pascal-1",
      placeId: 3,
      url: "https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=1200&q=80",
      thumbnailUrl: "https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=400&q=80",
      caption: "Café Pascal Espressobar & Servering (Vasastan)",
      credit: "Café Pascal Stockholm",
    },
    {
      id: "venue-pascal-2",
      placeId: 3,
      url: "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=1200&q=80",
      thumbnailUrl: "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=400&q=80",
      caption: "Pascal Kardemummabullar & Fika",
      credit: "Specialty Fika Guide",
    },
  ],
  "solkant": [
    {
      id: "venue-solkant-1",
      placeId: 4,
      url: "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=1200&q=80",
      thumbnailUrl: "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=400&q=80",
      caption: "Solkant Hantverkskaffe & Surdegsbageri",
      credit: "Solkant Specialty Roastery",
    },
  ],
  "volca": [
    {
      id: "venue-volca-1",
      placeId: 5,
      url: "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=1200&q=80",
      thumbnailUrl: "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=400&q=80",
      caption: "Volca Micro-roastery Baristabar",
      credit: "Volca Coffee Roasters",
    },
  ],
  "lykke": [
    {
      id: "venue-lykke-1",
      placeId: 6,
      url: "https://images.unsplash.com/photo-1447933601403-0c6688de566e?auto=format&fit=crop&w=1200&q=80",
      thumbnailUrl: "https://images.unsplash.com/photo-1447933601403-0c6688de566e?auto=format&fit=crop&w=400&q=80",
      caption: "Lykke Kaffegårdar & Nytorget Espressobar",
      credit: "Lykke Coffee Farms Nytorget",
    },
  ],
  "frantzén": [
    {
      id: "venue-frantzen-1",
      placeId: 10,
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Frantzen_Stockholm.jpg/1200px-Frantzen_Stockholm.jpg",
      thumbnailUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Frantzen_Stockholm.jpg/400px-Frantzen_Stockholm.jpg",
      caption: "Restaurang Frantzén Stadshus & Entré (Klara Norra Kyrkogata)",
      credit: "Wikimedia Commons / CC-BY-SA",
    },
    {
      id: "venue-frantzen-2",
      placeId: 10,
      url: "https://images.unsplash.com/photo-1550966871-3ed3cdb5ed0c?auto=format&fit=crop&w=1200&q=80",
      thumbnailUrl: "https://images.unsplash.com/photo-1550966871-3ed3cdb5ed0c?auto=format&fit=crop&w=400&q=80",
      caption: "Frantzén Öppna Kockbänk & Gastronomi",
      credit: "Anders Husa & Kaitlin Orr Guide",
    },
  ],
  "operakällaren": [
    {
      id: "venue-operakallaren-1",
      placeId: 11,
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a2/Operak%C3%A4llaren_2011.jpg/1200px-Operak%C3%A4llaren_2011.jpg",
      thumbnailUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a2/Operak%C3%A4llaren_2011.jpg/400px-Operak%C3%A4llaren_2011.jpg",
      caption: "Operakällaren Historisk Fasad & Kungliga Operan",
      credit: "Wikimedia Commons / Public Domain",
    },
  ],
  "restaurang ag": [
    {
      id: "venue-ag-1",
      placeId: 12,
      url: "https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=1200&q=80",
      thumbnailUrl: "https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=400&q=80",
      caption: "Restaurang AG Hängmörningskyl & Köttsommelier (Kronobergsgatan)",
      credit: "Restaurang AG Stockholm",
    },
  ],
  "miyakodori": [
    {
      id: "venue-miyakodori-1",
      placeId: 13,
      url: "https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=1200&q=80",
      thumbnailUrl: "https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=400&q=80",
      caption: "Miyakodori Yakitori & Izakayaspettsar (Upplandsgatan)",
      credit: "Miyakodori Izakaya",
    },
  ],
  "la neta": [
    {
      id: "venue-laneta-1",
      placeId: 14,
      url: "https://images.unsplash.com/photo-1565299585323-38d6b0865b47?auto=format&fit=crop&w=1200&q=80",
      thumbnailUrl: "https://images.unsplash.com/photo-1565299585323-38d6b0865b47?auto=format&fit=crop&w=400&q=80",
      caption: "La Neta Majstacos & Salsabar (Barnhusgatan)",
      credit: "La Neta Taqueria",
    },
  ],
  "svedjan bageri": [
    {
      id: "venue-svedjan-1",
      placeId: 15,
      url: "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=1200&q=80",
      thumbnailUrl: "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=400&q=80",
      caption: "Svedjan Bageri Surdegsbröd & Bageridisk (Zinkensdamm)",
      credit: "Svedjan Bageri",
    },
  ],
  "lillebrors bageri": [
    {
      id: "venue-lillebror-1",
      placeId: 16,
      url: "https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=1200&q=80",
      thumbnailUrl: "https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=400&q=80",
      caption: "Lillebrors Bageri Nystökta Kardemummabullar (Vasastan)",
      credit: "Lillebrors Bageri",
    },
  ],
  "pyza ii": [
    {
      id: "venue-pyza-1",
      placeId: 17,
      url: "https://images.unsplash.com/photo-1541832676-9b763b0239ab?auto=format&fit=crop&w=1200&q=80",
      thumbnailUrl: "https://images.unsplash.com/photo-1541832676-9b763b0239ab?auto=format&fit=crop&w=400&q=80",
      caption: "Pyza II Handgjorda Pierogi & Dumplings (Gamla Stan)",
      credit: "Pyza II Polish Dining",
    },
  ],
  "pastis": [
    {
      id: "venue-pastis-1",
      placeId: 18,
      url: "https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?auto=format&fit=crop&w=1200&q=80",
      thumbnailUrl: "https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?auto=format&fit=crop&w=400&q=80",
      caption: "Bistro Pastis Franska Bistrobord & Vin (Baggensgatan)",
      credit: "Pastis Bistro Gamla Stan",
    },
  ],
  "rolfs kök": [
    {
      id: "venue-rolfs-1",
      placeId: 19,
      url: "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=1200&q=80",
      thumbnailUrl: "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=400&q=80",
      caption: "Rolfs Kök Klassisk Inredningsdesign & Matbar (Tegnérgatan)",
      credit: "Rolfs Kök Stockholm",
    },
  ],
  "lilla ego": [
    {
      id: "venue-lillaego-1",
      placeId: 20,
      url: "https://images.unsplash.com/photo-1559339352-11d035aa65de?auto=format&fit=crop&w=1200&q=80",
      thumbnailUrl: "https://images.unsplash.com/photo-1559339352-11d035aa65de?auto=format&fit=crop&w=400&q=80",
      caption: "Lilla Ego Tegelväggsbistro & Säsongskök (Västmannagatan)",
      credit: "Lilla Ego Vasastan",
    },
  ],
  "oaxen": [
    {
      id: "venue-oaxen-1",
      placeId: 21,
      url: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=80",
      thumbnailUrl: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=400&q=80",
      caption: "Oaxen Slip Sjönära Bistro (Djurgården)",
      credit: "Oaxen Krog & Slip",
    },
  ],
};

export function getFallbackPhotos(input: PlaceContext | number): PlacePhoto[] {
  const ctx = parseContext(input);
  const placeId = ctx.id;
  const name = ctx.name || "";
  const nameLower = name.toLowerCase().trim();

  // 1. Direct venue-specific photo match (with strict word boundaries)
  for (const [key, venuePhotos] of Object.entries(VENUE_SPECIFIC_PHOTOS)) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`(?:^|\\b)${escaped}(?:\\b|$)`, "i");
    if (pattern.test(nameLower)) {
      return venuePhotos
        .filter((ph) => !ph.url.includes("images.unsplash.com"))
        .map((ph, idx) => ({
          ...ph,
          id: `venue-${placeId}-${idx + 1}`,
          placeId,
        }));
    }
  }

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
  const newPhoto: PlacePhoto = {
    ...photo,
    placeId,
    id: `user-img-${placeId}-${Date.now()}`,
  };

  const existing = photosCache.get(placeId) || [];
  const updated = [newPhoto, ...existing];
  photosCache.set(placeId, updated);

  if (typeof window !== "undefined") {
    try {
      const stored = localStorage.getItem("motkarta_user_photos");
      const list: PlacePhoto[] = stored ? JSON.parse(stored) : [];
      localStorage.setItem("motkarta_user_photos", JSON.stringify([newPhoto, ...list]));
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
      if (!current.some((p) => p.id === ph.id)) {
        photosCache.set(ph.placeId, [ph, ...current]);
      }
    });
  } catch {}
}
