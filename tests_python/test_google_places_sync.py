import copy
import json

from scripts import enrich_missing_addresses_and_photos as legacy_enrich
from scripts import google_places_monthly_sync as sync


def test_google_payload_extracts_only_allowed_metadata(monkeypatch):
    monkeypatch.setattr(
        sync,
        "scrape_website_og_image",
        lambda url: {
            "url": f"{url}/hero.jpg",
            "thumbnailUrl": f"{url}/hero.jpg",
            "caption": "Official website image",
            "credit": "example.com / official website",
        },
    )

    raw = {
        "place_id": "google-1",
        "name": "New Bistro",
        "formatted_address": "Testgatan 1, Stockholm",
        "geometry": {"location": {"lat": 59.3, "lng": 18.0}},
        "rating": 4.9,
        "user_ratings_total": 1200,
        "price_level": 4,
    }
    details = {
        "website": "https://example.com",
        "rating": 5,
        "reviews": [{"text": "must not be copied"}],
    }

    metadata = sync.metadata_from_google_payload(raw, details)
    candidate = sync.build_candidate_record(metadata)

    assert metadata.google_place_id == "google-1"
    assert metadata.name == "New Bistro"
    assert metadata.address == "Testgatan 1, Stockholm"
    assert metadata.website == "https://example.com"
    assert sync.forbidden_value_fields(candidate) == set()
    assert "rating" not in candidate
    assert "reviews" not in candidate
    assert "price_level" not in candidate


def test_existing_place_enrichment_preserves_value_fields():
    place = {
        "id": 42,
        "name": "Existing Cafe",
        "note": "Cafe from OpenStreetMap.",
        "ratingAverage": 4.1,
        "reliableRatingCount": 0,
        "reviewCount": 0,
        "categoryPopularityRaw": 0.2,
        "localPopularityPercentile": 0.5,
        "mainstreamExposure": 12,
        "evidence": {"confidence": "Low", "verifiedUserRating": 0},
        "engagement": {"searchImpressions": 0, "saves": 0},
    }
    original_value_fields = {
        key: copy.deepcopy(place[key])
        for key in [
            "ratingAverage",
            "reliableRatingCount",
            "reviewCount",
            "categoryPopularityRaw",
            "localPopularityPercentile",
            "mainstreamExposure",
            "evidence",
            "engagement",
        ]
    }
    metadata = sync.PlaceMetadata(
        google_place_id="google-2",
        name="Existing Cafe",
        address="Cafegatan 2, Stockholm",
        website="https://existing.example",
        official_photo={
            "url": "https://existing.example/photo.jpg",
            "thumbnailUrl": "https://existing.example/photo.jpg",
            "caption": "Official website image",
            "credit": "existing.example / official website",
        },
    )
    photos_by_place = {}

    changes = sync.apply_metadata_to_existing_place(place, metadata, photos_by_place)

    assert changes == ["address", "website", "official_photo"]
    assert place["address"] == "Cafegatan 2, Stockholm"
    assert place["website"] == "https://existing.example"
    assert photos_by_place["42"][0]["url"] == "https://existing.example/photo.jpg"
    for key, value in original_value_fields.items():
        assert place[key] == value


def test_sync_writes_new_google_places_to_candidate_queue_only(tmp_path, monkeypatch):
    places_path = tmp_path / "places.json"
    photos_path = tmp_path / "place_photos.json"
    candidates_path = tmp_path / "google_places_candidates.json"
    places_payload = {
        "source": "osm",
        "places": [
            {
                "id": 1,
                "name": "Existing Cafe",
                "note": "Cafe from OpenStreetMap.",
                "latitude": 59.3,
                "longitude": 18.0,
                "ratingAverage": 4.1,
                "reviewCount": 0,
                "evidence": {"confidence": "Low"},
                "engagement": {"searchImpressions": 0},
            }
        ],
    }
    places_path.write_text(json.dumps(places_payload), encoding="utf-8")
    photos_path.write_text(json.dumps({"photosByPlace": {}}), encoding="utf-8")

    monkeypatch.setattr(
        sync,
        "fetch_google_places",
        lambda api_key, queries: [
            {
                "place_id": "new-google-place",
                "name": "New Review Queue Bistro",
                "formatted_address": "Nygatan 3, Stockholm",
                "geometry": {"location": {"lat": 59.31, "lng": 18.01}},
                "rating": 5,
                "user_ratings_total": 999,
            }
        ],
    )
    monkeypatch.setattr(
        sync,
        "fetch_place_details",
        lambda api_key, place_id: {"website": "https://new.example", "price_level": 4},
    )
    monkeypatch.setattr(sync, "scrape_website_og_image", lambda url: None)

    stats = sync.sync_metadata(
        api_key="test-key",
        places_path=places_path,
        photos_path=photos_path,
        candidates_path=candidates_path,
    )

    updated_places = json.loads(places_path.read_text(encoding="utf-8"))["places"]
    candidates = json.loads(candidates_path.read_text(encoding="utf-8"))["candidates"]

    assert stats["new_candidates"] == 1
    assert len(updated_places) == 1
    assert updated_places[0]["name"] == "Existing Cafe"
    assert candidates[0]["name"] == "New Review Queue Bistro"
    assert sync.forbidden_value_fields(candidates[0]) == set()


def test_legacy_enrichment_request_is_metadata_only(monkeypatch):
    captured_field_masks = []

    class FakeResponse:
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def read(self):
            return json.dumps(
                {
                    "places": [
                        {
                            "displayName": {"text": "Existing Cafe"},
                            "formattedAddress": "Cafegatan 2, Stockholm",
                            "websiteUri": "https://existing.example",
                            "rating": 5,
                            "userRatingCount": 999,
                        }
                    ]
                }
            ).encode("utf-8")

    def fake_urlopen(request, timeout=8):
        captured_field_masks.append(request.get_header("X-goog-fieldmask") or request.get_header("X-Goog-FieldMask"))
        return FakeResponse()

    monkeypatch.setattr(legacy_enrich.urllib.request, "urlopen", fake_urlopen)

    details = legacy_enrich.fetch_google_place_details("Existing Cafe", "Vasastan", "test-key")

    assert captured_field_masks == [legacy_enrich.GOOGLE_FIELD_MASK]
    assert "rating" not in legacy_enrich.GOOGLE_FIELD_MASK
    assert "userRatingCount" not in legacy_enrich.GOOGLE_FIELD_MASK
    assert details == {
        "address": "Cafegatan 2, Stockholm",
        "website": "https://existing.example",
    }
