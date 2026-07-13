# xtra — מגזין התרבות והפנאי של ישראל

אתר תוכן סטטי (RTL) בנוי ב-[Astro](https://astro.build). כתבות נכתבות כקבצי Markdown, והאתר מתארח על Cloudflare. מדורים: קולנוע · מוזיקה · תיאטרון · ספרים · אמנות · חיי לילה.

## הרצה מקומית

```bash
npm install      # פעם אחת
npm run dev      # שרת פיתוח: http://localhost:4321
npm run build    # בונה את האתר לתיקיית dist/
npm run preview  # תצוגה מקדימה של הבנייה
```

## איך מוסיפים כתבה חדשה

1. צור קובץ חדש בתיקייה `src/content/articles/`, למשל `my-article.md`
   (שם הקובץ הופך לכתובת: `/articles/my-article/`).
2. בראש הקובץ הוסף בלוק frontmatter כזה:

```markdown
---
title: 'כותרת הכתבה'
description: 'תקציר קצר שמופיע בכרטיס ובתוצאות החיפוש'
category: 'קולנוע'   # אחת מ: קולנוע | מוזיקה | תיאטרון | ספרים | אמנות | חיי לילה
author: 'שם הכותב'
pubDate: 2026-07-13      # תאריך בפורמט YYYY-MM-DD
cover: '../../assets/media/my-image.jpg'   # אופציונלי
coverAlt: 'תיאור התמונה'
featured: false          # true = הכתבה תופיע ככתבה מרכזית בעמוד הבית
---

גוף הכתבה כאן, ב-Markdown רגיל. אפשר כותרות (## ), רשימות, ציטוטים, טבלאות ותמונות.
```

3. שים תמונת נושא בתיקייה `src/assets/media/` והפנה אליה בשדה `cover`.
4. עשה commit ו-push ל-GitHub — Cloudflare יבנה ויפרסם אוטומטית.

## אוטומציה יומית (ענן)

`scripts/generate-daily.mjs` מייצר כתבות תרבות מקצועיות (Anthropic API, SEO+GEO מלא). רץ אוטומטית דרך GitHub Actions (`.github/workflows/daily-articles.yml`, 6 כתבות/יום, 05:00 UTC). דורש את ה-secret `ANTHROPIC_API_KEY`. הרצה ידנית: `ANTHROPIC_API_KEY=... ARTICLES_PER_RUN=n npm run generate:daily`.

## מבנה הפרויקט

```
src/
├── consts.ts            שם האתר, סלוגן, קטגוריות וצבעי המדורים (עריכה מרכזית)
├── content.config.ts    הגדרת שדות הכתבה (schema)
├── content/articles/    ← כאן כותבים כתבות (קבצי .md)
├── assets/media/        תמונות לכתבות
├── components/          Header, Footer, ArticleCard, Logo
├── layouts/             תבנית הבסיס (SEO, RTL)
├── pages/               index (בית), articles/[slug], category/[category], archive, about
└── styles/global.css    עיצוב ומשתני צבע
```

## צבע לכל מדור

לכל קטגוריה צבע משלה מתוך הלוגו — מוגדר ב-`CATEGORY_COLORS` בקובץ `src/consts.ts` ומיושם דרך משתנה ה-CSS `--cat`.

## שינוי קטגוריות

ערוך את `CATEGORIES` בקובץ `src/consts.ts`, את מפת `CATEGORY_COLORS`, וגם את רשימת ה-`enum` ב-`src/content.config.ts` — הרשימות חייבות להיות זהות.

## פריסה

- **Build command:** `npm run build`
- **Output directory:** `dist`
- מתארח על Cloudflare, מחובר ל-GitHub (push לענף הראשי = פרסום אוטומטי).
