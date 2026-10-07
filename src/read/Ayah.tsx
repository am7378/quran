import { Fragment, memo, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Bookmark, BookmarkCheck, Copy, Mic, Share2, StickyNote } from "lucide-react";
import type { Verse } from "@/lib/data";
import { TRANSLATIONS } from "@/lib/data";
import type { Highlight, Settings } from "@/lib/store";
import { arabicSize, arabicWords, inkOf, newestOf, shownPieces, splitPiece, translationPieces, translationSize } from "./text";
import { phrasesIn, renderTerms } from "./terms";
import { cn } from "@/lib/utils";

export type AyahAction = "bookmark" | "copy" | "share" | "note" | "voice" | "context";

type Props = {
  surah: number;
  verse: Verse;
  settings: Settings;
  mobile: boolean;
  highlights: Highlight[];
  bookmarked: boolean;
  notes: number;
  voices: number;
  onAction: (a: AyahAction, v: Verse, anchor?: HTMLElement) => void;
  viewH: number;
  viewW: number;
  /** within a couple of ayahs of the one being read */
  near?: boolean;
  isLast?: boolean;
  light?: boolean; // not built yet: only its place held (Read)
};

const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

export const AyahSection = memo(function AyahSection({
  surah,
  verse: v,
  settings,
  mobile,
  highlights,
  bookmarked,
  notes,
  voices,
  onAction,
  viewH,
  viewW,
  near,
  isLast,
  light,
}: Props) {
  const key = `${surah}:${v.n}`;
  const view = settings.view;
  const one = view === 1;
  const showAr = settings.readingMode !== "translation";
  const showTr = settings.readingMode !== "arabic";
  const tr = translationPieces(v, settings.translation);
  const fellBack = settings.translation === "qme" && tr.source !== "qme";
  const arHls = highlights.filter((h) => h.field === "ar");
  const trHls = highlights.filter((h) => h.field === tr.source);
  // up to two more translations shown under the main one (not one that is already showing)
  const extras = showTr
    ? settings.also
        .filter((t) => t !== settings.translation)
        .slice(0, 2)
        .map((t) => translationPieces(v, t))
        .filter((x, i, all) => x.source !== tr.source && all.findIndex((y) => y.source === x.source) === i)
    : [];
  const { canon: arCanon, words } = arabicWords(v, settings.script);
  const close = settings.arabicSpacing === "close"; // the words and lines set nearer, as a printed mushaf

  const ref = useRef<HTMLElement>(null);
  const oneRef = useRef(one);
  oneRef.current = one;

  /* ── an ayah far from the frame is not laid out at all (content-visibility), only held at
     about its own height, so a long surah lays out a few ayahs, not hundreds. It is measured
     for fitting (below) when it comes near. ── */
  const [shownTick, setShownTick] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const on = (e: Event) => {
      if (!(e as Event & { skipped?: boolean }).skipped && oneRef.current) setShownTick((t) => t + 1);
    };
    el.addEventListener("contentvisibilityautostatechange", on);
    return () => {
      el.removeEventListener("contentvisibilityautostatechange", on);
      notNear(el);
    };
  }, []);
  const arRef = useRef<HTMLDivElement>(null);
  const trWrap = useRef<HTMLDivElement>(null);
  const trRef = useRef<HTMLParagraphElement>(null);

  /* ── every ayah at the reader's own size, however long: never made smaller to fit the frame. In
     the one-ayah view one too long for the frame is read down to a mark at its end (and only a
     further swipe goes on to the next: pager.ts). ── */
  const [over, setOver] = useState(false);
  const arPx = arabicSize(v, view, mobile, settings.arabicScale * (settings.readingMode === "arabic" ? 1.18 : 1));
  const trPx = translationSize(tr.canon, view, mobile, settings.transScale * (settings.readingMode === "translation" ? 1.15 : 1));

  const sig = `${view}|${settings.readingMode}|${settings.translation}|${settings.also.join(",")}|${settings.script}|${settings.arabicSpacing}|${settings.arabicScale}|${settings.transScale}|${mobile}`;
  // (the line it decides on takes no room: so it is asked once the page is drawn, never while it is
  // being laid out, and only of the ayahs about the reader; one not laid out yet is asked again as it
  // is: shownTick)
  useEffect(() => {
    const el = ref.current;
    if (!el || !one || !viewH || light) {
      if (over) setOver(false);
      return;
    }
    if (!near) return;
    const id = requestAnimationFrame(() => {
      if (isSkipped(el)) return;
      const room = el.closest<HTMLElement>(".snap-scroller")?.clientHeight || viewH;
      const o = el.offsetHeight > room + 1;
      if (o !== over) setOver(o);
    });
    return () => cancelAnimationFrame(id);
  }, [sig, settings.showContext, over, one, viewH, shownTick, near, light]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── context on and off. In the one-ayah view the old text fades out, the new
     one fades in, and the ayah glides to its new centre; only transforms and
     opacity move, so no frame waits on the page's layout. In the multiple-ayah
     view the page fades through it (Read). An ayah out of sight changes only as
     the reader comes near it (whenNear), so nothing above the reader moves when
     the switch is pressed, and no work is spent on ayahs never reached. ── */
  const [ctxShown, setCtxShown] = useState(settings.showContext);
  const pending = useRef<{ from: number; above: boolean; ghost?: HTMLElement; top?: number } | null>(null);
  const glide = useRef<Animation | null>(null);
  const want = useRef(settings.showContext);
  want.current = settings.showContext;
  const shown = useRef(ctxShown);
  shown.current = ctxShown;
  useLayoutEffect(() => {
    if (settings.showContext === ctxShown) return;
    const p = trRef.current, box = trWrap.current, sec = ref.current;
    if (tr.source !== "qme" || !p || !box || !sec) {
      setCtxShown(settings.showContext);
      return;
    }
    const sc = sec.closest<HTMLElement>(".snap-scroller");
    const where = () => {
      const r = sec.getBoundingClientRect();
      const sr = sc?.getBoundingClientRect() ?? new DOMRect(0, 0, window.innerWidth, window.innerHeight);
      return { r, sr, seen: r.bottom > sr.top + 1 && r.top < sr.bottom - 1 };
    };
    const { seen } = where();
    if (!seen) {
      whenNear(sec, () => {
        if (!ref.current || want.current === shown.current) return;
        const w = where();
        pending.current = { from: sec.offsetHeight, above: w.r.bottom <= w.sr.top + 1 };
        setCtxShown(want.current);
      });
      return;
    }
    if (!one || settings.reduceMotion) {
      setCtxShown(settings.showContext);
      return;
    }
    box.querySelectorAll(":scope > [data-ghost]").forEach((x) => x.remove());
    const g = p.cloneNode(true) as HTMLElement;
    for (const x of [g, ...g.querySelectorAll<HTMLElement>("[data-field], [data-key], [data-hid]")])
      ["data-field", "data-key", "data-hid"].forEach((a) => x.removeAttribute(a));
    g.setAttribute("aria-hidden", "true");
    g.dataset.ghost = "";
    Object.assign(g.style, { position: "absolute", left: "0", top: "0", width: `${p.offsetWidth}px`, margin: "0", pointerEvents: "none" });
    box.style.position = "relative";
    box.appendChild(g);
    const inner = sec.querySelector<HTMLElement>("[data-inner]");
    pending.current = { from: sec.offsetHeight, above: false, ghost: g, top: inner?.getBoundingClientRect().top };
    setCtxShown(settings.showContext);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.showContext]);

  useLayoutEffect(() => {
    const P = pending.current;
    pending.current = null;
    if (!P) return;
    const p = trRef.current, box = trWrap.current, sec = ref.current;
    if (!P.ghost) {
      // (one not laid out is left to the reader's own watch on the heights above the frame; in the
      // one-ayah view that watch keeps the place through every change, this one included)
      if (P.above && sec && !isSkipped(sec) && !oneRef.current) {
        const sc = sec.closest<HTMLElement>(".snap-scroller");
        if (sc) sc.scrollTop += sec.offsetHeight - P.from;
      }
      return;
    }
    const ghost = P.ghost;
    if (!p || !box || !sec) {
      ghost.remove();
      return;
    }
    // the ayah starts where it was and glides to where it now sits
    const inner = sec.querySelector<HTMLElement>("[data-inner]");
    const dy = P.top != null && inner ? P.top - inner.getBoundingClientRect().top : 0;
    glide.current?.cancel();
    glide.current = inner && Math.abs(dy) > 0.5 ? inner.animate([{ transform: `translateY(${dy}px)` }, { transform: "none" }], { duration: 560, easing: EASE }) : null;
    const out = ghost.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: "cubic-bezier(0.4, 0, 1, 1)", fill: "forwards" });
    const done = () => {
      ghost.remove();
      if (!box.querySelector(":scope > [data-ghost]")) box.style.position = "";
    };
    out.onfinish = done;
    out.oncancel = done;
    p.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 420, delay: 140, easing: "cubic-bezier(0, 0, 0.2, 1)", fill: "backwards" });
  }, [ctxShown]);

  // the context changed this ayah's height: those keeping the reader's place hear of it now,
  // after its own steps above (an effect declared after them runs after them)
  const told = useRef(ctxShown);
  useLayoutEffect(() => {
    if (told.current === ctxShown) return;
    told.current = ctxShown;
    heightsChanged();
  }, [ctxShown]);

  // the height held while it is not laid out (inside its padding): its lines at their sizes
  // across the frame's width (measured averages: an Arabic letter 0.215 of the type size, an
  // English one 0.41). Before the frame is measured, its width from the window's, so a surah's
  // first render lays out a few ayahs too.
  const fw = viewW || Math.round(Math.min(window.innerWidth, 1600) * (mobile ? 0.9 : 0.76));
  const w = Math.max(220, fw * (one ? 0.8 : 0.88) - 50);
  const lines = (chars: number, px: number, k: number) => Math.max(1, Math.ceil((chars * px * k) / w));
  let hold = 0;
  if (showAr) hold += lines(arCanon.length, arPx, close ? 0.2 : 0.215) * arPx * (close ? 1.85 : one ? 2.1 : 2);
  if (showTr) hold += lines(tr.canon.length * (tr.source === "qme" && !ctxShown ? 0.62 : 1), trPx, 0.41) * trPx * 1.6;
  for (const x of extras) hold += lines(x.canon.length, trPx * 0.94, 0.41) * trPx * 1.5 + 44;
  // and the number, the rule or gap between Arabic and English (the one-ayah view's full-height
  // minimum makes up the rest)
  hold = Math.round(hold + (one ? 60 : showAr && showTr ? 38 : 8));
  if (!one) hold = Math.max(hold, showAr ? 188 : 168); // (the buttons' height, as the section's minimum)

  const sectionClass = cn(
    "snap-item cv relative flex flex-col",
    one
      ? "min-h-full justify-center pl-[max(7%,34px)] pr-[max(7%,66px)] md:pl-[9%] md:pr-[max(9%,64px)]"
      : cn(
          "justify-center border-b border-[var(--box-line)] pb-9 pl-[max(6%,34px)] pr-[max(calc(6%+44px),66px)] pt-7 md:pl-[6%] md:pr-[calc(6%+44px)] md:pt-9",
          // never shorter than its column of buttons (five, 168px) with the column's insets
          showAr ? "min-h-[252px] md:min-h-[260px]" : "min-h-[232px] md:min-h-[240px]",
        ),
  );
  // not built yet (Read builds a surah around where the reader lands, the rest as it has time): its
  // place held at about its height, with nothing in it
  if (light)
    return (
      <section
        ref={ref}
        data-key={key}
        data-n={v.n}
        data-first={v.n === 1 || undefined}
        data-last={isLast || undefined}
        className={sectionClass}
        style={{ paddingTop: one ? "6%" : undefined, paddingBottom: one ? FOOT : undefined, minHeight: hold, containIntrinsicSize: `auto ${hold}px` }}
        aria-label={`Ayah ${key}`}
      />
    );

  const actions = (
    <Actions bookmarked={bookmarked} notes={notes} voices={voices} onAction={(a, el) => onAction(a, v, el)} />
  );

  const arabic = showAr && (
    <div
      ref={arRef}
      data-field="ar"
      data-key={key}
      className={cn("quran text-right text-[var(--box-fg)]", settings.script === "indopak" && "indopak", settings.wordHover && "word-hover")}
      style={{ fontSize: arPx, lineHeight: close ? (one ? 1.88 : 1.82) : one ? 2.1 : 2 }}
      lang="ar"
    >
      {renderArabic(
        words,
        arHls,
        settings.script === "indopak" ? undefined : v.g,
        // the sajdah sign where the mushaf sets it: the Madani mushaf's 15 places, the Indo-Pak's 14
        v.sj || v.sw !== undefined ? (v.sw ?? words.length - 1) : undefined, // in both scripts: the Indo-Pak mushafs also mark 22:77
      )}
    </div>
  );

  const translation = showTr && (
    <div ref={trWrap}>
      {extras.length > 0 && <span className="label-sm mb-1.5 block text-[var(--box-faint)]">{TRANSLATIONS[tr.source].name}</span>}
      <p
        ref={trRef}
        data-field={tr.source}
        data-key={key}
        dir="ltr"
        className={cn("text-left font-serif text-[var(--box-fg)]", !showAr && "mx-auto max-w-[62ch]")}
        style={{ fontSize: `calc(${trPx}px * var(--read-scale, 1))`, lineHeight: 1.6 }}
      >
        {!showAr && (
          <span className="label mb-3 block text-[var(--box-faint)] tabular-nums">
            {key}
            {fellBack ? ` · ${TRANSLATIONS.saheeh.name}` : ""}
          </span>
        )}
        {renderPieces(tr, trHls, ctxShown)}
      </p>
    </div>
  );
  // the other translations chosen, under the main one, each named
  const more = extras.length > 0 && (
    <div className={cn("mt-6 flex flex-col gap-5", !showAr && "mx-auto max-w-[62ch]")}>
      {extras.map((x) => (
        <div key={x.source}>
          <span className="label-sm mb-1.5 block text-[var(--box-faint)]">{TRANSLATIONS[x.source].name}</span>
          <p
            data-field={x.source}
            data-key={key}
            dir="ltr"
            className="text-left font-serif text-[var(--box-fg)]"
            style={{ fontSize: `calc(${Math.round(trPx * 0.94 * 10) / 10}px * var(--read-scale, 1))`, lineHeight: 1.6 }}
          >
            {renderPieces(x, highlights.filter((h) => h.field === x.source), settings.showContext)}
          </p>
        </div>
      ))}
    </div>
  );

  // the ayah's number under its Arabic, with the context switch beside it (one-ayah view)
  const divider = showAr && showTr && one && (
    <div className="label-sm my-6 flex items-center gap-3 text-[var(--box-faint)] md:my-7" dir="ltr">
      <span className="pill border border-[var(--box-line)] px-1.5 py-[3px] tabular-nums text-[var(--box-muted)]">{key}</span>
      <span className="h-px flex-1 bg-[var(--box-line)]" />
      {fellBack && <span className="normal-case tracking-normal">Saheeh International · this page of Quraan Made Easy is damaged in the source</span>}
    </div>
  );
  // the multiple-ayah view: the number at the top of each ayah, no rule between ayah and translation
  const number = !one && showAr && (
    <div className="label-sm mb-2 flex items-center gap-3 text-[var(--box-faint)]" dir="ltr">
      <span className="tabular-nums text-[var(--box-muted)]">{key}</span>
      {fellBack && showTr && <span className="normal-case tracking-normal">Saheeh International · this page of Quraan Made Easy is damaged in the source</span>}
    </div>
  );


  return (
    <section
      ref={ref}
      data-key={key}
      data-n={v.n}
      data-first={v.n === 1 || undefined}
      data-last={isLast || undefined}
      className={sectionClass}
      style={{ paddingTop: one ? "6%" : undefined, paddingBottom: one ? FOOT : undefined, containIntrinsicSize: `auto ${hold}px` }}
      aria-label={`Ayah ${key}`}
    >
      <div data-inner className={one ? "relative" : undefined}>
        {number}
        {arabic}
        {divider}
        {!one && showAr && showTr && <div className="h-4" />}
        {translation}
        {more}
        {/* an ayah too long for the frame: where it ends is plain to see, a single line (in the
            margin below it: shown or not, it moves nothing) */}
        {one && over && (
          <div data-end-mark className="pointer-events-none absolute inset-x-0 top-full mt-6 flex justify-center" aria-hidden>
            <span className="h-px w-44 bg-[var(--box-line)]" />
          </div>
        )}
      </div>
      {/* the one-ayah view keeps one set of buttons still in the frame's corner (Read); here, halfway
          down the ayah and its translation (below the number, above the bottom padding) */}
      {!one && (
        <div data-ayah-tools className={cn("absolute bottom-9 right-[30px] flex items-center md:right-3", showAr ? "top-12 md:top-14" : "top-7 md:top-9")}>{actions}</div>
      )}
    </section>
  );
});

/** one ayah at a time, the page's foot: its margin and room for the line that marks a long ayah's end
    (the same for every ayah, the line or not: nothing moves when it shows) */
const FOOT = "calc(6% + 28px)";

/** Whether the browser is skipping an ayah's contents (content-visibility, far from the frame). */
function isSkipped(sec: HTMLElement) {
  const c = sec.firstElementChild as HTMLElement | null;
  return !!c && typeof c.checkVisibility === "function" && !c.checkVisibility({ contentVisibilityAuto: true });
}

/* Work for an ayah out of sight, done as the reader comes near it (within a screen and a bit of the
   frame, either way): before it can be seen, and never for ayahs the reader does not reach. One
   watch for the whole page. */
const nearWatch = new WeakMap<Element, IntersectionObserver>();
const nearJobs = new WeakMap<Element, () => void>();
const nearIn = new WeakMap<Element, IntersectionObserver>();
function whenNear(el: HTMLElement, run: () => void) {
  const root = el.closest(".snap-scroller");
  if (!root || typeof IntersectionObserver === "undefined") return run();
  let io = nearWatch.get(root);
  if (!io) {
    const watch = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const job = nearJobs.get(e.target);
          nearJobs.delete(e.target);
          watch.unobserve(e.target);
          job?.();
        }
      },
      { root, rootMargin: "120% 0px 120% 0px" },
    );
    nearWatch.set(root, (io = watch));
  }
  nearJobs.set(el, run);
  nearIn.set(el, io);
  io.observe(el);
}
function notNear(el: HTMLElement) {
  nearJobs.delete(el);
  nearIn.get(el)?.unobserve(el);
  nearIn.delete(el);
}

/** An ayah's height changed with its context: those keeping the reader's place hear of it at once,
 *  in the same frame (before it is drawn), not a frame late (Read). */
const heightWatch = new Set<() => void>();
export function onAyahHeights(f: () => void) {
  heightWatch.add(f);
  return () => {
    heightWatch.delete(f);
  };
}
function heightsChanged() {
  heightWatch.forEach((f) => f());
}

/** A translation's pieces as rendered: bold reading text, the lighter context (when shown), highlights over both. */
export function renderPieces(tr: ReturnType<typeof translationPieces>, hls: Highlight[], showCtx: boolean) {
  // (the context hidden: its bracketed words go, the sentence's own punctuation stays: shownPieces)
  return (tr.source === "qme" ? shownPieces(tr.pieces, showCtx) : tr.pieces)
    .map((p, pi) => [
      // (a space the hidden context left wanting: not the book's, so outside its words)
      p.pre ? <Fragment key={"pre" + pi}>{p.pre}</Fragment> : null,
      ...splitPiece(p, hls).map((part, i) => {
        const inner = (
          <span key={pi + "-" + i} className={tr.source === "qme" ? (p.kind === 1 ? "ctx" : "tr-main") : undefined}>
            {wordsOf(part.text, part.start)}
          </span>
        );
        const ink = inkOf(part.hls);
        return part.hl ? (
          <mark key={pi + "-" + i} className="hl" data-hid={part.hl.id} data-c={part.hl.color} style={ink ? ({ "--hl": ink } as CSSProperties) : undefined}>
            {inner}
          </mark>
        ) : (
          inner
        );
      }),
    ]);
}

/** Split text into word spans (each keeps its canonical offset) with plain spaces between. */
function wordsOf(text: string, start: number) {
  const parts = text.split(/(\s+)/).filter(Boolean);
  const offs: number[] = [];
  parts.reduce((at, p) => (offs.push(at), at + p.length), 0);
  const space = (p: string) => /^\s+$/.test(p);
  const wordAt = parts.map((p, i) => (space(p) ? -1 : i)).filter((i) => i >= 0); // word -> part index
  // a glossed term of several words is one term: one underline, one meaning ('Ar Rahmaan')
  const phrases = phrasesIn(wordAt.map((i) => parts[i]));
  const word = (i: number, inPhrase = false) => (
    <span key={offs[i]} className="tw" data-o={start + offs[i]}>
      {renderTerms(parts[i], inPhrase)}
    </span>
  );
  const out: ReactNode[] = [];
  let i = 0;
  while (i < parts.length) {
    const ph = phrases.find((x) => wordAt[x.from] === i);
    if (ph) {
      const end = wordAt[ph.to];
      const inner: ReactNode[] = [];
      for (let j = i; j <= end; j++) inner.push(space(parts[j]) ? parts[j] : word(j, true));
      out.push(
        <span key={`ph${offs[i]}`} className={ph.gloss.quiet ? "gl quiet" : "gl"} data-gloss={ph.gloss.term.toLowerCase()}>
          {inner}
        </span>,
      );
      i = end + 1;
      continue;
    }
    out.push(space(parts[i]) ? parts[i] : word(i));
    i++;
  }
  return out;
}

export function renderArabic(words: ReturnType<typeof arabicWords>["words"], hls: Highlight[], glue?: number[], sajdahAt?: number) {
  const out: ReactNode[] = [];
  const sep = (i: number) => (glue?.includes(i) || i === words.length - 1 ? "" : " ");
  // ۩ after the word of prostration, as the mushaf prints it
  const sajdah = (i: number) =>
    i === sajdahAt ? (
      <span key={`sj${i}`} className="sajdah" title="Verse of prostration (sajdah): those reciting or hearing it prostrate" aria-label="sajdah">
        {" ۩"}
      </span>
    ) : null;
  // the highlights over a word (they can overlap), and a name for that set
  const over = words.map((w) => hls.filter((h) => h.start <= w.start && h.end >= w.end));
  const sig = over.map((hs) => hs.map((h) => h.id).sort().join(","));
  let i = 0;
  while (i < words.length) {
    const w = words[i];
    if (!sig[i]) {
      out.push(
        <span key={w.i} className="word" data-w={w.i} data-o={w.start}>
          {w.text}
        </span>,
        sajdah(i),
        sep(i),
      );
      i++;
      continue;
    }
    // the run of words under the same highlights is one mark; the space after it joins the mark
    // when a highlight carries on into the next word, so overlapping colours meet without a gap
    const group: ReactNode[] = [];
    const s = sig[i];
    const hs = over[i];
    while (i < words.length && sig[i] === s) {
      const x = words[i];
      group.push(
        <span key={x.i} className="word" data-w={x.i} data-o={x.start}>
          {x.text}
        </span>,
        sajdah(i),
      );
      const goesOn = i + 1 < words.length && over[i + 1].some((h) => over[i].includes(h));
      if (i + 1 < words.length && (sig[i + 1] === s || goesOn)) group.push(sep(i));
      i++;
    }
    const top = newestOf(hs);
    const ink = inkOf(hs);
    out.push(
      <mark key={`h${w.i}`} className="hl" data-hid={top.id} data-c={top.color} style={ink ? ({ "--hl": ink } as CSSProperties) : undefined}>
        {group}
      </mark>,
    );
    if (!(i < words.length && over[i].some((h) => hs.includes(h)))) out.push(sep(i - 1));
  }
  return out;
}

export function ContextToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="group inline-flex h-full min-h-8 shrink-0 items-center gap-2 px-2 text-[var(--box-faint)] transition-colors hover:text-[var(--box-fg)]"
      aria-pressed={on}
      aria-label={on ? "Hide the bracketed context" : "Show the bracketed context"}
      title={on ? "Hide the bracketed context" : "Show the bracketed context"}
    >
      <span className="whitespace-nowrap">( context )</span>
      <span className={cn("pill relative inline-block h-[11px] w-[20px] border border-current transition-colors duration-300", on && "border-[var(--box-accent)]")}>
        <span
          className={cn(
            "pill absolute top-[1.5px] h-[6px] w-[6px] bg-current transition-all duration-300 ease-out",
            on ? "left-[11px] bg-[var(--box-accent)]" : "left-[1.5px]",
          )}
        />
      </span>
    </button>
  );
}

export function Actions({
  bookmarked,
  notes,
  voices,
  onAction,
}: {
  bookmarked: boolean;
  notes: number;
  voices: number;
  onAction: (a: AyahAction, el: HTMLElement) => void;
}) {
  return (
    <div className="flex flex-col items-center gap-0.5 text-[var(--box-muted)]">
      <IconBtn label={bookmarked ? "Remove bookmark" : "Bookmark this ayah"} onClick={(e) => onAction("bookmark", e)} active={bookmarked}>
        {bookmarked ? <BookmarkCheck size={15} strokeWidth={1.5} /> : <Bookmark size={15} strokeWidth={1.5} />}
      </IconBtn>
      <IconBtn label="Write a note on this ayah" onClick={(e) => onAction("note", e)} badge={notes || undefined}>
        <StickyNote size={15} strokeWidth={1.5} />
      </IconBtn>
      <IconBtn label="Record a voice note on this ayah" onClick={(e) => onAction("voice", e)} badge={voices || undefined}>
        <Mic size={15} strokeWidth={1.5} />
      </IconBtn>
      <IconBtn label="Copy ayah" onClick={(e) => onAction("copy", e)}>
        <Copy size={15} strokeWidth={1.5} />
      </IconBtn>
      <IconBtn label="Share ayah" onClick={(e) => onAction("share", e)}>
        <Share2 size={15} strokeWidth={1.5} />
      </IconBtn>
    </div>
  );
}

function IconBtn({
  children,
  label,
  onClick,
  active,
  badge,
}: {
  children: ReactNode;
  label: string;
  onClick: (el: HTMLElement) => void;
  active?: boolean;
  badge?: number;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={(e) => onClick(e.currentTarget)}
      className={cn(
        "relative flex h-8 w-8 items-center justify-center transition-colors hover:bg-[var(--box-hover)] hover:text-[var(--box-fg)]",
        active && "text-[var(--box-accent)] hover:text-[var(--box-accent)]",
      )}
    >
      {children}
      {badge ? (
        <span className="count-badge">
          {badge}
        </span>
      ) : null}
    </button>
  );
}
