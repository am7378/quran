import { qmePieces, shownPieces, type Piece, type Translation, type Verse } from "@/lib/data";
export { shownPieces, type Piece } from "@/lib/data";
import { HIGHLIGHT_HEX, type Highlight } from "@/lib/store";

/**
 * Where highlights of different colours overlap, the inks combine the way a marker's do on paper
 * (multiplied), lifted a touch so the words on them stay easy to read. One colour: none needed.
 */
export function inkOf(hls: Highlight[]): string | undefined {
  const colors = [...new Set(hls.map((h) => h.color))];
  if (colors.length < 2) return undefined;
  const rgb = colors
    .map((c) => HIGHLIGHT_HEX[c].match(/[0-9a-f]{2}/gi)!.map((x) => parseInt(x, 16) / 255))
    .reduce((a, b) => a.map((v, i) => v * b[i]));
  return "#" + rgb.map((v) => Math.round((v + (1 - v) * 0.12) * 255).toString(16).padStart(2, "0")).join("");
}

/** The one of overlapping highlights that answers a tap: the newest. */
export const newestOf = (hls: Highlight[]) => hls.reduce((a, b) => (b.at > a.at ? b : a));

/**
 * Every rendered text has a canonical string; highlights are stored as
 * character offsets into it, so they survive re-renders and the context
 * toggle (hidden pieces keep their offsets).
 */
export function translationPieces(v: Verse, t: Translation): { canon: string; pieces: Piece[]; source: Translation } {
  if (t === "qme" && v.q && v.q.length) return { ...qmePieces(v.q), source: "qme" };
  const source: Translation = t === "clear" ? "clear" : "saheeh";
  const text = source === "clear" ? v.c : v.s;
  return { canon: text, pieces: [{ text, start: 0, kind: 0 }], source };
}

/** The words between two offsets as they are shown (the context hidden: without its brackets). */
export function shownSlice(pieces: Piece[], showCtx: boolean, s: number, e: number) {
  let out = "";
  for (const p of shownPieces(pieces, showCtx)) {
    const a = Math.max(s, p.start), b = Math.min(e, p.start + p.text.length);
    if (b <= a) continue;
    if (p.pre && out) out += p.pre;
    out += p.text.slice(a - p.start, b - p.start);
  }
  return out.trim();
}

export type Word = { text: string; start: number; end: number; i: number };
/**
 * The ayah's Arabic words. Offsets always count in the Madani (QPC) text, so a
 * highlight made in one script shows on the same words in the other; `text`
 * is what is displayed.
 */
export function arabicWords(v: Verse, script: "uthmani" | "indopak" = "uthmani"): { canon: string; words: Word[] } {
  const shown = script === "indopak" && v.ip && v.ip.length === v.a.length ? v.ip : v.a;
  let at = 0;
  const words = v.a.map((qpc, i) => {
    const w = { text: shown[i], start: at, end: at + qpc.length, i };
    at += qpc.length + 1;
    return w;
  });
  return { canon: v.a.join(" "), words };
}

/** Arabic highlights: the whole words a selection touches. */
export function rangeToArabicWords(range: Range, field: HTMLElement, words: Word[]): [number, number] | null {
  let first = Infinity, last = -1;
  field.querySelectorAll<HTMLElement>(".word[data-w]").forEach((el) => {
    if (!range.intersectsNode(el)) return;
    const i = Number(el.dataset.w);
    first = Math.min(first, i);
    last = Math.max(last, i);
  });
  if (last < 0) return null;
  return [words[first].start, words[last].end];
}

/** Split a piece at highlight boundaries. */
export function splitPiece(p: Piece, hls: Highlight[]): { text: string; start: number; hl?: Highlight; hls: Highlight[] }[] {
  const end = p.start + p.text.length;
  const cuts = new Set<number>([p.start, end]);
  for (const h of hls) {
    if (h.end <= p.start || h.start >= end) continue;
    cuts.add(Math.max(p.start, h.start));
    cuts.add(Math.min(end, h.end));
  }
  const pts = [...cuts].sort((a, b) => a - b);
  const out: { text: string; start: number; hl?: Highlight; hls: Highlight[] }[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    if (b <= a) continue;
    // every highlight over this stretch (they can overlap); the newest answers a tap
    const over = hls.filter((h) => h.start <= a && h.end >= b);
    out.push({ text: p.text.slice(a - p.start, b - p.start), start: a, hl: over.length ? newestOf(over) : undefined, hls: over });
  }
  return out;
}

function offsetWithin(el: Element, node: Node, off: number) {
  const r = document.createRange();
  r.selectNodeContents(el);
  try {
    r.setEnd(node, off);
  } catch {
    return 0;
  }
  return r.toString().length;
}

/** Map a DOM selection inside a field to canonical [start, end). */
export function rangeToOffsets(range: Range, field: HTMLElement): [number, number] | null {
  let s = Infinity, e = -Infinity;
  field.querySelectorAll<HTMLElement>("[data-o]").forEach((el) => {
    if (!range.intersectsNode(el)) return;
    const base = Number(el.dataset.o);
    const len = (el.textContent ?? "").length;
    let a = 0, b = len;
    if (el.contains(range.startContainer)) a = offsetWithin(el, range.startContainer, range.startOffset);
    else if (range.comparePoint(el, 0) < 0) return; // element lies before the range
    if (el.contains(range.endContainer)) b = offsetWithin(el, range.endContainer, range.endOffset);
    if (b > a) {
      s = Math.min(s, base + a);
      e = Math.max(e, base + b);
    }
  });
  return Number.isFinite(s) ? [s, e] : null;
}

/** Trim whitespace at both ends of a canonical range. */
export function trimRange(canon: string, [s, e]: [number, number]): [number, number] {
  while (s < e && /\s/.test(canon[s])) s++;
  while (e > s && /\s/.test(canon[e - 1])) e--;
  return [s, e];
}

/** Translation highlights grow to whole words. */
export function snapToLatinWords(canon: string, [s, e]: [number, number]): [number, number] {
  const word = /[\p{L}\p{N}'’-]/u;
  while (s > 0 && word.test(canon[s - 1])) s--;
  while (e < canon.length && word.test(canon[e])) e++;
  return [s, e];
}

/** Arabic highlights cover whole words so letters keep their joined forms. */
export function snapToWords(words: Word[], [s, e]: [number, number]): [number, number] {
  const first = words.find((w) => w.end > s) ?? words[0];
  const last = [...words].reverse().find((w) => w.start < e) ?? words[words.length - 1];
  return [first.start, Math.max(first.end, last.end)];
}

/** Arabic font size by length, so short ayahs are monumental and long ones fit. */
/** Arabic type size. One ayah per view: sized to the ayah's length. Scrolling: one size for every ayah. */
/* One size for every ayah, long or short: the reader's own sizes (Settings) and nothing else. An
   ayah is never made smaller to fit the frame; one too long for it scrolls (Ayah.tsx). */
export function arabicSize(_v: Verse, view: 1 | 3, mobile: boolean, scale: number) {
  if (view === 3) return Math.round((mobile ? 26 : 31) * scale);
  return Math.round((mobile ? 29 : 38) * scale);
}

export function translationSize(_text: string, view: 1 | 3, mobile: boolean, scale: number) {
  if (view === 3) return Math.round((mobile ? 15.5 : 17.5) * scale * 10) / 10;
  return Math.round((mobile ? 17.5 : 20) * scale * 10) / 10;
}
