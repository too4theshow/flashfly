-- FlashFly Supabase Schema
-- Run this in Supabase SQL Editor

-- ─── DEALS TABLE ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS deals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  origin          TEXT NOT NULL,           -- SAT, AUS, IAH, HOU
  origin_city     TEXT NOT NULL,           -- San Antonio, Austin, Houston
  destination     TEXT NOT NULL,           -- airport code e.g. LAX
  destination_city TEXT NOT NULL,          -- Los Angeles
  destination_country TEXT,               -- USA, Mexico, etc.
  airline         TEXT,
  price_rt        NUMERIC(10,2) NOT NULL,  -- round trip price USD
  price_normal    NUMERIC(10,2),           -- 30-day avg for this route
  discount_pct    INTEGER,                 -- % off normal price
  travel_dates    TEXT,                    -- "Jul 15 – Jul 22"
  departure_date  DATE,
  return_date     DATE,
  nonstop         BOOLEAN DEFAULT FALSE,
  deal_tier       TEXT DEFAULT 'DEAL',     -- FLASH, HOT, DEAL
  booking_url     TEXT,
  is_active       BOOLEAN DEFAULT TRUE,
  is_international BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  expires_at      TIMESTAMPTZ,
  last_seen_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─── PRICE HISTORY (for baseline calculations) ────────────────────────
CREATE TABLE IF NOT EXISTS price_history (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  origin        TEXT NOT NULL,
  destination   TEXT NOT NULL,
  price_rt      NUMERIC(10,2) NOT NULL,
  sampled_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─── WATCHLIST (user saves) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS watchlist (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id   UUID REFERENCES deals(id) ON DELETE CASCADE,
  email     TEXT,
  added_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── SCAN LOG ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS scan_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scanned_at  TIMESTAMPTZ DEFAULT NOW(),
  deals_found INTEGER DEFAULT 0,
  new_deals   INTEGER DEFAULT 0,
  status      TEXT DEFAULT 'ok',
  notes       TEXT
);

-- ─── INDEXES ─────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_deals_active   ON deals(is_active, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deals_origin   ON deals(origin);
CREATE INDEX IF NOT EXISTS idx_deals_tier     ON deals(deal_tier);
CREATE INDEX IF NOT EXISTS idx_price_history  ON price_history(origin, destination, sampled_at DESC);

-- ─── ENABLE REALTIME ────────────────────────────────────────────────
ALTER TABLE deals REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE deals;

-- ─── SEED SAMPLE DEALS (San Antonio primary) ─────────────────────────
INSERT INTO deals (origin, origin_city, destination, destination_city, destination_country, airline, price_rt, price_normal, discount_pct, travel_dates, departure_date, return_date, nonstop, deal_tier, is_international, booking_url) VALUES
('SAT','San Antonio','LAX','Los Angeles','USA','American Airlines',89.00,210.00,58,'Aug 5 – Aug 12','2026-08-05','2026-08-12',false,'FLASH',false,'https://www.aa.com'),
('SAT','San Antonio','MCO','Orlando','USA','Southwest',109.00,240.00,55,'Jul 18 – Jul 25','2026-07-18','2026-07-25',false,'FLASH',false,'https://www.southwest.com'),
('AUS','Austin','JFK','New York City','USA','Delta',129.00,320.00,60,'Aug 20 – Aug 27','2026-08-20','2026-08-27',false,'FLASH',false,'https://www.delta.com'),
('SAT','San Antonio','CUN','Cancún','Mexico','United',198.00,480.00,59,'Sep 1 – Sep 8','2026-09-01','2026-09-08',false,'FLASH',true,'https://www.united.com'),
('AUS','Austin','DEN','Denver','USA','Southwest',79.00,195.00,59,'Jul 30 – Aug 6','2026-07-30','2026-08-06',true,'FLASH',false,'https://www.southwest.com'),
('IAH','Houston','SJU','San Juan, Puerto Rico','Puerto Rico','JetBlue',189.00,390.00,52,'Aug 8 – Aug 15','2026-08-08','2026-08-15',false,'FLASH',true,'https://www.jetblue.com'),
('SAT','San Antonio','PDX','Portland','USA','American Airlines',25.00,310.00,92,'Aug 1 – Aug 8','2026-08-01','2026-08-08',false,'FLASH',false,'https://www.aa.com'),
('AUS','Austin','OGG','Maui','USA','Delta',404.00,820.00,51,'Aug 10 – Aug 17','2026-08-10','2026-08-17',false,'HOT',false,'https://www.delta.com'),
('SAT','San Antonio','SEA','Seattle','USA','Delta',179.00,380.00,53,'Aug 12 – Aug 19','2026-08-12','2026-08-19',false,'HOT',false,'https://www.delta.com'),
('IAH','Houston','LGA','New York City','USA','United',149.00,360.00,59,'Sep 5 – Sep 12','2026-09-05','2026-09-12',false,'HOT',false,'https://www.united.com'),
('AUS','Austin','NAS','Nassau, Bahamas','Bahamas','JetBlue',279.00,550.00,49,'Jul 22 – Jul 29','2026-07-22','2026-07-29',false,'HOT',true,'https://www.jetblue.com'),
('SAT','San Antonio','LAS','Las Vegas','USA','Southwest',59.00,160.00,63,'Aug 3 – Aug 7','2026-08-03','2026-08-07',true,'FLASH',false,'https://www.southwest.com'),
('AUS','Austin','MIA','Miami','USA','American Airlines',119.00,290.00,59,'Aug 15 – Aug 22','2026-08-15','2026-08-22',false,'FLASH',false,'https://www.aa.com'),
('SAT','San Antonio','GDL','Guadalajara','Mexico','Volaris',89.00,210.00,58,'Sep 10 – Sep 17','2026-09-10','2026-09-17',true,'FLASH',true,'https://www.volaris.com'),
('IAH','Houston','LIR','Liberia, Costa Rica','Costa Rica','Delta',292.00,590.00,51,'Jul 25 – Aug 1','2026-07-25','2026-08-01',false,'HOT',true,'https://www.delta.com'),
('AUS','Austin','MSP','Minneapolis','USA','Southwest',197.00,380.00,48,'Aug 5 – Aug 12','2026-08-05','2026-08-12',true,'HOT',false,'https://www.southwest.com');
