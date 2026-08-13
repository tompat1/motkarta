-- Export current raw place rows for score computation.
-- Run with:
-- wrangler d1 execute <database-name> --remote --json --file scripts/export_places.sql > data/place-export.json

SELECT
  e.id,
  e.name,
  e.type,
  e.district,
  e.description,
  e.price_level,
  e.latitude,
  e.longitude,
  e.chain_status,
  r.rating_average,
  r.reliable_rating_count,
  r.review_count,
  r.category_mean_rating,
  r.captured_at AS latest_rating_at,
  g.search_impressions,
  g.profile_views,
  g.map_marker_clicks,
  g.saves,
  g.direction_requests,
  g.confirmed_visits,
  g.repeat_visits,
  g.recommendations,
  g.recent_saves,
  g.window_ended_at AS latest_engagement_at,
  s.specialty_verified,
  s.own_roastery,
  s.traceable_coffee,
  s.filter_coffee,
  s.espresso_based,
  s.rotating_roasters,
  s.single_origin,
  s.manual_brew_methods_json,
  s.decaf_available,
  s.beans_for_sale,
  s.verification_sources
FROM establishments e
LEFT JOIN rating_snapshots r
  ON r.id = (
    SELECT id FROM rating_snapshots
    WHERE establishment_id = e.id
    ORDER BY captured_at DESC, id DESC
    LIMIT 1
  )
LEFT JOIN engagement_snapshots g
  ON g.id = (
    SELECT id FROM engagement_snapshots
    WHERE establishment_id = e.id
    ORDER BY window_ended_at DESC, id DESC
    LIMIT 1
  )
LEFT JOIN specialty_coffee_attributes s
  ON s.establishment_id = e.id
ORDER BY e.name ASC;
