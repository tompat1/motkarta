from __future__ import annotations

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
    for establishment_type, group in data.groupby("establishment_type"):
        feature_group = folium.FeatureGroup(name=establishment_type, show=True)
        color = TYPE_COLORS.get(establishment_type, "gray")
        for _, row in group.iterrows():
            popup = folium.Popup(
                f"""
                <strong>{row['name']}</strong><br>
                {row['establishment_type']} · {row['neighbourhood']}<br>
                Cuisine: {row['cuisine'] or 'Missing'}<br>
                Address: {row['address'] or 'Missing'}<br>
                Opening hours: {row['opening_hours'] or 'Missing'}<br>
                Discovery score: {row['discovery_score']}
                """,
                max_width=320,
            )
            folium.CircleMarker(
                location=[row["latitude"], row["longitude"]],
                radius=6,
                color=color,
                fill=True,
                fill_opacity=0.75,
                popup=popup,
                tooltip=row["name"],
            ).add_to(feature_group)
        feature_group.add_to(fmap)

    missing_group = folium.FeatureGroup(name="Missing information filters", show=False)
    for flag, label in [
        ("missing_address", "Missing address"),
        ("missing_opening_hours", "Missing opening hours"),
        ("missing_website", "Missing website"),
    ]:
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
