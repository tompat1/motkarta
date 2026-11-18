import exclusions from './catalog-exclusions.json' with { type: 'json' };

const tasstipsetOnlyNames = new Map(exclusions.tasstipsetOnlyPlaces.map((place) => [place.id, place.name.toLowerCase()]));

export function isExcludedCatalogPlace(place: { id?: number; name?: unknown; sourceName?: string }): boolean {
  return isExcludedCatalogName(place.name)
    || (place.id !== undefined && typeof place.name === 'string' && tasstipsetOnlyNames.get(place.id) === place.name.toLowerCase())
    || (typeof place.sourceName === 'string' && place.sourceName.toLowerCase().includes('tasstipset'));
}

/** Explicit catalog exclusions apply to every branch, regardless of chain metadata. */
export function isExcludedCatalogName(name: unknown): boolean {
  if (typeof name !== "string") return false;
  const trimmed = name.trim();
  if (/\bo[\s'’‘`´-]*learys\b/i.test(trimmed)) return true;
  if (/^stf\s+stockholm(?:\s|\/).*\bvandrarhem\b/i.test(trimmed)) return true;

  // Major fast food and multinational / national commercial chains
  if (/\b(?:mcdonald[\s'’‘`´-]*s?|max\s+(?:burgers?|hamburgare|restaurang(?:er)?)|burger\s*king|pizza\s*hut|subway|kfc|kentucky\s+fried\s+chicken|taco\s*bell|domino[\s'’‘`´-]*s(?:\s+pizza)?|vapiano|pinchos|dunkin(?:\s*donuts?)?|espresso\s*house|starbucks|wayne[\s'’‘`´-]*s\s+coffee|joe\s*(?:&|and)\s*(?:the\s*)?juice|nespresso|kahls(?:\s+(?:the|te|kaffe)[\w\s&]*)?|b[öo]nor\s*(?:&|och)\s*blad|pressbyr[aå]n|7\s*[-–]?\s*eleven)\b/i.test(trimmed)) return true;
  if (/^max$/i.test(trimmed)) return true;

  // If passed an entire file content (multi-line or extremely long string), don't treat embedded URLs/addresses as place names
  if (trimmed.includes("\n") || trimmed.length > 300) return false;

  // Seasonal shacks, bathing kiosks, and minigolf huts
  if (/\b(?:minigolf\s*kiosk|bangolf(?:\s*&\s*caf[eé])?|badkiosk|strandkiosk|campingkiosk)\b/i.test(trimmed)) return true;
  if (/^kiosk,\s*caf[eé],\s*snabbmat$/i.test(trimmed)) return true;

  // Bathing places, outdoor swimming spots, public baths, and paddling pools
  if (
    /\b(?:badplats|badställe|strandbad|klippbad|friluftsbad|bryggbad|hundbad|sjöbad|utomhusbad|nakenbad|vinterbad|plaskdamm)(?:en|et|er|erna)?\b/i.test(trimmed)
    && !/\b(?:caf[eé]|restaurang(?:en)?|krog(?:en)?|bistro(?:n)?|bar(?:en)?|bageri(?:et)?|konditori(?:et)?)\b/i.test(trimmed)
  ) return true;
  if (/^badplats$/i.test(trimmed)) return true;

  // Non-food financial & cash service POIs (ATMs / cash machines / currency exchange)
  if (/\b(?:bankomat(?:en)?|uttagsautomat(?:en)?|kontantautomat(?:en)?|kontantuttag|v[äa]xlingskontor(?:et)?|cash\s+machine|atm)\b/i.test(trimmed)) return true;

  // Institutional non-commercial dining: schools, preschools, retirement & care facilities
  if (/(?:^|[^a-zA-ZåäöÅÄÖ0-9])(?:grundskol|förskol|forskol|gymnasi|dagis|fritidshem)[a-zA-ZåäöÅÄÖ0-9]*(?![a-zA-ZåäöÅÄÖ0-9])/i.test(trimmed)) return true;
  if (/(?:^|[^a-zA-ZåäöÅÄÖ0-9])[a-zA-ZåäöÅÄÖ0-9]*skol(?:a|an|or|orna)(?![a-zA-ZåäöÅÄÖ0-9])/i.test(trimmed)) return true;
  if (/(?:^|[^a-zA-ZåäöÅÄÖ0-9])(?:äldreboende|aldreboende|vårdboende|vardboende|servicehus|gruppboende|sjukhus)[a-zA-ZåäöÅÄÖ0-9]*(?![a-zA-ZåäöÅÄÖ0-9])/i.test(trimmed)) return true;

  return false;
}
