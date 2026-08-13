from __future__ import annotations

from html import escape
from pathlib import Path

import folium
import pandas as pd


TYPE_COLORS = {
    "Restaurant": "red",
    "Bistro": "purple",
    "Bakery": "orange",
    "Café": "blue",
    "Specialty coffee": "green",
}


def build_folium_map(frame: pd.DataFrame, output_path: str | Path) -> None:
    data = frame.dropna(subset=["latitude", "longitude"]).copy()
    center = [59.3293, 18.0686]
    if not data.empty:
        center = [float(data["latitude"].mean()), float(data["longitude"].mean())]

    fmap = folium.Map(location=center, zoom_start=12, tiles="CartoDB positron")
    add_title(fmap, "Motkarta Stockholm Food Map")

    for establishment_type, group in data.groupby("establishment_type"):
        add_marker_group(
            fmap,
            group,
            name=f"Type · {establishment_type}",
            color=TYPE_COLORS.get(establishment_type, "gray"),
            show=True,
        )

    for neighbourhood, group in data.groupby("neighbourhood"):
        add_marker_group(
            fmap,
            group,
            name=f"Neighbourhood · {neighbourhood}",
            color="cadetblue",
            show=False,
        )

    for cuisine, group in top_cuisine_groups(data):
        add_marker_group(
            fmap,
            group,
            name=f"Cuisine · {cuisine}",
            color="darkgreen",
            show=False,
        )

    for flag, label in [
        ("missing_address", "Missing address"),
        ("missing_opening_hours", "Missing opening hours"),
        ("missing_website", "Missing website"),
    ]:
        missing_group = folium.FeatureGroup(name=f"Missing info · {label}", show=False)
        for _, row in data[data[flag]].iterrows():
            folium.CircleMarker(
                location=[row["latitude"], row["longitude"]],
                radius=9,
                color="black",
                fill=False,
                popup=f"{row['name']} · {label}",
                tooltip=label,
            ).add_to(missing_group)
        missing_group.add_to(fmap)

    folium.LayerControl(collapsed=False).add_to(fmap)
    target = Path(output_path)
    target.parent.mkdir(parents=True, exist_ok=True)
    fmap.save(str(target))


def add_marker_group(
    fmap: folium.Map,
    group: pd.DataFrame,
    name: str,
    color: str,
    show: bool,
) -> None:
    feature_group = folium.FeatureGroup(name=name, show=show)
    for _, row in group.iterrows():
        folium.CircleMarker(
            location=[row["latitude"], row["longitude"]],
            radius=6,
            color=color,
            fill=True,
            fill_opacity=0.75,
            popup=place_popup(row),
            tooltip=escape(str(row["name"])),
        ).add_to(feature_group)
    feature_group.add_to(fmap)


def place_popup(row: pd.Series) -> folium.Popup:
    return folium.Popup(
        f"""
        <strong>{escape(str(row['name']))}</strong><br>
        {escape(str(row['establishment_type']))} · {escape(str(row['neighbourhood']))}<br>
        Cuisine: {escape(str(row['cuisine'] or 'Missing'))}<br>
        Address: {escape(str(row['address'] or 'Missing'))}<br>
        Opening hours: {escape(str(row['opening_hours'] or 'Missing'))}<br>
        Website: {escape(str(row['website'] or 'Missing'))}<br>
        Discovery score: {escape(str(row['discovery_score']))}
        """,
        max_width=340,
    )


def top_cuisine_groups(data: pd.DataFrame, limit: int = 12) -> list[tuple[str, pd.DataFrame]]:
    exploded = data.assign(primary_cuisine=data["cuisine"].map(primary_cuisine))
    cuisines = [value for value in exploded["primary_cuisine"].value_counts().head(limit).index if value]
    return [(cuisine, exploded[exploded["primary_cuisine"] == cuisine]) for cuisine in cuisines]


def primary_cuisine(value: object) -> str:
    parts = [part.strip() for part in str(value or "").split(";") if part.strip()]
    return parts[0].title() if parts else "Missing cuisine"


def add_title(fmap: folium.Map, title: str) -> None:
    html = f"""
    <div style="
      position: fixed;
      top: 12px;
      left: 50px;
      z-index: 9999;
      background: white;
      padding: 10px 12px;
      border: 1px solid #bbb;
      font: 14px/1.3 sans-serif;
      box-shadow: 0 1px 4px rgba(0,0,0,.2);
    ">
      <strong>{escape(title)}</strong><br>
      Toggle filters with the layer control.
    </div>
    """
    fmap.get_root().html.add_child(folium.Element(html))
