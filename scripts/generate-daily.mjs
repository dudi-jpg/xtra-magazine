// xtra — daily article generator
// Generates N professional Hebrew culture-&-leisure magazine articles (SEO + GEO optimized),
// fetches real images from Wikimedia Commons, and writes them as Markdown.
//
// Usage:  ANTHROPIC_API_KEY=... node scripts/generate-daily.mjs
// Env:    ARTICLES_PER_RUN (default 6), ARTICLE_MODEL (default claude-opus-4-8)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const ARTICLES_DIR = path.join(ROOT, 'src/content/articles');
const IMG_DIR = path.join(ROOT, 'src/assets/media');

const MODEL = process.env.ARTICLE_MODEL || 'claude-opus-4-8';
const COUNT = parseInt(process.env.ARTICLES_PER_RUN || '6', 10);
const UA = 'xtra/1.0 (info@xtra.co.il)';

const CATEGORIES = ['קולנוע', 'מוזיקה', 'תיאטרון', 'ספרים', 'אמנות', 'חיי לילה'];
const AUTHORS = ['נועה שלו', 'איתי רוזן', 'מאיה גולן', 'תומר אבידן', 'ליאת בן-חיים', 'מערכת xtra'];

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('❌ Missing ANTHROPIC_API_KEY. Set it in the environment / GitHub secret.');
  process.exit(1);
}
const client = new Anthropic();

// ---------- helpers ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function slugify(s) {
  return (
    (s || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'article'
  );
}

function existingTitles() {
  if (!fs.existsSync(ARTICLES_DIR)) return [];
  const titles = [];
  for (const f of fs.readdirSync(ARTICLES_DIR)) {
    if (!f.endsWith('.md')) continue;
    const txt = fs.readFileSync(path.join(ARTICLES_DIR, f), 'utf8');
    const m = txt.match(/^title:\s*'?(.+?)'?\s*$/m);
    if (m) titles.push(m[1].replace(/''/g, "'"));
  }
  return titles;
}

function uniqueSlug(base) {
  let slug = base;
  let n = 2;
  while (fs.existsSync(path.join(ARTICLES_DIR, `${slug}.md`))) {
    slug = `${base}-${n++}`;
  }
  return slug;
}

const yq = (s) => `'${String(s ?? '').replace(/\r?\n/g, ' ').replace(/'/g, "''").trim()}'`;

// ---------- Wikimedia Commons image fetch ----------
// significant english tokens (brand/model words) from a query, for relevance matching
function sigTokens(query) {
  const stop = new Set(['the', 'and', 'new', 'with', 'for', 'film', 'movie', 'music', 'concert', 'stage', 'book', 'art', 'israeli', 'israel']);
  return (query.toLowerCase().match(/[a-z0-9]{3,}/g) || []).filter((w) => !stop.has(w));
}

// matchTokens: if provided, the Commons file title must contain at least one — keeps a
// "Toyota Corolla" query from returning an unrelated car.
async function fetchImage(query, destPath, matchTokens = null) {
  const api =
    'https://commons.wikimedia.org/w/api.php?' +
    new URLSearchParams({
      action: 'query',
      format: 'json',
      generator: 'search',
      gsrsearch: `filetype:bitmap ${query}`,
      gsrnamespace: '6',
      gsrlimit: '20',
      prop: 'imageinfo',
      iiprop: 'url|size|mime',
      iiurlwidth: '1600',
    });
  try {
    const res = await fetch(api, { headers: { 'User-Agent': UA } });
    const data = await res.json();
    const pages = Object.values(data?.query?.pages || {}).sort(
      (a, b) => (a.index ?? 999) - (b.index ?? 999)
    );
    for (const p of pages) {
      const ii = p.imageinfo?.[0];
      if (!ii) continue;
      if (!['image/jpeg', 'image/png'].includes(ii.mime)) continue;
      if ((ii.width || 0) < 1000 || (ii.width || 0) <= (ii.height || 1)) continue; // landscape, decent
      if (matchTokens && matchTokens.length) {
        const title = (p.title || '').toLowerCase();
        if (!matchTokens.some((t) => title.includes(t))) continue; // relevance gate
      }
      const url = ii.thumburl || ii.url;
      const imgRes = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!imgRes.ok) continue;
      const buf = Buffer.from(await imgRes.arrayBuffer());
      if (buf.length < 8000) continue;
      fs.writeFileSync(destPath, buf);
      return true;
    }
  } catch (e) {
    console.warn(`  ! image fetch failed for "${query}": ${e.message}`);
  }
  return false;
}

// generic fallback queries per category (when a specific entity isn't on Commons)
const FALLBACK_QUERIES = {
  'קולנוע': ['cinema movie theater', 'film festival red carpet', 'movie projector cinema'],
  'מוזיקה': ['concert stage lights crowd', 'live music performance', 'recording studio microphone'],
  'תיאטרון': ['theatre stage performance', 'theater auditorium seats', 'stage curtain spotlight'],
  'ספרים': ['bookshop books shelves', 'library reading books', 'open book literature'],
  'אמנות': ['art gallery exhibition', 'museum paintings', 'contemporary art installation'],
  'חיי לילה': ['nightclub dj lights', 'bar cocktails night', 'city nightlife neon'],
};
const POOL_DIR = path.join(ROOT, 'src/assets/covers/pool'); // optional; skipped if absent
const POOL_THEMES = {};

// resolve a cover: exact model (brand-matched) → brand only → generic → local pool
async function resolveCover(query, category, dest) {
  const tokens = sigTokens(query);
  // 1) exact query, require the file to actually reference the model/brand
  if (tokens.length && (await fetchImage(query, dest, tokens))) return true;
  // 2) brand only (first 1-2 significant tokens), still relevance-gated
  if (tokens.length) {
    const brand = tokens.slice(0, 2).join(' ');
    if (await fetchImage(brand, dest, tokens.slice(0, 2))) return true;
  }
  // 3) generic category queries (no relevance gate — themed but not model-specific)
  for (const q of FALLBACK_QUERIES[category] || []) {
    if (await fetchImage(q, dest)) return true;
  }
  // last resort: copy a themed image from the existing pool
  try {
    const themes = POOL_THEMES[category] || [];
    const pool = fs.existsSync(POOL_DIR)
      ? fs.readdirSync(POOL_DIR).filter((f) => f.endsWith('.jpg') && themes.some((t) => f.startsWith(t + '-')))
      : [];
    if (pool.length) {
      const pick = pool[Math.floor(Math.random() * pool.length)];
      fs.copyFileSync(path.join(POOL_DIR, pick), dest);
      return true;
    }
  } catch { /* ignore */ }
  return false;
}

// ---------- article generation ----------
const ARTICLE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'title', 'metaDescription', 'focusKeyword', 'keywords', 'excerpt',
    'keyTakeaways', 'bodyMarkdown', 'faq', 'coverImageQuery', 'coverAlt', 'slugHint', 'author',
  ],
  properties: {
    title: { type: 'string', description: 'כותרת עד 60 תווים, כוללת את מילת המפתח' },
    metaDescription: { type: 'string', description: 'תיאור מטא עד 155 תווים' },
    focusKeyword: { type: 'string' },
    keywords: { type: 'array', items: { type: 'string' } },
    excerpt: { type: 'string', description: 'תקציר קצר של משפט-שניים' },
    keyTakeaways: { type: 'array', items: { type: 'string' } },
    bodyMarkdown: {
      type: 'string',
      description:
        'גוף הכתבה ב-Markdown: כותרות ## ו-###, טבלה אחת בפורמט Markdown (למשל דירוג/השוואה/לוח הופעות), רשימות, הדגשות. שבץ 1-2 מצייני תמונה בשורה נפרדת בפורמט [IMAGE: english search query].',
    },
    faq: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['question', 'answer'],
        properties: { question: { type: 'string' }, answer: { type: 'string' } },
      },
    },
    coverImageQuery: { type: 'string', description: 'ביטוי חיפוש באנגלית לתמונת נושא אמיתית. העדף ישות מוכרת בשם לועזי (למשל "Berlin Film Festival", "Habima Theatre", "Tel Aviv Museum of Art", "Radiohead concert") או סצנה כללית רלוונטית ("cinema audience", "concert stage lights", "art gallery exhibition"). הימנע משמות בעברית — הם לא יימצאו.' },
    coverAlt: { type: 'string', description: 'תיאור תמונת הנושא בעברית' },
    slugHint: { type: 'string', description: 'סלאג באנגלית, מילים מופרדות במקף' },
    author: { type: 'string' },
  },
};

const SYSTEM = `אתה עורך וכתב תרבות ופנאי בכיר ומקצועי במגזין "xtra" — מגזין התרבות והפנאי של ישראל (קולנוע, מוזיקה, תיאטרון, ספרים, אמנות וחיי לילה). אתה כותב עברית עיתונאית עשירה, חדה, סקרנית וקולחת, בסגנון מוסף תרבות איכותי.

עקרונות כתיבה:
- כתוב בעברית תקנית, עשירה וזורמת, בטון תרבותי-עיתונאי (ביקורתי, מסקרן, לא יבש). אל תמציא עובדות ספציפיות כוודאיות (תאריכי בכורה מדויקים, מספרי צפיות, ציטוטים מפי אנשים) — נסח כמגמות, הקשר או הערכה ("בשנים האחרונות", "נחשב לאחד מ...", "רבים רואים בו").
- **עברית נקייה בכל הטקסט (קריטי):** כתוב כל מילה עברית באותיות עבריות בלבד. **לעולם אל תמזג אותיות לטיניות בתוך מילה עברית**. בכותרות ובכותרות המשנה אל תשלב מילים באנגלית כלל. שמות יצירות/אמנים לועזיים — כתוב בתעתיק עברי (למשל "כריסטופר נולאן", "בילי אייליש", "הביטלס"), ואפשר להוסיף את השם הלועזי בסוגריים פעם אחת בגוף הטקסט אם חשוב לזיהוי.
- הכותרת קצרה, חדה ומזמינה, בסגנון כותרת תרבות. בדוק שהיא נקראת חלק בעברית.
- מבנה: פסקת פתיחה (לִיד) מסקרנת שמעמידה את הנושא, ואז כותרות משנה (##) הגיוניות, לעיתים ### תת-כותרות.
- העדף להזכיר ישויות מוכרות (במאים, אמנים, להקות, פסטיבלים כמו פסטיבל הקולנוע בקאן/ברלין, מוסדות כמו תיאטרון הבימה, מוזיאון תל אביב לאמנות, סינמטק) — כדי שניתן יהיה למצוא תמונות אמיתיות ולחזק את האמינות.

SEO best practices:
- הכותרת עד ~60 תווים וכוללת את מילת המפתח המרכזית.
- תיאור המטא עד ~155 תווים וכולל את מילת המפתח.
- שלב את מילת המפתח בפסקה הראשונה ובכותרת משנה אחת לפחות, בטבעיות.
- כותרות סמנטיות, רשימות, הדגשות.
- כלול **טבלה אחת** בפורמט Markdown (| עמודה | עמודה |) הרלוונטית לנושא (למשל דירוג סרטים/אלבומים, השוואת יצירות, לוח הופעות/מופעים, "איפה ומתי").

GEO best practices (אופטימיזציה למנועי תשובות/AI):
- פסקת פתיחה שעונה תשובה ישירה וברורה בתוך 1-3 משפטים.
- 3-5 נקודות "בקצרה" (keyTakeaways) — קצרות וברורות.
- כותרות משנה מנוסחות כשאלות טבעיות כשמתאים.
- מקטע FAQ עם 3-5 שאלות ותשובות תמציתיות ומדויקות.
- הזכר ישויות מפורשות (יוצרים, יצירות, מוסדות, פסטיבלים).

שבץ 1-2 מצייני תמונה בגוף הכתבה, כל אחד בשורה נפרדת: [IMAGE: english search query] (למשל [IMAGE: Cannes Film Festival red carpet]).
אורך הכתבה: כ-700-1000 מילים.`;

async function generateArticle(category, avoidTitles) {
  const prompt = `כתוב כתבה חדשה ומקורית בקטגוריית "${category}" למגזין התרבות והפנאי xtra.
בחר נושא ספציפי, מסקרן ורלוונטי לקהל הישראלי — למשל ביקורת או המלצה על סרט/סדרה/אלבום/ספר/הצגה/תערוכה, פרופיל של יוצר או אמן, מגמה תרבותית, מדריך ("5 ההצגות שחובה לראות", "המלצות סוף שבוע"), או כתבת רקע על פסטיבל/מקום בילוי. התאם את הנושא לקטגוריה "${category}".
אל תחזור על אף אחת מהכותרות הקיימות הבאות:
${avoidTitles.slice(0, 40).map((t) => `- ${t}`).join('\n')}

החזר אך ורק JSON התואם לסכימה.`;

  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    system: SYSTEM,
    output_config: { format: { type: 'json_schema', schema: ARTICLE_SCHEMA } },
    messages: [{ role: 'user', content: prompt }],
  });
  const textBlock = resp.content.find((b) => b.type === 'text');
  if (!textBlock) throw new Error('no text block in response');
  return JSON.parse(textBlock.text);
}

// ---------- main ----------
async function main() {
  fs.mkdirSync(ARTICLES_DIR, { recursive: true });
  fs.mkdirSync(IMG_DIR, { recursive: true });

  const avoid = existingTitles();
  const today = new Date().toISOString().slice(0, 10);
  let written = 0;

  for (let i = 0; i < COUNT; i++) {
    const category = CATEGORIES[i % CATEGORIES.length];
    console.log(`\n[${i + 1}/${COUNT}] generating — ${category} …`);
    let a;
    try {
      a = await generateArticle(category, avoid);
    } catch (e) {
      console.error(`  ✗ generation failed: ${e.message}`);
      continue;
    }
    avoid.push(a.title);

    const slug = uniqueSlug(`${today}-${slugify(a.slugHint || a.title)}`);
    const author = a.author && AUTHORS.includes(a.author) ? a.author : AUTHORS[i % AUTHORS.length];

    // cover image (specific → generic → local pool fallback, so every article has one)
    let coverRel = '';
    const coverFile = path.join(IMG_DIR, `${slug}-cover.jpg`);
    if (await resolveCover(a.coverImageQuery || a.title, category, coverFile)) {
      coverRel = `../../assets/media/${slug}-cover.jpg`;
      console.log(`  ✓ cover ready`);
    } else {
      console.warn('  ! no cover image found');
    }

    // inline images: replace [IMAGE: query] placeholders
    let body = a.bodyMarkdown || '';
    const placeholders = [...body.matchAll(/\[IMAGE:\s*([^\]]+)\]/gi)];
    let idx = 0;
    for (const ph of placeholders) {
      idx++;
      const q = ph[1].trim();
      const file = path.join(IMG_DIR, `${slug}-${idx}.jpg`);
      let replacement = '';
      if (await fetchImage(q, file, sigTokens(q))) {
        replacement = `![${q}](../../assets/media/${slug}-${idx}.jpg)`;
        console.log(`  ✓ inline image: ${q}`);
      }
      body = body.replace(ph[0], replacement);
    }
    body = body.replace(/\n{3,}/g, '\n\n').trim();

    // frontmatter
    const fm = [
      '---',
      `title: ${yq(a.title)}`,
      `description: ${yq(a.metaDescription || a.excerpt)}`,
      `category: ${yq(category)}`,
      `author: ${yq(author)}`,
      `pubDate: ${today}`,
      coverRel ? `cover: ${yq(coverRel)}` : null,
      coverRel ? `coverAlt: ${yq(a.coverAlt || a.title)}` : null,
      'featured: false',
      `focusKeyword: ${yq(a.focusKeyword)}`,
      'keywords:',
      ...(a.keywords || []).slice(0, 12).map((k) => `  - ${yq(k)}`),
      'keyTakeaways:',
      ...(a.keyTakeaways || []).slice(0, 6).map((k) => `  - ${yq(k)}`),
      'faq:',
      ...(a.faq || []).slice(0, 6).flatMap((f) => [`  - question: ${yq(f.question)}`, `    answer: ${yq(f.answer)}`]),
      '---',
      '',
    ]
      .filter((l) => l !== null)
      .join('\n');

    fs.writeFileSync(path.join(ARTICLES_DIR, `${slug}.md`), fm + body + '\n', 'utf8');
    console.log(`  ✓ wrote ${slug}.md`);
    written++;
    await sleep(500);
  }

  console.log(`\n✅ Done. Wrote ${written}/${COUNT} articles for ${today}.`);
  if (written === 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
