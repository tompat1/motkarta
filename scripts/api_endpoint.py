"""Offline development concierge adapter; production RAG is the Pages endpoint."""
from dataclasses import asdict
import json
from pathlib import Path
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from motkarta.concierge import synthesize_concierge_response
from motkarta.rag import place_to_rag_document

app = FastAPI(title='Motkarta local concierge', version='2.0')


class ChatQuery(BaseModel):
    message: str = Field(min_length=1, max_length=1000)
    user_coordinates: list[float] | None = None


def load_vector_db() -> list[dict]:
    # Reject old synthetic/anomaly-enriched payloads; rebuild from the factual snapshot.
    path = Path('public/data/places.json')
    if not path.exists():
        return []
    payload = json.loads(path.read_text())
    places = payload.get('places', []) if isinstance(payload, dict) else payload
    return [asdict(place_to_rag_document(place)) for place in places]


@app.get('/health')
async def health_check():
    return {'status': 'online', 'mode': 'offline_lexical', 'generation': False}


@app.post('/api/v1/concierge/chat')
async def handle_concierge_query(payload: ChatQuery):
    documents = load_vector_db()
    if not documents:
        raise HTTPException(status_code=503, detail='Catalog unavailable')
    result = synthesize_concierge_response(payload.message, documents)
    return {**result, 'reply': result['synthesized_answer'],
            'sources': [{'id': d['id'], 'name': d['title']} for d in result['retrieved_places']]}


if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host='127.0.0.1', port=8000)
