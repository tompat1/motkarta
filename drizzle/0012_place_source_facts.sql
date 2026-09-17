-- Neutral venue facts, separate from quality/evidence scoring.
CREATE TABLE IF NOT EXISTS place_source_facts (
  id TEXT PRIMARY KEY NOT NULL,
  place_id INTEGER NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,
  fact_json TEXT NOT NULL CHECK(json_valid(fact_json)),
  captured_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS place_source_facts_place_idx ON place_source_facts(place_id);
