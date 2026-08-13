from motkarta.normalize import OsmFoodPlace, normalize_osm_establishment_type, osm_description, osm_tags


def test_osm_category_normalization_keeps_plain_cafe_as_cafe():
    assert normalize_osm_establishment_type("cafe", "coffee_shop") == "Café"
    assert normalize_osm_establishment_type("coffee_roaster") == "Specialty coffee"
    assert normalize_osm_establishment_type("bakery") == "Bakery"
    assert normalize_osm_establishment_type("restaurant") == "Restaurant"
    assert normalize_osm_establishment_type("bar") == "Restaurant"
    assert normalize_osm_establishment_type("pub") == "Restaurant"


def test_osm_tags_and_description():
    place = OsmFoodPlace(
        osm_type="node",
        osm_id="1",
        name="Test",
        category="coffee_roaster",
        cuisine="coffee;bakery",
        opening_hours="Mo-Fr",
        street="Testgatan",
        house_number="1",
        website="https://example.com",
    )

    assert osm_tags(place) == ["Coffee Roaster", "Coffee", "Bakery", "Website", "Opening hours"]
    assert "Testgatan 1" in osm_description(place, "Specialty coffee")
