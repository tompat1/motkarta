from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path
from motkarta.stockholm_boundary import normalized_boundary_text, contains_boundary_token
from motkarta.stockholm_boundary import STOCKHOLM_MUNICIPALITY_BBOX

POLICY = json.loads((Path(__file__).resolve().parents[1] / 'lib/concierge/policy.json').read_text())
CORPUS_VERSION = 'concierge-facts-v1'


@dataclass(frozen=True)
class RagDocument:
    id: str
    title: str
    text: str
    metadata: dict


def eligible_place(place: dict) -> bool:
    state = place.get('lifecycleState', place.get('lifecycle_state')) or 'baseline'
    if state not in {'baseline', 'active', 'verified', 'featured'}:
        return False
    if place.get('validationLabel', place.get('validation_label')) == 'closed_wrong_category':
        return False
    if place.get('chainStatus', place.get('chain_status')) == 'chain':
        return False
    name = normalized_boundary_text(place.get('name', ''))
    if name in POLICY['excludedExactChains']:
        return False
    if any(contains_boundary_token(name, chain) for chain in POLICY['excludedChains']):
        return False
    latitude, longitude = place.get('latitude'), place.get('longitude')
    if isinstance(latitude, (int, float)) and isinstance(longitude, (int, float)):
        south, west, north, east = STOCKHOLM_MUNICIPALITY_BBOX
        if not (south <= latitude <= north and west <= longitude <= east):
            return False
    location = normalized_boundary_text(' '.join(str(place.get(k) or '') for k in ['area', 'sourceArea', 'address', 'sourceUrl']))
    return not any(contains_boundary_token(location, area) for area in POLICY['excludedLocalities']) and any(contains_boundary_token(location, area) for area in POLICY['stockholmLocalities'])


def clean(value: object) -> str:
    return re.sub(r'[\r\n\x00-\x1f#*<>`]', ' ', str(value or '')).strip()[:500]


def place_to_rag_document(place: dict) -> RagDocument:
    """Factual corpus only: no invented verification, independence or quality."""
    kind = place.get('kind') or place.get('type') or 'venue'
    area = place.get('area') or place.get('district') or ''
    fields = {'name': place.get('name'), 'kind': kind, 'area': area,
              'address': place.get('address'), 'cuisine': place.get('cuisine')}
    lines = [f'{key}: {clean(value)}' for key, value in fields.items() if value]
    tags = [clean(tag) for tag in place.get('tags', []) if isinstance(tag, str) and not re.search(r'rating|review|popular|quality|hidden gem|verified|independent|anomal|residual', tag, re.I)]
    lines.extend(f'tags: {tag}' for tag in tags)
    # Evidence labels are metadata, not claims that all attributes were verified.
    metadata = {
        'place_id': place.get('id'), 'type': kind, 'establishment_type': kind,
        'area': area, 'neighbourhood': area, 'cuisine': place.get('cuisine', ''),
        'tags': tags, 'address': place.get('address', ''),
        'source_url': place.get('sourceUrl'), 'source_name': place.get('sourceName'),
        'evidence_label': place.get('evidenceLabel', ''),
        'lifecycle_state': place.get('lifecycleState') or 'baseline',
        'chain_status': place.get('chainStatus') or 'unknown',
        'validation_label': place.get('validationLabel'),
        'eligible': eligible_place({**place, 'area': area}),
        'corpus_version': CORPUS_VERSION, 'is_hidden_gem': False,
    }
    return RagDocument(str(place.get('id')), clean(place.get('name')), '\n'.join(lines), metadata)


def chunk_documents(documents: list[RagDocument], max_chars: int = 1200) -> list[RagDocument]:
    if max_chars <= 0:
        raise ValueError('max_chars must be positive')
    chunks = []
    for document in documents:
        if len(document.text) <= max_chars:
            chunks.append(document)
            continue
        for index, start in enumerate(range(0, len(document.text), max_chars)):
            chunks.append(RagDocument(f'{document.id}:{index}', document.title,
                                      document.text[start:start + max_chars],
                                      {**document.metadata, 'chunk': index}))
    return chunks
