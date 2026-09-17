"""Repair static facts and emit guarded, additive D1 SQL. Never connects to D1.

python -m execution.repair_enrichment --write --d1-snapshot .tmp/d1-enrichment.json
Export snapshot: SELECT id,name,osm_type,osm_id,latitude,longitude,updated_at,
opening_hours,price_sek,website,address,lifecycle_state,validation_label FROM establishments
"""
from __future__ import annotations
import argparse
import copy
import json
import hashlib
from pathlib import Path
from execution.apply_enrichment import apply_overlay, remove_unsupported_defaults, WIFI_TAGS
from execution.enrich_catalog import extract_osm_facts
from scripts.enrich_street_addresses import haversine_distance, normalize_text

ROOT = Path(__file__).resolve().parents[1]


def repair_catalog(payload, raw, captured_at):
    result = copy.deepcopy(payload)
    places = result['places']
    # Exact identities only during bulk repair: no speculative name joins.
    index = {p['osmIdentity']: [p] for p in places if p.get('osmIdentity')}
    overlay = extract_osm_facts(raw['elements'], index)
    for place in places:
        identity = place.get('osmIdentity')
        expected_url = 'https://www.openstreetmap.org/' + identity.replace(':', '/') if identity else None
        valid = []
        for fact in place.get('sourceFacts', []):
            if fact.get('source') == 'OpenStreetMap' and fact.get('url') != expected_url:
                if place.get(fact.get('field')) == fact.get('value'):
                    place.pop(fact['field'], None)
                continue
            valid.append(fact)
        place['sourceFacts'] = valid
        remove_unsupported_defaults(place)
        # Legacy price extraction has no provenance: quarantine instead of claiming accuracy.
        if place.get('priceSEK') and not any(f.get('field') == 'priceSEK' and f.get('value') == place['priceSEK'] and f.get('url') for f in valid):
            place.pop('priceSEK', None)
        for fact in overlay.get(place['id'], []):
            fact['capturedAt'] = captured_at  # Source snapshot time, not processing time.
    apply_overlay(places, {str(k): v for k, v in overlay.items()})
    return result


def literal(value):
    if value is None:
        return 'NULL'
    if isinstance(value, (float, int)):
        return str(value)
    return "'" + str(value).replace("'", "''") + "'"


def sync_sql(payload, rows, photos=None):
    """Only update corroborated identities, empty fields and neutral source facts."""
    index = {}
    for row in rows:
        key = f"{row.get('osm_type')}:{row.get('osm_id')}"
        index.setdefault(key, []).append(row)
    sql, review = [], []
    from scripts.fetch_place_photos import is_disallowed_image_url
    for place in payload['places']:
        matches = index.get(place.get('osmIdentity'), [])
        if len(matches) != 1:
            review.append({'id': place['id'], 'reason': 'missing_or_ambiguous_identity'})
            continue
        row = matches[0]
        try:
            close = haversine_distance(float(place['latitude']), float(place['longitude']), float(row['latitude']), float(row['longitude'])) <= 150
        except (KeyError, ValueError, TypeError):
            close = False
        if not close or normalize_text(place['name']) != normalize_text(row['name']):
            review.append({'id': place['id'], 'reason': 'name_or_location_mismatch'})
            continue
        guard_fields = ['id', 'osm_type', 'osm_id', 'name', 'updated_at', 'lifecycle_state', 'validation_label']
        guard = ' AND '.join(f'{key} IS {literal(row.get(key))}' for key in guard_fields)
        facts = [f for f in place.get('sourceFacts', []) if f.get('url') and f.get('capturedAt') and (f.get('source') == 'OpenStreetMap' or f.get('source', '').lower().startswith('venue website'))]
        updates = {}
        for field, column in [('openingHours', 'opening_hours'), ('priceSEK', 'price_sek'), ('address', 'address')]:
            if not row.get(column) and place.get(field) and any(f['field'] == field and f['value'] == place[field] for f in facts):
                updates[column] = place[field]
        if updates:
            values = ', '.join(f'{key}={literal(value)}' for key, value in updates.items())
            empty_guard = ' AND '.join(f'{key} IS {literal(row.get(key))}' for key in updates)
            sql.append(f'UPDATE establishments SET {values} WHERE {guard} AND {empty_guard};')
        for photo in (photos or {}).get(str(place['id']), []):
            url = photo.get('url', '')
            if not url.startswith(('https://', 'http://')) or is_disallowed_image_url(url):
                continue
            photo_id = f"scraped:{row['id']}:" + hashlib.sha256(url.encode()).hexdigest()[:20]
            sql.append(f"INSERT INTO place_photos(id,place_id,url,thumbnail_url,caption,credit,created_at) SELECT {literal(photo_id)},id,{literal(url)},{literal(photo.get('thumbnailUrl') or url)},{literal(photo.get('caption') or place['name'])},{literal(photo.get('credit') or 'Venue website')},datetime('now') FROM establishments WHERE {guard} AND NOT EXISTS (SELECT 1 FROM place_photos WHERE place_id={row['id']} AND url={literal(url)}) ON CONFLICT(id) DO NOTHING;")
        for fact in facts:
            if fact['field'] not in {'openingHours', 'priceSEK', 'address'} and not fact['id'].endswith(':osm:wifi'):
                continue
            # Do not insert a conflicting fact over an existing admin field.
            column = {'openingHours': 'opening_hours', 'priceSEK': 'price_sek', 'address': 'address'}.get(fact['field'])
            if column and row.get(column) and row[column] != fact['value']:
                continue
            stored = {**fact, 'placeId': row['id'], 'id': f"{row['id']}:" + fact['id'].split(':', 1)[1]}
            if fact['id'].endswith(':osm:wifi'):
                owned_tags = ','.join(literal(t) for t in WIFI_TAGS)
                sql.append(f"DELETE FROM establishment_tags WHERE establishment_id={row['id']} AND tag IN ({owned_tags}) AND EXISTS (SELECT 1 FROM establishments WHERE {guard}) AND EXISTS (SELECT 1 FROM place_source_facts WHERE id={literal(stored['id'])} AND captured_at <= {literal(stored['capturedAt'])});")
            sql.append(f"INSERT INTO place_source_facts (id,place_id,fact_json,captured_at) SELECT {literal(stored['id'])},{row['id']},{literal(json.dumps(stored, ensure_ascii=False))},{literal(stored['capturedAt'])} FROM establishments WHERE {guard} ON CONFLICT(id) DO UPDATE SET fact_json=excluded.fact_json,captured_at=excluded.captured_at WHERE excluded.captured_at > place_source_facts.captured_at;")
            if fact['id'].endswith(':osm:wifi'):
                # Only remove tags previously owned by this OSM fact in future syncs.
                value = fact['value']
                tags = ['Wi-Fi', value] if value in {'Free Wi-Fi', 'Wi-Fi free for customers', 'Paid Wi-Fi'} else [value]
                for tag in tags:
                    sql.append(f"INSERT INTO establishment_tags(establishment_id,tag) SELECT id,{literal(tag)} FROM establishments WHERE {guard} AND EXISTS (SELECT 1 FROM place_source_facts WHERE id={literal(stored['id'])} AND fact_json={literal(json.dumps(stored, ensure_ascii=False))}) AND NOT EXISTS (SELECT 1 FROM establishment_tags WHERE establishment_id={row['id']} AND tag={literal(tag)});")
    return '\n'.join(sql) + '\n', review


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--write', action='store_true')
    parser.add_argument('--osm-file', type=Path, default=ROOT / 'data/raw/osm_stockholm_food_places.json')
    parser.add_argument('--osm-metadata', type=Path, default=ROOT / 'data/raw/osm_stockholm_food_places.metadata.json')
    parser.add_argument('--d1-snapshot', type=Path)
    parser.add_argument('--output', type=Path, default=ROOT / '.tmp/enrichment-repair')
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    catalog = ROOT / 'public/data/places.json'
    before = json.loads(catalog.read_text())
    raw = json.loads(args.osm_file.read_text())
    metadata = json.loads(args.osm_metadata.read_text())
    after = repair_catalog(before, raw, metadata['fetched_at'])
    if not (args.output / 'before.json').exists():
        (args.output / 'before.json').write_text(json.dumps(before, ensure_ascii=False, indent=2) + '\n')
    (args.output / 'after.json').write_text(json.dumps(after, ensure_ascii=False, indent=2) + '\n')
    if args.d1_snapshot:
        snapshot = json.loads(args.d1_snapshot.read_text())
        rows = snapshot[0]['results']
        photos = json.loads((ROOT / 'public/data/place_photos.json').read_text()).get('photosByPlace', {})
        sql, review = sync_sql(after, rows, photos)
        (args.output / 'sync.sql').write_text(sql)
        (args.output / 'review.json').write_text(json.dumps(review, indent=2))
    if args.write:
        catalog.write_text(json.dumps(after, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'places': len(after['places']), 'hours': sum(bool(p.get('openingHours')) for p in after['places']), 'prices': sum(bool(p.get('priceSEK')) for p in after['places']), 'wifi': sum('Wi-Fi' in p.get('tags', []) for p in after['places']), 'freeWifi': sum('Free Wi-Fi' in p.get('tags', []) for p in after['places'])}))

if __name__ == '__main__':
    main()
