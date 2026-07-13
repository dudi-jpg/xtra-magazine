// הגדרות כלליות של האתר — נקודה אחת לעריכה של שם, סלוגן וקטגוריות.
export const SITE_TITLE = 'xtra';
export const SITE_TAGLINE = 'מגזין התרבות והפנאי של ישראל';
export const SITE_DESCRIPTION =
  'xtra — מגזין התרבות והפנאי של ישראל. קולנוע, מוזיקה, תיאטרון, ספרים, אמנות וחיי לילה: ביקורות, המלצות, ראיונות וכל מה שקורה בסצנה התרבותית.';

// סדר הקטגוריות בתפריט. חייב להתאים לערכים ב-content.config.ts
export const CATEGORIES = ['קולנוע', 'מוזיקה', 'תיאטרון', 'ספרים', 'אמנות', 'חיי לילה'] as const;
export type Category = (typeof CATEGORIES)[number];

// צבע ייעודי לכל מדור (מהלוגו הצבעוני) — משמש לתוויות קטגוריה, פילים וקווים.
export const CATEGORY_COLORS: Record<string, string> = {
  'קולנוע': '#e6197f', // מג'נטה
  'מוזיקה': '#f5921e', // כתום
  'תיאטרון': '#8a2be2', // סגול
  'ספרים': '#12b5c9', // טורקיז
  'אמנות': '#ff5a36', // קורל
  'חיי לילה': '#6d28d9', // סגול עמוק
};
export const catColor = (c: string) => CATEGORY_COLORS[c] || '#e6197f';

// כמה כתבות מציגים בעמוד (ארכיון + עמודי קטגוריה)
export const PAGE_SIZE = 12;
