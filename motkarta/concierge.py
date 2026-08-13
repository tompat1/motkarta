from __future__ import annotations

import json
import os
import urllib.request
from pathlib import Path


def load_rag_corpus(path: str | Path) -> list[dict]:
    with Path(path).open(encoding="utf-8") as handle:
        return [json.loads(line) for line in handle if line.strip()]


def extract_structured_filters(query: str) -> dict:
    q_lower = query.lower()

    cuisines: list[str] = []
    known_cuisines = [
        ("polish", "polish"),
        ("eastern european", "eastern_european"),
        ("russian", "russian"),
        ("ukrainian", "ukrainian"),
        ("georgian", "georgian"),
        ("italian", "italian"),
        ("pizza", "pizza"),
        ("sushi", "sushi"),
        ("thai", "thai"),
        ("indian", "indian"),
        ("coffee", "coffee"),
        ("bakery", "bakery"),
        ("burger", "burger"),
        ("middle eastern", "middle_eastern"),
        ("mexican", "mexican"),
        ("tapas", "tapas"),
        ("ramen", "ramen"),
    ]
    for term, norm in known_cuisines:
        if term in q_lower:
            cuisines.append(norm)

    price_max = None
    if any(kw in q_lower for kw in ["not expensive", "budget", "affordable", "cheap", "cheaply", "moderate"]):
        price_max = 250
    elif any(kw in q_lower for kw in ["fine dining", "expensive", "upscale"]):
        price_max = 800

    independent_preferred = any(
        kw in q_lower for kw in ["family-run", "family run", "independent", "local", "authentic", "small business"]
    )
    tourist_centre = not any(
        kw in q_lower for kw in ["outside", "away from", "outer", "suburb", "outside the tourist centre", "not in center"]
    )
    near_public_transport = any(
        kw in q_lower for kw in ["public transport", "metro", "tunnelbana", "station", "bus", "transit", "train"]
    )

    return {
        "cuisines": cuisines,
        "price_max": price_max,
        "independent_preferred": independent_preferred,
        "tourist_centre": tourist_centre,
        "near_public_transport": near_public_transport,
    }


def answer_query(query: str, documents: list[dict], limit: int = 5) -> list[dict]:
    q_lower = query.lower()
    filters = extract_structured_filters(query)
    tokens = {token.strip() for token in q_lower.replace(",", " ").replace(".", " ").split() if len(token) > 2}

    stop_words = {"and", "the", "for", "with", "from", "some", "best", "good", "great", "find", "where", "what", "want", "like", "near", "place", "places", "food", "eat", "get", "have"}
    food_specific_tokens = [t for t in tokens if t not in stop_words and t not in {"tourist", "streets", "center", "centre", "busiest", "quiet", "cheap", "expensive", "independent", "local"}]
    asks_away_from_tourist = any(kw in q_lower for kw in ["away from", "outside", "tourist", "hidden", "quiet", "off the beaten path", "suburb"])

    def score(document: dict) -> float:
        text = f"{document.get('title', '')} {document.get('text', '')}".lower()
        title_lower = str(document.get("title", "")).lower()
        metadata = document.get("metadata", {})
        type_str = str(metadata.get("establishment_type", "")).lower()
        area_str = str(metadata.get("neighbourhood", "")).lower()

        relevance = 0.0

        if any(chain in title_lower for chain in ["nespresso", "kahls", "espresso house", "starbucks"]):
            return -9999.0

        # 1. Food/Query Keyword Match
        matching_food_tokens = [t for t in food_specific_tokens if t in text]
        if food_specific_tokens:
            if matching_food_tokens:
                relevance += len(matching_food_tokens) * 40.0
            else:
                relevance -= 100.0

        # 2. Direct Cuisine Match
        if any(c in text for c in filters.get("cuisines", [])):
            relevance += 50.0

        # 3. Specialty Coffee Verification Gate (Rule #1)
        is_grill_or_restaurant = any(kw in text for kw in ["grill", "grillen", "gastropub", "pub", "bar", "restaurang", "restaurant", "burger", "pizza"])

        if "specialty" in tokens or "coffee" in tokens or "roaster" in tokens:
            is_verified = (
                not is_grill_or_restaurant
                and (
                    metadata.get("specialty_verified")
                    or any(t in text for t in ["own roastery", "roastery", "roaster", "rosteri", "single origin", "filter", "beans", "v60", "aeropress"])
                    or any(n in title_lower for n in ["pascal", "drop coffee", "johan & nyström", "johan & nystrom", "johan och nyström", "solkant", "volca", "lykke", "höga kusten", "gast", "muttley", "nordic brew lab", "a.b.café", "ab cafe", "standout", "café blom", "cafe blom"])
                    or (type_str == "specialty coffee" and float(metadata.get("quality_score") or 0) >= 35)
                )
            )
            if is_verified:
                relevance += 30.0
            else:
                relevance -= 30.0

        # 4. Cardamom / Bakery match points
        if "cardamom" in tokens or "bun" in tokens or "bakery" in tokens:
            if "cardamom" in text or "bakery" in type_str or "bakery" in text or "fika" in text:
                relevance += 25.0

        # 5. Away from tourist streets bonus (ONLY if explicitly requested)
        if asks_away_from_tourist:
            if "central" not in area_str and area_str != "unknown":
                relevance += 15.0
            else:
                relevance -= 15.0

        # 6. Quality & Discovery weightings (scaled to 15 max)
        quality = float(metadata.get("quality_score") or metadata.get("quality") or 0) / 100 * 15.0
        discovery = float(metadata.get("discovery_score") or 0) / 100 * 10.0
        relevance += quality + discovery

        # 6. Low quality penalty
        if float(metadata.get("quality_score") or metadata.get("quality") or 0) < 20:
            relevance -= 30.0

        return relevance

    scored_docs = [doc for doc in documents if score(doc) > 0]
    if not scored_docs:
        scored_docs = documents

    return sorted(scored_docs, key=score, reverse=True)[:limit]


def build_concierge_prompt(query: str, retrieved_documents: list[dict]) -> str:
    context_lines = []
    for idx, doc in enumerate(retrieved_documents, 1):
        metadata = doc.get("metadata", {})
        text = doc.get("text", "")
        has_hours = "Opening hours: Missing" not in text and bool(metadata.get("opening_hours") or "Opening hours:" in text)
        hours_conf = "High" if has_hours else "Low (Hours missing in source)"
        price_conf = "Low (Price level unverified)"
        last_verified = metadata.get("osm_timestamp") or "Not available"

        context_lines.append(
            f"[{idx}] {doc.get('title')}\n"
            f"    Type: {metadata.get('establishment_type', 'Unknown')}\n"
            f"    Area: {metadata.get('neighbourhood', 'Unknown')}\n"
            f"    Discovery score: {metadata.get('discovery_score', 0)}/100\n"
            f"    Why it matches / Reasons: {metadata.get('discovery_reasons', 'N/A')}\n"
            f"    Price confidence: {price_conf}\n"
            f"    Opening-hours confidence: {hours_conf}\n"
            f"    Data sources: OpenStreetMap (ODbL license), Stockholm Stad open data\n"
            f"    Last verified date: {last_verified}\n"
            f"    Details:\n{text}\n"
        )

    context_str = "\n".join(context_lines)

    return (
        "You are the Stockholm Independent Food Map AI Concierge. "
        "Strictly adhere to the following ethical and technical guidelines:\n"
        "1. Base recommendations ONLY on the retrieved database context below. DO NOT invent prices, opening hours, or attributes.\n"
        "2. Never assume a business is low quality or bad simply because it has few reviews or missing attributes.\n"
        "3. Separate verifiable facts (address, cuisine, hours) from discovery scoring signals.\n"
        "4. Explicitly state confidence levels for price and opening hours, and highlight missing or uncertain information.\n"
        "5. Include data sources (OpenStreetMap under ODbL license, Stockholm Stad) and last verified dates.\n\n"
        f"--- RETRIEVED DATABASE CONTEXT ---\n{context_str}\n"
        f"--- USER QUERY ---\n{query}\n\n"
        "AI CONCIERGE RECOMMENDATION (Include for each place: Name, Why it matches, Distance/Area, Price confidence, Opening-hours confidence, Data sources & license, Last verified date, and Missing/Uncertain info):"
    )


def synthesize_concierge_response(
    query: str,
    documents: list[dict],
    limit: int = 3,
    api_key: str | None = None,
) -> dict:
    filters = extract_structured_filters(query)
    retrieved = answer_query(query, documents, limit=limit)
    prompt = build_concierge_prompt(query, retrieved)

    key = api_key or os.getenv("GEMINI_API_KEY") or os.getenv("OPENAI_API_KEY")

    if key and (os.getenv("GEMINI_API_KEY") or (api_key and "AIza" in api_key)):
        try:
            synthesized = call_gemini_api(prompt, key)
            return {
                "query": query,
                "structured_filters": filters,
                "synthesized_answer": synthesized,
                "retrieved_places": retrieved,
                "grounded": True,
                "source": "gemini",
            }
        except Exception as err:
            print(f"Gemini API call fallback: {err}")

    # Grounded fallback recommendation synthesis following transparent auditability standards
    items = []
    for doc in retrieved:
        title = doc.get("title", "Unknown Place")
        meta = doc.get("metadata", {})
        text = doc.get("text", "")
        area = meta.get("neighbourhood", "Stockholm")
        score_val = meta.get("discovery_score", 0)
        reasons = meta.get("discovery_reasons", "Matches query criteria")

        has_hours = "Opening hours: Missing" not in text and "Opening hours:" in text
        has_website = "Website: Missing" not in text and "Website:" in text
        has_address = "Address: Missing" not in text and "Address:" in text

        hours_conf = "High" if has_hours else "Low (Opening hours missing in OSM data)"
        price_conf = "Low (Unverified price tier)"
        last_verified = meta.get("osm_timestamp") or "Unspecified"

        gaps = []
        if not has_hours:
            gaps.append("Opening hours missing")
        if not has_website:
            gaps.append("Website link missing")
        if not has_address:
            gaps.append("Full street address unlisted")
        gap_str = ", ".join(gaps) if gaps else "Profile complete"

        item_block = (
            f"### **{title}**\n"
            f"- **Why it matches**: {reasons} [Discovery score: {score_val}/100]\n"
            f"- **Area / Location**: {area}\n"
            f"- **Price confidence**: {price_conf}\n"
            f"- **Opening-hours confidence**: {hours_conf}\n"
            f"- **Data sources & License**: OpenStreetMap (ODbL), Stockholm Stad Open Data (CC0)\n"
            f"- **Last verified date**: {last_verified}\n"
            f"- **Missing or uncertain info**: {gap_str}"
        )
        items.append(item_block)

    formatted = "\n\n".join(items)
    fallback_answer = (
        f"Based on our auditable open database, here are the top matches for '{query}':\n\n"
        f"{formatted}\n\n"
        f"--- ETHICAL & TECHNICAL CHARTER ---\n"
        f"• Unbiased & Plural: Uses open source data; lack of review volume is never penalized.\n"
        f"• Grounded Facts: Separate verifiable facts from discovery scoring algorithms.\n"
        f"• Corrections & History: OpenStreetMap and Stockholm data updates maintain complete change histories."
    )

    return {
        "query": query,
        "structured_filters": filters,
        "synthesized_answer": fallback_answer,
        "retrieved_places": retrieved,
        "grounded": True,
        "source": "database_grounded",
    }


def call_gemini_api(prompt: str, api_key: str) -> str:
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={api_key}"
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.2, "maxOutputTokens": 600},
    }

    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    with urllib.request.urlopen(req, timeout=15) as resp:
        data = json.loads(resp.read().decode("utf-8"))
        candidates = data.get("candidates", [])
        if candidates:
            parts = candidates[0].get("content", {}).get("parts", [])
            if parts:
                return parts[0].get("text", "").strip()

    raise RuntimeError("Empty or invalid response from Gemini API")
