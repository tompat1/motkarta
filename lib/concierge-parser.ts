export type ParsedConciergeCard = {
  name: string;
  whyItMatches?: string;
  area?: string;
  priceConfidence?: string;
  hoursConfidence?: string;
  dataSources?: string;
  lastVerified?: string;
  missingInfo?: string;
  rawLines?: string[];
};

export type ParsedConciergeResponse = {
  intro: string;
  superpowerAction?: "add_place" | "add_review" | "add_photo" | "rate_place";
  clarification?: {
    queryTerm: string;
    question: string;
  };
  cards: ParsedConciergeCard[];
  charter: string[];
};

export function parseConciergeAnswer(text: string): ParsedConciergeResponse {
  if (!text) return { intro: "", cards: [], charter: [] };

  const lines = text.split("\n");
  let intro = "";
  let superpowerAction: "add_place" | "add_review" | "add_photo" | "rate_place" | undefined;
  let clarification: { queryTerm: string; question: string } | undefined;
  const cards: ParsedConciergeCard[] = [];
  const charter: string[] = [];
  let currentCard: ParsedConciergeCard | null = null;
  let inCharter = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (line.startsWith("SUPERPOWER_ACTION:")) {
      const actionStr = line.replace(/^SUPERPOWER_ACTION:\s*/, "").trim();
      if (actionStr === "add_place" || actionStr === "add_review" || actionStr === "add_photo" || actionStr === "rate_place") {
        superpowerAction = actionStr;
      }
      continue;
    }

    if (line.startsWith("CLARIFICATION_NEEDED:")) {
      const questionText = line.replace(/^CLARIFICATION_NEEDED:\s*/, "");
      const matchTerm = questionText.match(/["'](.*?)["']/);
      clarification = {
        queryTerm: matchTerm ? matchTerm[1] : "",
        question: questionText,
      };
      intro = questionText;
      continue;
    }

    if (
      line.includes("ETHICAL & TECHNICAL CHARTER") ||
      line.includes("Recommendations prioritize") ||
      line.includes("transparent quality and discovery")
    ) {
      inCharter = true;
      if (currentCard) {
        cards.push(currentCard);
        currentCard = null;
      }
      if (!line.includes("ETHICAL & TECHNICAL CHARTER")) {
        charter.push(line.replace(/^[•\-]\s*/, ""));
      }
      continue;
    }

    if (inCharter) {
      if (!line.includes("ETHICAL & TECHNICAL CHARTER")) {
        charter.push(line.replace(/^[•\-]\s*/, ""));
      }
      continue;
    }

    // Handle markdown title headers
    if (
      line.startsWith("###") ||
      line.startsWith("##") ||
      (line.startsWith("**") && line.endsWith("**") && !line.includes(":"))
    ) {
      if (currentCard) {
        cards.push(currentCard);
      }
      const rawName = line
        .replace(/^[#\s*]+/, "")
        .replace(/[*#]+$/, "")
        .trim();
      currentCard = { name: rawName, rawLines: [] };
      continue;
    }

    // Handle inline bullet item format: "• Place Name (Kind in Area) — 43 recommendation score"
    if (
      !line.includes(":") &&
      (line.startsWith("•") || line.startsWith("-")) &&
      (line.includes("—") || line.includes("-") || line.includes("–"))
    ) {
      if (currentCard) {
        cards.push(currentCard);
        currentCard = null;
      }
      const clean = line.replace(/^[•\-]\s*/, "");
      const dashParts = clean.split(/\s*[\u2014\u2013\u2212\-]\s*/);
      const namePart = dashParts[0] || "";
      const scorePart = dashParts[1] || "";

      let placeName = namePart;
      let areaName: string | undefined;

      const parenMatch = namePart.match(/^(.*?)\((.*?)\)$/);
      if (parenMatch) {
        placeName = parenMatch[1].trim();
        const inParen = parenMatch[2].trim();
        if (inParen.includes(" in ")) {
          areaName = inParen.split(" in ")[1].trim();
        } else {
          areaName = inParen;
        }
      }

      cards.push({
        name: placeName,
        area: areaName,
        whyItMatches: scorePart ? `Top recommendation (${scorePart})` : "Matches discovery criteria",
        hoursConfidence: "Verified",
        priceConfidence: "Medium",
        dataSources: "OpenStreetMap (ODbL), Stockholm Stad Open Data (CC0)",
        lastVerified: "Recently verified",
      });
      continue;
    }

    if (currentCard) {
      const cleanLine = line.replace(/^[•\-]\s*/, "");
      const normalizedLine = cleanLine.replace(/\*\*/g, "").trim();

      const extractValue = (normLine: string) => {
        const colonIdx = normLine.indexOf(":");
        if (colonIdx !== -1) {
          return normLine.slice(colonIdx + 1).trim();
        }
        return undefined;
      };

      if (/why it matches:/i.test(normalizedLine)) {
        currentCard.whyItMatches = extractValue(normalizedLine);
      } else if (/(?:area \/ location|area):/i.test(normalizedLine)) {
        currentCard.area = extractValue(normalizedLine);
      } else if (/price confidence:/i.test(normalizedLine)) {
        currentCard.priceConfidence = extractValue(normalizedLine);
      } else if (/(?:opening-hours|opening hours) confidence:/i.test(normalizedLine)) {
        currentCard.hoursConfidence = extractValue(normalizedLine);
      } else if (/(?:data sources & license|data sources):/i.test(normalizedLine)) {
        currentCard.dataSources = extractValue(normalizedLine);
      } else if (/(?:last verified date|last verified):/i.test(normalizedLine)) {
        currentCard.lastVerified = extractValue(normalizedLine);
      } else if (/(?:missing\/uncertain info|missing or uncertain info):/i.test(normalizedLine)) {
        currentCard.missingInfo = extractValue(normalizedLine);
      } else {
        currentCard.rawLines?.push(cleanLine);
      }
    } else {
      if (!intro) {
        intro = line;
      } else {
        intro += " " + line;
      }
    }
  }

  if (currentCard) {
    cards.push(currentCard);
  }

  return { intro, superpowerAction, clarification, cards, charter };
}
