import type { ExternalWebResult } from './contracts.ts';

export const PROHIBITED_DOMAINS = [
  'yelp.com',
  'yelp.se',
  'tripadvisor.',
  'google.',
  'facebook.com',
  'instagram.com',
  'zomato.com',
  'foursquare.com',
  'trustpilot.com',
  'thefork.',
  'lafourchette.com',
  'gastrogate.com',
  'bokabord.se',
  'restaurangguiden.com',
  'krogguiden.se',
  'eniro.se',
  'hitta.se',
  'pricerunner.se',
  'reco.se',
  'booking.com',
  'hotels.com',
  'expedia.com',
  'starbucks.',
  'espressohouse.com',
  'espressohouse.se',
  'waynescoffee.',
  'mcdonalds.',
  'max.se',
  'burgerking.',
  'subway.com',
  'subway.se',
  'pressbyran.se',
  '7-eleven.se',
  'nespresso.com',
  'kahls.se',
  'bonorochblad.se',
  'pizzahut.',
  'dominos.se',
  'kfc.se',
  'kfc.com',
];

export function isProhibitedDomain(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return PROHIBITED_DOMAINS.some((p) => {
      if (p.endsWith('.')) {
        return hostname === p.slice(0, -1) || hostname.includes(p);
      }
      return hostname === p || hostname.endsWith('.' + p);
    });
  } catch {
    return true;
  }
}

export function cleanCommercialText(text: string): string {
  if (!text) return '';
  let clean = text
    .replace(/&amp;/g, '&')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');

  // Strip star rating symbols
  clean = clean.replace(/[★☆]+/g, ' ');

  // Strip rating phrases: "Betyg: 4.5 av 5 stjärnor.", "rated 5 of 5", "4.8/5"
  clean = clean.replace(/\b(betyg|rated|ranking|grade)\s*[:#]?\s*\d+(\.\d)?(\s*(av|\/|out of)\s*(5|10))?(\s*(stjärnor|stars))?\s*[!.:;]?/gi, ' ');
  clean = clean.replace(/\b\d+(\.\d)?\s*(av|\/|out of)\s*(5|10)(\s*(stjärnor|stars))?\s*[!.:;]?/gi, ' ');
  clean = clean.replace(/\b\d+(\.\d)?\s*(stjärnor|stars)\b\s*[!.:;]?/gi, ' ');

  // Strip review counts: "142 omdömen.", "See unbiased reviews", "3 264 recensioner"
  clean = clean.replace(/\b\d+[\s\d]*\s*(omdömen|recensioner|reviews|unbiased reviews)\b\s*[!.:;]?/gi, ' ');
  clean = clean.replace(/\b(see|läs|se)\s+(unbiased\s+)?(omdömen|reviews|recensioner)(\s+om)?\b\s*[!.:;]?/gi, ' ');

  // Strip booking & commercial promotional slogans
  clean = clean.replace(/\b(boka bord(\s+online)?|book a table(\s+online)?)\b\s*[!.:;]?/gi, ' ');
  clean = clean.replace(/\b(sponsrad(e)?|sponsrat|sponsored|annons|advertisement)(\s+(innehåll|artikel|krog|restaurang|plats|länk|inlägg))?\b\s*[!.:;]?/gi, ' ');
  clean = clean.replace(/\b(för\s+)?\d+%\s*(rabatt|discount|off)\b\s*[!.:;]?/gi, ' ');
  clean = clean.replace(/\b(erbjudande|special offer)\b\s*[!.:;]?/gi, ' ');

  // Strip aggregator branding: "på Tripadvisor.", "on Yelp"
  clean = clean.replace(/\b(på|on)\s+(tripadvisor|yelp|thefork|gastrogate|eniro|hitta)\b\s*[!.:;]?/gi, ' ');

  // Clean up punctuation artifacts
  clean = clean.replace(/\s*([,.:;!?])\s*\1+/g, '$1');
  clean = clean.replace(/([,.:;!?])\s*([,.:;!?])+/g, '$1');
  clean = clean.replace(/\s+([,.:;!?])/g, '$1');
  clean = clean.replace(/\s+/g, ' ').trim();
  clean = clean.replace(/^[:;,\.\-–—!?\s]+/, '').trim();
  clean = clean.replace(/\s+[:;,\.\-–—!?]+$/, '').trim();
  return clean;
}

export function cleanCommercialTitle(title: string): string {
  if (!title) return '';
  let clean = title
    .replace(/&amp;/g, '&')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');

  clean = clean.replace(/[★☆]+/g, ' ');

  // Remove commercial aggregator suffixes
  clean = clean.replace(/\s*[-–—|]\s*(Tripadvisor|Yelp|TheFork|GastroGate|Hitta\.se|Eniro|Restaurangguiden|BokaBord|Google|Thatsup).*$/i, '');
  clean = clean.replace(/^(TOP\s+\d+\s+BEST\s+|Top\s+\d+\s+Best\s+)/i, '');
  clean = clean.replace(/\s+-\s+\d{4}\s+(Reviews|Omdömen).*$/i, '');

  clean = clean.replace(/\s+/g, ' ').trim();
  clean = clean.replace(/^[:;,\.\-–—\s]+/, '').trim();
  return clean;
}

export function filterExternalWebResults(results: ExternalWebResult[]): ExternalWebResult[] {
  const filtered: ExternalWebResult[] = [];
  const seenDomains = new Set<string>();

  for (const r of results) {
    if (!r.url || isProhibitedDomain(r.url)) continue;
    let domain = '';
    try {
      domain = new URL(r.url).hostname.replace(/^www\./, '');
    } catch {
      continue;
    }
    if (seenDomains.has(domain)) continue;

    const title = cleanCommercialTitle(r.title || domain);
    const snippet = cleanCommercialText(r.snippet || '');
    if (!title) continue;

    seenDomains.add(domain);
    filtered.push({
      title,
      url: r.url,
      snippet,
      domain,
    });
  }

  return filtered.slice(0, 5);
}

export function parseDuckDuckGoHtml(html: string): ExternalWebResult[] {
  const rawResults: ExternalWebResult[] = [];
  const blocks = html.split(/class="result\s+results_links/);
  for (const block of blocks.slice(1)) {
    const titleMatch = block.match(/<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    const snippetMatch = block.match(/<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);
    if (!titleMatch) continue;

    let url = titleMatch[1];
    if (url.includes('uddg=')) {
      try {
        url = decodeURIComponent(url.split('uddg=')[1].split('&')[0]);
      } catch {
        // preserve url as is
      }
    }
    if (!url.startsWith('http://') && !url.startsWith('https://')) continue;

    let domain = '';
    try {
      domain = new URL(url).hostname.replace(/^www\./, '');
    } catch {
      continue;
    }

    const rawTitle = titleMatch[2].replace(/<[^>]+>/g, '').trim();
    const rawSnippet = snippetMatch ? snippetMatch[1].replace(/<[^>]+>/g, '').trim() : '';

    rawResults.push({
      title: rawTitle,
      url,
      snippet: rawSnippet,
      domain,
    });
  }

  return filterExternalWebResults(rawResults);
}
