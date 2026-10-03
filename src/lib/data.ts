export type Surah = {
  n: number;
  ar: string; // Arabic name
  tr: string; // transliteration (simple)
  tc: string; // transliteration with diacritics
  en: string; // English meaning (quran.com)
  ct?: string; // English meaning as The Clear Quran translates the name
  place: "makkah" | "madinah";
  count: number;
  order: number;
  bism: boolean;
};

/** Quraan Made Easy segments: 0 = bold smooth-reading text, 1 = context */
export type Segment = [0 | 1, string];

export type Verse = {
  n: number;
  a: string[]; // Uthmani words
  m: string[]; // word meanings
  t: string[]; // word transliterations
  q: Segment[] | null; // Quraan Made Easy, checked against the print (null = missing in the source)
  s: string; // Saheeh International
  c: string; // The Clear Quran
  o: -2 | -1 | 0 | 1 | 2; // tone: warning … glad tidings
  j: number; // juz
  h?: string; // Clear Quran theme heading that starts here
  sj?: 1; // sajdah (the 14 places of the Indo-Pak mushaf)
  sw?: number; // the word the Madani mushaf sets the sajdah sign ۩ on (15 places: 22:77 too)
  g?: number[]; // indices of words the mushaf writes joined to the next (no space)
  ip?: string[]; // the same words in the Indo-Pak script
  qg?: 1; // Quraan Made Easy lost here (a damaged page in every copy)
};

export type SummaryBlock = { type: "p"; text: string } | { type: "ul" | "ol"; items: string[] };
export type SummarySection = { kind: string; title: string; blocks: SummaryBlock[] };

let summariesPromise: Promise<Record<string, SummarySection[]>> | null = null;
export function loadSummaries() {
  summariesPromise ??= fetch(`${import.meta.env.BASE_URL}data/summaries.json`).then((r) => r.json());
  summariesPromise.catch(() => (summariesPromise = null));
  return summariesPromise;
}

/** Arabic of a verse as printed: words joined where the mushaf joins them. */
export function arabicText(v: Verse, script: "uthmani" | "indopak" = "uthmani") {
  if (script === "indopak" && v.ip && v.ip.length === v.a.length) return v.ip.join(" ");
  return v.a.map((w, i) => w + (i === v.a.length - 1 || v.g?.includes(i) ? "" : " ")).join("");
}

export type SurahData = { n: number; v: Verse[]; themes: (string | null)[] };

export type Translation = "qme" | "saheeh" | "clear";
export const TRANSLATIONS: Record<Translation, { name: string; short: string; by: string }> = {
  qme: { name: "Quraan Made Easy", short: "QME", by: "Zamzam Publishers" },
  saheeh: { name: "Saheeh International", short: "SAHEEH", by: "Saheeh International" },
  clear: { name: "The Clear Quran", short: "CLEAR", by: "Dr. Mustafa Khattab" },
};

let surahsPromise: Promise<{ surahs: Surah[]; juz: Record<string, string> }> | null = null;
export function loadIndex() {
  surahsPromise ??= fetch(`${import.meta.env.BASE_URL}data/surahs.json`).then((r) => r.json());
  return surahsPromise;
}

const cache = new Map<number, Promise<SurahData>>();
export function loadSurah(n: number): Promise<SurahData> {
  let p = cache.get(n);
  if (!p) {
    p = fetch(`${import.meta.env.BASE_URL}data/s/${n}.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`Surah ${n} failed to load (${r.status})`);
        return r.json();
      })
      .then((d: { n: number; v: Verse[] }) => {
        // carry each theme heading forward so every ayah knows its theme
        let cur: string | null = null;
        const full = fullHeadings(d.v);
        const themes = d.v.map((v, i) => (cur = full[i] ?? cur));
        return { ...d, themes };
      });
    p.catch(() => cache.delete(n));
    cache.set(n, p);
  }
  return p;
}

/**
 * The Clear Quran numbers the parts of a list of themes and names the list only at its first
 * part ("Qualities of the Righteous: 1) Humility", then "2) Sincere Devotion"): a part that starts
 * with its number alone takes the list's name from the last numbered heading of the surah (a list
 * whose first part is bare, as in 56:11 "1) The Foremost", is named by the heading before it:
 * "The Three Groups on Judgment Day").
 */
export function fullHeadings(vs: { h?: string }[]): (string | null)[] {
  let lead: string | null = null;
  let prev: string | null = null;
  const named = (s: string) => (/:$/.test(s) ? s : `${s}:`);
  return vs.map((v) => {
    const h = v.h;
    if (!h) return null;
    if (/^\d+\)/.test(h)) {
      if (/^1\)/.test(h) && prev && !/\d+\)/.test(prev)) lead = named(prev);
      return lead ? `${lead} ${h}` : h;
    }
    prev = h;
    const m = h.match(/^(.*?\S)\s*\d+\)/);
    if (m) lead = named(m[1]);
    return h;
  });
}

let searchPromise: Promise<[string, string, string, string][]> | null = null;
export function loadSearchIndex() {
  searchPromise ??= fetch(`${import.meta.env.BASE_URL}data/search.json`).then((r) => r.json());
  return searchPromise;
}

const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";
export const toArabicDigits = (n: number | string) =>
  String(n).replace(/\d/g, (d) => AR_DIGITS[+d]);
export const fromArabicDigits = (s: string) =>
  s.replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d))).replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));

export const pad3 = (n: number) => String(n).padStart(3, "0");

/** Plain translation text for a verse, honouring the context toggle. */
export function translationText(v: Verse, t: Translation, withContext = true): string {
  if (t === "saheeh" || (t === "qme" && !v.q)) return v.s;
  if (t === "clear") return v.c;
  return spellHonorifics(joinSegments(v.q!.filter(([k]) => withContext || k === 0).map(([, s]) => s)));
}

/**
 * The honorifics are stored as Unicode ligatures; ﷺ is drawn by most fonts,
 * the rest are written out for text leaving the site (copy, share).
 */
const HONORIFIC_TEXT: Record<string, string> = {
  "﵊": "عليه الصلاة والسلام",
  "﵁": "رضي الله تعالى عنه",
  "﵂": "رضي الله تعالى عنها",
  "﵃": "رضي الله تعالى عنهم",
};
export function spellHonorifics(text: string) {
  return text.replace(/[﵊﵁﵂﵃]/g, (c) => HONORIFIC_TEXT[c]);
}

/** Join segments with spaces, but not before punctuation. */
export function joinSegments(parts: string[]) {
  let out = "";
  for (const p of parts) {
    if (!out) out = p;
    else if (/^[,.;:!?’”)]/.test(p)) out += p;
    else out += " " + p;
  }
  return out;
}
