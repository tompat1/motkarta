export interface VerifiedSourceInfo {
  id: string;
  name: string;
  label: string;
  shortLabel: string;
  iconType: "burger" | "star" | "fork-knife" | "award" | "newspaper" | "coffee" | "dog" | "sparkle" | "compass" | "map-pin";
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
    sourceName?: string;
    evidenceLabel?: string;
    evidence?: unknown;
    kind?: string;
    candidateSourceType?: string | null;
    specialty?: { specialtyVerified?: boolean };
  } | null | undefined,
): VerifiedSourceInfo[] {
  if (!place) return [];
  const tags = (place.tags || []).map((t) => t.toLowerCase());
  const evidenceEntries = Array.isArray(place.evidence)
    ? place.evidence.map((entry) => {
        if (typeof entry === "string") return entry.toLowerCase();
        if (entry && typeof entry === "object") {
          const rec = entry as { source?: string; label?: string; sourceType?: string };
          return `${rec.source || ""} ${rec.label || ""} ${rec.sourceType || ""}`.toLowerCase();
        }
        return "";
      })
    : [];
  const facts = [
    ...(place.sourceFacts || []).map((f) => (f.source || "").toLowerCase()),
    (place.sourceName || "").toLowerCase(),
    (place.evidenceLabel || "").toLowerCase(),
    ...evidenceEntries,
  ].filter(Boolean);
  const hasTag = (term: string) => tags.some((t) => t.includes(term.toLowerCase()));
  const hasFact = (term: string) => facts.some((f) => f.includes(term.toLowerCase()));
  const hasAny = (...terms: string[]) => terms.some((term) => hasTag(term) || hasFact(term));

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
  if (hasAny("anders husa")) {
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

  // 10. Stora Restaurangpriset / Svenska Gastronomipriset
  if (hasAny("stora restaurangpriset", "gastronomipriset", "restaurangpriset")) {
    sources.push({
      id: "stora-restaurangpriset",
      name: "Stora Restaurangpriset",
      label: "Stora Restaurangpriset",
      shortLabel: "Restaurangpriset",
      iconType: "award",
      descriptionSv: "Utmärkt av Sveriges främsta kockar och sommelierer i Stora Restaurangpriset / Svenska Gastronomipriset",
      descriptionEn: "Awarded by Sweden's top chefs and sommeliers in Stora Restaurangpriset",
      url: "https://restaurangpriset.se",
      color: "#9a3412",
      bgColor: "#ffedd5",
      borderColor: "#fed7aa",
    });
  }

  // 11. Allt om Mat
  if (hasAny("allt om mat")) {
    sources.push({
      id: "allt-om-mat",
      name: "Allt om Mat",
      label: "Allt om Mat",
      shortLabel: "Allt om Mat",
      iconType: "fork-knife",
      descriptionSv: "Krogtestad och rekommenderad av redaktionen på Allt om Mat",
      descriptionEn: "Reviewed and recommended by Allt om Mat editors",
      url: "https://alltommat.expressen.se/restaurang/",
      color: "#166534",
      bgColor: "#dcfce7",
      borderColor: "#bbf7d0",
    });
  }

  // 12. Vagabond
  if (hasAny("vagabond")) {
    sources.push({
      id: "vagabond",
      name: "Vagabond",
      label: "Vagabond",
      shortLabel: "Vagabond",
      iconType: "compass",
      descriptionSv: "Handplockad i Vagabonds redaktionella Stockholmsguide",
      descriptionEn: "Handpicked in Vagabond's editorial Stockholm guide",
      url: "https://www.vagabond.se/sverige/stockholm/",
      color: "#0369a1",
      bgColor: "#e0f2fe",
      borderColor: "#bae6fd",
    });
  }

  // 13. Spotted by Locals Stockholm
  if (hasAny("spotted by locals")) {
    sources.push({
      id: "spotted-by-locals",
      name: "Spotted by Locals",
      label: "Spotted by Locals",
      shortLabel: "Spotted by Locals",
      iconType: "map-pin",
      descriptionSv: "Handplockat lokalt tips från Stockholms-spotters på Spotted by Locals",
      descriptionEn: "Handpicked local tip from Stockholm spotters on Spotted by Locals",
      url: "https://www.spottedbylocals.com/stockholm/",
      color: "#4338ca",
      bgColor: "#e0e7ff",
      borderColor: "#c7d2fe",
    });
  }

  // 14. Visit Stockholm
  if (hasAny("visit stockholm")) {
    sources.push({
      id: "visit-stockholm",
      name: "Visit Stockholm",
      label: "Visit Stockholm",
      shortLabel: "Visit Stockholm",
      iconType: "compass",
      descriptionSv: "Utvald i Stockholms stads officiella mat- och restaurangguide Visit Stockholm",
      descriptionEn: "Featured in Stockholm's official city dining guide Visit Stockholm",
      url: "https://www.visitstockholm.se",
      color: "#0f766e",
      bgColor: "#f0fdfa",
      borderColor: "#99f6e4",
    });
  }

  // 15. User Approved (Community-submitted place)
  if (
    place.candidateSourceType === "user_submission" ||
    hasAny("user approved", "user_submission", "community submission", "användargodkänd")
  ) {
    sources.push({
      id: "user-approved",
      name: "User Approved",
      label: "User Approved",
      shortLabel: "User Approved",
      iconType: "sparkle",
      descriptionSv: "Tillagd av en Motkarta-användare och godkänd för Stockholms oberoende matkarta",
      descriptionEn: "Added by a Motkarta user and approved for Stockholm's independent food map",
      url: "https://motkarta.rynell.org",
      color: "#166534",
      bgColor: "#dcfce7",
      borderColor: "#86efac",
    });
  }

  // 16. Thatsup Stockholm (Discovery & editorial staff-pick lead; requires separate quality corroboration)
  if (hasAny("thatsup")) {
    sources.push({
      id: "thatsup",
      name: "Thatsup",
      label: "Thatsup",
      shortLabel: "Thatsup",
      iconType: "compass",
      descriptionSv: "Upptäcktskälla och redaktionellt tips i Thatsup Stockholm (kräver separat oberoende belägg för högt kvalitetsförtroende; betalda placeringar exkluderas)",
      descriptionEn: "Discovery lead and editorial pick in Thatsup Stockholm (requires separate independent corroboration for high quality confidence; paid placements excluded)",
      url: "https://thatsup.se/stockholm/",
      color: "#9a3412",
      bgColor: "#ffedd5",
      borderColor: "#fdba74",
    });
  }

  return sources;
}
