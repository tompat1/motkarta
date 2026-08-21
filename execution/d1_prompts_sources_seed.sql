-- D1 Database Schema & Seed for Curated Sources and Concierge Prompts

CREATE TABLE IF NOT EXISTS curated_sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  type TEXT NOT NULL,
  description TEXT NOT NULL,
  license TEXT NOT NULL,
  verified_count INTEGER DEFAULT 0,
  added_by_user INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS concierge_prompts (
  id TEXT PRIMARY KEY,
  prompt TEXT NOT NULL UNIQUE,
  usage_count INTEGER DEFAULT 1,
  category TEXT DEFAULT 'general',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Seed Curated Sources
INSERT OR IGNORE INTO curated_sources (id, name, url, type, description, license, verified_count, added_by_user) VALUES
('husa-guide', 'Anders Husa & Kaitlin Orr Guide', 'https://andershusa.com', 'Verified Guide', 'Kurerad krog- och restaurangguide av Michelin- och World''s 50 Best-jurymedlemmar Anders Husa & Kaitlin Orr.', 'Citerat med tillstånd (andershusa.com)', 50, 0),
('stockholm-stad', 'Stockholms Stad Livsmedelskontroll', 'https://miljo.stockholm.se', 'Municipal Inspection', 'Officiella kommunala miljö- och hälsoskyddsgranskningar samt livsmedelsinspektioner.', 'CC0 1.0 Universal / Öppen kommunal data', 3212, 0),
('openstreetmap', 'OpenStreetMap Contributors', 'https://www.openstreetmap.org', 'Open Data', 'Geografiska koordinater, byggnadskonturer och oberoende POI-identiteter för Stockholms stad.', 'ODbL 1.0 (Open Database License)', 14500, 0),
('white-guide', 'White Guide Nordic', 'https://whiteguide.com', 'Editorial Review', 'Nordiska krog- och fikatillsynsbedömningar av oberoende gastronomiprofessionella.', 'Redaktionell granskning', 85, 0),
('specialty-coffee-se', 'Specialty Coffee Sweden Registry', 'https://specialtycoffee.se', 'Verified Guide', 'Kvalitetssäkrade kaffebönskällor, spårbarhetsbevis och rosteriverifieringar i Stockholm.', 'Öppen branschstandard', 15, 0),
('visit-stockholm', 'Visit Stockholm (Officiella Stadsguiden)', 'https://www.visitstockholm.se', 'Official City Guide', 'Officiell besöks- och restaurangguide från Stockholms Stad. En opartisk och heltäckande resurs för Stockholms matkultur, krogar och caféer.', 'Officiell stadsportal (Stockholms Stad)', 240, 0);

-- Seed Concierge Prompts
INSERT OR IGNORE INTO concierge_prompts (id, prompt, usage_count) VALUES
('p-1', 'specialty coffee och kardemummabulle på Södermalm', 100),
('p-2', 'bästa mexikanska tacos i Vasastan', 85),
('p-3', 'familjeägd fransk bistro med bra vin i Gamla Stan', 72),
('p-4', 'hantverksbageri med surdegsbröd i Zinkensdamm', 68),
('p-5', 'handgjorda polska pierogi i Gamla Stan', 64),
('p-6', 'dolda pärlor för middag nära mig', 90),
('p-7', '3-stjärnig fine dining med avsmakningsmeny', 55),
('p-8', 'svensk husmanskost till rimligt pris', 80),
('p-9', 'bageri med nysandade kanelbullar', 60),
('p-10', 'italienska trattorias med färsk pasta', 75),
('p-11', 'izakaya och yakitori spett i Vasastan', 50);
