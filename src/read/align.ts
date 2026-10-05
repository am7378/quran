/**
 * Which words of an ayah's translation go with some of its Arabic words, and the other way: a guess
 * from the word-by-word meanings (quran.com's, in the data), for the reader to confirm or change
 * when sharing a part of an ayah (Share.tsx). Nothing here is shown that is not in the texts: it
 * only chooses where in them to begin and end.
 */

// words too common to say anything about where a phrase is
const COMMON = new Set(
  "the a an of and to in is are was were be been for on with that this it its as at by from or so then which who whom what whose he his him they them their we us our you your i me my she her has have had do does did will shall would should upon into there these those all any indeed verily truly not no nor but if when also very most more those such than".split(
    " ",
  ),
);

/** A word as the matching sees it: lower case, letters only, doubled letters single (Allaah, Allah), a plural's s gone. */
export function norm(w: string) {
  let s = w
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z]/g, "")
    .replace(/(.)\1+/g, "$1");
  if (s.length > 4 && s.endsWith("s")) s = s.slice(0, -1);
  return s;
}
const content = (w: string) => {
  const n = norm(w);
  return n.length > 1 && !COMMON.has(n) ? n : null;
};
const tokens = (text: string) => text.split(/\s+/).map(content).filter((t): t is string => !!t);

/** The shortest run of `words` that holds the most of `want`; null if it holds too few. */
function bestRun(words: (string[] | string | null)[], want: Set<string>, least: number): [number, number] | null {
  let best: [number, number] | null = null, bestN = 0;
  const has = (w: string[] | string | null) => (w == null ? [] : Array.isArray(w) ? w : [w]).filter((t) => want.has(t));
  for (let i = 0; i < words.length; i++) {
    if (!has(words[i]).length) continue;
    const got = new Set<string>();
    for (let j = i; j < words.length; j++) {
      const h = has(words[j]);
      if (!h.length) continue;
      h.forEach((t) => got.add(t));
      if (got.size > bestN || (got.size === bestN && best && j - i < best[1] - best[0])) {
        bestN = got.size;
        best = [i, j];
      }
    }
  }
  return best && bestN >= least ? best : null;
}

/** Arabic words [a, b] (their meanings) → the run of the translation's words (split on spaces) that says them. */
export function translationFor(meanings: string[], [a, b]: [number, number], trWords: string[]): [number, number] | null {
  const want = new Set(meanings.slice(a, b + 1).flatMap(tokens));
  if (!want.size) return null;
  const run = bestRun(trWords.map(content), want, Math.max(1, Math.ceil(want.size * 0.5)));
  if (!run) return null;
  // take in the small words just before it (“the best”, “and He”), not across a sentence's end
  let [i, j] = run;
  for (let k = 0; k < 2 && i > 0 && !content(trWords[i - 1]) && !/[.;:!?]$/.test(trWords[i - 1]); k++) i--;
  // Arabic from the ayah's first word, or to its last: the translation's beginning, or its end
  if (a === 0) i = 0;
  if (b === meanings.length - 1) j = trWords.length - 1;
  return [i, j];
}

/**
 * No guess from the meanings (too few of them say anything): the same stretch of the other side, in
 * proportion, `[from, to)` of `total` → words `[i, j]` of `count`. Only a first mark, for the reader
 * to move; never the whole ayah in place of the part.
 */
export function inProportion([from, to]: [number, number], total: number, count: number): [number, number] {
  if (count <= 0 || total <= 0) return [0, Math.max(0, count - 1)];
  const i = Math.max(0, Math.min(count - 1, Math.floor((from / total) * count)));
  const j = Math.max(i, Math.min(count - 1, Math.ceil((to / total) * count) - 1));
  return [i, j];
}

/** Some of the translation's words → the run of Arabic words whose meanings say them. */
export function arabicFor(meanings: string[], excerpt: string): [number, number] | null {
  const want = new Set(tokens(excerpt));
  if (!want.size) return null;
  return bestRun(
    meanings.map((m) => tokens(m)),
    want,
    Math.max(1, Math.ceil(want.size * 0.4)),
  );
}
