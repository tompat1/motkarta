import json
import sys

from scripts import fetch_place_photos as scraper
from scripts import enrich_coverage as coverage


def test_stockholm_urls_allowed_but_stock_social_and_logo_assets_rejected():
    assert not scraper.is_disallowed_image_url('https://www.visitstockholm.com/images/restaurant.jpg')
    assert not scraper.is_disallowed_image_url('https://stockholmskrog.se/iconic-dining.jpg')
    for url in ['https://images.unsplash.com/a.jpg', 'https://s.cdninstagram.com/a.jpg',
                'https://venue.se/images/logo-2025.png',
                'https://venue.se/_next/image?url=%2Fimages%2Flogo.png&w=600',
                'https://venue.se/_next/image?url=%2Ficons%2Fflags%2Fsweden.png&w=48', 'https://venue.se/favicon.ico', 'data:image/png,abc']:
        assert scraper.is_disallowed_image_url(url)


def test_scrapes_metadata_and_lazy_responsive_images(monkeypatch):
    monkeypatch.setattr(scraper, 'http_get_text', lambda *a, **k: '''
        <meta content="/hero.jpg?width=1600&amp;quality=80" property="og:image">
        <img src="/logo.png"><img data-src="/lazy.webp?width=900">
        <source srcset="/small.jpg 400w, /large.jpg 1200w">
        <img src="/hero.jpg?width=1600&amp;quality=80">
    ''')
    photos = scraper.scrape_place_website_photos('https://stockholmskrog.se/', 'Test venue')
    assert [p['url'] for p in photos] == [
        'https://stockholmskrog.se/hero.jpg?width=1600&quality=80',
        'https://stockholmskrog.se/lazy.webp?width=900',
        'https://stockholmskrog.se/large.jpg',
    ]


def test_merge_preserves_existing_images_and_ids():
    existing = [{'id': 'photo-1-1', 'placeId': 1, 'url': 'https://venue.se/old.jpg'}]
    assert scraper.merge_place_photos(existing, []) == existing
    incoming = [{'id': 'photo-1-1', 'placeId': 1, 'url': 'https://venue.se/new.jpg'}]
    merged = scraper.merge_place_photos(existing, incoming)
    assert merged[0] == existing[0]
    assert merged[1]['id'] != merged[0]['id']
    assert scraper.merge_place_photos(merged, incoming) == merged


def test_limited_missing_run_preserves_catalog_and_existing_photos(tmp_path, monkeypatch):
    places = tmp_path / 'places.json'
    existing = tmp_path / 'existing.json'
    output = tmp_path / 'output.json'
    sql = tmp_path / 'output.sql'
    places.write_text(json.dumps({'places': [{'id': i, 'name': f'Venue {i}', 'website': 'https://venue.se'} for i in [1, 2, 3]]}))
    old = {'1': [{'id': 'photo-1-1', 'placeId': 1, 'url': 'https://venue.se/old.jpg'}]}
    existing.write_text(json.dumps({'photosByPlace': old}))
    visited = []
    def fetch(place):
        visited.append(place['id'])
        return place['id'], [{'id': 'photo-2-1', 'placeId': 2, 'url': 'https://venue.se/new.jpg'}]
    monkeypatch.setattr(scraper, 'fetch_photos_for_place', fetch)
    monkeypatch.setattr(sys, 'argv', ['scraper', '--places-file', str(places), '--existing-json', str(existing),
                                     '--output-json', str(output), '--output-sql', str(sql), '--only-missing', '--limit', '1'])
    scraper.main()
    result = json.loads(output.read_text())
    assert visited == [2]
    assert result['totalPlaces'] == 3
    assert result['photosByPlace']['1'] == old['1']
    assert result['photoPlaces'] == 2
    assert result['verificationStatus'] == 'pending'
    assert 'DELETE FROM' not in sql.read_text()
    assert json.loads(existing.read_text())['photosByPlace'] == old


def test_photo_coverage_requires_full_catalog_coverage_and_ignores_orphans(tmp_path):
    places = tmp_path / 'places.json'
    photos = tmp_path / 'photos.json'
    places.write_text(json.dumps({'places': [{'id': i, 'address': 'Test 1'} for i in [1, 2]]}))
    def entry(i):
        return [{'id': f'photo-{i}', 'url': 'https://venue.se/a.jpg'}]
    photos.write_text(json.dumps({'photosByPlace': {'1': entry(1), '999': entry(999)}}))
    stats = coverage.enrich_addresses_and_photos(places, photos, tmp_path / 'photos.sql', tmp_path / 'stats.json', max_google_queries=0, quiet=True)
    assert stats['photos']['count'] == 1
    assert stats['photos']['percentage'] == 50
    assert stats['photos']['status'] == 'PROGRESSING'
    photos.write_text(json.dumps({'photosByPlace': {'1': entry(1), '2': entry(2)}}))
    stats = coverage.enrich_addresses_and_photos(places, photos, tmp_path / 'photos.sql', tmp_path / 'stats.json', max_google_queries=0, quiet=True)
    assert stats['photos']['status'] == 'PASS'


def test_resize_variants_do_not_fill_all_photo_slots(monkeypatch):
    monkeypatch.setattr(scraper, 'http_get_text', lambda *a, **k: '<meta property="og:image" content="/interior.jpg"><img src="/interior-400x300.jpg"><img srcset="/dining.jpg?w=300 300w, /dining.jpg?w=1200 1200w"><img src="/food.jpg">')
    photos = scraper.scrape_place_website_photos('https://venue.se/', 'Venue')
    assert [p['url'] for p in photos] == ['https://venue.se/interior.jpg', 'https://venue.se/dining.jpg?w=1200', 'https://venue.se/food.jpg']
