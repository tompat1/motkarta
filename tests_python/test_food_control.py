from motkarta.food_control import food_control_records, normalize_food_control_features


def test_food_control_features_are_aggregated_by_facility():
    payload = {
        "features": [
            {
                "attributes": {
                    "ObjektId": "facility-1",
                    "AnlaggningsNamn": "Nyko Kitchen",
                    "Adress": "Nybrogatan 61",
                    "Riskklass": 5,
                    "TillsynsDatum": "2020-07-03",
                    "Anmarkning": "Utan avvikelse",
                },
                "geometry": {"x": 18.08037, "y": 59.3388},
            },
            {
                "attributes": {
                    "ObjektId": "facility-1",
                    "AnlaggningsNamn": "Nyko Kitchen",
                    "Adress": "Nybrogatan 61",
                    "Riskklass": 5,
                    "TillsynsDatum": "2021-08-01",
                    "Anmarkning": "Med avvikelse",
                },
                "geometry": {"x": 18.08037, "y": 59.3388},
            },
        ]
    }

    frame = normalize_food_control_features(payload)

    assert len(frame) == 1
    assert frame.loc[0, "name"] == "Nyko Kitchen"
    assert frame.loc[0, "latest_inspection_date"] == "2021-08-01"
    assert frame.loc[0, "inspection_count"] == 2


def test_food_control_records_include_source_summary():
    frame = normalize_food_control_features(
        {
            "features": [
                {
                    "attributes": {
                        "ObjektId": "facility-1",
                        "AnlaggningsNamn": "Nyko Kitchen",
                        "Adress": "Nybrogatan 61",
                        "TillsynsDatum": "2021-08-01",
                        "Anmarkning": "Utan avvikelse",
                    },
                    "geometry": {"x": 18.08037, "y": 59.3388},
                }
            ]
        }
    )

    [record] = food_control_records(frame)

    assert record.source_id == "facility-1"
    assert record.source_name == "Stockholms stad livsmedelskontroll"
    assert "latest inspection 2021-08-01" in record.summary
