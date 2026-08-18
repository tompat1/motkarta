"""
api_endpoint.py
Motkarta REST API Gateway - Vector RAG Concierge Endpoint
Optimized for Antigravity IDE & Gemini 2.5 Flash
"""

import json
import os
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

try:
    from google import genai
    from google.genai import types
    HAS_GENAI_SDK = True
except ImportError:
    HAS_GENAI_SDK = False

app = FastAPI(title="Motkarta AI Concierge Backend", version="1.0")

# Enable cross-origin routing for motkarta.rynell.org frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Restrict to specific domains in production deployment
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize the official Google GenAI client if GEMINI_API_KEY environment variable is configured
api_key = os.environ.get("GEMINI_API_KEY")
client = None
if api_key and HAS_GENAI_SDK:
    client = genai.Client(api_key=api_key)


class ChatQuery(BaseModel):
    message: str
    user_coordinates: list[float] | None = None  # Optional [lat, lon] array


def load_vector_db() -> list[dict]:
    candidates = [
        Path("outputs/motkarta_rag_payload.json"),
        Path("motkarta_rag_payload.json"),
        Path("outputs/rag_corpus.jsonl"),
    ]
    for path in candidates:
        if path.exists():
            if path.suffix == ".json":
                with path.open("r", encoding="utf-8") as f:
                    return json.load(f)
            elif path.suffix == ".jsonl":
                with path.open("r", encoding="utf-8") as f:
                    docs = []
                    for line in f:
                        if line.strip():
                            raw = json.loads(line)
                            meta = raw.get("metadata", {})
                            docs.append({
                                "id": raw.get("id"),
                                "name": raw.get("title"),
                                "coordinates": [0.0, 0.0],
                                "geohash": "u6s",
                                "gem_index": meta.get("gem_index", 5.0),
                                "custom_score": meta.get("discovery_score", 50.0) / 10.0,
                                "text_content": raw.get("text"),
                            })
                    return docs
    return []


MOCK_VECTOR_DB = load_vector_db()


def semantic_vector_match(query_text: str, top_k: int = 4):
    """
    Substitutes standard vector search by ranking keywords and prioritizing 
    high-performing ML outlier scores to surface true hidden gems.
    """
    ranked_results = []
    query_words = [w.lower() for w in query_text.replace(",", " ").replace(".", " ").split() if len(w) > 2]
    
    for doc in MOCK_VECTOR_DB:
        match_score = 0
        content_lower = doc["text_content"].lower()
        
        for word in query_words:
            if word in content_lower:
                match_score += 1
                
        if match_score > 0:
            # Boost ranking score for places verified as ML hidden gems
            gem_idx = float(doc.get("gem_index", 0.0))
            final_rank = match_score + (gem_idx * 0.25)
            ranked_results.append((final_rank, doc))
            
    ranked_results.sort(key=lambda x: x[0], reverse=True)
    return [item[1] for item in ranked_results[:top_k]]


@app.get("/health")
async def health_check():
    return {
        "status": "online",
        "payload_items": len(MOCK_VECTOR_DB),
        "genai_sdk_available": HAS_GENAI_SDK,
        "gemini_api_key_configured": bool(api_key),
    }


@app.post("/api/v1/concierge/chat")
async def handle_concierge_query(payload: ChatQuery):
    global MOCK_VECTOR_DB
    if not MOCK_VECTOR_DB:
        MOCK_VECTOR_DB = load_vector_db()
    if not MOCK_VECTOR_DB:
        raise HTTPException(status_code=500, detail="RAG system payload database uninitialized.")

    # 1. Execute localized vector matching pass
    relevant_contexts = semantic_vector_match(payload.message, top_k=4)
    
    if not relevant_contexts:
        # Fall back to returning top global ML outliers if keyword matching fails
        relevant_contexts = sorted(MOCK_VECTOR_DB, key=lambda x: float(x.get("gem_index", 0)), reverse=True)[:3]

    # 2. Build the structural reference context packet
    context_str = "\n\n".join([doc["text_content"] for doc in relevant_contexts])

    # 3. Inject strict parameters and constraints into system instructions
    system_instructions = (
        "You are the Motkarta AI Concierge, a non-commercial digital guide to Stockholm's independent food and drink scene.\n"
        "Your absolute core mission is to help users discover true local independent places and hidden gems based exclusively on OpenStreetMap ground data.\n\n"
        "CRITICAL BEHAVIORAL DIRECTIVES:\n"
        "1. Never suggest commercial franchises, global chains, or heavily marketed tourist corporations. If a user asks for them, politely refuse and suggest an independent alternative.\n"
        "2. Ground every response explicitly inside the data array provided in the context blocks below. Do not make up locations, addresses, or features.\n"
        "3. Explicitly emphasize venues categorized with a high Machine Learning Outlier Gem Index, highlighting why they are distinct.\n"
        "4. Output responses using clear, conversational structures. End suggestions by naming the specific city neighborhood or geohash sector."
    )

    prompt_content = f"Contextual Database Entries:\n{context_str}\n\nUser Question:\n{payload.message}"

    if client:
        try:
            # 4. Execute the network pass to Gemini 2.5 Flash
            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=prompt_content,
                config=types.GenerateContentConfig(
                    system_instruction=system_instructions,
                    temperature=0.2,  # Low temperature forces factual data adherence
                    max_output_tokens=800,
                ),
            )
            
            return {
                "reply": response.text,
                "sources": [
                    {
                        "id": doc["id"],
                        "name": doc["name"],
                        "coordinates": doc["coordinates"],
                        "gem_index": doc["gem_index"],
                    } for doc in relevant_contexts
                ],
            }

        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Gemini API Execution Error: {str(e)}")
    else:
        # Grounded fallback recommendation synthesis
        reply_lines = [
            f"Based on our OpenStreetMap ground data, here are top recommendations for '{payload.message}':",
            "",
        ]
        for doc in relevant_contexts:
            reply_lines.append(f"• **{doc['name']}**: {doc['text_content']}")

        reply_lines.extend([
            "",
            "--- ETHICAL CHARTER ---",
            "• Grounded Facts: Strictly based on OpenStreetMap ground data.",
            "• Non-Commercial: Global chains and tourist traps are excluded.",
        ])

        return {
            "reply": "\n".join(reply_lines),
            "sources": [
                {
                    "id": doc["id"],
                    "name": doc["name"],
                    "coordinates": doc["coordinates"],
                    "gem_index": doc["gem_index"],
                } for doc in relevant_contexts
            ],
            "fallback": True,
        }


if __name__ == "__main__":
    import uvicorn
    # Launch backend API service
    uvicorn.run(app, host="0.0.0.0", port=8000)
