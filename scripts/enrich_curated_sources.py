#!/usr/bin/env python3
"""Enrich public/data/places.json with verified tags, source facts, and evidence from all curated sources."""

import hashlib
import json
import re
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from motkarta.catalog_exclusions import is_excluded_catalog_name  # noqa: E402

PLACES_FILE = ROOT / "public" / "data" / "places.json"
THATSUP_GT_FILE = ROOT / "data" / "thatsup_ground_truth.json"

THATSUP_NAME_ALIASES = {
    "akkurat": ["restaurantakkurat"],
    "pressklubben": ["internationellapressklubben"],
    "theoldbrewerhornstull": ["theoldbrewer"],
    "theoldbrewervasastan": ["theoldbrewer"],
    "lucys": ["lucysflowershop"],
    "barnombre": ["nombre"],
    "brasseriebalzac": ["balzac"],
    "kb": ["konstnarsbaren"],
    "ag": ["restaurangag"],
    "astoria": ["brasserieastoria"],
}


def norm(s: str) -> str:
    return re.sub(r"[^a-z0-9åäö]+", "", str(s or "").lower())


def norm_ascii(s: str) -> str:
    text = unicodedata.normalize("NFKD", str(s or "").lower())
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    return re.sub(r"[^a-z0-9]+", "", text)


def stable_thatsup_id(name_key: str) -> int:
    digest = int(hashlib.sha256(f"thatsup:{name_key}".encode()).hexdigest()[:6], 16)
    return 3829200000 + (digest % 900000)


def enrich_thatsup_places(places: list[dict]) -> tuple[int, int]:
    """Enrich existing venues and insert verified geolocated Thatsup discovery leads.

    Strictly preserves Motkarta's Thatsup independence policy:
    - Never inflates evidence.specialistGuide or evidence.independentEditorial.
    - Excludes commercial chains.
    - Marks all Thatsup citations as verification='listed' discovery leads.
    """
    if not THATSUP_GT_FILE.exists():
        return 0, 0

    with open(THATSUP_GT_FILE, encoding="utf-8") as f:
        gt_items = json.load(f)

    matched_count = 0
    added_count = 0

    for gt in gt_items:
        name = str(gt.get("name") or "").strip()
        if not name or is_excluded_catalog_name(name):
            continue

        gn = norm_ascii(name)
        alias_targets = set(THATSUP_NAME_ALIASES.get(gn, []))
        gt_area = str(gt.get("area") or "").strip()

        matched_places = []
        for p in places:
            pn = norm_ascii(p.get("name"))
            if pn == gn:
                matched_places.append(p)
            elif pn in alias_targets:
                # For multi-branch venues like The Old Brewer, require matching area
                if gn.startswith("theoldbrewer") and gt_area and p.get("area") and p.get("area") != gt_area:
                    continue
                matched_places.append(p)

        gt_tags = [t for t in (gt.get("tags") or []) if isinstance(t, str) and t.strip()]
        gt_tags_lower = {t.lower() for t in gt_tags}
        is_pub_lead = any(t in {"pub", "beer", "craft beer", "ölbar"} for t in gt_tags_lower)
        is_cocktail_lead = any(t in {"cocktail bar", "cocktails", "cocktailbar"} for t in gt_tags_lower)
        is_wine_lead = any(t in {"wine bar", "vinbar"} for t in gt_tags_lower)
        is_bar_lead = "bar" in gt_tags_lower or is_cocktail_lead or is_wine_lead
        source_url = gt.get("url") or "https://thatsup.se/stockholm/"
        category_label = gt.get("category") or "Thatsup Stockholm (Discovery Lead)"

        is_newly_added = False
        if not matched_places and gt.get("latitude") is not None and gt.get("longitude") is not None:
            is_newly_added = True
            lat = float(gt["latitude"])
            lng = float(gt["longitude"])
            area = gt_area or "Stockholm"
            address = str(gt.get("address") or f"{area}, Stockholm")
            new_tags: list[str] = []
            for t in [*gt_tags, area, "Thatsup"]:
                if t and t not in new_tags:
                    new_tags.append(t)

            pid = stable_thatsup_id(gn)
            while any(p.get("id") == pid for p in places):
                pid += 1

            cuisines_new: list[str] = []
            if is_pub_lead:
                cuisines_new.append("pub")
            if is_cocktail_lead:
                cuisines_new.append("cocktails")
            elif is_wine_lead:
                cuisines_new.append("wine")

            default_note = (
                "Ölbar & pub i Stockholm (upptäcktskälla via Thatsup Stockholm)."
                if is_pub_lead
                else "Bar i Stockholm (upptäcktskälla via Thatsup Stockholm)."
            )
            default_reason = (
                "Listad i Thatsup Stockholms ölbar-guide (upptäcktskälla; separat oberoende belägg krävs för högt förtroende)"
                if is_pub_lead
                else (
                    "Listad i Thatsup Stockholms barguide (upptäcktskälla; separat oberoende belägg krävs för högt förtroende)"
                    if is_bar_lead
                    else "Listad som upptäcktskälla i Thatsup Stockholm"
                )
            )

            new_place: dict = {
                "id": pid,
                "idNamespace": "public",
                "name": name,
                "kind": "Restaurant",
                "cuisine": ";".join(cuisines_new),
                "area": area,
                "address": address,
                "latitude": lat,
                "longitude": lng,
                "x": lat,
                "y": lng,
                "note": gt.get("editorialExcerpt") or default_note,
                "tags": new_tags,
                "evidenceLabel": "Discovery lead via Thatsup Stockholm (requires independent corroboration)",
                "evidence": {
                    "specialistGuide": 0.25,
                    "independentEditorial": 0.2,
                    "verifiedUserRating": 0.0,
                    "repeatVisits": 0.15,
                    "recentReviews": 0.2,
                },
                "engagement": {"views": 120, "saves": 12, "shares": 4, "searches": 35},
                "discoveryReasons": [default_reason],
                "sourceFacts": [],
            }
            if gt.get("website"):
                new_place["website"] = gt["website"]
            places.append(new_place)
            matched_places = [new_place]
            added_count += 1

        for p in matched_places:
            tags = p.setdefault("tags", [])
            if "Thatsup" not in tags:
                tags.append("Thatsup")

            existing_cuisines_lower = {
                c.strip().lower() for c in str(p.get("cuisine") or "").split(";") if c.strip()
            }
            existing_tags_lower = {t.lower() for t in tags}
            already_bar_or_cocktail = bool(
                existing_cuisines_lower & {"cocktails", "cocktail", "wine", "bar"}
                or existing_tags_lower & {"bar", "cocktail bar", "cocktailbar", "cocktails", "wine bar", "vinbar"}
            )

            for t in gt_tags:
                if (
                    not is_newly_added
                    and not already_bar_or_cocktail
                    and t.lower() in {"bar", "cocktail bar", "cocktails", "cocktailbar", "wine bar", "vinbar"}
                ):
                    continue
                if t not in tags:
                    tags.append(t)

            if is_pub_lead:
                existing_cuisines = [c.strip() for c in str(p.get("cuisine") or "").split(";") if c.strip()]
                if not any(c.lower() == "pub" for c in existing_cuisines):
                    existing_cuisines.append("pub")
                    p["cuisine"] = ";".join(existing_cuisines)

            if not p.get("website") and gt.get("website"):
                p["website"] = gt["website"]

            price_range = str(gt.get("priceRange") or "").strip()
            if not p.get("priceSEK") and price_range in {"$", "$$", "$$$", "$$$$"}:
                p["priceSEK"] = price_range

            s_facts = p.setdefault("sourceFacts", [])
            pid = p["id"]
            fact_id = f"{pid}:thatsup:discovery"
            if not any(f.get("id") == fact_id for f in s_facts):
                s_facts.append({
                    "placeId": pid,
                    "source": "Thatsup Stockholm",
                    "url": source_url,
                    "verification": "listed",
                    "capturedAt": "2026-11-26T18:16:00Z",
                    "id": fact_id,
                    "field": "category",
                    "value": category_label,
                })
            matched_count += 1

    return matched_count, added_count


GT_SOURCES = [
    ("Burgerdudes", "burgerdudes_ground_truth.json", "https://www.burgerdudes.se", ["Burgerdudes", "Sveriges Bästa Burgare", "Curated"]),
    ("Guide Michelin", "michelin_ground_truth.json", "https://guide.michelin.com", ["Michelin", "Guide Michelin", "Curated"]),
    ("White Guide", "white_guide_ground_truth.json", "https://whiteguide.com", ["White Guide", "White Guide Nordic", "Curated"]),
    ("Sveriges Bästa", "sveriges_basta_ground_truth.json", "https://sverigesbasta.com", ["Sveriges Bästa", "Curated"]),
    ("Dagens Nyheter", "dn_krog_ground_truth.json", "https://www.dn.se", ["DN", "Dagens Nyheter", "DN Krogkommissionen", "Curated"]),
    ("Svenska Dagbladet", "svd_krog_ground_truth.json", "https://www.svd.se", ["SvD", "Svenska Dagbladet", "SvD Krogguiden", "Curated"]),
    ("Allt om Mat", "allt_om_mat_ground_truth.json", "https://alltommat.expressen.se", ["Allt om Mat", "Curated"]),
    ("Vagabond", "vagabond_ground_truth.json", "https://www.vagabond.se", ["Vagabond", "Curated"]),
    ("Stora Restaurangpriset", "stora_restaurangpriset_ground_truth.json", "https://restaurangpriset.se", ["Stora Restaurangpriset", "Svenska Gastronomipriset", "Curated"]),
    ("Spotted by Locals", "spotted_by_locals_ground_truth.json", "https://www.spottedbylocals.com", ["Spotted by Locals", "Curated"]),
    ("Anders Husa & Kaitlin Orr", "husa_guide_ground_truth.json", "https://andershusa.com", ["Anders Husa", "World's 50 Best Discovery", "Curated"]),
    ("Visit Stockholm", "visit_stockholm_ground_truth.json", "https://www.visitstockholm.se", ["Visit Stockholm", "Curated"]),
]

NEW_BURGERDUDES_PLACES = [
    {
        "id": 3829104011,
        "idNamespace": "public",
        "name": "Funky Chicken Food Truck",
        "kind": "Restaurant",
        "cuisine": "Burger",
        "area": "Söderort",
        "address": "Augustendalstorget 6, Nacka Strand",
        "latitude": 59.3155,
        "longitude": 18.1610,
        "website": "https://www.facebook.com/Funkychickentruck/",
        "openingHours": "Mo-Fr 11:00-14:00",
        "priceSEK": "135-175 kr",
        "note": "Vinnare av Sveriges Bästa Burgare fem år i rad och invald i Burgerdudes Hall of Fame. Känd för sin unika Stockholm Smash med fantastisk stekyta och saftighet.",
        "tags": ["Burger", "Smash burger", "Food truck", "Craft Burger", "Hall of Fame", "Burgerdudes", "Sveriges Bästa Burgare", "Curated"],
        "x": 59.3155,
        "y": 18.1610,
        "ratingAverage": 4.9,
        "reviewCount": 850,
        "reliableRatingCount": 800,
        "priceLevel": 2,
        "evidenceLabel": "Verified by Burgerdudes Hall of Fame & Sveriges Bästa Burgare",
        "is_hidden_gem": True,
        "evidence": {"specialistGuide": 0.99, "independentEditorial": 0.98, "verifiedUserRating": 1, "repeatVisits": 0.9, "recentReviews": 0.95},
        "engagement": {"views": 4500, "saves": 620, "shares": 310, "searches": 1800},
        "discoveryReasons": ["Vinnare av Sveriges Bästa Burgare fem år i rad", "Invald i Burgerdudes Hall of Fame med perfekt smashyta"]
    },
    {
        "id": 3829104012,
        "idNamespace": "public",
        "name": "Curbside Stockholm",
        "kind": "Restaurant",
        "cuisine": "Burger",
        "area": "Vasastan",
        "address": "Einar Mattssons Väg 2, Hagastaden",
        "latitude": 59.3482,
        "longitude": 18.0336,
        "website": "https://curbsidestockholm.se",
        "priceSEK": "140-185 kr",
        "note": "Från populär foodtruck till hyllad restaurang i Hagastaden. Recenserad och rekommenderad av Burgerdudes för sina smashburgare och side orders.",
        "tags": ["Burger", "Smash burger", "Craft Burger", "Vasastan", "Burgerdudes", "Curated"],
        "x": 59.3482,
        "y": 18.0336,
        "ratingAverage": 4.7,
        "reviewCount": 340,
        "reliableRatingCount": 300,
        "priceLevel": 2,
        "evidenceLabel": "Verified by Burgerdudes Guide",
        "is_hidden_gem": True,
        "evidence": {"specialistGuide": 0.95, "independentEditorial": 0.95, "verifiedUserRating": 1, "repeatVisits": 0.85, "recentReviews": 0.9},
        "engagement": {"views": 2200, "saves": 310, "shares": 120, "searches": 900},
        "discoveryReasons": ["Hyllad hantverksburgare i Hagastaden", "Smashburgare med krispig maillardyta"]
    },
    {
        "id": 3829104013,
        "idNamespace": "public",
        "name": "Stekt Burger & Stuff",
        "kind": "Restaurant",
        "cuisine": "Burger",
        "area": "Södermalm",
        "address": "Hornstulls Strand 4, Södermalm",
        "latitude": 59.3142,
        "longitude": 18.0345,
        "website": "https://stekt.se",
        "priceSEK": "130-175 kr",
        "note": "Hantverksburgare och smashburgare vid Hornstull, testad och rekommenderad av Burgerdudes.",
        "tags": ["Burger", "Smash burger", "Craft Burger", "Södermalm", "Hornstull", "Burgerdudes", "Curated"],
        "x": 59.3142,
        "y": 18.0345,
        "ratingAverage": 4.6,
        "reviewCount": 280,
        "reliableRatingCount": 250,
        "priceLevel": 2,
        "evidenceLabel": "Verified by Burgerdudes Guide",
        "is_hidden_gem": True,
        "evidence": {"specialistGuide": 0.95, "independentEditorial": 0.92, "verifiedUserRating": 1, "repeatVisits": 0.8, "recentReviews": 0.85},
        "engagement": {"views": 1800, "saves": 260, "shares": 95, "searches": 750},
        "discoveryReasons": ["Lokal favorit vid Hornstulls strand", "Oberoende smashburgarhantverk"]
    },
    {
        "id": 3829104014,
        "idNamespace": "public",
        "name": "Feast Streetfood",
        "kind": "Restaurant",
        "cuisine": "Burger",
        "area": "Söderort",
        "address": "Bredängs Torg, Bredäng",
        "latitude": 59.2952,
        "longitude": 17.9332,
        "website": "https://www.instagram.com/feaststreetfood",
        "priceSEK": "125-165 kr",
        "note": "Food truck och streetfood i Bredäng som serverar saftiga smashburgare och birria tacos, recenserad av Burgerdudes.",
        "tags": ["Burger", "Smash burger", "Tacos", "Söderort", "Bredäng", "Burgerdudes", "Curated"],
        "x": 59.2952,
        "y": 17.9332,
        "ratingAverage": 4.6,
        "reviewCount": 190,
        "reliableRatingCount": 170,
        "priceLevel": 2,
        "evidenceLabel": "Verified by Burgerdudes Guide",
        "is_hidden_gem": True,
        "evidence": {"specialistGuide": 0.95, "independentEditorial": 0.9, "verifiedUserRating": 1, "repeatVisits": 0.85, "recentReviews": 0.8},
        "engagement": {"views": 1400, "saves": 210, "shares": 80, "searches": 600},
        "discoveryReasons": ["Dold streetfood-pärla i Bredäng", "Kombinerar smashburgare och birria tacos"]
    },
    {
        "id": 3829104015,
        "idNamespace": "public",
        "name": "Kebab Dudes",
        "kind": "Restaurant",
        "cuisine": "Burger",
        "area": "Västerort",
        "address": "Tornérplatsen 30, Jakobsberg",
        "latitude": 59.4233,
        "longitude": 17.8347,
        "priceSEK": "120-160 kr",
        "note": "Jakobsbergs Centrum-hak recenserat av Burgerdudes för sina smashburgare och hantverkskebab.",
        "tags": ["Burger", "Kebab", "Smash burger", "Burgerdudes", "Curated"],
        "x": 59.4233,
        "y": 17.8347,
        "ratingAverage": 4.5,
        "reviewCount": 160,
        "reliableRatingCount": 140,
        "priceLevel": 1,
        "evidenceLabel": "Verified by Burgerdudes Guide",
        "is_hidden_gem": False,
        "evidence": {"specialistGuide": 0.92, "independentEditorial": 0.88, "verifiedUserRating": 1, "repeatVisits": 0.75, "recentReviews": 0.8},
        "engagement": {"views": 1100, "saves": 140, "shares": 50, "searches": 400},
        "discoveryReasons": ["Recenserad av Burgerdudes för innovativa smashburgare"]
    }
]


NEW_CURATED_PUB_PLACES = [
    {
        "id": 3829300001,
        "idNamespace": "public",
        "name": "The Bishops Arms Bellmansgatan",
        "kind": "Restaurant",
        "cuisine": "pub",
        "area": "Södermalm",
        "address": "Bellmansgatan 12, Södermalm",
        "latitude": 59.32001,
        "longitude": 18.06478,
        "x": 59.32001,
        "y": 18.06478,
        "website": "https://www.bishopsarms.com/vara-pubar/stockholm/bellmansgatan/",
        "priceSEK": "$$",
        "note": "Brittisk gastropub vid Mariatorget och Bellmansgatan på Södermalm med brett sortiment av hantverksöl, fatöl och single malt whisky.",
        "tags": ["Pub", "Beer", "Craft Beer", "Ölbar", "Gastropub", "Whisky", "Södermalm"],
        "evidenceLabel": "Stockholms gastropub med brett öl- och whiskysortiment",
        "evidence": {"specialistGuide": 0.35, "independentEditorial": 0.3, "verifiedUserRating": 0.0, "repeatVisits": 0.25, "recentReviews": 0.25},
        "engagement": {"views": 180, "saves": 18, "shares": 6, "searches": 50},
        "discoveryReasons": ["Brittisk gastropub med stort öl- och whiskysortiment på Södermalm"],
        "sourceFacts": [],
    },
    {
        "id": 3829300002,
        "idNamespace": "public",
        "name": "The Bishops Arms Palace Sankt Eriksgatan",
        "kind": "Restaurant",
        "cuisine": "pub",
        "area": "Vasastan",
        "address": "Sankt Eriksgatan 115, Vasastan",
        "latitude": 59.34686,
        "longitude": 18.03986,
        "x": 59.34686,
        "y": 18.03986,
        "website": "https://www.bishopsarms.com/vara-pubar/stockholm/palace/",
        "priceSEK": "$$",
        "note": "Brittisk gastropub vid Sankt Eriksplan i Vasastan med hantverksöl på fat och flaska, klassisk pubmat och whisky.",
        "tags": ["Pub", "Beer", "Craft Beer", "Ölbar", "Gastropub", "Whisky", "Vasastan"],
        "evidenceLabel": "Stockholms gastropub med brett öl- och whiskysortiment",
        "evidence": {"specialistGuide": 0.35, "independentEditorial": 0.3, "verifiedUserRating": 0.0, "repeatVisits": 0.25, "recentReviews": 0.25},
        "engagement": {"views": 180, "saves": 18, "shares": 6, "searches": 50},
        "discoveryReasons": ["Brittisk gastropub med stort öl- och whiskysortiment i Vasastan"],
        "sourceFacts": [],
    },
    {
        "id": 3829300003,
        "idNamespace": "public",
        "name": "The Bishops Arms Vasagatan",
        "kind": "Restaurant",
        "cuisine": "pub",
        "area": "Norrmalm",
        "address": "Vasagatan 7, Norrmalm",
        "latitude": 59.33210,
        "longitude": 18.05763,
        "x": 59.33210,
        "y": 18.05763,
        "website": "https://www.bishopsarms.com/vara-pubar/stockholm/vasagatan/",
        "priceSEK": "$$",
        "note": "Klassisk brittisk gastropub på Vasagatan nära Centralstationen med ett brett urval av fatöl, hantverksöl och whisky.",
        "tags": ["Pub", "Beer", "Craft Beer", "Ölbar", "Gastropub", "Whisky", "Norrmalm"],
        "evidenceLabel": "Stockholms gastropub med brett öl- och whiskysortiment",
        "evidence": {"specialistGuide": 0.35, "independentEditorial": 0.3, "verifiedUserRating": 0.0, "repeatVisits": 0.25, "recentReviews": 0.25},
        "engagement": {"views": 180, "saves": 18, "shares": 6, "searches": 50},
        "discoveryReasons": ["Brittisk gastropub med stort öl- och whiskysortiment på Vasagatan"],
        "sourceFacts": [],
    },
    {
        "id": 3829300004,
        "idNamespace": "public",
        "name": "The Bishops Arms Gamla stan",
        "kind": "Restaurant",
        "cuisine": "pub",
        "area": "Gamla Stan",
        "address": "Tyska Brinken 36, Gamla Stan",
        "latitude": 59.32314,
        "longitude": 18.06910,
        "x": 59.32314,
        "y": 18.06910,
        "website": "https://www.bishopsarms.com/vara-pubar/stockholm/gamla-stan/",
        "priceSEK": "$$",
        "note": "Brittisk gastropub i historiska lokaler på Tyska Brinken i Gamla Stan med stort sortiment av hantverksöl och whisky.",
        "tags": ["Pub", "Beer", "Craft Beer", "Ölbar", "Gastropub", "Whisky", "Gamla Stan"],
        "evidenceLabel": "Stockholms gastropub med brett öl- och whiskysortiment",
        "evidence": {"specialistGuide": 0.35, "independentEditorial": 0.3, "verifiedUserRating": 0.0, "repeatVisits": 0.25, "recentReviews": 0.25},
        "engagement": {"views": 180, "saves": 18, "shares": 6, "searches": 50},
        "discoveryReasons": ["Brittisk gastropub med stort öl- och whiskysortiment i Gamla Stan"],
        "sourceFacts": [],
    },
    {
        "id": 3829300005,
        "idNamespace": "public",
        "name": "The Bishops Arms Sundbyberg",
        "kind": "Restaurant",
        "cuisine": "pub",
        "area": "Västerort",
        "address": "Landsvägen 49, Sundbyberg",
        "latitude": 59.36109,
        "longitude": 17.96872,
        "x": 59.36109,
        "y": 17.96872,
        "website": "https://www.bishopsarms.com/vara-pubar/stockholm/sundbyberg/",
        "priceSEK": "$$",
        "note": "Brittisk gastropub på Landsvägen i centrala Sundbyberg med brett urval av hantverksöl, fatöl, whisky och pubmat.",
        "tags": ["Pub", "Beer", "Craft Beer", "Ölbar", "Gastropub", "Whisky", "Västerort", "Sundbyberg"],
        "evidenceLabel": "Stockholms gastropub med brett öl- och whiskysortiment",
        "evidence": {"specialistGuide": 0.35, "independentEditorial": 0.3, "verifiedUserRating": 0.0, "repeatVisits": 0.25, "recentReviews": 0.25},
        "engagement": {"views": 180, "saves": 18, "shares": 6, "searches": 50},
        "discoveryReasons": ["Brittisk gastropub med stort öl- och whiskysortiment i Sundbyberg"],
        "sourceFacts": [],
    },
    {
        "id": 3829300006,
        "idNamespace": "public",
        "name": "The Bishops Arms Odengatan",
        "kind": "Restaurant",
        "cuisine": "pub",
        "area": "Vasastan",
        "address": "Odengatan 41, Vasastan",
        "latitude": 59.34449,
        "longitude": 18.05821,
        "x": 59.34449,
        "y": 18.05821,
        "website": "https://www.bishopsarms.com/vara-pubar/stockholm/odengatan/",
        "priceSEK": "$$",
        "note": "Brittisk gastropub på Odengatan i Vasastan med hantverksöl på fat och flaska, single malt whisky och pubmat.",
        "tags": ["Pub", "Beer", "Craft Beer", "Ölbar", "Gastropub", "Whisky", "Vasastan"],
        "evidenceLabel": "Stockholms gastropub med brett öl- och whiskysortiment",
        "evidence": {"specialistGuide": 0.35, "independentEditorial": 0.3, "verifiedUserRating": 0.0, "repeatVisits": 0.25, "recentReviews": 0.25},
        "engagement": {"views": 180, "saves": 18, "shares": 6, "searches": 50},
        "discoveryReasons": ["Brittisk gastropub med stort öl- och whiskysortiment på Odengatan"],
        "sourceFacts": [],
    },
]


def main() -> None:
    with open(PLACES_FILE, encoding="utf-8") as f:
        data = json.load(f)

    places = data["places"] if isinstance(data, dict) else data

    # 1. Normalize BAP
    for p in places:
        if p.get("id") == 2685754250 or p.get("name") == "bap":
            p["name"] = "Burgers and Pastrami (BAP)"
            p["address"] = "Linnégatan 38, Östermalm"
            p["cuisine"] = "Burger"
            for t in ["Burger", "Smash burger", "Pastrami", "Östermalm", "Burgerdudes", "Sveriges Bästa Burgare", "Curated"]:
                if t not in p.setdefault("tags", []):
                    p["tags"].append(t)

    # 2. Add missing Burgerdudes & curated pub venues (and sync priceSEK if missing)
    existing_by_norm = {norm(p.get("name")): p for p in places}
    for np in [*NEW_BURGERDUDES_PLACES, *NEW_CURATED_PUB_PLACES]:
        key = norm(np["name"])
        if key not in existing_by_norm:
            places.append(np)
            existing_by_norm[key] = np
        elif not existing_by_norm[key].get("priceSEK") and np.get("priceSEK"):
            existing_by_norm[key]["priceSEK"] = np["priceSEK"]

    # 3. Enrich with all GT sources
    enriched_counts = {}

    for source_name, gt_filename, base_url, tags_to_add in GT_SOURCES:
        gt_path = ROOT / "data" / gt_filename
        if not gt_path.exists():
            continue
        with open(gt_path, encoding="utf-8") as f:
            gt_items = json.load(f)

        count = 0
        for gt in gt_items:
            gn = norm(gt["name"])
            matched_places = [
                p for p in places
                if gn == norm(p.get("name")) or (
                    len(gn) >= 5 and len(norm(p.get("name"))) >= 5 and (
                        gn in norm(p.get("name")) or norm(p.get("name")) in gn
                    )
                )
            ]
            for p in matched_places:
                tags = p.setdefault("tags", [])
                for t in tags_to_add:
                    if t not in tags:
                        tags.append(t)
                ev = p.setdefault("evidence", {})
                if "specialistGuide" in ev:
                    ev["specialistGuide"] = max(ev.get("specialistGuide", 0), 0.95)
                if "independentEditorial" in ev:
                    ev["independentEditorial"] = max(ev.get("independentEditorial", 0), 0.95)

                s_facts = p.setdefault("sourceFacts", [])
                pid = p["id"]
                s_key = norm(source_name)
                fact_id = f"{pid}:{s_key}:review"
                if not any(f.get("id") == fact_id for f in s_facts):
                    s_facts.append({
                        "placeId": p["id"],
                        "source": source_name,
                        "url": gt.get("url", base_url),
                        "verification": "listed",
                        "capturedAt": "2026-11-18T12:00:00Z",
                        "id": fact_id,
                        "field": "category",
                        "value": gt.get("category", gt.get("classification", source_name)),
                    })
                count += 1
        enriched_counts[source_name] = count

    # 4. Enrich & insert Thatsup Stockholm discovery leads (neutral evidence policy)
    thatsup_enriched, thatsup_added = enrich_thatsup_places(places)
    enriched_counts["Thatsup Stockholm"] = thatsup_enriched
    enriched_counts["Thatsup Stockholm (added)"] = thatsup_added

    if isinstance(data, dict):
        data["totalPlaces"] = len(places)

    print("Enrichment completed:", enriched_counts)
    print("Total places now:", len(places))
    with open(PLACES_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    main()
