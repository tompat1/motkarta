from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from motkarta.concierge import answer_query, load_rag_corpus, synthesize_concierge_response


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("query")
    parser.add_argument("--corpus", default="outputs/rag_corpus.jsonl")
    parser.add_argument("--limit", type=int, default=5)
    parser.add_argument("--synthesize", action="store_true", help="Generate full RAG concierge answer synthesis")
    args = parser.parse_args()

    corpus = load_rag_corpus(args.corpus)

    if args.synthesize:
        result = synthesize_concierge_response(args.query, corpus, limit=args.limit)
        print(f"=== AI CONCIERGE RECOMMENDATION (Source: {result['source']}) ===")
        print(result["synthesized_answer"])
        print("\n=== RETRIEVED PLACES ===")
        for doc in result["retrieved_places"]:
            meta = doc.get("metadata", {})
            print(f"- {doc['title']} ({meta.get('establishment_type')}, score {meta.get('discovery_score')})")
    else:
        for result in answer_query(args.query, corpus, limit=args.limit):
            metadata = result.get("metadata", {})
            print(f"- {result['title']} ({metadata.get('establishment_type')}, score {metadata.get('discovery_score')})")


if __name__ == "__main__":
    main()
