// xtra — upcoming culture-events generator (for the floating side banners)
//
// Runs every 3 days (GitHub Actions). Two jobs, per the spec:
//   1) Prune events whose date has already passed.
//   2) Use Claude + real web search to find upcoming Israeli culture events and
//      top the list back up to TARGET, so removed (past) events are replaced.
//
// Data file: src/data/events.json  →  { updated, events: [{title,date,category,venue,city,url}] }
//
// Usage:  ANTHROPIC_API_KEY=... node scripts/generate-events.mjs
// Env:    EVENTS_TARGET (default 8), EVENTS_MODEL (default claude-opus-4-8)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_FILE = path.join(ROOT, 'src/data/events.json');

const MODEL = process.env.EVENTS_MODEL || 'claude-opus-4-8';
const TARGET = parseInt(process.env.EVENTS_TARGET || '8', 10);
const CATEGORIES = ['קולנוע', 'מוזיקה', 'תיאטרון', 'ספרים', 'אמנות', 'חיי לילה'];
const MAX_AHEAD_DAYS = 150; // ignore events further out than ~5 months (likely inaccurate)

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('❌ Missing ANTHROPIC_API_KEY.');
  process.exit(1);
}
const client = new Anthropic();

const todayStr = new Date().toISOString().slice(0, 10);
const isValidDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d || '');
const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);

function loadData() {
  try {
    const j = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    return Array.isArray(j.events) ? j.events : [];
  } catch {
    return [];
  }
}

function normCategory(c) {
  if (CATEGORIES.includes(c)) return c;
  const t = (c || '').toString();
  if (/סרט|קולנוע|פסטיבל.*סרט|סינמט/.test(t)) return 'קולנוע';
  if (/מוזי|הופע|קונצרט|מופע.*מוזי|דיג'יי|ג׳אז|ג'אז/.test(t)) return 'מוזיקה';
  if (/תיאטר|הצג|מחז|בלט|מחול/.test(t)) return 'תיאטרון';
  if (/ספר|סופר|שירה|ספרות/.test(t)) return 'ספרים';
  if (/אמנות|תערוכ|מוזיאון|גלרי/.test(t)) return 'אמנות';
  if (/מסיב|לילה|מועדון|בר\b|קליב/.test(t)) return 'חיי לילה';
  return 'מוזיקה';
}

function extractJsonArray(text) {
  const tryParse = (s) => {
    try {
      const v = JSON.parse(s);
      return Array.isArray(v) ? v : null;
    } catch {
      return null;
    }
  };
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    const v = tryParse(fence[1].trim());
    if (v) return v;
  }
  const first = text.indexOf('[');
  const last = text.lastIndexOf(']');
  if (first !== -1 && last > first) {
    const v = tryParse(text.slice(first, last + 1));
    if (v) return v;
  }
  return [];
}

async function findEvents(need, avoidTitles) {
  const prompt = `היום ${todayStr}. חפש ברשת אירועי תרבות ופנאי **אמיתיים** שיתקיימו **בישראל** בטווח שבין היום לעוד כ-4 חודשים, במגוון הקטגוריות: קולנוע, מוזיקה (הופעות/קונצרטים), תיאטרון (הצגות/מחול), ספרים (אירועי ספרות), אמנות (תערוכות/מוזיאונים), חיי לילה (מסיבות/מועדונים/פסטיבלים).

מצא לפחות ${Math.max(need + 3, 8)} אירועים אמיתיים ומגוונים (עדיף כאלה עם תאריך התחלה ברור). השתמש בחיפוש ברשת כדי לוודא שהם אמיתיים ולמצוא תאריך, מקום וקישור.

אל תכלול אירועים שכבר נמצאים ברשימה הזאת:
${avoidTitles.map((t) => `- ${t}`).join('\n') || '(אין)'}

החזר **אך ורק** מערך JSON (בתוך גדר \`\`\`json) של אובייקטים בפורמט הבא, ללא טקסט נוסף אחריו:
[
  {
    "title": "שם האירוע בעברית",
    "date": "YYYY-MM-DD",           // תאריך התחלה עתידי בלבד
    "category": "אחת מ: קולנוע | מוזיקה | תיאטרון | ספרים | אמנות | חיי לילה",
    "venue": "שם המקום/האולם",
    "city": "עיר",
    "url": "קישור אמיתי לעמוד האירוע/כרטיסים"
  }
]
כללים: רק תאריכים עתידיים (מ-${todayStr} והלאה). עברית נקייה. אם אינך בטוח בתאריך מדויק — אל תכלול את האירוע.`;

  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 8000,
    tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 8 }],
    messages: [{ role: 'user', content: prompt }],
  });
  const text = resp.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
  const searches = resp.content.filter((b) => b.type === 'server_tool_use').length;
  console.log(`  · web searches used: ${searches}`);
  return extractJsonArray(text);
}

function clean(list) {
  const seen = new Set();
  const out = [];
  for (const e of list) {
    if (!e || typeof e !== 'object') continue;
    const title = (e.title || '').toString().trim();
    const date = (e.date || '').toString().trim();
    if (!title || !isValidDate(date)) continue;
    if (date < todayStr) continue; // past → drop
    if (daysBetween(todayStr, date) > MAX_AHEAD_DAYS) continue; // too far out
    const key = title.replace(/\s+/g, ' ').toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      title,
      date,
      category: normCategory(e.category),
      venue: (e.venue || '').toString().trim(),
      city: (e.city || '').toString().trim(),
      url: (e.url || '').toString().trim(),
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

async function main() {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });

  // 1) load + prune past events
  const before = loadData();
  let events = clean(before);
  const removed = before.length - events.length;
  console.log(`Loaded ${before.length} events → ${events.length} still upcoming (removed ${removed} past/invalid).`);

  // 2) top up to TARGET with fresh real events
  const need = TARGET - events.length;
  if (need > 0) {
    console.log(`Need ${need} more → searching the web via Claude…`);
    let found = [];
    try {
      found = await findEvents(need, events.map((e) => e.title));
    } catch (e) {
      console.error(`  ✗ event search failed: ${e.message}`);
    }
    const merged = clean([...events, ...found]);
    events = merged;
    console.log(`  + found ${found.length} candidates → ${events.length} valid after merge/dedupe.`);
  } else {
    console.log('Already at/above target — no search needed.');
  }

  events = events.slice(0, TARGET);

  fs.writeFileSync(
    DATA_FILE,
    JSON.stringify({ updated: todayStr, events }, null, 2) + '\n',
    'utf8'
  );
  console.log(`\n✅ Wrote ${events.length} upcoming events to src/data/events.json`);
  events.forEach((e) => console.log(`   ${e.date}  [${e.category}]  ${e.title} — ${e.venue}, ${e.city}`));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
