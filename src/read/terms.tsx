import type { ReactNode } from "react";

/**
 * Words in the translation that carry a gloss on hover: the Arabic terms and
 * names the translation keeps (Taqwa, Imaan, Kuffaar…), defined in the words
 * of the translation's own glossary, and the honorifics the book prints after
 * names, stored as their Unicode ligatures.
 */
export type Gloss = { term: string; text: string; quiet?: 1 };

let GLOSSARY: Map<string, Gloss> | null = null;
let loading: Promise<void> | null = null;

export function loadGlossary() {
  if (!loading)
    loading = fetch(`${import.meta.env.BASE_URL}data/glossary.json`)
      .then((r) => (r.ok ? r.json() : {}))
      .then((d: Record<string, Gloss>) => {
        GLOSSARY = new Map(Object.entries(d));
      })
      .catch(() => {
        GLOSSARY = new Map();
      });
  return loading;
}

/**
 * The honorifics: how each is shown (ﷺ has a glyph in the Arabic fonts; the
 * others are written out as printed) and what it means.
 */
export const HONORIFICS: Record<string, { show: string; meaning: string }> = {
  "ﷺ": { show: "ﷺ", meaning: "Peace be upon him" },
  "﵊": { show: "عليه الصلاة والسلام", meaning: "Peace and blessings be upon him" },
  "﵁": { show: "رضي الله تعالى عنه", meaning: "May Allaah be pleased with him" },
  "﵂": { show: "رضي الله تعالى عنها", meaning: "May Allaah be pleased with her" },
  "﵃": { show: "رضي الله تعالى عنهم", meaning: "May Allaah be pleased with them" },
};
const HON_RE = /[ﷺ﵊﵁﵂﵃]/;

/** Glossary entry for a word as it appears in the text ('Kuffaar)', "Allaah's"). */
export function glossFor(token: string): Gloss | null {
  if (!GLOSSARY) return null;
  // (asked for every word of every translation shown: each word's answer kept)
  let g = seen.get(token);
  if (g === undefined) {
    const core = token.replace(/^[^A-Za-z]+|[^A-Za-z']+$/g, "").replace(/['’]s$/, "");
    g = (core && GLOSSARY.get(core.toLowerCase())) || null;
    seen.set(token, g);
  }
  return g;
}
const seen = new Map<string, Gloss | null>();

let BY_TERM: Map<string, Gloss> | null = null;
/** A glossary entry by its whole term ('ar rahmaan'): how a phrase's tooltip finds it. */
export function glossByTerm(term: string): Gloss | null {
  if (!GLOSSARY) return null;
  BY_TERM ??= new Map([...GLOSSARY.values()].map((g) => [g.term.toLowerCase(), g]));
  return BY_TERM.get(term.toLowerCase()) ?? null;
}

const normWord = (w: string) => w.toLowerCase().replace(/['’]s$/, "").replace(/[^a-z']/g, "").replace(/^'+|'+$/g, "");

/**
 * The glossary keeps a term of several words ('Ar Rahmaan', 'Laylatul Qadr', 'Day of Qiyaamah')
 * under one of them; where the text has the whole phrase, it is one term: the word positions
 * [from, to] of each such phrase among `words`.
 */
export function phrasesIn(words: string[]): { from: number; to: number; gloss: Gloss }[] {
  const out: { from: number; to: number; gloss: Gloss }[] = [];
  const norm = words.map(normWord);
  for (let i = 0; i < words.length; i++) {
    const g = glossFor(words[i]);
    if (!g || !/\s/.test(g.term)) continue;
    for (const alt of g.term.split(/ or /)) {
      const tw = alt.split(/\s+/).map(normWord);
      const k = tw.indexOf(norm[i]);
      if (k < 0) continue;
      const from = i - k, to = from + tw.length - 1;
      if (from < 0 || to >= words.length || (out.length && from <= out[out.length - 1].to)) continue;
      if (tw.every((w, j) => norm[from + j] === w)) {
        out.push({ from, to, gloss: g });
        break;
      }
    }
  }
  return out;
}

/** A token of the translation, with its gloss or honorific marked up (`inPhrase`: its phrase carries the gloss). */
export function renderTerms(token: string, inPhrase = false): ReactNode {
  const hm = token.match(HON_RE);
  if (hm) {
    const c = hm[0];
    const [a, b] = token.split(c);
    return (
      <>
        {a}
        <span className={c === "ﷺ" ? "saw" : "hon"} data-hon={c} lang="ar">
          {HONORIFICS[c].show}
        </span>
        {b}
      </>
    );
  }
  const g = inPhrase ? null : glossFor(token);
  if (!g) return token;
  return (
    <span className={g.quiet ? "gl quiet" : "gl"} data-gloss={g.term.toLowerCase()}>
      {token}
    </span>
  );
}
