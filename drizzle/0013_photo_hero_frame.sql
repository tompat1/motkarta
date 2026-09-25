-- Per-photo hero framing for map cards and place detail views.
ALTER TABLE place_photos ADD COLUMN hero_focus_x REAL NOT NULL DEFAULT 50;
ALTER TABLE place_photos ADD COLUMN hero_focus_y REAL NOT NULL DEFAULT 50;
ALTER TABLE place_photos ADD COLUMN hero_scale REAL NOT NULL DEFAULT 1;
ALTER TABLE place_photos ADD COLUMN hero_fit TEXT NOT NULL DEFAULT 'contain';

ALTER TABLE place_photo_uploads ADD COLUMN hero_focus_x REAL NOT NULL DEFAULT 50;
ALTER TABLE place_photo_uploads ADD COLUMN hero_focus_y REAL NOT NULL DEFAULT 50;
ALTER TABLE place_photo_uploads ADD COLUMN hero_scale REAL NOT NULL DEFAULT 1;
ALTER TABLE place_photo_uploads ADD COLUMN hero_fit TEXT NOT NULL DEFAULT 'contain';
