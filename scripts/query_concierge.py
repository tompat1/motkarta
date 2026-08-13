from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from motkarta.concierge import answer_query, load_rag_corpus


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("query")
    parser.add_argument("--corpus", default="outputs/rag_corpus.jsonl")
    parser.add_argument("--limit", type=int, default=5)
    args = parser.parse_args()

    for result in answer_query(args.query, load_rag_corpus(args.corpus), limit=args.limit):
        metadata = result.get("metadata", {})
        print(f"- {result['title']} ({metadata.get('establishment_type')}, score {metadata.get('discovery_score')})")


if __name__ == "__main__":
    main()
