from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from motkarta.food_control import load_or_fetch_food_control, normalize_food_control_features


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default="data/stockholm_food_control.csv")
    parser.add_argument("--cache", default="data/raw/stockholm_food_control.json")
    parser.add_argument("--metadata", default="data/raw/stockholm_food_control.metadata.json")
    parser.add_argument("--where", default="TillsynsDatum >= '2024-01-01'")
    parser.add_argument("--max-pages", type=int, default=8)
    parser.add_argument("--page-size", type=int, default=2000)
    parser.add_argument("--refresh", action="store_true")
    args = parser.parse_args()

    payload = load_or_fetch_food_control(
        args.cache,
        args.metadata,
        refresh=args.refresh,
        where=args.where,
        max_pages=args.max_pages,
        page_size=args.page_size,
    )
    frame = normalize_food_control_features(payload)
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    frame.to_csv(output, index=False)
    print(f"Wrote {output} ({len(frame)} facilities)")


if __name__ == "__main__":
    main()
