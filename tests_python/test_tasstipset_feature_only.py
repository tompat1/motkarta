import copy
import json

import pytest

from scripts.fetch_tasstipset_dog_places import enrich_tasstipset_places, parse_tasstipset_place_page, is_food_establishment
from scripts.sync_curated_sources import sync_curated_sources
from motkarta.dog_friendly import tasstipset_coverage


def venue(kind="Restaurant"):
    return {"id": 123, "name": "Test Place", "kind": kind, "area": "Södermalm",
            "latitude": 59.32, "longitude": 18.06, "tags": ["Independent"],
            "sourceName": "OpenStreetMap", "note": "Original note", "website": "https://example.com",
            "evidenceLabel": "OSM", "evidence": {"specialistGuide": 0, "confidence": "Low"},
            "lifecycleState": "baseline", "scores": {"quality": 0}}


def dog_record(**changes):
    return {"name": "Test Place", "kind": "Restaurant", "category": "Restaurant", "area": "Södermalm",
            "latitude": 59.32, "longitude": 18.06, "sourceName": "Tasstipset",
            "url": "https://tasstipset.se/plats/test", "dog_policy_quote": "Dogs allowed outside only",
            "tags": ["Endast uteservering", "Specialty coffee", "Hidden gem"],
            "evidence": {"specialistGuide": 99}, "note": "Replacement note", "website": "https://wrong.example",
            "lifecycleState": "verified", **changes}


@pytest.mark.parametrize("kind", ["Restaurant", "Bakery", "Café", "Cafe", "Coffee shop", "Coffeeshop", "Specialty coffee"])
def test_enrichment_changes_only_dog_feature_and_its_provenance(kind):
    place = venue(kind)
    original = copy.deepcopy(place)
    result = enrich_tasstipset_places([place], [dog_record()])
    assert result["matched"] == 1
    assert result["added"] == 0
    assert {k: v for k, v in place.items() if k not in {"tags", "sourceFacts"}} == {
        k: v for k, v in original.items() if k != "tags"}
    assert set(place["tags"]) == {"Independent", "Dog friendly", "Hundvänligt", "Tasstipset", "Endast uteservering"}
    assert place["sourceFacts"][0]["field"] == "dogFriendly"
    assert place["sourceFacts"][0]["value"] == "Dogs allowed outside only"
    first_run = copy.deepcopy(place)
    enrich_tasstipset_places([place], [dog_record()])
    assert place == first_run


@pytest.mark.parametrize("kind", ["Hotel", "Hostel", "Park", "Store", "Bar", "Pub", "Unknown", ""])
def test_other_target_types_cannot_receive_tasstipset_features(kind):
    place = venue(kind)
    original = copy.deepcopy(place)
    enrich_tasstipset_places([place], [dog_record()])
    assert place == original


@pytest.mark.parametrize("category", ["Hotel", "Hostel", "Park", "Store", "Bar", "Pub", "LocalBusiness", "Unknown"])
def test_other_source_categories_cannot_enrich_a_restaurant(category):
    place = venue()
    original = copy.deepcopy(place)
    enrich_tasstipset_places([place], [dog_record(category=category)])
    assert place == original


def test_unmatched_distant_and_ambiguous_records_do_not_create_or_modify_places():
    places = []
    assert enrich_tasstipset_places(places, [dog_record()])["added"] == 0
    assert places == []
    places = [venue()]
    original = copy.deepcopy(places)
    enrich_tasstipset_places(places, [dog_record(latitude=59.34)])
    assert places == original
    places.append({**venue(), "id": 124})
    original = copy.deepcopy(places)
    enrich_tasstipset_places(places, [dog_record()])
    assert places == original


def test_curated_import_obeys_the_same_feature_only_contract(tmp_path):
    places = tmp_path / "places.json"
    curated = tmp_path / "curated.json"
    original = venue()
    places.write_text(json.dumps({"places": [original]}))
    curated.write_text(json.dumps({"places": [dog_record(), dog_record(name="Unmatched Restaurant")]}))
    result = sync_curated_sources(places, curated, quiet=True)
    actual = json.loads(places.read_text())["places"]
    assert result["added"] == 0
    assert len(actual) == 1
    assert actual[0]["evidence"] == original["evidence"]
    assert actual[0]["website"] == original["website"]
    assert actual[0]["kind"] == original["kind"]
    assert "Dog friendly" in actual[0]["tags"]


def test_coverage_requires_existing_venues_and_rejects_source_or_type_leaks():
    places = [venue()]
    references = [{"name": "Test Place"}, {"name": "Unmatched Place"}]
    coverage = tasstipset_coverage(places, references)
    assert coverage["eligible_existing_references"] == 1
    assert coverage["unmatched_reference_venues"] == 1
    assert coverage["eligible_coverage_pct"] == 0
    enrich_tasstipset_places(places, [dog_record()])
    assert tasstipset_coverage(places, references)["eligible_coverage_pct"] == 100
    places.append({**venue("Hotel"), "id": 456, "sourceName": "Tasstipset", "tags": ["Tasstipset"]})
    coverage = tasstipset_coverage(places, references)
    assert coverage["source_only_venues"] == 1
    assert coverage["ineligible_dog_venues"] == 1


def test_missing_source_category_never_defaults_to_restaurant():
    record = parse_tasstipset_place_page("<html><h1>Unknown venue</h1></html>", "https://tasstipset.se/plats/unknown")
    assert record.category == "Unknown"
    assert not is_food_establishment(record)
