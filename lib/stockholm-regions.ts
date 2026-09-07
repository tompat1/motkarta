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
  "Västermalm",
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
  { region: "Södermalm", aliases: ["södermalm", "soder", "söder", "mariatorget", "hornstull", "sofo", "nytorget", "östgöta", "ostgota", "zinkensdamm", "skanstull", "götgatan", "gotgatan", "folkungagatan", "bondegatan", "kocksgatan", "skånegatan", "renstiernas"] },
  { region: "Djurgården", aliases: ["djurgården", "djurgarden", "biskopsudden", "skansen", "grona lund", "gröna lund", "djurgårdsbrunn"] },
  { region: "Vasastan", aliases: ["vasastan", "vasastaden", "odenplan", "birkastan", "st eriksplan", "rörstrandsgatan", "rorstrandsgatan", "sankt eriksplan"] },
  { region: "Norrmalm", aliases: ["norrmalm", "city", "hötorget", "hotorget", "t-centralen", "drottninggatan", "sergels torg", "hamngatan", "klarabergsgatan", "bryggargatan", "tegelbacken"] },
  { region: "Östermalm", aliases: ["östermalm", "ostermalm", "stureplan", "karlaplan", "humlegården", "humlegarden", "strandvägen", "gärdet", "gardet", "styrmansgatan", "linnégatan"] },
  { region: "Västermalm", aliases: ["västermalm", "vastermalm"] },
  { region: "Kungsholmen", aliases: ["kungsholmen", "fridhemsplan", "norr mälarstrand", "norr malarstrand", "hornsberg", "hantverkargatan", "stadshuset"] },
  { region: "Gamla Stan", aliases: ["gamla stan", "gamlastan", "stortorget", "västerlånggatan", "vasterlanggatan", "österlånggatan"] },
  { region: "Söderort", aliases: ["söderort", "soderort", "årsta", "arsta", "liljeholmen", "midsommarkransen", "aspudden", "hägersten", "hagersten", "älvsjö", "alvsjo", "enskede", "gullmarsplan", "globen", "hammarbyhöjden", "hammarbyhojden", "björkhagen", "bjorkhagen", "kärrtorp", "karrtorp", "bagarmossen", "skarpnäck", "skarpnack", "farsta", "bandhagen", "högdalen", "hogdalen", "rågsved", "ragsved", "skärholmen", "skarholmen", "bredäng", "bredang", "mälarhöjden", "malarhojden", "sätra", "satra", "telefonplan", "hammarby sjöstad", "hammarby sjostad", "klubbacken"] },
  { region: "Västerort", aliases: ["västerort", "vasterort", "bromma", "alvik", "traneberg", "ulvsunda", "mariehäll", "mariehall", "annedal", "riksby", "blackeberg", "åkeshov", "akeshov", "vällingby", "vallingby", "hässelby", "hasselby", "spånga", "spanga", "tensta", "rinkeby", "kista", "akalla", "husby", "nockeby"] },
  { region: "Norrort", aliases: ["norrort", "solna", "sundbyberg", "danderyd", "täby", "taby", "sollentuna", "upplands väsby", "upplands vasby", "järfälla", "jarfalla"] },
];

const PLACE_OVERRIDES = new Map<string, string>([
  ["ostgotakallaren", "Södermalm"],
  ["ostgotakallaren bar kok", "Södermalm"],
  ["ostgotakallaren bar and kok", "Södermalm"],
  ["ostgotakallaren bar kok ab", "Södermalm"],
  ["östgötakällaren", "Södermalm"],
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
  { region: "Gamla Stan", latMin: 59.3210, latMax: 59.3288, lonMin: 18.0610, lonMax: 18.0820 },
  { region: "Södermalm", latMin: 59.3000, latMax: 59.3210, lonMin: 18.0150, lonMax: 18.1050 },
  { region: "Djurgården", latMin: 59.3180, latMax: 59.3370, lonMin: 18.0850, lonMax: 18.1600 },
  { region: "Kungsholmen", latMin: 59.3230, latMax: 59.3440, lonMin: 17.9850, lonMax: 18.0600 },
  { region: "Vasastan", latMin: 59.3375, latMax: 59.3620, lonMin: 18.0200, lonMax: 18.0660 },
  { region: "Norrmalm", latMin: 59.3260, latMax: 59.3375, lonMin: 18.0440, lonMax: 18.0720 },
  { region: "Östermalm", latMin: 59.3300, latMax: 59.3550, lonMin: 18.0660, lonMax: 18.1400 },
];

export function resolveStockholmRegion(place: RegionPlace): string {
  const existingArea = place.area?.trim();
  const normalizedName = normalizeRegionText(place.name);
  const override = PLACE_OVERRIDES.get(normalizedName);
  if (override) {
    return override;
  }

  if (existingArea && !isBroadStockholmArea(existingArea)) {
    return existingArea;
  }

  const text = normalizeRegionText(`${place.name} ${place.area ?? ""} ${place.address ?? ""}`);
  const aliasMatch = AREA_ALIASES.find((entry) => entry.aliases.some((alias) => text.includes(normalizeRegionText(alias))));
  if (aliasMatch) {
    return aliasMatch.region;
  }

  if (typeof place.latitude === "number" && typeof place.longitude === "number" && place.latitude > 0 && place.longitude > 0) {
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

    if (place.latitude < 59.3000 || (place.latitude < 59.3150 && place.longitude < 18.0150)) {
      return "Söderort";
    }
    if (place.longitude < 17.9850) {
      return "Västerort";
    }
    if (place.latitude > 59.3550) {
      return "Norrort";
    }
    if (place.latitude < 59.3210) {
      return "Södermalm";
    }
    if (place.latitude <= 59.3375) {
      return place.longitude > 18.0700 ? "Östermalm" : "Norrmalm";
    }
    if (place.latitude > 59.3375) {
      return "Vasastan";
    }
  }

  return existingArea || "Södermalm";
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
