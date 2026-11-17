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
  "Gärdet",
  "Kransen",
  "Kungsholmen",
  "Västermalm",
  "Norrmalm",
  "Östermalm",
  "Riddarholmen",
  "Skeppsholmen",
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

const GENERIC_PREFIXES = new Set(["soder", "soderort", "norr", "norrort", "vaster", "vasterort", "oster"]);

function matchesRegionAlias(text: string, rawAlias: string): boolean {
  const alias = normalizeRegionText(rawAlias);
  if (!alias) return false;
  const padded = ` ${text} `;
  if (padded.includes(` ${alias} `)) {
    return true;
  }
  if (alias.length >= 5 && !GENERIC_PREFIXES.has(alias)) {
    const words = text.split(" ");
    if (words.some((w) => w.startsWith(alias))) {
      return true;
    }
  }
  return false;
}

const AREA_ALIASES: Array<{ region: string; aliases: string[] }> = [
  { region: "Gärdet", aliases: ["gärdet", "gardet", "frihamnen", "sandhamnsgatan", "sehlstedtsgatan", "furusundsgatan", "smedsbacksgatan", "östhammarsgatan", "rökubbsgatan", "värtahamnen", "vartahamnen", "tessinparken", "brantingsgatan"] },
  { region: "Kransen", aliases: ["kransen", "midsommarkransen", "svandammsplan", "svandammsparken", "tellusborg", "tellusborgsvägen", "tegelbruksvägen", "vattenledningsvägen", "bäckvägen", "backvagen", "klockargatan", "nymilsgatan"] },
  {
    region: "Söderort",
    aliases: [
      "söderort",
      "soderort",
      "farsta",
      "farsta strand",
      "farstastrand",
      "farstaplan",
      "farstagången",
      "farstagangen",
      "farstaängsvägen",
      "farstaangsvagen",
      "farsta torg",
      "farstatorg",
      "sköndal",
      "skondal",
      "sköndals",
      "skondals",
      "fagersjö",
      "fagersjo",
      "fagersta",
      "larsboda",
      "larsbodavägen",
      "larsbodavagen",
      "hökarängen",
      "hokarangen",
      "hökarängsplan",
      "hokarangsplan",
      "gubbängen",
      "gubbangen",
      "gubbängstorget",
      "gubbängsvägen",
      "tallkrogen",
      "svedmyra",
      "stureby",
      "örby",
      "orby",
      "östberga",
      "ostberga",
      "hagsätra",
      "hagsatra",
      "rågsved",
      "ragsved",
      "högdalen",
      "hogdalen",
      "bandhagen",
      "älvsjö",
      "alvsjo",
      "fruängen",
      "fruangen",
      "västertorp",
      "vastertorp",
      "hägersten",
      "hagersten",
      "aspudden",
      "liljeholmen",
      "årsta",
      "arsta",
      "enskede",
      "gullmarsplan",
      "globen",
      "hammarbyhöjden",
      "hammarbyhojden",
      "björkhagen",
      "bjorkhagen",
      "kärrtorp",
      "karrtorp",
      "bagarmossen",
      "skarpnäck",
      "skarpnack",
      "skärholmen",
      "skarholmen",
      "bredäng",
      "bredang",
      "mälarhöjden",
      "malarhojden",
      "sätra",
      "satra",
      "telefonplan",
      "hammarby sjöstad",
      "hammarby sjostad",
      "klubbacken",
    ],
  },
  { region: "Södermalm", aliases: ["södermalm", "soder", "söder", "mariatorget", "hornstull", "sofo", "nytorget", "östgöta", "ostgota", "zinkensdamm", "skanstull", "götgatan", "gotgatan", "folkungagatan", "bondegatan", "kocksgatan", "skånegatan", "renstiernas"] },
  { region: "Djurgården", aliases: ["djurgården", "djurgarden", "biskopsudden", "skansen", "grona lund", "gröna lund", "djurgårdsbrunn"] },
  { region: "Riddarholmen", aliases: ["riddarholmen", "birger jarls torg", "riddarholmskajen", "wrangelska", "norra riddarholmshamnen", "södra riddarholmshamnen"] },
  { region: "Skeppsholmen", aliases: ["skeppsholmen", "kastellholmen", "svensksundsvägen", "svensksundsvagen", "exercisplan", "flaggmansvägen", "flaggmansvagen", "sjöbacksstigen", "sjobacksstigen"] },
  { region: "Vasastan", aliases: ["vasastan", "vasastaden", "odenplan", "birkastan", "st eriksplan", "rörstrandsgatan", "rorstrandsgatan", "sankt eriksplan"] },
  { region: "Norrmalm", aliases: ["norrmalm", "city", "hötorget", "hotorget", "t-centralen", "drottninggatan", "sergels torg", "hamngatan", "klarabergsgatan", "bryggargatan", "tegelbacken"] },
  { region: "Östermalm", aliases: ["östermalm", "ostermalm", "stureplan", "karlaplan", "humlegården", "humlegarden", "strandvägen", "styrmansgatan", "linnégatan"] },
  { region: "Västermalm", aliases: ["västermalm", "vastermalm"] },
  { region: "Kungsholmen", aliases: ["kungsholmen", "fridhemsplan", "norr mälarstrand", "norr malarstrand", "hornsberg", "hantverkargatan", "stadshuset"] },
  { region: "Gamla Stan", aliases: ["gamla stan", "gamlastan", "stortorget", "västerlånggatan", "vasterlanggatan", "österlånggatan"] },
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
  ["cafe skeppsholmen", "Skeppsholmen"],
  ["café skeppsholmen", "Skeppsholmen"],
  ["haro krog", "Skeppsholmen"],
  ["harö krog", "Skeppsholmen"],
  ["riddaren mat & catering", "Riddarholmen"],
  ["riddaren mat och catering", "Riddarholmen"],
  ["riddaren", "Riddarholmen"],
  ["brasserie hutton", "Riddarholmen"],
  ["malardrottningen brasserie hutton", "Riddarholmen"],
  ["mälardrottningen brasserie hutton", "Riddarholmen"],
  ["lilla gastabud", "Riddarholmen"],
  ["lilla gästabud", "Riddarholmen"],
  ["gamla riksarkivet", "Riddarholmen"],
  ["riksarkivet", "Riddarholmen"],
]);

const REGION_BOXES: Array<{
  region: string;
  latMin: number;
  latMax: number;
  lonMin: number;
  lonMax: number;
}> = [
  { region: "Riddarholmen", latMin: 59.3225, latMax: 59.3270, lonMin: 18.0600, lonMax: 18.0665 },
  { region: "Skeppsholmen", latMin: 59.3220, latMax: 59.3290, lonMin: 18.0780, lonMax: 18.0890 },
  { region: "Gamla Stan", latMin: 59.3210, latMax: 59.3288, lonMin: 18.0666, lonMax: 18.0770 },
  { region: "Södermalm", latMin: 59.3000, latMax: 59.3210, lonMin: 18.0150, lonMax: 18.1050 },
  { region: "Djurgården", latMin: 59.3180, latMax: 59.3370, lonMin: 18.0850, lonMax: 18.1600 },
  { region: "Gärdet", latMin: 59.3400, latMax: 59.3560, lonMin: 18.0920, lonMax: 18.1350 },
  { region: "Kransen", latMin: 59.2970, latMax: 59.3075, lonMin: 18.0000, lonMax: 18.0200 },
  { region: "Kungsholmen", latMin: 59.3230, latMax: 59.3440, lonMin: 17.9850, lonMax: 18.0600 },
  { region: "Vasastan", latMin: 59.3375, latMax: 59.3620, lonMin: 18.0200, lonMax: 18.0660 },
  { region: "Norrmalm", latMin: 59.3260, latMax: 59.3375, lonMin: 18.0440, lonMax: 18.0720 },
  { region: "Östermalm", latMin: 59.3300, latMax: 59.3550, lonMin: 18.0660, lonMax: 18.1400 },
];

export function isMisplacedSodermalmRegion(place: RegionPlace): boolean {
  const existingArea = place.area?.trim();
  if (!existingArea || normalizeRegionText(existingArea) !== "sodermalm") {
    return false;
  }
  if (typeof place.latitude === "number" && place.latitude > 0) {
    if (place.latitude < 59.3000 || (place.latitude < 59.3150 && typeof place.longitude === "number" && place.longitude < 18.0150)) {
      return true;
    }
    if (place.latitude > 59.3220) {
      return true;
    }
  }
  const textWithoutArea = normalizeRegionText(`${place.name} ${place.address ?? ""}`);
  const soderort = AREA_ALIASES.find((entry) => entry.region === "Söderort");
  if (soderort && soderort.aliases.some((alias) => matchesRegionAlias(textWithoutArea, alias))) {
    return true;
  }
  const kransen = AREA_ALIASES.find((entry) => entry.region === "Kransen");
  if (kransen && kransen.aliases.some((alias) => matchesRegionAlias(textWithoutArea, alias))) {
    return true;
  }
  return false;
}

export function resolveStockholmRegion(place: RegionPlace): string {
  const existingArea = place.area?.trim();
  const normalizedName = normalizeRegionText(place.name);
  const override = PLACE_OVERRIDES.get(normalizedName);
  if (override) {
    return override;
  }

  const isMisplaced = isMisplacedSodermalmRegion(place);
  if (existingArea && !isBroadStockholmArea(existingArea) && !isMisplaced) {
    return existingArea;
  }

  const isSouthOfSoder =
    typeof place.latitude === "number" &&
    place.latitude > 0 &&
    (place.latitude < 59.3000 || (place.latitude < 59.3150 && typeof place.longitude === "number" && place.longitude < 18.0150));

  const text = normalizeRegionText(`${place.name} ${isMisplaced ? "" : (place.area ?? "")} ${place.address ?? ""}`);
  const aliasMatch = AREA_ALIASES.find((entry) => {
    if (isSouthOfSoder && entry.region === "Södermalm") {
      return false;
    }
    return entry.aliases.some((alias) => matchesRegionAlias(text, alias));
  });
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

export function getAreaAliases(area?: string | null): string[] {
  if (!area) return [];
  const normalized = normalizeRegionText(area);
  const entry = AREA_ALIASES.find((e) => normalizeRegionText(e.region) === normalized);
  return entry ? entry.aliases : [];
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
