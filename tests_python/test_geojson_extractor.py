import geopandas as gpd
from shapely.geometry import Point
from scripts.geojson_extractor import encode_geohash, detect_hidden_gems, synthesize_rag_docs


def test_encode_geohash():
    # Stockholm central geohash prefix test
    gh = encode_geohash(59.3326, 18.0649, precision=7)
    assert len(gh) == 7
    assert gh.startswith("u6s")


def test_detect_hidden_gems_gdf():
    data = [
        {"name": "Spot 1", "score": 9.0, "geometry": Point(18.06, 59.33)},
        {"name": "Spot 2", "score": 8.0, "geometry": Point(18.061, 59.331)},
        {"name": "Spot 3", "score": 7.0, "geometry": Point(18.062, 59.332)},
        {"name": "Spot 4", "score": 6.0, "geometry": Point(18.063, 59.333)},
        {"name": "Spot 5", "score": 5.0, "geometry": Point(18.150, 59.400)},  # Isolated
    ]
    gdf = gpd.GeoDataFrame(data)
    result = detect_hidden_gems(gdf)

    assert "gem_index" in result.columns
    assert "spatial_density" in result.columns
    assert len(result) == 5
