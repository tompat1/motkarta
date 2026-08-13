import pandas as pd

from motkarta.source_matching import SourceRecord, match_source_records


def test_match_source_records_matches_by_same_address_and_similar_name():
    places = pd.DataFrame(
        [
            {
                "osm_type": "node",
                "osm_id": "10",
                "name": "Nyko Kitchen",
                "address": "Nybrogatan 61",
                "latitude": 59.3388,
                "longitude": 18.08037,
            }
        ]
    )
    records = [
        SourceRecord(
            source_id="facility-1",
            name="Nyko Kitchen AB",
            address="Nybrogatan 61",
            latitude=59.3388,
            longitude=18.08037,
            source_name="Food control",
        )
    ]

    [match] = match_source_records(places, records)

    assert match.osm_id == "10"
    assert match.match_reason == "same address and similar name"


def test_match_source_records_rejects_distant_name_match():
    places = pd.DataFrame(
        [
            {
                "osm_type": "node",
                "osm_id": "10",
                "name": "Nyko Kitchen",
                "address": "Nybrogatan 61",
                "latitude": 59.3388,
                "longitude": 18.08037,
            }
        ]
    )
    records = [
        SourceRecord(
            source_id="facility-1",
            name="Nyko Kitchen",
            address="Other Street 1",
            latitude=59.0,
            longitude=18.5,
            source_name="Food control",
        )
    ]

    assert match_source_records(places, records) == []
