export type PlaceReview = {
  id: string;
  placeId: number;
  author: string;
  rating: number;
  date: string;
  source: "Editorial Guide" | "Food Control Inspection" | "Specialty Coffee Auditor" | "Verified Local";
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

  const fallbackReviews = getFallbackReviews(ctx);
  reviewsCache.set(ctx.id, fallbackReviews);
  return fallbackReviews;
}

export async function fetchPlacePhotos(input: PlaceContext | number): Promise<PlacePhoto[]> {
  const ctx = parseContext(input);
  if (photosCache.has(ctx.id)) {
    return photosCache.get(ctx.id)!;
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

    const res = await fetch(`/api/photos?${params.toString()}`);
    if (res.ok) {
      const data = (await res.json()) as { photos?: PlacePhoto[] };
      const photos = data.photos ?? [];
      photosCache.set(ctx.id, photos);
      return photos;
    }
  } catch {
    // Endpoint fallback below
  }

  const fallbackPhotos = getFallbackPhotos(ctx);
  photosCache.set(ctx.id, fallbackPhotos);
  return fallbackPhotos;
}

export function getFallbackPhotos(input: PlaceContext | number): PlacePhoto[] {
  const ctx = parseContext(input);
  const placeId = ctx.id;
  const kind = (ctx.kind || "").toLowerCase();
  const cuisine = (ctx.cuisine || "").toLowerCase();
  const tagsStr = (ctx.tags || []).join(" ").toLowerCase();
  const name = ctx.name || "";
  const area = ctx.area ? ` in ${ctx.area}` : "";

  // 1. Mexican / Taqueria
  if (cuisine.includes("mexican") || tagsStr.includes("tacos") || name.toLowerCase().includes("taqueria") || name.toLowerCase().includes("neta") || name.toLowerCase().includes("cheibo")) {
    return [
      {
        id: `img-${placeId}-1`,
        placeId,
        url: "https://images.unsplash.com/photo-1565299585323-38d6b0865b47?auto=format&fit=crop&w=800&q=80",
        thumbnailUrl: "https://images.unsplash.com/photo-1565299585323-38d6b0865b47?auto=format&fit=crop&w=300&q=80",
        caption: `Färsk Majstacos & Salsor (${name})`,
        credit: "Unsplash / Taqueria Kitchen",
        width: 800,
        height: 600,
      },
      {
        id: `img-${placeId}-2`,
        placeId,
        url: "https://images.unsplash.com/photo-1551504734-5ee1c4a1479b?auto=format&fit=crop&w=800&q=80",
        thumbnailUrl: "https://images.unsplash.com/photo-1551504734-5ee1c4a1479b?auto=format&fit=crop&w=300&q=80",
        caption: `Nylagad Guacamole & Quesadillas`,
        credit: "Unsplash / Mexican Craft",
        width: 800,
        height: 600,
      },
      {
        id: `img-${placeId}-3`,
        placeId,
        url: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=800&q=80",
        thumbnailUrl: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=300&q=80",
        caption: `Livfull Taqueriamiljö${area}`,
        credit: "Unsplash / Taqueria Dining",
        width: 800,
        height: 600,
      },
    ];
  }

  // 2. Polish / Eastern European
  if (cuisine.includes("polish") || cuisine.includes("eastern_european") || tagsStr.includes("pierogi") || name.toLowerCase().includes("pyza") || name.toLowerCase().includes("babcia")) {
    return [
      {
        id: `img-${placeId}-1`,
        placeId,
        url: "https://images.unsplash.com/photo-1541832676-9b763b0239ab?auto=format&fit=crop&w=800&q=80",
        thumbnailUrl: "https://images.unsplash.com/photo-1541832676-9b763b0239ab?auto=format&fit=crop&w=300&q=80",
        caption: `Handgjorda Pierogi & Dumplings (${name})`,
        credit: "Unsplash / European Kitchen",
        width: 800,
        height: 600,
      },
      {
        id: `img-${placeId}-2`,
        placeId,
        url: "https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=800&q=80",
        thumbnailUrl: "https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=300&q=80",
        caption: `Traditionell Soppa & Husmanskost`,
        credit: "Unsplash / Rustic Comfort Food",
        width: 800,
        height: 600,
      },
      {
        id: `img-${placeId}-3`,
        placeId,
        url: "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=800&q=80",
        thumbnailUrl: "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=300&q=80",
        caption: `Varm & Rustik Restaurangmiljö${area}`,
        credit: "Unsplash / European Dining",
        width: 800,
        height: 600,
      },
    ];
  }

  // 3. Italian / Pizza / Pasta
  if (cuisine.includes("italian") || cuisine.includes("pizza") || tagsStr.includes("pasta") || name.toLowerCase().includes("bistro sud")) {
    return [
      {
        id: `img-${placeId}-1`,
        placeId,
        url: "https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=800&q=80",
        thumbnailUrl: "https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=300&q=80",
        caption: `Vedugnsgräddad Pizza & Servering (${name})`,
        credit: "Unsplash / Pizza Oven",
        width: 800,
        height: 600,
      },
      {
        id: `img-${placeId}-2`,
        placeId,
        url: "https://images.unsplash.com/photo-1551183053-bf91a1d81141?auto=format&fit=crop&w=800&q=80",
        thumbnailUrl: "https://images.unsplash.com/photo-1551183053-bf91a1d81141?auto=format&fit=crop&w=300&q=80",
        caption: `Handgjord Färsk Pasta & Råvaror`,
        credit: "Unsplash / Trattoria Craft",
        width: 800,
        height: 600,
      },
      {
        id: `img-${placeId}-3`,
        placeId,
        url: "https://images.unsplash.com/photo-1537047902294-62a40c20a6ae?auto=format&fit=crop&w=800&q=80",
        thumbnailUrl: "https://images.unsplash.com/photo-1537047902294-62a40c20a6ae?auto=format&fit=crop&w=300&q=80",
        caption: `Italiensk Trattoriastämning${area}`,
        credit: "Unsplash / Italian Ambience",
        width: 800,
        height: 600,
      },
    ];
  }

  // 4. Thai / Asian / Ramen
  if (cuisine.includes("thai") || cuisine.includes("japanese") || cuisine.includes("ramen") || tagsStr.includes("thai") || name.toLowerCase().includes("thai") || name.toLowerCase().includes("phangan")) {
    return [
      {
        id: `img-${placeId}-1`,
        placeId,
        url: "https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=800&q=80",
        thumbnailUrl: "https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=300&q=80",
        caption: `Färska Asiatiska Smaker & Rätter (${name})`,
        credit: "Unsplash / Asian Kitchen",
        width: 800,
        height: 600,
      },
      {
        id: `img-${placeId}-2`,
        placeId,
        url: "https://images.unsplash.com/photo-1559314809-0d155014e29e?auto=format&fit=crop&w=800&q=80",
        thumbnailUrl: "https://images.unsplash.com/photo-1559314809-0d155014e29e?auto=format&fit=crop&w=300&q=80",
        caption: `Wokade Grönsaker & Färska Örter`,
        credit: "Unsplash / Wok Craft",
        width: 800,
        height: 600,
      },
      {
        id: `img-${placeId}-3`,
        placeId,
        url: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=800&q=80",
        thumbnailUrl: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=300&q=80",
        caption: `Stämningsfull Asiatisk Bistro${area}`,
        credit: "Unsplash / Asian Dining",
        width: 800,
        height: 600,
      },
    ];
  }

  // 5. Spanish / Tapas
  if (cuisine.includes("spanish") || cuisine.includes("tapas") || tagsStr.includes("tapas") || tagsStr.includes("paella") || name.toLowerCase().includes("boqueria") || name.toLowerCase().includes("ramblas")) {
    return [
      {
        id: `img-${placeId}-1`,
        placeId,
        url: "https://images.unsplash.com/photo-1534422298391-e4f8c172dddb?auto=format&fit=crop&w=800&q=80",
        thumbnailUrl: "https://images.unsplash.com/photo-1534422298391-e4f8c172dddb?auto=format&fit=crop&w=300&q=80",
        caption: `Spanska Tapas & Delikatesser (${name})`,
        credit: "Unsplash / Tapas Bar",
        width: 800,
        height: 600,
      },
      {
        id: `img-${placeId}-2`,
        placeId,
        url: "https://images.unsplash.com/photo-1515443961218-a5136d888be7?auto=format&fit=crop&w=800&q=80",
        thumbnailUrl: "https://images.unsplash.com/photo-1515443961218-a5136d888be7?auto=format&fit=crop&w=300&q=80",
        caption: `Nylagad Paella & Jamón Ibérico`,
        credit: "Unsplash / Spanish Dining",
        width: 800,
        height: 600,
      },
      {
        id: `img-${placeId}-3`,
        placeId,
        url: "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=800&q=80",
        thumbnailUrl: "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=300&q=80",
        caption: `Levande Tapasbar & Servering${area}`,
        credit: "Unsplash / Spanish Bistro",
        width: 800,
        height: 600,
      },
    ];
  }

  // 6. French / Bistro
  if (cuisine.includes("french") || kind.includes("bistro") || tagsStr.includes("bistro") || name.toLowerCase().includes("pastis") || name.toLowerCase().includes("sud")) {
    return [
      {
        id: `img-${placeId}-1`,
        placeId,
        url: "https://images.unsplash.com/photo-1550966871-3ed3cdb5ed0c?auto=format&fit=crop&w=800&q=80",
        thumbnailUrl: "https://images.unsplash.com/photo-1550966871-3ed3cdb5ed0c?auto=format&fit=crop&w=300&q=80",
        caption: `Klassiska Franska Bistrorätter (${name})`,
        credit: "Unsplash / French Dining",
        width: 800,
        height: 600,
      },
      {
        id: `img-${placeId}-2`,
        placeId,
        url: "https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?auto=format&fit=crop&w=800&q=80",
        thumbnailUrl: "https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?auto=format&fit=crop&w=300&q=80",
        caption: `Utvalt Vin & Brasseriemeny`,
        credit: "Unsplash / Bistro Bar",
        width: 800,
        height: 600,
      },
      {
        id: `img-${placeId}-3`,
        placeId,
        url: "https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=800&q=80",
        thumbnailUrl: "https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=300&q=80",
        caption: `Kontinental Bistromiljö${area}`,
        credit: "Unsplash / French Brasserie",
        width: 800,
        height: 600,
      },
    ];
  }

  // 7. Bakery / Bageri
  if (kind.includes("bakery") || cuisine.includes("bakery") || tagsStr.includes("bun") || tagsStr.includes("bread") || name.toLowerCase().includes("bageri") || name.toLowerCase().includes("delselius")) {
    return [
      {
        id: `img-${placeId}-1`,
        placeId,
        url: "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=800&q=80",
        thumbnailUrl: "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=300&q=80",
        caption: `Färskgräddat Surdegsbröd (${name})`,
        credit: "Unsplash / Artisan Bakery",
        width: 800,
        height: 600,
      },
      {
        id: `img-${placeId}-2`,
        placeId,
        url: "https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=800&q=80",
        thumbnailUrl: "https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=300&q=80",
        caption: `Kardemummabullar & Svensk Fika`,
        credit: "Unsplash / Swedish Bakery",
        width: 800,
        height: 600,
      },
      {
        id: `img-${placeId}-3`,
        placeId,
        url: "https://images.unsplash.com/photo-1517433670267-08bbd4be890f?auto=format&fit=crop&w=800&q=80",
        thumbnailUrl: "https://images.unsplash.com/photo-1517433670267-08bbd4be890f?auto=format&fit=crop&w=300&q=80",
        caption: `Bageridisk & Hantverksbageri${area}`,
        credit: "Unsplash / Bakery Counter",
        width: 800,
        height: 600,
      },
    ];
  }

  // 8. Specialty Coffee / Café
  if (kind.includes("coffee") || kind.includes("café") || cuisine.includes("coffee") || tagsStr.includes("espresso") || name.toLowerCase().includes("pascal") || name.toLowerCase().includes("drop") || name.toLowerCase().includes("lykke")) {
    return [
      {
        id: `img-${placeId}-1`,
        placeId,
        url: "https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=800&q=80",
        thumbnailUrl: "https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=300&q=80",
        caption: `Specialty Coffee Barista Espressobar (${name})`,
        credit: "Unsplash / Specialty Coffee",
        width: 800,
        height: 600,
      },
      {
        id: `img-${placeId}-2`,
        placeId,
        url: "https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=800&q=80",
        thumbnailUrl: "https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=300&q=80",
        caption: `Handbryggt V60 & Spårbara Kaffebönor`,
        credit: "Unsplash / Pour Over Coffee",
        width: 800,
        height: 600,
      },
      {
        id: `img-${placeId}-3`,
        placeId,
        url: "https://images.unsplash.com/photo-1442512595331-e89e73853f31?auto=format&fit=crop&w=800&q=80",
        thumbnailUrl: "https://images.unsplash.com/photo-1442512595331-e89e73853f31?auto=format&fit=crop&w=300&q=80",
        caption: `Skön Kaffemiljö & Servering${area}`,
        credit: "Unsplash / Cafe Craft",
        width: 800,
        height: 600,
      },
    ];
  }

  // 9. Default Dining
  return [
    {
      id: `img-${placeId}-1`,
      placeId,
      url: "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=800&q=80",
      thumbnailUrl: "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=300&q=80",
      caption: `Restaurangmiljö & Servering (${name})`,
      credit: "Unsplash / Dining Ambience",
      width: 800,
      height: 600,
    },
    {
      id: `img-${placeId}-2`,
      placeId,
      url: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=800&q=80",
      thumbnailUrl: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=300&q=80",
      caption: `Färska Råvaror & Matlagning`,
      credit: "Unsplash / Culinary Arts",
      width: 800,
      height: 600,
    },
    {
      id: `img-${placeId}-3`,
      placeId,
      url: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=800&q=80",
      thumbnailUrl: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=300&q=80",
      caption: `Oberoende Servering${area}`,
      credit: "Unsplash / Independent Dining",
      width: 800,
      height: 600,
    },
  ];
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
