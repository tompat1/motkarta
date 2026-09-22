from datetime import date

from motkarta.municipal_signals import (
    is_food_venue_business_type,
    is_likely_new_venue_signal,
    summarize_municipal_new_venue_signals,
)


def test_is_food_venue_business_type_filters_retail_out():
    assert is_food_venue_business_type("Restaurang-, catering- och barverksamhet")
    assert not is_food_venue_business_type("Detaljhandel")
    assert not is_food_venue_business_type("Partihandel")


def test_is_likely_new_venue_signal_uses_recent_inspections():
    row = {
        "latest_inspection_date": "2026-08-01",
        "inspection_count": "1",
        "latest_remark": "Utan avvikelse",
    }
    assert is_likely_new_venue_signal(row, reference=date(2026, 9, 1))


def test_summarize_municipal_new_venue_signals_prioritizes_unmatched_restaurants():
    summary = summarize_municipal_new_venue_signals(
        [
            {
                "source_id": "fc-1",
                "name": "Luca Pizza Restaurant",
                "address": "Surbrunnsgatan 1",
                "business_type": "Restaurang-, catering- och barverksamhet",
                "latest_inspection_date": "2026-07-01",
                "inspection_count": "1",
                "latitude": 59.34,
                "longitude": 18.05,
            },
            {
                "source_id": "fc-2",
                "name": "1:an Godis",
                "address": "Svandammsvägen 1",
                "business_type": "Detaljhandel",
                "latest_inspection_date": "2026-07-01",
                "inspection_count": "1",
            },
        ],
        matched_source_ids=set(),
        serving_permit_rows=[
            {
                "permit_id": "permit-1",
                "name": "Aperitivo",
                "address": "Odengatan 20",
                "permit_type": "Stadigvarande serveringstillstånd",
                "valid_from": "2026-06-01",
            }
        ],
        matched_permit_ids=set(),
    )

    assert summary["unmatchedFoodControlVenues"] == 1
    assert summary["unmatchedServingPermits"] == 1
    assert summary["likelyNewVenueSignals"] >= 2
    assert any(item["name"] == "Luca Pizza Restaurant" for item in summary["sample"])
    assert any(item["name"] == "Aperitivo" for item in summary["sample"])
