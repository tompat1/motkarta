from motkarta.stockholm_boundary import (
    contains_boundary_token,
    is_stockholm_municipality_place,
    normalized_boundary_text,
)


def test_stockholm_boundary_accepts_city_districts_and_coordinates():
    assert is_stockholm_municipality_place(area="Södermalm")
    assert is_stockholm_municipality_place(area="Kista")
    assert is_stockholm_municipality_place(59.3175, 18.0598)


def test_stockholm_boundary_rejects_outside_city_tokens_even_with_default_stockholm_text():
    assert not is_stockholm_municipality_place(
        area="Stockholm",
        address="Stockholm, Stockholm",
        source_url="https://tasstipset.se/plats/ahlens-umea",
    )
    assert not is_stockholm_municipality_place(
        area="Stockholm",
        address="Haga Kyrkogata 14",
        source_url="https://tasstipset.se/plats/bord-27-goteborg",
    )
    assert not is_stockholm_municipality_place(59.36, 18.0, area="Solna")


def test_stockholm_boundary_does_not_reject_street_name_substrings():
    text = normalized_boundary_text("Danderydsgatan 27, Stockholm")
    assert not contains_boundary_token(text, "danderyd")
    assert is_stockholm_municipality_place(address="Danderydsgatan 27, Stockholm")
