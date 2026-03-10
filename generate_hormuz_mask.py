#!/usr/bin/env python3
"""Generate a Minesweeper mask from real Strait of Hormuz coastline data.

Source data:
https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_countries.geojson

The script samples land polygons for Iran, Oman, and the UAE over a fixed
geographic bounding box and emits ASCII rows where `#` is playable water.
"""

from __future__ import annotations

from dataclasses import dataclass

import requests

SOURCE_URL = (
    "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/"
    "geojson/ne_10m_admin_0_countries.geojson"
)
COUNTRY_CODES = {"IRN", "OMN", "ARE"}
BOARD_WIDTH = 52
BOARD_HEIGHT = 30
SUPERSAMPLE = 5
WATER_THRESHOLD = 0.5
BBOX = (55.1, 24.0, 58.8, 27.15)


@dataclass(frozen=True)
class PolygonRecord:
    rings: list[list[list[float]]]
    bbox: tuple[float, float, float, float]


def load_polygons() -> list[PolygonRecord]:
    response = requests.get(SOURCE_URL, timeout=30)
    response.raise_for_status()
    feature_collection = response.json()
    polygons: list[PolygonRecord] = []

    for feature in feature_collection["features"]:
        if feature["properties"].get("ADM0_A3") not in COUNTRY_CODES:
            continue

        geometry = feature["geometry"]
        polygon_sets = (
            geometry["coordinates"]
            if geometry["type"] == "MultiPolygon"
            else [geometry["coordinates"]]
        )

        for polygon in polygon_sets:
            xs = [x for ring in polygon for x, _ in ring]
            ys = [y for ring in polygon for _, y in ring]
            polygons.append(
                PolygonRecord(
                    rings=polygon,
                    bbox=(min(xs), min(ys), max(xs), max(ys)),
                )
            )

    return polygons


def point_in_ring(point_x: float, point_y: float, ring: list[list[float]]) -> bool:
    inside = False
    previous_x, previous_y = ring[-1]

    for current_x, current_y in ring:
        intersects = (
            (current_y > point_y) != (previous_y > point_y)
            and point_x
            < ((previous_x - current_x) * (point_y - current_y))
            / (previous_y - current_y)
            + current_x
        )
        if intersects:
            inside = not inside
        previous_x, previous_y = current_x, current_y

    return inside


def point_in_polygon(
    point_x: float, point_y: float, polygon: list[list[list[float]]]
) -> bool:
    if not point_in_ring(point_x, point_y, polygon[0]):
        return False

    return not any(point_in_ring(point_x, point_y, hole) for hole in polygon[1:])


def point_is_land(point_x: float, point_y: float, polygons: list[PolygonRecord]) -> bool:
    for polygon in polygons:
        min_x, min_y, max_x, max_y = polygon.bbox
        if point_x < min_x or point_x > max_x or point_y < min_y or point_y > max_y:
            continue
        if point_in_polygon(point_x, point_y, polygon.rings):
            return True

    return False


def build_mask(polygons: list[PolygonRecord]) -> list[str]:
    min_x, min_y, max_x, max_y = BBOX
    rows: list[str] = []

    for row in range(BOARD_HEIGHT):
        row_cells: list[str] = []

        for col in range(BOARD_WIDTH):
            water_hits = 0

            for sample_y in range(SUPERSAMPLE):
                for sample_x in range(SUPERSAMPLE):
                    lon = min_x + (
                        col + (sample_x + 0.5) / SUPERSAMPLE
                    ) / BOARD_WIDTH * (max_x - min_x)
                    lat = max_y - (
                        row + (sample_y + 0.5) / SUPERSAMPLE
                    ) / BOARD_HEIGHT * (max_y - min_y)

                    if not point_is_land(lon, lat, polygons):
                        water_hits += 1

            total_samples = SUPERSAMPLE * SUPERSAMPLE
            row_cells.append("#" if water_hits / total_samples >= WATER_THRESHOLD else ".")

        rows.append("".join(row_cells))

    return rows


def main() -> None:
    polygons = load_polygons()
    rows = build_mask(polygons)

    print("// Generated board rows")
    for row in rows:
        print(f'"{row}",')

    playable = sum(row.count("#") for row in rows)
    print(f"// playable cells: {playable}")


if __name__ == "__main__":
    main()
