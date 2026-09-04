from __future__ import annotations

import re
import unicodedata
from typing import Any


STOCKHOLM_MUNICIPALITY_BBOX = (59.20, 17.75, 59.47, 18.25)

STOCKHOLM_LOCALITIES = {
    "akalla",
    "alvik",
    "aspudden",
    "bagarmossen",
    "bandhagen",
    "birkastan",
    "blackeberg",
    "bredang",
    "bromma",
    "bromsten",
    "djurgarden",
    "enskede",
    "enskedefaltet",
    "farsta",
    "fjaderholmarna",
    "fredhall",
    "gamla stan",
    "gubbangen",
    "gullmarsplan",
    "grimsta",
    "hagersten",
    "hagersten alvsjo",
    "hagsatra",
    "hammarby sjostad",
    "hasselby",
    "hasselby strand",
    "hjorthagen",
    "hokerangen",
    "hornstull",
    "husby",
    "johanneshov",
    "jarva",
    "kista",
    "kristineberg",
    "kungsholmen",
    "ladugardsgardet",
    "liljeholmen",
    "lilla essingen",
    "mariehäll",
    "mariehall",
    "marieberg",
    "midsommarkransen",
    "norrmalm",
    "norra djurgarden",
    "ragsved",
    "rinkeby",
    "skarpnack",
    "skarholmen",
    "skondal",
    "slussen",
    "sodermalm",
    "sodra hammarbyhamnen",
    "spanga",
    "stadshagen",
    "stockholm",
    "stora essingen",
    "svedmyra",
    "tensta",
    "vasastan",
    "vallingby",
    "vastberga",
    "vinsta",
    "arsta",
    "alvsjo",
    "ostermalm",
}

NON_STOCKHOLM_LOCALITIES = {
    "borgholm",
    "botkyrka",
    "barkarby",
    "danderyd",
    "ekero",
    "goteborg",
    "gothenburg",
    "haninge",
    "helenelund",
    "huddinge",
    "jarfalla",
    "jakobsberg",
    "kungens kurva",
    "lidingo",
    "lilla alby",
    "linkoping",
    "loviseberg",
    "malmo",
    "nacka",
    "nykvarn",
    "nynashamn",
    "salem",
    "sigtuna",
    "skytteholm",
    "skarsatra",
    "sollentuna",
    "solna",
    "sodertalje",
    "soderhojden",
    "sundbyberg",
    "taby",
    "tureberg",
    "tyreso",
    "umea",
    "upplands bro",
    "upplands vasby",
    "vallentuna",
    "varmdo",
    "vaxholm",
    "viksjo",
    "visinge",
    "vastra skogen",
    "osteraker",
}


def is_stockholm_municipality_place(
    latitude: Any = None,
    longitude: Any = None,
    *,
    area: Any = "",
    address: Any = "",
    source_url: Any = "",
    name: Any = "",
) -> bool:
    """Return true when place signals fit Stockholm municipality scope."""
    location_text = normalized_boundary_text(" ".join(str(part or "") for part in [area, address, source_url]))
    all_text = normalized_boundary_text(" ".join(str(part or "") for part in [area, address, source_url, name]))
    if any(contains_boundary_token(location_text, token) for token in NON_STOCKHOLM_LOCALITIES):
        return False
    if any(contains_boundary_token(all_text, token) for token in STOCKHOLM_LOCALITIES):
        return True
    return coordinates_in_stockholm_municipality_bbox(latitude, longitude)


def coordinates_in_stockholm_municipality_bbox(latitude: Any, longitude: Any) -> bool:
    try:
        lat = float(latitude)
        lon = float(longitude)
    except (TypeError, ValueError):
        return False
    if lat != lat or lon != lon:
        return False
    min_lat, min_lon, max_lat, max_lon = STOCKHOLM_MUNICIPALITY_BBOX
    return min_lat <= lat <= max_lat and min_lon <= lon <= max_lon


def normalized_boundary_text(value: Any) -> str:
    text = unicodedata.normalize("NFKD", str(value or "").lower())
    text = "".join(char for char in text if not unicodedata.combining(char))
    return re.sub(r"[^a-z0-9]+", " ", text).strip()


def contains_boundary_token(text: str, token: str) -> bool:
    normalized_token = normalized_boundary_text(token)
    if not normalized_token:
        return False
    pattern = rf"(?<![a-z0-9]){re.escape(normalized_token)}(?![a-z0-9])"
    return re.search(pattern, text) is not None
