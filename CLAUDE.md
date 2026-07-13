# xtra — Project Guide (for Claude)

Hebrew (RTL) **culture & leisure** magazine — "מגזין התרבות והפנאי של ישראל". Static Astro 5 site, built by cloning the Auto Times / The Market engine and rebranding.

## Stack & hosting
- Astro 5, content collections, fonts Rubik (headings) + Assistant (body).
- Articles = Markdown in `src/content/articles/`. Images in `src/assets/media/`.
- Deploy: GitHub (account dudi@adgpt.com / **dudi-jpg**, SSH) → Cloudflare. Build `npm run build`, output `dist`.

## Brand
- Logo: colorful "XTRA ישראל" wordmark (`src/components/Logo.astro` → `src/assets/logo.jpg`, user-supplied, auto-trimmed).
- **Multi-color palette** (from logo): magenta `--accent #e6197f` primary + near-black `--ink #17161d` + white. Each category has its own color via `CATEGORY_COLORS` / `catColor()` in `src/consts.ts`, applied through the `--cat` CSS var (set inline per element/section; defaults to `--accent`).
  - קולנוע `#e6197f` · מוזיקה `#f5921e` · תיאטרון `#8a2be2` · ספרים `#12b5c9` · אמנות `#ff5a36` · חיי לילה `#6d28d9`
- Sticky nav has a gradient underline (`--grad`). No finance widgets (removed the TradingView/ticker components inherited from The Market).
- Categories: קולנוע · מוזיקה · תיאטרון · ספרים · אמנות · חיי לילה (edit in `src/consts.ts` + enum in `src/content.config.ts`).

## Commands
- `npm run dev` → http://localhost:4321 · `npm run build` / `npm run preview`

## Daily automation (6 articles/day, CLOUD only)
- `scripts/generate-daily.mjs` — Anthropic API (`claude-opus-4-8`, adaptive thinking, structured outputs) → pro Hebrew culture articles (SEO+GEO: focus keyword, meta, TL;DR, a data/ranking table, FAQ). Images from Wikimedia Commons (relevance-matched), generic per-category fallbacks. Prefers well-known entities (directors, artists, festivals, museums) so real images resolve.
- GitHub Actions cron `.github/workflows/daily-articles.yml` (05:00 UTC ≈ 08:00 Israel). Needs repo secret **ANTHROPIC_API_KEY**. Commits as "xtra Bot". Manual: `ANTHROPIC_API_KEY=... ARTICLES_PER_RUN=n npm run generate:daily`.
- SEO/GEO: sitemap, robots.txt (allows AI crawlers), /rss.xml, JSON-LD (NewsArticle+FAQPage+Breadcrumb+Organization+WebSite).

## Conventions
- Hebrew, RTL. Address the user in Hebrew masculine. Article images always render 16:9 (`height:auto` + `aspect-ratio`).
- Clean Hebrew rule in the generator prompt: never fuse Latin letters into a Hebrew word; foreign names in Hebrew transliteration.
