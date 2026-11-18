import json
from pathlib import Path

import pandas as pd

from motkarta.catalog_exclusions import is_excluded_catalog_name
from motkarta.pipeline import filter_excluded_chains, known_chain_brand
from scripts.google_places_monthly_sync import is_excluded_chain
from scripts.sync_curated_sources import sync_curated_sources
from scripts.fetch_tasstipset_dog_places import sync_tasstipset_to_places
from scripts.fetch_tasstipset_dog_places import DogPlaceRecord, is_food_establishment, map_category_to_kind
from motkarta.rag import eligible_place


FIXTURE = json.loads(Path("tests/fixtures/catalog-exclusions.json").read_text())


def test_all_branch_spellings_are_excluded_without_matching_other_venues():
    for name in FIXTURE["excluded"]:
        assert is_excluded_catalog_name(name)
        assert known_chain_brand(name) == "O'Learys"
        assert is_excluded_chain(name)
    for name in FIXTURE["included"]:
        assert not is_excluded_catalog_name(name)
        assert not is_excluded_chain(name)
    frame = pd.DataFrame({"name": FIXTURE["excluded"] + FIXTURE["included"]})
    included, excluded = filter_excluded_chains(frame)
    assert included["name"].tolist() == FIXTURE["included"]
    assert excluded["name"].tolist() == FIXTURE["excluded"]


def test_curated_sync_cannot_reintroduce_excluded_branches(tmp_path):
    places = tmp_path / "places.json"
    curated = tmp_path / "curated.json"
    places.write_text(json.dumps({"places": []}))
    curated.write_text(json.dumps({"places": [{"name": name} for name in FIXTURE["excluded"] + FIXTURE["nonFood"]]}))
    sync_curated_sources(places, curated, quiet=True)
    assert json.loads(places.read_text())["places"] == []


def test_dog_friendly_sync_cannot_reintroduce_excluded_branches(tmp_path):
    places = tmp_path / "places.json"
    curated = tmp_path / "curated.json"
    places.write_text(json.dumps({"places": []}))
    curated.write_text(json.dumps({"places": []}))
    records = [{"name": name, "latitude": 59.33, "longitude": 18.06, "area": "Stockholm"}
               for name in FIXTURE["excluded"] + FIXTURE["nonFood"]]
    sync_tasstipset_to_places(records, places, curated, quiet=True)
    assert json.loads(places.read_text())["places"] == []


def test_hostels_are_excluded_without_mislabeling_them_as_olearys():
    for name in FIXTURE["nonFood"]:
        assert is_excluded_catalog_name(name)
        assert known_chain_brand(name) != "O'Learys"
        assert not eligible_place({"name": name, "area": "Stockholm"})
    included, _ = filter_excluded_chains(pd.DataFrame({"name": FIXTURE["nonFood"]}))
    assert included.empty


def test_tasstipset_rejects_lodging_but_keeps_explicit_food_categories():
    for category in ["Hotel", "Hotell", "Hostel", "Vandrarhem", "LodgingBusiness"]:
        record = DogPlaceRecord(source_id="test", name="Test lodging", url="", category=category,
                                kind=map_category_to_kind(category), area="Stockholm", address="",
                                latitude=59.33, longitude=18.06)
        assert not is_food_establishment(record)
    for category in ["Restaurant", "Café", "Bakery", "Hotellrestaurang"]:
        record = DogPlaceRecord(source_id="test", name="Hotel restaurant", url="", category=category,
                                kind=map_category_to_kind(category), area="Stockholm", address="",
                                latitude=59.33, longitude=18.06)
        assert is_food_establishment(record)


def test_seasonal_kiosks_and_institutional_facilities_are_excluded():
    excluded_names = [
        "Kiosk, Cafe, snabbmat",
        "Minigolf kiosk",
        "Kanaans Bangolf & Café",
        "Äldreboendet Trekanten",
        "Sköndals Skola",
        "Bromma Gymnasium Köket",
        "Dalahöjdens Äldreboende",
        "Academica Förskolan Vinterelvan",
    ]
    for name in excluded_names:
        assert is_excluded_catalog_name(name), f"Expected {name} to be excluded"

    included_names = [
        "Apotekskiosken",
        "Brokiosken",
        "Matteus Kiosk & Grill",
        "Flitiga Lisa",
        "Sköndals Konditori",
    ]
    for name in included_names:
        assert not is_excluded_catalog_name(name), f"Expected {name} to be included"


def test_commercial_chains_are_excluded():
    chains = [
        "Pizza Hut",
        "Subway",
        "McDonald's",
        "McDonalds",
        "MAX",
        "Max Burgers",
        "Burger King",
        "KFC",
        "Taco Bell",
        "Domino's Pizza",
        "Vapiano",
        "Pinchos",
        "Espresso House",
        "Starbucks",
        "Wayne's Coffee",
        "Joe & The Juice",
        "Nespresso",
        "Kahls",
        "Bönor och Blad",
    ]
    for chain in chains:
        assert is_excluded_catalog_name(chain), f"Expected {chain} to be excluded"

    assert not is_excluded_catalog_name("Café Två Bönor")
    assert not is_excluded_catalog_name("Sibyllans Kaffe & Tehandel")
    assert not is_excluded_catalog_name("Pizzeria Domino")
    assert not is_excluded_catalog_name("Bastard Burgers")


def test_bathing_places_and_swimming_spots_are_excluded():
    bathing_spots = [
        "Badplats",
        "Flatenbadet badplats",
        "Farsta strandbad",
        "Fredhälls klippbad",
        "Eriksdals friluftsbad",
        "Hellasgårdens sjöbad",
        "Motalaparkens plaskdamm",
        "Tessinparkens plaskdamm",
        "Strandbad",
        "Klippbadet",
    ]
    for spot in bathing_spots:
        assert is_excluded_catalog_name(spot), f"Expected {spot} to be excluded"

    legitimate_venues = [
        "Badcafét",
        "Ecobaren (Centralbadet)",
        "Sjöcafé Lövstabadet",
        "Restaurang Eriksdalsbadet",
        "Krogen vid Klippbadet",
    ]
    for venue in legitimate_venues:
        assert not is_excluded_catalog_name(venue), f"Expected {venue} to remain included"


def test_atms_and_bankomat_are_excluded():
    for poi in [
        "Bankomat",
        "Bankomaten",
        "Uttagsautomat",
        "Kontantautomat",
        "ATM",
        "Euronet ATM",
        "Växlingskontor",
    ]:
        assert is_excluded_catalog_name(poi), f"Expected {poi} to be excluded"



