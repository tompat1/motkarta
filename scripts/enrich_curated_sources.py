#!/usr/bin/env python3
"""Enrich public/data/places.json with verified tags, source facts, and evidence from all curated sources."""

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PLACES_FILE = ROOT / "public" / "data" / "places.json"


def norm(s: str) -> str:
    return re.sub(r"[^a-z0-9åäö]+", "", str(s or "").lower())


GT_SOURCES = [
    ("Guide Michelin", "michelin_ground_truth.json", "https://guide.michelin.com", ["Michelin", "Guide Michelin", "Curated"]),
    ("Dagens Nyheter", "dn_krog_ground_truth.json", "https://www.dn.se", ["DN", "Dagens Nyheter", "DN Krogkommissionen", "Curated"]),
    ("Svenska Dagbladet", "svd_krog_ground_truth.json", "https://www.svd.se", ["SvD", "Svenska Dagbladet", "SvD Krogguiden", "Curated"]),
    ("Allt om Mat", "allt_om_mat_ground_truth.json", "https://alltommat.expressen.se", ["Allt om Mat", "Curated"]),
    ("Vagabond", "vagabond_ground_truth.json", "https://www.vagabond.se", ["Vagabond", "Curated"]),
    ("Stora Restaurangpriset", "stora_restaurangpriset_ground_truth.json", "https://restaurangpriset.se", ["Stora Restaurangpriset", "Svenska Gastronomipriset", "Curated"]),
    ("Sveriges Bästa", "sveriges_basta_ground_truth.json", "https://sverigesbasta.com", ["Sveriges Bästa", "Curated"]),
    ("Spotted by Locals", "spotted_by_locals_ground_truth.json", "https://www.spottedbylocals.com", ["Spotted by Locals", "Curated"]),
]


def main() -> None:
    with open(PLACES_FILE, encoding="utf-8") as f:
        data = json.load(f)

    places = data["places"] if isinstance(data, dict) else data
    enriched_counts = {}

    for source_name, gt_filename, base_url, tags_to_add in GT_SOURCES:
        gt_path = ROOT / "data" / gt_filename
        with open(gt_path, encoding="utf-8") as f:
            gt_items = json.load(f)

        count = 0
        for gt in gt_items:
            gn = norm(gt["name"])
            matched_places = [
                p for p in places
                if gn == norm(p.get("name")) or (len(gn) >= 5 and (gn in norm(p.get("name")) or norm(p.get("name")) in gn))
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
                        "capturedAt": "2026-11-17T12:00:00Z",
                        "id": fact_id,
                        "field": "category",
                        "value": gt.get("category", source_name),
                    })
                count += 1
        enriched_counts[source_name] = count

    print("Enrichment completed:", enriched_counts)
    with open(PLACES_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    main()
