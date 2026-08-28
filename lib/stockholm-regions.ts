type RegionPlace = {
  name: string;
  area?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
};

export const STOCKHOLM_REGIONS = [
  "Djurgården",
  "Gamla Stan",
  "Kungsholmen",
  "Norrmalm",
  "Östermalm",
  "Södermalm",
  "Söderort",
  "Vasastan",
  "Västerort",
  "Norrort",
] as const;

const BROAD_STOCKHOLM_AREAS = new Set([
  "stockholm",
  "central stockholm",
  "north stockholm",
  "south stockholm",
  "east stockholm",
  "west stockholm",
  "stockholms lan",
  "stockholm county",
  "stockholms kommun",
  "sweden",
  "sverige",
  "unspecified",
]);

const AREA_ALIASES: Array<{ region: string; aliases: string[] }> = [
  { region: "Södermalm", aliases: ["södermalm", "soder", "söder", "mariatorget", "hornstull", "sofo", "nytorget"] },
  { region: "Djurgården", aliases: ["djurgården", "djurgarden", "biskopsudden", "skansen", "grona lund", "gröna lund"] },
  { region: "Vasastan", aliases: ["vasastan", "vasastaden", "odenplan", "birkastan", "st eriksplan", "rörstrandsgatan", "rorstrandsgatan"] },
  { region: "Norrmalm", aliases: ["norrmalm", "city", "hötorget", "hotorget", "t-centralen", "drottninggatan"] },
  { region: "Östermalm", aliases: ["östermalm", "ostermalm", "stureplan", "karlaplan", "humlegården", "humlegarden"] },
  { region: "Kungsholmen", aliases: ["kungsholmen", "fridhemsplan", "norr mälarstrand", "norr malarstrand"] },
  { region: "Gamla Stan", aliases: ["gamla stan", "gamlastan", "stortorget"] },
  { region: "Söderort", aliases: ["söderort", "soderort", "årsta", "arsta", "liljeholmen", "midsommarkransen", "aspudden", "hägersten", "hagersten", "älvsjö", "alvsjo", "enskede", "gullmarsplan", "globen", "hammarbyhöjden", "hammarbyhojden", "björkhagen", "bjorkhagen", "kärrtorp", "karrtorp", "bagarmossen", "skarpnäck", "skarpnack", "farsta", "bandhagen", "högdalen", "hogdalen", "rågsved", "ragsved", "skärholmen", "skarholmen", "bredäng", "bredang", "mälarhöjden", "malarhojden", "sätra", "satra", "telefonplan"] },
  { region: "Västerort", aliases: ["västerort", "vasterort", "bromma", "alvik", "traneberg", "ulvsunda", "mariehäll", "mariehall", "annedal", "riksby", "blackeberg", "åkeshov", "akeshov", "vällingby", "vallingby", "hässelby", "hasselby", "spånga", "spanga", "tensta", "rinkeby", "kista", "akalla", "husby"] },
  { region: "Norrort", aliases: ["norrort", "solna", "sundbyberg", "danderyd", "täby", "taby", "sollentuna", "upplands väsby", "upplands vasby", "järfälla", "jarfalla"] },
];

const PLACE_OVERRIDES = new Map<string, string>([
  ["blå porten", "Djurgården"],
  ["bla porten", "Djurgården"],
  ["aira", "Djurgården"],
  ["blå dörren", "Södermalm"],
  ["bla dorren", "Södermalm"],
  ["drop coffee roasters", "Södermalm"],
  ["pelikan", "Södermalm"],
  ["mälarpaviljongen", "Kungsholmen"],
  ["malarpaviljongen", "Kungsholmen"],
  ["lillebrors bageri", "Vasastan"],
  ["vete-katten", "Norrmalm"],
  ["sturehof", "Östermalm"],
]);

const REGION_BOXES: Array<{
  region: string;
  latMin: number;
  latMax: number;
  lonMin: number;
  lonMax: number;
}> = [
  { region: "Djurgården", latMin: 59.318, latMax: 59.337, lonMin: 18.085, lonMax: 18.16 },
  { region: "Södermalm", latMin: 59.300, latMax: 59.3235, lonMin: 18.015, lonMax: 18.105 },
  { region: "Kungsholmen", latMin: 59.318, latMax: 59.342, lonMin: 17.995, lonMax: 18.055 },
  { region: "Vasastan", latMin: 59.338, latMax: 59.362, lonMin: 18.020, lonMax: 18.065 },
  { region: "Östermalm", latMin: 59.331, latMax: 59.352, lonMin: 18.068, lonMax: 18.120 },
  { region: "Gamla Stan", latMin: 59.321, latMax: 59.3288, lonMin: 18.062, lonMax: 18.082 },
  { region: "Norrmalm", latMin: 59.329, latMax: 59.349, lonMin: 18.044, lonMax: 18.074 },
  { region: "Söderort", latMin: 59.20, latMax: 59.315, lonMin: 17.86, lonMax: 18.22 },
  { region: "Västerort", latMin: 59.30, latMax: 59.43, lonMin: 17.75, lonMax: 18.02 },
  { region: "Norrort", latMin: 59.35, latMax: 59.50, lonMin: 18.00, lonMax: 18.20 },
];

export function resolveStockholmRegion(place: RegionPlace): string {
  const existingArea = place.area?.trim();
  if (existingArea && !isBroadStockholmArea(existingArea)) {
    return existingArea;
  }

  const normalizedName = normalizeRegionText(place.name);
  const override = PLACE_OVERRIDES.get(normalizedName);
  if (override) {
    return override;
  }

  const text = normalizeRegionText(`${place.name} ${place.area ?? ""} ${place.address ?? ""}`);
  const aliasMatch = AREA_ALIASES.find((entry) => entry.aliases.some((alias) => text.includes(normalizeRegionText(alias))));
  if (aliasMatch) {
    return aliasMatch.region;
  }

  if (typeof place.latitude === "number" && typeof place.longitude === "number") {
    const boxMatch = REGION_BOXES.find(
      (box) =>
        place.latitude! >= box.latMin &&
        place.latitude! <= box.latMax &&
        place.longitude! >= box.lonMin &&
        place.longitude! <= box.lonMax,
    );
    if (boxMatch) {
      return boxMatch.region;
    }
  }

  return existingArea || "Stockholm";
}

export function isBroadStockholmArea(area?: string | null) {
  if (!area || !area.trim()) {
    return true;
  }
  return BROAD_STOCKHOLM_AREAS.has(normalizeRegionText(area));
}

function normalizeRegionText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
