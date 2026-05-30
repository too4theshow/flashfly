/**
 * FlashFly Live Deal Scanner
 * Uses OpenAI to generate realistic flight deal data based on actual route knowledge
 * Runs every 4 hours — inserts new deals into Supabase
 * 
 * Zero external API key needed beyond OpenAI (which we already have)
 * Upgrade path: swap generateDeals() for Amadeus/Kiwi/Serpapi when ready
 */

import { execSync } from 'child_process';

// ── CONFIG ─────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const OPENAI_KEY   = process.env.OPENAI_API_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY || !OPENAI_KEY) {
  console.error('Missing env vars: SUPABASE_URL, SUPABASE_SERVICE_KEY, OPENAI_API_KEY');
  process.exit(1);
}

const HOME_AIRPORTS = ['SAT','AUS','IAH','HOU'];
const SCAN_TIMESTAMP = new Date().toISOString();

// ── GENERATE DEALS VIA OPENAI ────────────────────────────────────────
async function generateDeals() {
  const today = new Date();
  const month1 = today.toLocaleString('en-US', { month: 'long', year: 'numeric' });
  today.setMonth(today.getMonth() + 1);
  const month2 = today.toLocaleString('en-US', { month: 'long', year: 'numeric' });

  const prompt = `You are a real-time flight deal detection engine. Based on your knowledge of actual airline pricing and routes, generate 30 realistic flash flight deals departing from Texas airports in ${month1} and ${month2}.

Primary airport: SAT (San Antonio) — weight 40% of deals from SAT
Secondary: AUS (Austin) — 30%, IAH (Houston) — 20%, HOU (Houston Hobby) — 10%

Rules:
- Only include routes that ACTUALLY EXIST on these airlines
- Flash deals: genuinely low prices that would qualify as deals (not just normal prices)
- Domestic flash threshold: under $150 RT
- International flash threshold: under $350 RT  
- Hawaii flash threshold: under $450 RT
- Use realistic airlines for each route (Southwest doesn't fly to Mexico; Volaris does)
- Vary travel dates naturally across the 2 months
- Include a mix: nonstop where realistic, 1-stop where more common

Respond with ONLY a JSON object: {"deals": [...array of 30 deals...]}

Each deal: {"origin":"SAT","origin_city":"San Antonio","destination":"CUN","destination_city":"Cancún","destination_country":"Mexico","airline":"United","price_rt":178,"price_normal":440,"discount_pct":60,"travel_dates":"Aug 12 – Aug 19","nonstop":false,"deal_tier":"FLASH","is_international":true,"booking_url":"https://www.google.com/travel/flights?q=flights+from+San+Antonio+to+Cancun"}`;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.6,
      max_tokens: 4000,
      response_format: { type: 'json_object' }
    })
  });

  const data = await res.json();
  if (!res.ok) throw new Error(`OpenAI error: ${JSON.stringify(data)}`);
  
  const content = JSON.parse(data.choices[0].message.content);
  return content.deals || [];
}

// ── SUPABASE HELPERS ─────────────────────────────────────────────────
async function sbQuery(path, method = 'GET', body = null) {
  const opts = {
    method,
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': method === 'POST' ? 'return=minimal' : ''
    }
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, opts);
  if (method === 'GET') return await res.json();
  return res.status;
}

// ── MAIN SCAN ────────────────────────────────────────────────────────
async function runScan() {
  console.log(`\n🛰️  FlashFly Scanner — ${SCAN_TIMESTAMP}`);
  console.log('Generating deals via OpenAI...');

  let deals;
  try {
    deals = await generateDeals();
    console.log(`✅ Generated ${deals.length} deals`);
  } catch (e) {
    console.error('Deal generation failed:', e.message);
    await logScan(0, 0, 'error', e.message);
    return;
  }

  // Mark all current active deals as expired (fresh scan)
  await sbQuery('deals?is_active=eq.true', 'PATCH', {
    is_active: false,
    expires_at: new Date().toISOString()
  });
  console.log('Expired old deals');

  // Insert fresh batch
  let inserted = 0;
  const dealsToInsert = deals.map(d => ({
    ...d,
    is_active: true,
    created_at: new Date().toISOString(),
    last_seen_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString() // 4 hours
  }));

  // Batch insert (Supabase supports array inserts)
  const status = await sbQuery('deals', 'POST', dealsToInsert);
  if (status === 201 || status === 200) {
    inserted = dealsToInsert.length;
    console.log(`✅ Inserted ${inserted} fresh deals`);
  } else {
    console.error('Insert failed, status:', status);
  }

  await logScan(deals.length, inserted, 'ok', `Scan complete — ${inserted} deals live`);
  console.log(`\n✅ Scan done. ${inserted} deals live on FlashFly.`);
  
  return { deals: inserted };
}

async function logScan(found, inserted, status, notes) {
  await sbQuery('scan_log', 'POST', {
    scanned_at: SCAN_TIMESTAMP,
    deals_found: found,
    new_deals: inserted,
    status,
    notes
  });
}

// Run
runScan().catch(console.error);
