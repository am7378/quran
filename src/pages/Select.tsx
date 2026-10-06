import { animate, AnimatePresence, motion, useMotionValue, useMotionValueEvent } from "framer-motion";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { IndexView, INDEX_VIEWS, type IndexKind } from "./IndexViews";
import { HaloReel, type ReelGeometry } from "@/components/ui/halo-reel";
import { AyahSlider } from "@/components/ui/slider";
import { SurahCard } from "@/components/SurahCard";
import { SearchBox } from "@/components/SearchBox";
import { BracketButton, Clock, DotField } from "@/components/bits";
import type { Surah } from "@/lib/data";
import { pad3 } from "@/lib/data";
import type { Result } from "@/lib/search";
import type { Rect } from "@/lib/layout";
import { isLongPressMenu } from "@/lib/touch";
import { EASE_OUT, clamp, cn } from "@/lib/utils";
import { useUI, type MenuItem } from "@/lib/ui";
import { SettingsGlyph } from "@/components/ImmersivePanel";
import { ayn, nameMarks } from "@/lib/names";

const COUNT = 114;
const SEARCH_H = 40; // the search input's height
const NAME_H = 30; // the surah name row above it
const NAME_GAP = 14;
const mod = (a: number, n: number) => ((a % n) + n) % n;
let lastView: IndexKind = "ring"; // the way the index was last seen, kept for coming back to it

export type OpenRequest = { surah: number; ayah: number; from?: Rect };

export function Select({
  surahs,
  juz,
  initialSurah,
  initialAyah = 1,
  onOpen,
  mobile,
  resume,
  onSettings,
  settingsOpen,
}: {
  surahs: Surah[];
  juz: Record<string, string>;
  initialSurah: number;
  initialAyah?: number; // back from the reader: the ayah that was being read
  onOpen: (r: OpenRequest) => void;
  mobile: boolean;
  resume?: { s: number; v: number } | null; // where the reader left off, last time
  onSettings: () => void;
  settingsOpen: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const pos = useMotionValue(initialSurah - 1);
  const [front, setFront] = useState(initialSurah - 1);
  const [ayah, setAyah] = useState(initialAyah);
  const pendingAyah = useRef<{ surah: number; ayah: number } | null>({ surah: initialSurah, ayah: initialAyah });
  const [view, setViewState] = useState<IndexKind>(lastView);
  const setView = (v: IndexKind) => {
    lastView = v;
    setViewState(v);
  };
  const ring = view === "ring";

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useMotionValueEvent(pos, "change", (v) => {
    const f = mod(Math.round(v), COUNT);
    setFront((prev) => (prev === f ? prev : f));
  });
  // a new surah in front: start from its first ayah, unless a search (or the reader just left)
  // asked for another; the same surah again (a re-run, a re-render) keeps its ayah
  const handledFront = useRef<number | null>(null);
  useEffect(() => {
    if (handledFront.current === front) return;
    const first = handledFront.current === null;
    handledFront.current = front;
    const p = pendingAyah.current;
    if (p && p.surah === front + 1) {
      setAyah(p.ayah);
      pendingAyah.current = null;
    } else if (!first) setAyah(1);
  }, [front]);

  const surah = surahs[front];
  // (a surah just come to the front shows its own ayah from its first frame, not the last one's)
  const shownAyah = handledFront.current === front ? ayah : pendingAyah.current?.surah === front + 1 ? pendingAyah.current.ayah : 1;

  // geometry of the ring: pinned to the left edge, front card on the one-third line
  const W = size.w, H = size.h;
  const stageH = mobile ? H * 0.56 : H;
  const top = mobile ? 52 : 0;
  const cardW = mobile ? clamp(Math.min(W * 0.36, stageH * 0.46), 104, 150) : clamp(H * 0.3, 118, 178);
  // "Continue", on a phone: at the foot, under the slider, where there is room for it (the search,
  // the slider and their gaps end about 207px below the ring's stage); on a small phone, a line
  // under "Surahs" instead
  const resumable = !!(resume && surahs[resume.s - 1]);
  const resumeAtFoot = !mobile || H * 0.44 - 207 >= 56;
  const g: ReelGeometry = {
    cx: 0,
    cy: mobile ? (top + stageH - 40) / 2 : stageH / 2,
    rx: mobile ? W * 0.5 : W / 3,
    ry: stageH * (mobile ? 0.36 : 0.42),
    cardW,
    cardH: cardW * 1.4,
    step: mobile ? 0.3 : 0.3,
    minScale: 0.42,
  };

  /** turn the ring the short way round to a surah */
  const turnTo = useCallback(
    (n: number, then?: () => void) => {
      const cur = pos.get();
      const target = Math.round(cur) + (((n - 1 - mod(Math.round(cur), COUNT) + COUNT + COUNT / 2) % COUNT) - COUNT / 2);
      const dist = Math.abs(target - cur);
      animate(pos, target, {
        duration: Math.min(1.1, 0.45 + dist * 0.03),
        ease: EASE_OUT,
        onComplete: then,
      });
    },
    [pos],
  );

  const openFront = useCallback(
    (a = ayah) => {
      const card = stageRef.current?.querySelector<HTMLElement>(`[data-abs="${Math.round(pos.get())}"]`);
      const root = rootRef.current?.getBoundingClientRect();
      let from: Rect | undefined;
      if (card && root) {
        const c = card.getBoundingClientRect();
        from = { left: c.left - root.left, top: c.top - root.top, width: c.width, height: c.height };
      }
      onOpen({ surah: mod(Math.round(pos.get()), COUNT) + 1, ayah: a, from });
    },
    [ayah, onOpen, pos],
  );

  const onPick = (r: Result) => {
    if (r.kind === "surah") {
      turnTo(r.surah.n);
      return;
    }
    const n = r.surah.n;
    const a = r.ayah;
    if (mod(Math.round(pos.get()), COUNT) + 1 === n) {
      setAyah(a);
      openFront(a);
      return;
    }
    pendingAyah.current = { surah: n, ayah: a };
    turnTo(n, () => setTimeout(() => openFront(a), 160));
  };

  const previewTimer = useRef(0);
  const onPreview = (s: Surah | null) => {
    clearTimeout(previewTimer.current);
    if (!s) return;
    previewTimer.current = window.setTimeout(() => turnTo(s.n), 280);
  };

  // the right-click menu: the surah under the pointer (a card of the ring, a line of a list), then the index's own things
  const onContextMenu = (e: React.MouseEvent) => {
    const t = e.target as HTMLElement;
    if (isLongPressMenu(e.nativeEvent) || t.closest("input, textarea")) return;
    e.preventDefault();
    const items: MenuItem[] = [];
    if (ring) {
      const cur = surahs[mod(Math.round(pos.get()), COUNT)];
      const card = t.closest<HTMLElement>("[data-abs]");
      const under = card ? surahs[mod(Number(card.dataset.abs), COUNT)] : null;
      items.push({ type: "label", label: (under ?? cur).tc });
      if (under && under.n !== cur.n) {
        items.push({ type: "item", label: `Bring it forward`, onSelect: () => turnTo(under.n) });
        items.push({ type: "item", label: `Open ${ayn(under.tc)}`, onSelect: () => turnTo(under.n, () => setTimeout(() => openFront(1), 160)) });
      } else items.push({ type: "item", label: `Open at ayah ${ayah}`, hint: "Enter", onSelect: () => openFront() });
      items.push({ type: "sep" });
      items.push({ type: "item", label: "Next surah", hint: "↓", onSelect: () => turnTo((cur.n % 114) + 1) });
      items.push({ type: "item", label: "Previous surah", hint: "↑", onSelect: () => turnTo(((cur.n + 112) % 114) + 1) });
      items.push({ type: "item", label: "Search", onSelect: () => rootRef.current?.querySelector<HTMLInputElement>("input")?.focus() });
    } else {
      const line = t.closest<HTMLElement>("[data-index-list] button");
      if (line) {
        items.push({ type: "item", label: "Open", onSelect: () => line.click() });
        items.push({ type: "sep" });
      }
      items.push({ type: "item", label: "All surahs", onSelect: () => setView("ring") });
    }
    if (resume && surahs[resume.s - 1]) items.push({ type: "item", label: `Continue · ${ayn(surahs[resume.s - 1].tc)} ${resume.s}:${resume.v}`, onSelect: () => onOpen({ surah: resume.s, ayah: resume.v }) });
    items.push({ type: "sep" });
    items.push({ type: "item", label: "Settings", onSelect: onSettings });
    items.push({ type: "item", label: "About this reader", onSelect: () => useUI.getState().setAbout(true) });
    useUI.getState().openMenu(e.clientX, e.clientY, items);
  };

  // a computer's keys (Settings → Guide lists them): the arrows turn the ring, Enter opens the surah in
  // front at its ayah, / searches, C continues where the reader left off, a comma opens Settings
  const keysNow = useRef<(e: KeyboardEvent) => void>(() => {});
  keysNow.current = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    const ui = useUI.getState();
    if (e.defaultPrevented || settingsOpen || ui.about || ui.menu || e.ctrlKey || e.metaKey || e.altKey || !ring) return;
    // (where a field, the slider or the ring itself has the keys, they keep them)
    if (t?.closest?.("input, textarea, [contenteditable], [role=slider], [role=listbox], [role=menu], [role=dialog]")) return;
    const cur = surahs[mod(Math.round(pos.get()), COUNT)];
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (k === "ArrowDown" || k === "ArrowRight") return e.preventDefault(), turnTo((cur.n % 114) + 1);
    if (k === "ArrowUp" || k === "ArrowLeft") return e.preventDefault(), turnTo(((cur.n + 112) % 114) + 1);
    if (k === "Enter" && !t?.closest?.("button, a")) return e.preventDefault(), openFront();
    if (k === "/") return e.preventDefault(), rootRef.current?.querySelector<HTMLInputElement>("input")?.focus();
    if (k === "c" && resume && resumable) return e.preventDefault(), onOpen({ surah: resume.s, ayah: resume.v });
    if (k === ",") return e.preventDefault(), onSettings();
  };
  useEffect(() => {
    const on = (e: KeyboardEvent) => keysNow.current(e);
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);

  const colCenter = mobile ? W / 2 : (W * 2) / 3;
  const colW = mobile ? W - 36 : clamp(W * 0.36, 300, 440);

  return (
    <motion.div
      ref={rootRef}
      className="relative h-full w-full"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.35 } }}
      transition={{ duration: 0.6, delay: 0.1 }}
      onContextMenu={onContextMenu}
    >
      {/* top row (above the search and the ring: its index menu opens over them) */}
      <div className="absolute inset-x-0 top-0 z-40 flex items-start justify-between px-5 pt-4 md:px-7 md:pt-5">
        <div className="relative">
          <ViewPicker view={view} onChange={setView} />
          {ring && resumable && !resumeAtFoot ? (
            <button type="button" onClick={() => onOpen({ surah: resume!.s, ayah: resume!.v })} className="label mt-1 flex items-center gap-1.5 text-[var(--box-muted)] transition-colors hover:text-[var(--box-fg)]">
              Continue {resume!.s}:{resume!.v} <span aria-hidden>→</span>
            </button>
          ) : (
            <div className="label mt-1 text-[var(--box-faint)]">{ring ? `[${pad3(front + 1)} / 114]` : INDEX_VIEWS.find((v) => v.id === view)?.line}</div>
          )}
        </div>
        {/* About and Settings set as on the cover (side by side, no gap but their own padding), the
            gear's edge on the same line as the search and the Open button under it */}
        <div className="flex h-[22px] items-center">
          <BracketButton onClick={() => useUI.getState().setAbout(true)} title="About this reader">
            About
          </BracketButton>
          {mobile ? (
            <button type="button" onClick={onSettings} aria-label="Settings" title="Settings" className="-mr-3 flex h-9 w-9 items-center justify-center text-[var(--box-muted)] transition-colors hover:bg-[var(--box-hover)] hover:text-[var(--box-fg)]">
              <SettingsGlyph open={settingsOpen} />
            </button>
          ) : (
            <BracketButton onClick={onSettings} active={settingsOpen} title="Settings">
              Settings
            </BracketButton>
          )}
          {!mobile && <Clock className="ml-3 text-[var(--box-muted)]" />}
        </div>
      </div>

      {/* where the reader left off last time, one tap away */}
      {ring && resume && resumable && resumeAtFoot && (
        <motion.div
          className={cn("pointer-events-none absolute inset-x-0 z-30 flex", mobile ? "justify-center px-5" : "justify-center px-24")}
          // on a phone the top row is full and the ring rises to it: at the foot instead, under the slider
          style={mobile ? { bottom: 14 } : { top: 18 }}
          initial={{ opacity: 0, y: mobile ? 8 : -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.55, duration: 0.6, ease: EASE_OUT }}
        >
          <button
            type="button"
            onClick={() => onOpen({ surah: resume.s, ayah: resume.v })}
            className="btn-secondary pill group pointer-events-auto flex h-9 min-w-0 items-center gap-2.5 border border-[var(--box-line)] bg-[var(--box-hover)] px-3.5 transition-colors hover:border-[var(--box-fg)]"
            aria-label={`Continue reading ${ayn(surahs[resume.s - 1].tc)}, ayah ${resume.v}`}
          >
            <span className="label shrink-0 text-[var(--box-muted)]">Continue</span>
            {!mobile && <span className="-my-[0.15em] truncate py-[0.15em] font-serif text-[15px] italic leading-[1.15]">{nameMarks(surahs[resume.s - 1].tc)}</span>}
            <span className="label shrink-0 tabular-nums text-[var(--box-fg)]">
              {resume.s}:{resume.v}
            </span>
            <span className="shrink-0 transition-transform duration-300 group-hover:translate-x-0.5">→</span>
          </button>
        </motion.div>
      )}

      {/* the other ways of seeing the index */}
      <AnimatePresence mode="wait" initial={false}>
        {!ring && (
          <motion.div
            key={view}
            className="absolute inset-x-0 bottom-0 z-10"
            style={{ top: mobile ? 66 : 82 }}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8, transition: { duration: 0.18 } }}
            transition={{ duration: 0.45, ease: EASE_OUT }}
          >
            <div data-index-list className="h-full">
              <IndexView kind={view} surahs={surahs} juz={juz} onOpen={(s, a) => onOpen({ surah: s, ayah: a })} mobile={mobile} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* the ring */}
      {ring && W > 0 && (
        <div
          ref={stageRef}
          className="absolute inset-0 z-10"
          style={{
            ...(mobile ? { top: 40, bottom: H - (top + stageH) } : { right: W - colCenter + colW / 2 + 24 }),
            // cards surface from and sink back into depth at the top and bottom
            maskImage: "linear-gradient(to bottom, transparent 0%, #000 14%, #000 86%, transparent 100%)",
            WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, #000 14%, #000 86%, transparent 100%)",
          }}
        >
          <HaloReel
            className="h-full w-full"
            label="Surahs"
            count={COUNT}
            pos={pos}
            geometry={g}
            visible={7}
            renderCard={(i, isFront) => (
              <div className="h-full w-full" style={{ fontSize: cardW / 15 }}>
                <SurahCard surah={surahs[i]} front={isFront} />
              </div>
            )}
            onCardClick={(abs, isFront) => {
              if (isFront) openFront();
            }}
          />
        </div>
      )}

      {/* search, centred on the frame's middle, with the surah name above and the ayah slider below */}
      {ring && W > 0 && surah && (
        <div
          className="absolute z-30"
          style={
            mobile
              ? { left: 18, right: 18, top: top + stageH + 40 }
              : { left: colCenter - colW / 2, width: colW, top: H / 2 - SEARCH_H / 2 }
          }
        >
          {/* where it was revealed: halfway between the frame's top edge and the surah name */}
          {!mobile && (
            <motion.div
              key={`place-${surah.n}`}
              className="label pointer-events-none absolute left-0 right-0 text-center text-[var(--box-faint)]"
              style={{ top: -(H / 2 - SEARCH_H / 2 - NAME_GAP - NAME_H) / 2 - NAME_GAP - NAME_H, transform: "translateY(-50%)" }}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: EASE_OUT }}
            >
              {surah.place === "makkah" ? "Makkan" : "Madinan"} · {surah.count} ayat
            </motion.div>
          )}
          <motion.div
            className="absolute bottom-full left-0 right-0 flex items-baseline justify-between gap-3"
            style={{ marginBottom: NAME_GAP, height: NAME_H }}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35, duration: 0.7, ease: EASE_OUT }}
          >
            <span className="display -my-[0.18em] self-end truncate py-[0.18em] font-serif text-[22px] leading-[1.1] italic md:text-[26px]">{nameMarks(surah.tc)}</span>
            <span className="flex shrink-0 items-baseline gap-3 self-end">
              {mobile && <span className="label text-[var(--box-faint)]">{surah.place === "makkah" ? "Makkan" : "Madinan"}</span>}
              <span className="font-kufi text-[18px] leading-none text-[var(--box-muted)]" dir="rtl">
                {surah.ar}
              </span>
            </span>
          </motion.div>

          {/* above the slider below it, so the dropdown of results opens over it */}
          <motion.div
            className="relative z-20 flex flex-wrap items-start gap-2"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.7, ease: EASE_OUT }}
          >
            <SearchBox className="w-auto min-w-[150px] flex-1 basis-0" surahs={surahs} juz={juz} onPick={onPick} onPreview={onPreview} />
            <button
              type="button"
              onClick={() => openFront()}
              className="btn-primary group relative inline-flex h-10 shrink-0 items-center gap-2 whitespace-nowrap border-2 border-[var(--box-fg)] px-3.5 transition-colors hover:bg-[var(--box-fg)] hover:text-[var(--box-bg-solid)]"
              aria-label={`Open ${ayn(surah.tc)}, ayah ${shownAyah}`}
            >
              <span className="label">
                Open {surah.n}:{shownAyah}
              </span>
              <span className="transition-transform duration-300 group-hover:translate-x-0.5">→</span>
            </button>
          </motion.div>

          <motion.div
            className="relative z-0 mt-7"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.7, ease: EASE_OUT }}
          >
            <div className="mb-1 flex items-center justify-between">
              <span className="label text-[var(--box-faint)]">Ayah</span>
              <span className="label tabular-nums text-[var(--box-muted)]">
                {shownAyah} / {surah.count}
              </span>
            </div>
            <AyahSlider key={surah.n} value={Math.min(shownAyah, surah.count)} max={surah.count} onChange={setAyah} />
          </motion.div>
        </div>
      )}
      {ring && !mobile && <DotField className="absolute bottom-6 right-6 text-[var(--box-muted)]" cols={10} rows={7} />}
    </motion.div>
  );
}

/** "Surahs ▾": the ring of surahs, or the index seen another way */
function ViewPicker({ view, onChange }: { view: IndexKind; onChange: (v: IndexKind) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("keydown", key);
    };
  }, [open]);
  const cur = INDEX_VIEWS.find((v) => v.id === view)!;
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-[22px] items-center gap-1.5 text-[13px] text-[var(--box-fg)] transition-colors hover:text-[var(--color-gold)]"
      >
        {cur.name}
        <ChevronDown size={13} strokeWidth={1.8} className={cn("transition-transform duration-300", open && "rotate-180")} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            aria-label="See the index by"
            className="theme-pop absolute left-0 top-[calc(100%+8px)] z-40 w-[264px] border border-[var(--box-line)] bg-[var(--box-bg-solid)] p-1.5 shadow-[0_18px_50px_-14px_rgba(0,0,0,0.7)]"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, transition: { duration: 0.12 } }}
            transition={{ duration: 0.22, ease: EASE_OUT }}
          >
            <div className="label px-2 pb-1.5 pt-1 text-[var(--box-faint)]">See the index by</div>
            {INDEX_VIEWS.map((v) => (
              <button
                key={v.id}
                type="button"
                role="menuitemradio"
                aria-checked={v.id === view}
                onClick={() => {
                  onChange(v.id);
                  setOpen(false);
                }}
                className={cn("flex w-full items-start gap-2.5 px-2 py-2 text-left transition-colors hover:bg-[var(--box-hover)]", v.id === view && "bg-[var(--box-hover)]")}
              >
                <span className={cn("mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center", v.id === view ? "text-[var(--color-gold)]" : "text-transparent")}>
                  <Check size={13} strokeWidth={2.4} />
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="text-[13.5px] leading-tight text-[var(--box-fg)]">{v.name}</span>
                  <span className="label-sm mt-0.5 text-[var(--box-faint)]">{v.line}</span>
                </span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export { BracketButton };
