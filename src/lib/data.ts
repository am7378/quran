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
        const themes = d.v.map((_, i) => (cur = full[i] ?? cur));
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

/** Plain translation text for a verse, honouring the context toggle (the same text the page shows). */
export function translationText(v: Verse, t: Translation, withContext = true): string {
  if (t === "saheeh" || (t === "qme" && !v.q)) return v.s;
  if (t === "clear") return v.c;
  if (withContext) return spellHonorifics(joinSegments(v.q!.map(([, s]) => s)));
  return spellHonorifics(
    shownPieces(qmePieces(v.q!).pieces, false)
      .map((p) => (p.pre ?? "") + p.text)
      .join(""),
  ).trim();
}

/**
 * Quraan Made Easy's text in pieces, each with its offset in the whole (highlights are kept as
 * offsets): kind 0 the reading, 1 the bracketed context (shown or hidden), 2 the sentence's own
 * punctuation or word that the book prints against a bracket, always shown. The pieces always add
 * up to the book's text exactly; nothing in it is changed, only told apart.
 */
// (pre: a space shown before the piece that is not the book's, where the context hidden leaves two
// sentences touching: "…yourselves. This", from the printed "…yourselves (…). .This")
export type Piece = { text: string; start: number; kind: 0 | 1 | 2; pre?: string };

export function qmePieces(q: [number, string][]): { canon: string; pieces: Piece[] } {
  let canon = "";
  const pieces: Piece[] = [];
  for (let i = 0; i < q.length; i++) {
    const [kind, seg] = q[i];
    const sep = canon === "" || /^[,.;:!?’”)]/.test(seg) ? "" : " ";
    const text = sep + seg;
    let at = canon.length;
    const add = (t: string, k: 0 | 1 | 2) => {
      if (!t) return;
      pieces.push({ text: t, start: at, kind: k });
      at += t.length;
    };
    const next = q[i + 1];
    const u = kind === 0 && next && next[0] === 1 ? unclosed(text) : -1;
    if (kind === 1) {
      const { head, body, tail } = splitContext(seg);
      if (head) {
        add(sep + head, 2);
        add(body, 1);
      } else add(sep + body, 1);
      add(tail, 2);
    } else if (u >= 0) {
      // a bracket the printing opened at the end of the reading: the context's. A stray one before
      // the context's own ("…the Aakhirah( (hereafter…)") goes with it, the punctuation after it
      // stays ("see(!" is "see!"); one the context closes ("from You (to" … "Prophethood).") is the
      // start of the context. (With the space before it, so nothing is left hanging.)
      const cut = text.slice(0, u).search(/\s*$/);
      const frag = text.slice(cut);
      const stray = /^\s*\(\s*[.,;:!?…]*$/.test(frag) && next[1].trimStart().startsWith("(");
      const runsOn = !next[1].includes("(") && next[1].includes(")");
      if (stray) {
        const m = /^(\s*\(\s*)(.*)$/.exec(frag)!;
        add(text.slice(0, cut), 0);
        add(m[1], 1);
        add(m[2], 2);
      } else if (runsOn) {
        add(text.slice(0, cut), 0);
        add(frag, 1);
      } else add(text, 0);
    } else add(text, kind as 0 | 1);
    canon += text;
  }
  return { canon, pieces };
}

/** Where a bracket opened in a piece is left unclosed, or -1. */
function unclosed(t: string) {
  let depth = 0, first = -1;
  for (let i = 0; i < t.length; i++) {
    if (t[i] === "(") {
      if (!depth) first = i;
      depth++;
    } else if (t[i] === ")" && depth) depth--;
  }
  return depth ? first : -1;
}

/**
 * A piece of the context as printed carries, besides the bracketed words, the sentence's own
 * punctuation that the printer set against them: "…for them (ensures their purity…)." The full stop
 * is the sentence's, not the bracket's; an opening quote or an ellipsis can stand before the bracket,
 * a word or an honorific after it. Split: `body` the bracketed words (shown or hidden with the
 * context), `head` and `tail` the sentence's (always shown). A bracket opened in the piece before
 * (the printing's slip) closes here: the words up to it are the body.
 */
export function splitContext(seg: string): { head: string; body: string; tail: string } {
  const open = seg.search(/[([]/);
  const close = Math.max(seg.lastIndexOf(")"), seg.lastIndexOf("]"));
  if (open < 0 && close >= 0) return { head: "", body: seg.slice(0, close + 1), tail: seg.slice(close + 1) };
  if (open < 0 || close < open) return { head: "", body: seg, tail: "" };
  return { head: seg.slice(0, open), body: seg.slice(open, close + 1), tail: seg.slice(close + 1) };
}

/**
 * The pieces as shown. With the context on, all of them. Off: the bracketed words go and the
 * sentence's own punctuation stays where the sentence needs it: "This is purer for them." (not
 * "…for them Allaah is…"); once, not twice ("oppressors. (transgressors)." is "oppressors.", not
 * "oppressors.."); an opening quote close against the words after it. Each piece keeps its offsets.
 */
export function shownPieces(pieces: Piece[], showCtx: boolean): Piece[] {
  if (showCtx) return pieces;
  const out: Piece[] = [];
  let shown = "";
  let glue = false; // an opening quote kept before bracketed words that went: the next words close to it
  let hid = false; // bracketed words went since the last of the reading shown
  for (let i = 0; i < pieces.length; i++) {
    const p = pieces[i];
    if (p.kind === 1) {
      hid = true;
      continue;
    }
    let t = p.text, start = p.start;
    const trim = (re: RegExp) => {
      const m = re.exec(t);
      if (!m || !m[0]) return;
      start += m[0].length;
      t = t.slice(m[0].length);
    };
    const ended = /[.,;:!?…]["”’']*\s*$/.test(shown);
    if (p.kind === 2 && i > 0 && pieces[i - 1].kind === 1) {
      // after bracketed words that went: punctuation straight after the words before it, not doubled,
      // and none at all before the ayah's first words
      if (/^\s*[.,;:!?…"”’']/.test(t)) trim(/^\s+/);
      if (ended || !shown) trim(/^[.,;:!?…]+/);
      if (t === "..") t = "."; // (a stop printed twice)
    }
    let pre: string | undefined;
    if (p.kind === 0 && hid && /^[.,;:!?]+\S/.test(t)) {
      // the next sentence printed against its stop (".This"): the stop once, then a space
      if (ended || !shown) trim(/^[.,;:!?]+/);
      else {
        const stop = /^[.,;:!?]+/.exec(t)![0];
        out.push({ text: stop, start, kind: 0 });
        shown += stop;
        start += stop.length;
        t = t.slice(stop.length);
      }
      if (shown) pre = " ";
    }
    if (p.kind === 0) hid = false;
    if (glue || !shown) trim(/^\s+/);
    glue = p.kind === 2 && i + 1 < pieces.length && pieces[i + 1].kind === 1 && (i === 0 || pieces[i - 1].kind !== 1) && /[“‘'"]\s*$/.test(t);
    if (!t) continue;
    out.push(pre ? { text: t, start, kind: p.kind, pre } : { text: t, start, kind: p.kind });
    shown += (pre ?? "") + t;
  }
  return out;
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
