# ✈️ FlashFly — Automated Flash Flight Deals

> EscapeATX automated. Scans AUS, SAT, IAH, HOU every 4 hours for insane flight deals.

**Live Site:** https://flashfly-deals.netlify.app

## What It Does
- Monitors flights from San Antonio (SAT ★), Austin (AUS), Houston (IAH/HOU)
- Flags deals ≥40% below rolling 30-day average
- Absolute flash thresholds: <$150 domestic RT, <$350 international RT
- Real-time deal feed via Supabase live subscriptions
- No manual curation — fully automated

## Stack
- **Frontend:** Netlify (static HTML, impeccable design)
- **Database:** Supabase (deals table + real-time subscriptions)
- **Scanner:** Amadeus free tier API (2,000 calls/month)
- **Cron:** Every 4 hours

## Setup
```bash
# 1. Run Supabase schema
# Copy supabase/schema.sql into Supabase SQL editor

# 2. Get Amadeus free API key
# https://developers.amadeus.com/register

# 3. Set env vars
SUPABASE_URL=...
SUPABASE_SERVICE_KEY=...
AMADEUS_API_KEY=...
AMADEUS_API_SECRET=...

# 4. Run scanner
node api/scanner.mjs
```

## Deal Tiers
- 🔥 **FLASH** — ≥40% off or under absolute threshold
- 🌶️ **HOT** — 30-40% off
- ✈️ **DEAL** — 20-30% off

Built by Mox 🦞
