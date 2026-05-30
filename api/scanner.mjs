/**
 * FlashFly Deal Scanner
 * Runs on a cron (every 4 hours) — finds flash deals from SAT/AUS/IAH
 * Uses Amadeus free tier API + Supabase for storage
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const AMADEUS_KEY  = process.env.AMADEUS_API_KEY;
const AMADEUS_SEC  = process.env.AMADEUS_API_SECRET;

const HOME_AIRPORTS = [
  { code: 'SAT', city: 'San Antonio', primary: true },
  { code: 'AUS', city: 'Austin' },
  { code: 'IAH', city: 'Houston' },
  { code: 'HOU', city: 'Houston Hobby' },
];

// Flash deal thresholds
const THRESHOLDS = {
  domestic_rt:      150,   // under $150 = flash
  international_rt: 350,   // under $350 intl = flash
  hawaii_rt:        450,   // Hawaii
  discount_pct:     40,    // ≥40% off normal = flash
};

const TIER_LABELS = {
  FLASH: '🔥 FLASH DEAL',
  HOT:   '🌶️ HOT DEAL',
  DEAL:  '✈️ DEAL',
};

// Airport metadata for display
const AIRPORT_META = {
  LAX:{ city:'Los Angeles',     country:'USA',      intl:false },
  JFK:{ city:'New York City',   country:'USA',      intl:false },
  LGA:{ city:'New York City',   country:'USA',      intl:false },
  ORD:{ city:'Chicago',         country:'USA',      intl:false },
  MCO:{ city:'Orlando',         country:'USA',      intl:false },
  MIA:{ city:'Miami',           country:'USA',      intl:false },
  DEN:{ city:'Denver',          country:'USA',      intl:false },
  LAS:{ city:'Las Vegas',       country:'USA',      intl:false },
  SEA:{ city:'Seattle',         country:'USA',      intl:false },
  PDX:{ city:'Portland',        country:'USA',      intl:false },
  MSP:{ city:'Minneapolis',     country:'USA',      intl:false },
  SFO:{ city:'San Francisco',   country:'USA',      intl:false },
  BOS:{ city:'Boston',          country:'USA',      intl:false },
  PHX:{ city:'Phoenix',         country:'USA',      intl:false },
  OGG:{ city:'Maui',            country:'USA',      intl:false },
  HNL:{ city:'Honolulu',        country:'USA',      intl:false },
  KOA:{ city:'Kona Hawaii',     country:'USA',      intl:false },
  SJU:{ city:'San Juan',        country:'Puerto Rico', intl:true },
  NAS:{ city:'Nassau',          country:'Bahamas',  intl:true },
  CUN:{ city:'Cancún',          country:'Mexico',   intl:true },
  GDL:{ city:'Guadalajara',     country:'Mexico',   intl:true },
  CZM:{ city:'Cozumel',         country:'Mexico',   intl:true },
  LIR:{ city:'Liberia',         country:'Costa Rica', intl:true },
  SJO:{ city:'San José',        country:'Costa Rica', intl:true },
  MBJ:{ city:'Montego Bay',     country:'Jamaica',  intl:true },
  AUA:{ city:'Aruba',           country:'Aruba',    intl:true },
  SXM:{ city:'Sint Maarten',    country:'Sint Maarten', intl:true },
};

const DEST_CODES = Object.keys(AIRPORT_META);

async function getAmadeusToken() {
  const res = await fetch('https://test.api.amadeus.com/v1/security/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=client_credentials&client_id=${AMADEUS_KEY}&client_secret=${AMADEUS_SEC}`
  });
  const data = await res.json();
  return data.access_token;
}

async function searchFlights(token, origin, destination) {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 30);
  const dateStr = tomorrow.toISOString().split('T')[0];

  const url = `https://test.api.amadeus.com/v2/shopping/flight-offers?originLocationCode=${origin}&destinationLocationCode=${destination}&departureDate=${dateStr}&adults=1&nonStop=false&max=5&currencyCode=USD`;

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  return await res.json();
}

function scoreDeal(price, dest) {
  const meta = AIRPORT_META[dest] || { intl: false };
  const threshold = meta.intl ? THRESHOLDS.international_rt :
                    ['OGG','HNL','KOA'].includes(dest) ? THRESHOLDS.hawaii_rt :
                    THRESHOLDS.domestic_rt;

  if (price <= threshold * 0.5)  return 'FLASH';
  if (price <= threshold * 0.75) return 'HOT';
  if (price <= threshold)        return 'DEAL';
  return null;
}

export async function runScan() {
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
  const token = await getAmadeusToken();
  
  let dealsFound = 0, newDeals = 0;
  const scanStart = new Date();

  for (const airport of HOME_AIRPORTS) {
    for (const dest of DEST_CODES) {
      if (dest === airport.code) continue;
      
      try {
        const data = await searchFlights(token, airport.code, dest);
        if (!data?.data?.length) continue;

        const cheapest = data.data[0];
        const price = parseFloat(cheapest.price.total);
        const meta = AIRPORT_META[dest];
        const tier = scoreDeal(price * 2, dest); // *2 for RT estimate
        
        if (!tier) continue;
        dealsFound++;

        const rtPrice = price * 2;
        const depDate = cheapest.itineraries[0]?.segments[0]?.departure?.at?.split('T')[0];
        const airline = cheapest.validatingAirlineCodes?.[0] || 'Various';
        const nonstop = cheapest.itineraries[0]?.segments?.length === 1;

        // Check if already in DB
        const { data: existing } = await sb.from('deals')
          .select('id')
          .eq('origin', airport.code)
          .eq('destination', dest)
          .eq('is_active', true)
          .gte('created_at', new Date(Date.now() - 24*60*60*1000).toISOString())
          .limit(1);

        if (existing?.length) {
          // Update last_seen
          await sb.from('deals').update({ last_seen_at: new Date(), price_rt: rtPrice })
            .eq('id', existing[0].id);
          continue;
        }

        // Insert new deal
        const { error } = await sb.from('deals').insert({
          origin: airport.code,
          origin_city: airport.city,
          destination: dest,
          destination_city: meta.city,
          destination_country: meta.country,
          airline,
          price_rt: rtPrice,
          price_normal: null,
          discount_pct: null,
          travel_dates: depDate ? `From ${depDate}` : 'Flexible dates',
          departure_date: depDate,
          nonstop,
          deal_tier: tier,
          is_international: meta.intl,
          booking_url: `https://www.google.com/travel/flights?q=flights+from+${airport.code}+to+${dest}`,
          expires_at: new Date(Date.now() + 48*60*60*1000),
        });

        if (!error) newDeals++;
      } catch (e) {
        console.error(`Error scanning ${airport.code}→${dest}:`, e.message);
      }

      // Rate limit — Amadeus free tier
      await new Promise(r => setTimeout(r, 250));
    }
  }

  // Log scan
  await sb.from('scan_log').insert({
    deals_found: dealsFound,
    new_deals: newDeals,
    status: 'ok',
    notes: `Scanned ${HOME_AIRPORTS.length} origins × ${DEST_CODES.length} destinations`
  });

  console.log(`✅ Scan complete: ${dealsFound} deals found, ${newDeals} new`);
  return { dealsFound, newDeals };
}
