-- Older installations provisioned this table through execution/d1_media_seed.sql.
CREATE TABLE IF NOT EXISTS place_photos (
  id TEXT PRIMARY KEY, place_id INTEGER, url TEXT, thumbnail_url TEXT,
  caption TEXT, credit TEXT, width INTEGER, height INTEGER, created_at TEXT
);

-- Community uploads are separate from scraped-photo seed/cleanup operations.
CREATE TABLE IF NOT EXISTS place_photo_uploads (
  id TEXT PRIMARY KEY NOT NULL,
  place_id INTEGER NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,
  caption TEXT NOT NULL,
  content_type TEXT NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
  image_base64 TEXT NOT NULL CHECK (length(image_base64) <= 1398104),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS photo_upload_place_idx ON place_photo_uploads(place_id, created_at);
