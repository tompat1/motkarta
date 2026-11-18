export interface VerifiedSourceInfo {
  id: string;
  name: string;
  label: string;
  shortLabel: string;
  iconType: "burger" | "star" | "fork-knife" | "award" | "newspaper" | "coffee" | "dog" | "sparkle";
  descriptionSv: string;
  descriptionEn: string;
  url: string;
  color: string;
  bgColor: string;
  borderColor: string;
}

export function getPlaceVerifiedSources(
  place: {
    tags?: string[];
    sourceFacts?: Array<{ source?: string; verification?: string }>;
    kind?: string;
    specialty?: { specialtyVerified?: boolean };
  } | null | undefined,
): VerifiedSourceInfo[] {
  if (!place) return [];
  const tags = (place.tags || []).map((t) => t.toLowerCase());
  const facts = (place.sourceFacts || []).map((f) => (f.source || "").toLowerCase());
  const hasTag = (term: string) => tags.some((t) => t.includes(term.toLowerCase()));
  const hasFact = (term: string) => facts.some((f) => f.includes(term.toLowerCase()));

  const sources: VerifiedSourceInfo[] = [];

  // 1. Burgerdudes (World's leading burger guide)
  if (hasTag("burgerdudes") || hasFact("burgerdudes") || hasTag("sveriges bästa burgare")) {
    sources.push({
      id: "burgerdudes",
      name: "Burgerdudes",
      label: "Vald av Burgerdudes",
      shortLabel: "Burgerdudes",
      iconType: "burger",
      descriptionSv: "Recenserad och utvald som en av Stockholms bästa burgare av Burgerdudes (världens ledande hamburgarguide)",
      descriptionEn: "Reviewed and selected as one of Stockholm's best burgers by Burgerdudes (world's leading burger guide)",
      url: "https://www.burgerdudes.se/sweden/stockholm/",
      color: "#b45309",
      bgColor: "#fef3c7",
      borderColor: "#fde68a",
    });
  }

  // 2. Guide Michelin
  if (hasTag("michelin") || hasFact("michelin") || hasFact("guide michelin")) {
    sources.push({
      id: "michelin",
      name: "Guide Michelin",
      label: "Guide Michelin",
      shortLabel: "Michelin",
      iconType: "star",
      descriptionSv: "Stjärna, Bib Gourmand eller utvald krog i officiella Guide Michelin Nordic",
      descriptionEn: "Star, Bib Gourmand or selected venue in official Guide Michelin Nordic",
      url: "https://guide.michelin.com/se/sv/stockholm-region/stockholm/restaurants",
      color: "#b91c1c",
      bgColor: "#fee2e2",
      borderColor: "#fca5a5",
    });
  }

  // 3. White Guide Nordic
  if (hasTag("white guide") || hasFact("white guide")) {
    sources.push({
      id: "white-guide",
      name: "White Guide",
      label: "White Guide",
      shortLabel: "White Guide",
      iconType: "fork-knife",
      descriptionSv: "Mästarklass eller mycket god klass i White Guide Nordic",
      descriptionEn: "Master Class or high rating in White Guide Nordic",
      url: "https://whiteguide.com",
      color: "#1e40af",
      bgColor: "#dbeafe",
      borderColor: "#bfdbfe",
    });
  }

  // 4. Sveriges Bästa
  if (hasTag("sveriges bästa") || hasFact("sveriges bästa")) {
    sources.push({
      id: "sveriges-basta",
      name: "Sveriges Bästa",
      label: "Sveriges Bästa",
      shortLabel: "Sveriges Bästa",
      iconType: "award",
      descriptionSv: "Topprankad krog på sverigesbasta.com",
      descriptionEn: "Top-ranked venue on sverigesbasta.com",
      url: "https://sverigesbasta.com",
      color: "#2563eb",
      bgColor: "#eff6ff",
      borderColor: "#dbeafe",
    });
  }

  // 5. Dagens Nyheter Krogkommissionen
  if (hasTag("dn krog") || hasTag("dagens nyheter") || hasFact("dagens nyheter")) {
    sources.push({
      id: "dn-krog",
      name: "DN Krogkommissionen",
      label: "DN Krog",
      shortLabel: "DN",
      iconType: "newspaper",
      descriptionSv: "Oberoende testad och recenserad av Dagens Nyheters krogkommission",
      descriptionEn: "Independently reviewed by Dagens Nyheter restaurant critics",
      url: "https://www.dn.se/om/krogkommissionen/",
      color: "#047857",
      bgColor: "#d1fae5",
      borderColor: "#a7f3d0",
    });
  }

  // 6. Svenska Dagbladet Krogguiden
  if (hasTag("svd krog") || hasTag("svenska dagbladet") || hasFact("svenska dagbladet")) {
    sources.push({
      id: "svd-krog",
      name: "SvD Krogguiden",
      label: "SvD Krog",
      shortLabel: "SvD",
      iconType: "newspaper",
      descriptionSv: "Gastronomisk krogrecension i Svenska Dagbladet",
      descriptionEn: "Dining review in Svenska Dagbladet",
      url: "https://www.svd.se/av/krog",
      color: "#6d28d9",
      bgColor: "#ede9fe",
      borderColor: "#ddd6fe",
    });
  }

  // 7. Specialty Coffee Sweden Registry
  if (place.kind === "Specialty coffee" || hasTag("specialty coffee") || Boolean(place.specialty?.specialtyVerified)) {
    sources.push({
      id: "specialty-coffee",
      name: "Specialty Coffee Sweden",
      label: "Specialkaffe",
      shortLabel: "Specialkaffe",
      iconType: "coffee",
      descriptionSv: "Kvalitetsverifierat oberoende specialkafferosteri / hantverkskafé",
      descriptionEn: "Quality-verified independent specialty roaster / artisan cafe",
      url: "https://specialtycoffee.se",
      color: "#92400e",
      bgColor: "#fef3c7",
      borderColor: "#fde68a",
    });
  }

  // 8. Tasstipset
  if (hasTag("tasstipset") || hasTag("hundvänligt") || hasTag("dog friendly")) {
    sources.push({
      id: "tasstipset",
      name: "Tasstipset",
      label: "Hundvänligt",
      shortLabel: "Tasstipset",
      iconType: "dog",
      descriptionSv: "Verifierat hundvänligt av Tasstipset",
      descriptionEn: "Dog-friendly verified by Tasstipset",
      url: "https://tasstipset.se",
      color: "#0f766e",
      bgColor: "#ccfbf1",
      borderColor: "#99f6e4",
    });
  }

  // 9. Anders Husa & Kaitlin Orr Guide
  if (hasTag("anders husa") || hasFact("anders husa")) {
    sources.push({
      id: "husa-guide",
      name: "Anders Husa & Kaitlin Orr",
      label: "Husa Guide",
      shortLabel: "Husa Guide",
      iconType: "sparkle",
      descriptionSv: "Handplockad av Michelin- och World's 50 Best-jurymedlemmarna Anders Husa & Kaitlin Orr",
      descriptionEn: "Curated by Michelin and World's 50 Best voters Anders Husa & Kaitlin Orr",
      url: "https://andershusa.com",
      color: "#be123c",
      bgColor: "#ffe4e6",
      borderColor: "#fecdd3",
    });
  }

  return sources;
}
