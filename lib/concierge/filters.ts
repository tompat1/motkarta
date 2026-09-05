export type StructuredFilters = {
  cuisines: string[];
  price_max: number | null;
  independent_preferred: boolean;
  tourist_centre: boolean;
  near_public_transport: boolean;
  dog_friendly?: boolean;
};

export function extractStructuredFilters(query: string): StructuredFilters {
  const qLower = query.toLowerCase();

  const cuisines: string[] = [];
  const knownCuisines: Array<[string, string]> = [
    ["poland", "polish"],
    ["polish", "polish"],
    ["polska", "polish"],
    ["polsk", "polish"],
    ["pierogi", "polish"],
    ["eastern european", "eastern_european"],
    ["eastern european", "polish"],
    ["russian", "russian"],
    ["ukrainian", "ukrainian"],
    ["france", "french"],
    ["french", "french"],
    ["fransk", "french"],
    ["franskt", "french"],
    ["bistro", "bistro"],
    ["brasserie", "bistro"],
    ["sweden", "swedish"],
    ["swedish", "swedish"],
    ["svensk", "swedish"],
    ["husmanskost", "swedish"],
    ["italy", "italian"],
    ["italian", "italian"],
    ["italiensk", "italian"],
    ["italienska", "italian"],
    ["italienskt", "italian"],
    ["trattoria", "italian"],
    ["trattorias", "italian"],
    ["pizza", "pizza"],
    ["sushi", "sushi"],
    ["japan", "japanese"],
    ["japanese", "japanese"],
    ["japansk", "japanese"],
    ["japanska", "japanese"],
    ["japanskt", "japanese"],
    ["izakaya", "japanese"],
    ["yakitori", "japanese"],
    ["germany", "german"],
    ["german", "german"],
    ["austria", "austrian"],
    ["austrian", "austrian"],
    ["hungary", "hungarian"],
    ["hungarian", "hungarian"],
    ["goulash", "hungarian"],
    ["schnitzel", "schnitzel"],
    ["thai", "thai"],
    ["thailand", "thai"],
    ["thailändsk", "thai"],
    ["thailändskt", "thai"],
    ["indian", "indian"],
    ["india", "indian"],
    ["indisk", "indian"],
    ["indiska", "indian"],
    ["indiskt", "indian"],
    ["koreansk", "korean"],
    ["koreanska", "korean"],
    ["korean", "korean"],
    ["kinesisk", "chinese"],
    ["kinesiska", "chinese"],
    ["kinesiskt", "chinese"],
    ["chinese", "chinese"],
    ["vietnamesisk", "vietnamese"],
    ["vietnamesiska", "vietnamese"],
    ["vietnamese", "vietnamese"],
    ["coffee", "coffee"],
    ["kaffe", "coffee"],
    ["bakery", "bakery"],
    ["bageri", "bakery"],
    ["hantverksbageri", "bakery"],
    ["kardemummabulle", "bakery"],
    ["kardemumma", "bakery"],
    ["kanelbulle", "bakery"],
    ["kanelbullar", "bakery"],
    ["surdegsbröd", "bakery"],
    ["surdeg", "bakery"],
    ["sourdough", "bakery"],
    ["burger", "burger"],
    ["middle eastern", "middle_eastern"],
    ["mexican", "mexican"],
    ["mexikansk", "mexican"],
    ["mexikanska", "mexican"],
    ["mexico", "mexican"],
    ["tacos", "mexican"],
    ["tapas", "tapas"],
    ["tapas", "spanish"],
    ["spanish", "spanish"],
    ["spain", "spanish"],
    ["spansk", "spanish"],
    ["spanskt", "spanish"],
    ["paella", "spanish"],
    ["paella", "paella"],
    ["ramen", "ramen"],
  ];

  for (const [term, norm] of knownCuisines) {
    if (qLower.includes(term)) {
      cuisines.push(norm);
    }
  }

  let priceMax: number | null = null;
  if (["not expensive", "budget", "affordable", "cheap", "cheaply", "moderate", "rimligt pris", "billigt", "prisvärt", "överkomligt"].some((kw) => qLower.includes(kw))) {
    priceMax = 250;
  } else if (["fine dining", "expensive", "upscale", "avsmakningsmeny", "tasting menu"].some((kw) => qLower.includes(kw))) {
    priceMax = 800;
  }

  const independentPreferred = ["family-run", "family run", "family-owned", "independent", "local", "authentic", "small business", "familjeägd", "familjeägt", "oberoende", "handgjorda", "handgjord", "hantverks", "artisan"].some(
    (kw) => qLower.includes(kw),
  );

  const touristCentre = !["outside", "away from", "outer", "suburb", "outside the tourist centre", "not in center"].some(
    (kw) => qLower.includes(kw),
  );

  const nearPublicTransport = ["public transport", "metro", "tunnelbana", "station", "bus", "transit", "train"].some(
    (kw) => qLower.includes(kw),
  );

  const dogFriendly = ["dog", "dogs", "hund", "hundar", "hundvänlig", "hundvänligt", "tasstipset", "dog-friendly"].some(
    (kw) => qLower.includes(kw),
  );

  return {
    cuisines: [...new Set(cuisines)],
    price_max: priceMax,
    independent_preferred: independentPreferred,
    tourist_centre: touristCentre,
    near_public_transport: nearPublicTransport,
    dog_friendly: dogFriendly,
  };
}

export const CUISINE_ALIASES: Record<string, string[]> = {
  poland: ["polish", "poland", "polska", "polsk", "pierogi", "eastern_european", "eastern european"],
  polish: ["polish", "poland", "polska", "polsk", "pierogi", "eastern_european", "eastern european"],
  polska: ["polish", "poland", "polska", "polsk", "pierogi", "eastern_european", "eastern european"],
  polsk: ["polish", "poland", "polska", "polsk", "pierogi", "eastern_european"],
  pierogi: ["polish", "poland", "polska", "polsk", "pierogi", "eastern_european"],
  sweden: ["swedish", "sweden", "svensk", "husmanskost"],
  swedish: ["swedish", "sweden", "svensk", "husmanskost"],
  svensk: ["swedish", "sweden", "svensk", "husmanskost"],
  husmanskost: ["swedish", "husmanskost", "svensk"],
  italy: ["italian", "italy", "italiensk", "italienska", "pasta", "pizza", "trattoria"],
  italian: ["italian", "italy", "italiensk", "italienska", "pasta", "pizza", "trattoria"],
  italiensk: ["italian", "italy", "italiensk", "italienska", "pasta", "pizza", "trattoria"],
  italienska: ["italian", "italy", "italiensk", "italienska", "pasta", "pizza", "trattoria"],
  trattoria: ["italian", "trattoria", "trattorias", "pasta", "pizza"],
  trattorias: ["italian", "trattoria", "trattorias", "pasta", "pizza"],
  japan: ["japanese", "japan", "japansk", "japanska", "sushi", "ramen", "izakaya", "yakitori"],
  japanese: ["japanese", "japan", "japansk", "japanska", "sushi", "ramen", "izakaya", "yakitori"],
  japansk: ["japanese", "japan", "japansk", "japanska", "sushi", "ramen", "izakaya", "yakitori"],
  japanska: ["japanese", "japan", "japansk", "japanska", "sushi", "ramen", "izakaya", "yakitori"],
  izakaya: ["japanese", "japan", "izakaya", "yakitori"],
  yakitori: ["japanese", "japan", "izakaya", "yakitori"],
  mexico: ["mexican", "mexico", "mexikansk", "mexikanska", "tacos"],
  mexican: ["mexican", "mexico", "mexikansk", "mexikanska", "tacos"],
  mexikansk: ["mexican", "mexico", "mexikansk", "mexikanska", "tacos"],
  mexikanska: ["mexican", "mexico", "mexikansk", "mexikanska", "tacos"],
  tacos: ["mexican", "mexico", "mexikansk", "mexikanska", "tacos"],
  germany: ["german", "germany", "schnitzel", "austrian"],
  german: ["german", "germany", "schnitzel", "austrian"],
  austria: ["austrian", "austria", "schnitzel", "german"],
  austrian: ["austrian", "austria", "schnitzel", "german"],
  schnitzel: ["schnitzel", "german", "austrian", "czech"],
  french: ["french", "france", "fransk", "franskt", "bistro", "brasserie"],
  france: ["french", "france", "fransk", "franskt", "bistro", "brasserie"],
  fransk: ["french", "france", "fransk", "franskt", "bistro", "brasserie"],
  bistro: ["bistro", "french", "fransk", "brasserie"],
  hungary: ["hungarian", "hungary", "goulash", "austrian"],
  hungarian: ["hungarian", "hungary", "goulash", "austrian"],
  goulash: ["goulash", "hungarian", "austrian"],
  spanish: ["spanish", "spain", "spansk", "spanskt", "paella", "tapas"],
  spain: ["spanish", "spain", "spansk", "spanskt", "paella", "tapas"],
  spansk: ["spanish", "spain", "spansk", "spanskt", "paella", "tapas"],
  spanskt: ["spanish", "spain", "spansk", "spanskt", "paella", "tapas"],
  paella: ["paella", "spanish", "spansk", "spanskt", "tapas"],
  tapas: ["tapas", "spanish", "spansk", "spanskt", "paella"],
  thai: ["thai", "thailand", "thailändsk", "thailändskt"],
  thailändsk: ["thai", "thailand", "thailändsk", "thailändskt"],
  indian: ["indian", "india", "indisk", "indiska", "indiskt"],
  indisk: ["indian", "india", "indisk", "indiska", "indiskt"],
  korean: ["korean", "koreansk", "koreanska"],
  koreansk: ["korean", "koreansk", "koreanska"],
  chinese: ["chinese", "kinesisk", "kinesiska", "kinesiskt"],
  kinesisk: ["chinese", "kinesisk", "kinesiska", "kinesiskt"],
  vietnamese: ["vietnamese", "vietnamesisk", "vietnamesiska"],
  vietnamesisk: ["vietnamese", "vietnamesisk", "vietnamesiska"],
  kardemummabulle: ["bakery", "cardamom", "kardemumma", "fika"],
  kardemumma: ["bakery", "cardamom", "kardemumma", "fika"],
  surdegsbröd: ["bakery", "sourdough", "surdeg", "bread"],
  surdeg: ["bakery", "sourdough", "surdeg", "bread"],
  sourdough: ["bakery", "sourdough", "surdeg", "bread"],
  kanelbulle: ["bakery", "cinnamon", "fika"],
  kanelbullar: ["bakery", "cinnamon", "fika"],
};

