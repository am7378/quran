import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { arabicText, loadIndex, loadSurah, pad3, translationText, TRANSLATIONS, type Surah, type SurahData } from "@/lib/data";
import { ALIASES, normLatin } from "@/lib/search";
import { useStore } from "@/lib/store";
import { useUI, type Peek } from "@/lib/ui";
import { EASE_OUT } from "@/lib/utils";

/**
 * An ayah a note refers to, opened beside the note to read where the reader is: its Arabic and its
 * translation, in the theme's own box. Pointing at a reference shows it; a tap keeps it open (on a
 * phone it rises from the foot of the screen). Nothing announces it.
 */

/* ── finding the references in a note ──────────────────────────── */

let counts: number[] | null = null;
let names: Map<string, number> | null = null;
loadIndex().then((i) => {
  counts = i.surahs.map((s) => s.count);
  names = new Map();
  for (const s of i.surahs) for (const n of [s.tr, s.tc, ...(ALIASES[s.n] ?? [])]) {
    const k = normLatin(n);
    if (k.length >= 3 && !names.has(k)) names.set(k, s.n);
  }
});

export type Ref = { at: number; end: number; s: number; a: number; to?: number };
type Tok = { t: string; at: number; end: number; k: "w" | "n" | "p" };

const SURAH = /^(surah|sura|surat|chapter|ch)$/i;
const AYAH = /^(ayah|ayat|aya|ayaat|ayahs|verse|verses|v|vs|vv)$/i;
const QURAN = /^(q|quran|qur'an|qur’an|koran)$/i;
const LINK = /^(of|in|from)$/i;

/**
 * The ways people write a reference: 2:255, 2 : 255, Q2:255, Quran 2:255, 2:255-257, Surah 2:255,
 * Q 2.255 or 2/255 after a keyword, Surah 2 ayah 255, ayah 255 of Al-Baqarah, verse 10 in Surah Kahf,
 * Baqarah 255, Al-Kahf: 10, Yaseen 1-5, Surah Rum 2. Only ayat that exist; a clock time is not one.
 */
export function refsIn(text: string): Ref[] {
  const toks: Tok[] = [];
  for (const m of text.matchAll(/[A-Za-zÀ-ɏḀ-ỿ'’`ʿʾ]+(?:-[A-Za-zÀ-ɏḀ-ỿ'’`ʿʾ]+)*|\d{1,3}|[:,./–-]/g)) {
    const t = m[0];
    toks.push({ t, at: m.index!, end: m.index! + t.length, k: /^\d/.test(t) ? "n" : /^[:,./–-]$/.test(t) ? "p" : "w" });
  }
  const out: Ref[] = [];
  const num = (i: number) => (toks[i]?.k === "n" ? Number(toks[i].t) : null);
  const word = (i: number, re: RegExp) => toks[i]?.k === "w" && re.test(toks[i].t);
  const punct = (i: number, set: string) => toks[i]?.k === "p" && set.includes(toks[i].t);
  // after an ayah number: '-257', '– 257', 'to 257'; returns [to, next index]
  const range = (i: number, a: number): [number | undefined, number] => {
    if ((punct(i, "-–") || word(i, /^to$/i)) && num(i + 1) !== null && num(i + 1)! > a) return [num(i + 1)!, i + 2];
    return [undefined, i];
  };
  const ok = (s: number, a: number) => s >= 1 && s <= 114 && a >= 1 && a <= (counts?.[s - 1] ?? 286);
  const timeAfter = (end: number) => /^\s?(?:am|pm|a\.m\.|p\.m\.|o'?clock)(?![a-z])/i.test(text.slice(end));
  const add = (from: number, toIdx: number, s: number, a: number, to?: number) => {
    const end = toks[toIdx - 1].end;
    if (!ok(s, a) || timeAfter(end)) return;
    out.push({ at: toks[from].at, end, s, a, to: to ? Math.min(to, counts?.[s - 1] ?? to, a + 19) : undefined });
  };
  // a surah named in 1 to 3 words ending at word index j (exclusive end j); [surah, first word index]
  const nameBefore = (j: number): [number, number] | null => {
    for (let len = 3; len >= 1; len--) {
      const i = j - len;
      if (i < 0 || toks.slice(i, j).some((x) => x.k !== "w") || SURAH.test(toks[i].t) || AYAH.test(toks[i].t)) continue;
      const k = normLatin(text.slice(toks[i].at, toks[j - 1].end));
      const s = names?.get(k);
      if (s) return [s, i];
    }
    return null;
  };
  const nameAfter = (i: number): [number, number] | null => {
    for (let len = 3; len >= 1; len--) {
      const j = i + len;
      if (j > toks.length || toks.slice(i, j).some((x) => x.k !== "w")) continue;
      const s = names?.get(normLatin(text.slice(toks[i].at, toks[j - 1].end)));
      if (s) return [s, j];
    }
    return null;
  };

  for (let i = 0; i < toks.length; i++) {
    const kw = word(i, QURAN) || word(i, SURAH);
    const n0 = kw ? i + 1 : i;
    // 2:255, Q2:255, Surah 2:255 (and 2.255, 2/255 after a keyword)
    if (num(n0) !== null && (punct(n0 + 1, ":") || (kw && punct(n0 + 1, "./"))) && num(n0 + 2) !== null) {
      const s = num(n0)!, a = num(n0 + 2)!;
      const [to, next] = range(n0 + 3, a);
      add(i, next, s, a, to);
      i = next - 1;
      continue;
    }
    // Surah 2, ayah 255
    if (word(i, SURAH) && num(i + 1) !== null) {
      let j = i + 2;
      if (punct(j, ",")) j++;
      if (word(j, AYAH)) {
        j++;
        if (punct(j, ".")) j++;
        if (num(j) !== null) {
          const a = num(j)!;
          const [to, next] = range(j + 1, a);
          add(i, next, num(i + 1)!, a, to);
          i = next - 1;
          continue;
        }
      }
    }
    // ayah 255 of Al-Baqarah, verse 10 in Surah 18
    if (word(i, AYAH)) {
      let j = i + 1;
      if (punct(j, ".")) j++;
      if (num(j) !== null) {
        const a = num(j)!;
        const [to, k] = range(j + 1, a);
        if (word(k, LINK)) {
          let m = k + 1;
          if (word(m, SURAH)) m++;
          if (num(m) !== null) {
            add(i, m + 1, num(m)!, a, to);
            i = m;
            continue;
          }
          const nm = nameAfter(m);
          if (nm) {
            add(i, nm[1], nm[0], a, to);
            i = nm[1] - 1;
            continue;
          }
        }
      }
    }
    // Baqarah 255, Al-Kahf: 10, Surah Yaseen ayah 1-5
    if (num(i) !== null && i > 0) {
      let j = i;
      let keyed = false;
      if (word(j - 1, AYAH)) {
        j--;
        keyed = true;
      } else if (punct(j - 1, ".") && word(j - 2, AYAH)) {
        j -= 2;
        keyed = true;
      }
      if (punct(j - 1, ":,")) {
        j--;
        keyed = true;
      }
      const nm = nameBefore(j);
      if (nm) {
        const [s, first] = nm;
        const surahKw = word(first - 1, SURAH);
        const k = normLatin(text.slice(toks[first].at, toks[j - 1].end));
        // a short name alone ('Rum 2') could be a word; it needs 'Surah' or 'ayah'
        if (surahKw || keyed || k.length >= 4) {
          const a = num(i)!;
          const [to, next] = range(i + 1, a);
          add(surahKw ? first - 1 : first, next, s, a, to);
          i = next - 1;
        }
      }
    }
  }
  // overlapping finds: the longer one
  out.sort((x, y) => x.at - y.at || y.end - x.end);
  return out.filter((r, k) => !out.slice(0, k).some((o) => r.at < o.end));
}

/* ── showing an ayah: pointed at (until the pointer leaves), or tapped (until tapped away) ── */

let closeTimer = 0;
let openTimer = 0;
export const peekHover = {
  /** pointing at a reference: open it after a moment */
  enter(p: Omit<Peek, "pinned">) {
    window.clearTimeout(closeTimer);
    window.clearTimeout(openTimer);
    const cur = useUI.getState().peek;
    if (cur?.pinned) return;
    openTimer = window.setTimeout(() => useUI.getState().setPeek({ ...p, pinned: false }), cur ? 60 : 260);
  },
  /** the pointer gone from the reference, or from the box: close it, unless it was tapped open */
  leave() {
    window.clearTimeout(openTimer);
    window.clearTimeout(closeTimer);
    closeTimer = window.setTimeout(() => {
      const cur = useUI.getState().peek;
      if (cur && !cur.pinned) useUI.getState().setPeek(null);
    }, 280);
  },
  stay() {
    window.clearTimeout(closeTimer);
  },
};

export function AyahPeek() {
  const peek = useUI((s) => s.peek);
  const setPeek = useUI((s) => s.setPeek);
  const settings = useStore((s) => s.settings);
  const [data, setData] = useState<{ surah: Surah; d: SurahData } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const phone = typeof window !== "undefined" && window.innerWidth < 768;

  useEffect(() => {
    if (!peek) return;
    let live = true;
    Promise.all([loadIndex(), loadSurah(peek.s)]).then(([i, d]) => live && setData({ surah: i.surahs[peek.s - 1], d }));
    return () => {
      live = false;
    };
  }, [peek?.s]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!peek?.pinned) return;
    const down = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      if (ref.current?.contains(t) || t.closest?.("[data-ref]")) return;
      setPeek(null);
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && setPeek(null);
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("keydown", key);
    };
  }, [peek?.pinned, setPeek]); // eslint-disable-line react-hooks/exhaustive-deps

  const verses = peek && data && data.surah.n === peek.s ? data.d.v.slice(peek.a - 1, peek.to ?? peek.a) : [];
  const label = peek ? `${peek.s}:${peek.a}${peek.to ? `–${peek.to}` : ""}` : "";
  // as wide as the ayat need (a long one gets a wider box and slightly smaller type), never cut
  const words = verses.reduce((n, v) => n + v.a.length, 0);
  const W = phone ? 0 : Math.min(window.innerWidth - 24, words > 60 ? 520 : words > 24 ? 440 : 360);
  const arPx = words > 90 ? 19 : words > 40 ? 20.5 : 22;

  // beside the note: to its right if there is room, else its left, else under it
  let pos: React.CSSProperties = {};
  if (peek && !phone) {
    const vw = window.innerWidth, vh = window.innerHeight;
    let left: number, top: number;
    if (peek.x + peek.w + 14 + W <= vw - 12) [left, top] = [peek.x + peek.w + 14, peek.y];
    else if (peek.x - 14 - W >= 12) [left, top] = [peek.x - 14 - W, peek.y];
    else [left, top] = [Math.max(12, Math.min(vw - W - 12, peek.x)), peek.y + peek.h + 12];
    pos = { left, top: Math.max(12, Math.min(top, vh * 0.3)), width: W, maxHeight: vh - Math.max(12, Math.min(top, vh * 0.3)) - 12 };
  }

  return (
    <AnimatePresence>
      {peek && (
        <motion.div
          ref={ref}
          key={label}
          role="dialog"
          aria-label={`Ayah ${label}`}
          onPointerEnter={() => peekHover.stay()}
          onPointerLeave={(e) => e.pointerType === "mouse" && peekHover.leave()}
          className={
            "theme-pop pointer-events-auto fixed z-[85] flex flex-col border border-[var(--box-line)] bg-[var(--box-bg-solid)] text-[var(--box-fg)] shadow-[0_24px_60px_-18px_rgba(0,0,0,0.75)] " +
            (phone ? "inset-x-2 bottom-2 max-h-[62vh]" : "")
          }
          style={phone ? { bottom: "calc(0.5rem - var(--icb-gap, 0px))" } : pos}
          initial={phone ? { opacity: 0, y: 40 } : { opacity: 0, y: 8, scale: 0.97 }}
          animate={phone ? { opacity: 1, y: 0 } : { opacity: 1, y: 0, scale: 1 }}
          exit={phone ? { opacity: 0, y: 30, transition: { duration: 0.18 } } : { opacity: 0, y: 6, scale: 0.98, transition: { duration: 0.15 } }}
          transition={{ duration: 0.28, ease: EASE_OUT }}
        >
          {phone && <div className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-[var(--box-line)]" />}
          <div className="flex items-start justify-between gap-3 border-b border-[var(--box-line)] px-4 pb-2.5 pt-3">
            <div className="min-w-0">
              <div className="label text-[var(--box-faint)]">
                {pad3(peek.s)} · {label}
              </div>
              <div className="display mt-1 truncate font-serif text-[19px] italic leading-tight">{data?.surah.tc ?? " "}</div>
            </div>
            <button type="button" onClick={() => setPeek(null)} aria-label="Close" className="-mr-1.5 flex h-8 w-8 shrink-0 items-center justify-center text-[var(--box-muted)] hover:text-[var(--box-fg)]">
              <X size={15} strokeWidth={1.6} />
            </button>
          </div>
          <div className="thin-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">
            {!verses.length ? (
              <div className="label py-4 text-center text-[var(--box-faint)]">Opening {label}</div>
            ) : (
              verses.map((v) => (
                <div key={v.n} className="border-b border-[var(--box-line)] py-3 first:pt-0 last:border-0">
                  {verses.length > 1 && <div className="label-sm mb-1 tabular-nums text-[var(--box-faint)]">{`${peek.s}:${v.n}`}</div>}
                  <p className="quran text-right leading-[2]" style={{ fontSize: arPx }} dir="rtl" lang="ar">
                    {arabicText(v, settings.script)}
                  </p>
                  <p className="mt-2 font-serif text-[15.5px] leading-relaxed text-[var(--box-fg)]" dir="ltr">
                    {translationText(v, settings.translation, settings.showContext)}
                  </p>
                </div>
              ))
            )}
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-[var(--box-line)] px-4 py-2">
            <span className="label-sm text-[var(--box-faint)]">{TRANSLATIONS[settings.translation].name}</span>
            <a href={`#/${peek.s}/${peek.a}`} onClick={() => setPeek(null)} className="label-sm text-[var(--box-muted)] transition-colors hover:text-[var(--box-fg)]">
              Open →
            </a>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
