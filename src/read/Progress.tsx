import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { get } from "idb-keyval";
import { ArrowLeft, Bookmark, Check, Mic, NotebookPen, Pause, Play, StickyNote } from "lucide-react";
import type { Surah } from "@/lib/data";
import { pad3 } from "@/lib/data";
import { HIGHLIGHT_COLORS, HIGHLIGHT_HEX, useStore, type Goal, type Highlight, type Note, type Reflection } from "@/lib/store";
import { sfx } from "@/lib/sound";
import { EASE_OUT, cn } from "@/lib/utils";
import { Segmented } from "@/components/ui/segmented";
import { voiceKey } from "./VoiceNote";
import { QuillGlyph } from "@/components/glyphs";

/**
 * Progress, as the reader marks it: a surah is completed when they tick it, at its end or here.
 * That is the only thing counted. A goal, if they set one, is measured against it. And for each
 * surah the reader has written in, a page of everything they kept there (their journal of it).
 */

const TOTAL_AYAT = 6236;
const fmtDate = (t: number | string) => new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

/** Completing a surah (or undoing it): the sound and the small burst that answer it. */
function useCompleting(n: number) {
  const done = useStore((s) => s.done[n]);
  const toggle = useStore((s) => s.toggleDone);
  const [burst, setBurst] = useState(0);
  const press = () => {
    const was = !!useStore.getState().done[n];
    toggle(n);
    if (was) sfx("undo");
    else {
      sfx("complete");
      setBurst((b) => b + 1);
    }
  };
  return { done, press, burst };
}

/** A ring of light and a few motes going out from the tick, once, when a surah is completed. */
function Burst({ k }: { k: number }) {
  const reduce = useStore((s) => s.settings.reduceMotion);
  if (!k || reduce) return null;
  return (
    <span key={k} className="pointer-events-none absolute inset-0" aria-hidden>
      <motion.span
        className="absolute inset-0 rounded-full border border-[var(--color-gold)]"
        initial={{ scale: 1, opacity: 0.8 }}
        animate={{ scale: 2.3, opacity: 0 }}
        transition={{ duration: 0.75, ease: "easeOut" }}
      />
      {Array.from({ length: 6 }, (_, i) => {
        const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
        return (
          <motion.span
            key={i}
            className="absolute left-1/2 top-1/2 -ml-[2px] -mt-[2px] h-1 w-1 rounded-full bg-[var(--color-gold)]"
            initial={{ x: 0, y: 0, opacity: 0.9, scale: 1 }}
            animate={{ x: Math.cos(a) * 22, y: Math.sin(a) * 22, opacity: 0, scale: 0.4 }}
            transition={{ duration: 0.7, ease: [0.2, 0.7, 0.3, 1], delay: 0.04 }}
          />
        );
      })}
    </span>
  );
}

/** The tick at the end of a surah (and in its journal): completed, or not yet. */
export function CompleteMark({ surah }: { surah: Surah }) {
  const { done, press, burst } = useCompleting(surah.n);
  return (
    <button
      type="button"
      onClick={press}
      aria-pressed={!!done}
      data-sfx="none"
      className="group flex items-center gap-3 text-left"
      title={done ? "Completed. Tap to undo." : `Mark ${surah.tc} as completed`}
    >
      <span
        className={cn(
          "pill relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-colors duration-300",
          done ? "border-[var(--box-fg)] bg-[var(--box-fg)] text-[var(--box-bg-solid)]" : "border-[var(--box-muted)] text-transparent group-hover:border-[var(--box-fg)]",
        )}
      >
        <Burst k={burst} />
        <AnimatePresence initial={false}>
          {done && (
            <motion.span key="tick" initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }} transition={{ type: "spring", stiffness: 420, damping: 18 }}>
              <Check size={15} strokeWidth={2.2} />
            </motion.span>
          )}
        </AnimatePresence>
      </span>
      <span className="flex flex-col">
        <span className="text-[14px] text-[var(--box-fg)]">{done ? "Completed" : "Mark as completed"}</span>
        {done ? <span className="label-sm text-[var(--box-faint)]">{fmtDate(done)}</span> : null}
      </span>
    </button>
  );
}

/* ── the goal's period: this week (from Monday), this month ── */
function periodStart(kind: "week" | "month", now = new Date()) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (kind === "month") d.setDate(1);
  else d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}
function periodEnd(kind: "week" | "month", now = new Date()) {
  const s = periodStart(kind, now);
  const e = new Date(s);
  if (kind === "month") e.setMonth(e.getMonth() + 1);
  else e.setDate(e.getDate() + 7);
  return e;
}
const DAY = 86_400_000;


/* ── what the reader has kept in each surah ─────────────────────── */

type Kept = { hl: Highlight[]; notes: Note[]; voice: Note[]; marks: string[]; reflection: Reflection | null };
const hasReflection = (r?: Reflection) => !!r && !!(r.summary.trim() || r.lessons.trim() || r.recordings.length);

function useKept(): Map<number, Kept> {
  const highlights = useStore((s) => s.highlights);
  const notes = useStore((s) => s.notes);
  const bookmarks = useStore((s) => s.bookmarks);
  const reflections = useStore((s) => s.reflections);
  return useMemo(() => {
    const m = new Map<number, Kept>();
    const of = (n: number) => {
      let k = m.get(n);
      if (!k) m.set(n, (k = { hl: [], notes: [], voice: [], marks: [], reflection: null }));
      return k;
    };
    const surahOf = (key: string) => Number(key.split(":")[0]);
    for (const h of Object.values(highlights)) of(surahOf(h.key)).hl.push(h);
    for (const n of Object.values(notes)) {
      if (n.kind === "voice") of(surahOf(n.key)).voice.push(n);
      else if (n.text.trim() || n.quote) of(surahOf(n.key)).notes.push(n);
    }
    for (const k of Object.keys(bookmarks)) of(surahOf(k)).marks.push(k);
    for (const [s, r] of Object.entries(reflections)) if (hasReflection(r)) of(Number(s)).reflection = r;
    return m;
  }, [highlights, notes, bookmarks, reflections]);
}

export function ProgressTab({ surahs, onGo }: { surahs: Surah[]; onGo: (s: number, a: number) => void }) {
  const done = useStore((s) => s.done);
  const goal = useStore((s) => s.goal);
  const toggle = useStore((s) => s.toggleDone);
  const [confirm, setConfirm] = useState(false);
  const [editing, setEditing] = useState(false);
  const [pick, setPick] = useState<number | null>(null); // a surah chosen on the grid
  const [journal, setJournal] = useState<number | null>(null); // a surah's page of everything kept in it
  const kept = useKept();
  const top = useRef<HTMLDivElement>(null);
  // the journal opens at its top (the panel scrolls), and closing it comes back to where it was
  const backTo = useRef(0);
  const open = (n: number) => {
    const sc = top.current?.closest<HTMLElement>(".overflow-y-auto");
    backTo.current = sc?.scrollTop ?? 0;
    setJournal(n);
    requestAnimationFrame(() => sc && (sc.scrollTop = 0));
  };
  const close = () => {
    setJournal(null);
    const sc = top.current?.closest<HTMLElement>(".overflow-y-auto");
    requestAnimationFrame(() => sc && (sc.scrollTop = backTo.current));
  };

  const n = Object.keys(done).length;
  const ayat = Object.keys(done).reduce((a, s) => a + (surahs[Number(s) - 1]?.count ?? 0), 0);
  const recent = Object.entries(done)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  const withKept = [...kept.keys()].sort((a, b) => a - b);

  if (journal) {
    const s = surahs[journal - 1];
    return (
      <div ref={top} className="contents">
        <SurahJournal surah={s} kept={kept.get(journal) ?? null} onBack={close} onGo={onGo} />
      </div>
    );
  }

  return (
    <>
      <div ref={top} className="text-[13px] text-[var(--box-muted)]">Mark a surah as completed at its end, or here: choose it below.</div>

      <div>
        <div className="flex items-baseline gap-3">
          <span className="display font-serif text-[44px] leading-none italic tabular-nums md:text-[56px]">{n}</span>
          <span className="label text-[var(--box-faint)]">of 114 surahs completed</span>
        </div>
        <div className="mt-3 h-[3px] w-full bg-[var(--box-line)]">
          <motion.div className="h-full bg-[var(--box-fg)]" initial={false} animate={{ width: `${(n / 114) * 100}%` }} transition={{ duration: 0.6, ease: EASE_OUT }} />
        </div>
        <div className="label-sm mt-2 text-[var(--box-faint)] tabular-nums">
          {ayat.toLocaleString()} of {TOTAL_AYAT.toLocaleString()} ayat · {((ayat / TOTAL_AYAT) * 100).toFixed(ayat ? 1 : 0)}%
        </div>
      </div>

      {/* the 114, in order: completed ones filled; one chosen opens its bar below */}
      <div>
        <div className="grid grid-cols-[repeat(19,minmax(0,1fr))] gap-[3px]" role="listbox" aria-label="The 114 surahs">
          {surahs.map((s) => (
            <button
              key={s.n}
              type="button"
              role="option"
              aria-selected={pick === s.n}
              onClick={() => setPick((p) => (p === s.n ? null : s.n))}
              title={`${pad3(s.n)} ${s.tc}${done[s.n] ? ` · completed ${fmtDate(done[s.n])}` : ""}`}
              aria-label={`${s.tc}${done[s.n] ? ", completed" : ""}`}
              className={cn(
                "relative aspect-square border transition-colors",
                done[s.n] ? "border-[var(--box-fg)] bg-[var(--box-fg)]" : "border-[var(--box-line)] hover:border-[var(--box-muted)]",
                pick === s.n && "outline outline-2 outline-offset-1 outline-[var(--color-gold)]",
              )}
            >
              {/* something kept in it: a small mark in the corner */}
              {kept.has(s.n) && <span className={cn("absolute right-[1px] top-[1px] h-[3px] w-[3px]", done[s.n] ? "bg-[var(--box-bg-solid)]" : "bg-[var(--color-gold)]")} />}
            </button>
          ))}
        </div>
        <AnimatePresence initial={false} mode="wait">
          {pick ? (
            <PickBar key={pick} surah={surahs[pick - 1]} hasKept={kept.has(pick)} onGo={onGo} onJournal={() => open(pick)} />
          ) : (
            <motion.div key="hint" className="label-sm mt-3 text-[var(--box-faint)]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              Choose a surah to mark it, or to open it
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <GoalBox goal={goal} done={done} surahs={surahs} editing={editing || !goal} onEdit={setEditing} />

      {/* every surah the reader has kept something in: its journal */}
      {withKept.length > 0 && (
        <div>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[15px]">Your notes and highlights</span>
            <span className="label-sm text-[var(--box-faint)]">{withKept.length} surah{withKept.length === 1 ? "" : "s"}</span>
          </div>
          <div className="mt-1 text-[12.5px] text-[var(--box-faint)]">Everything you kept in a surah, on one page.</div>
          <div className="mt-3 flex flex-col">
            {withKept.map((k) => (
              <KeptRow key={k} surah={surahs[k - 1]} kept={kept.get(k)!} done={!!done[k]} onOpen={() => open(k)} />
            ))}
          </div>
        </div>
      )}

      {recent.length > 0 && (
        <div>
          <div className="mb-1 text-[15px]">Recently completed</div>
          {recent.map(([s, at]) => (
            <div key={s} className="flex items-baseline gap-3 border-t border-[var(--box-line)] py-2">
              <span className="w-[3ch] font-mono text-[11px] text-[var(--box-faint)] tabular-nums">{pad3(Number(s))}</span>
              <button type="button" onClick={() => onGo(Number(s), 1)} className="min-w-0 flex-1 truncate text-left font-serif text-[16px] italic hover:text-[var(--color-gold)]">
                {surahs[Number(s) - 1]?.tc}
              </button>
              <span className="label-sm text-[var(--box-faint)]">{fmtDate(at)}</span>
              <button type="button" data-sfx="undo" onClick={() => toggle(Number(s))} className="label-sm text-[var(--box-faint)] hover:text-[var(--box-fg)]">
                Undo
              </button>
            </div>
          ))}
        </div>
      )}

      {n > 0 && (
        <div className="flex items-center justify-end gap-4 border-t border-[var(--box-line)] pt-5">
          <button
            type="button"
            onClick={() => (confirm ? (useStore.setState({ done: {} }), setConfirm(false)) : setConfirm(true))}
            onBlur={() => setConfirm(false)}
            className={cn("label border px-3 py-2 transition-colors", confirm ? "border-[var(--box-fg)] bg-[var(--box-fg)] text-[var(--box-bg-solid)]" : "border-[var(--box-line)] text-[var(--box-muted)] hover:border-[var(--box-fg)]")}
          >
            {confirm ? "Press again to clear all ticks" : "Start again"}
          </button>
        </div>
      )}
    </>
  );
}

/** The surah chosen on the grid: mark it (or undo), read it, open what is kept in it. */
function PickBar({ surah, hasKept, onGo, onJournal }: { surah: Surah; hasKept: boolean; onGo: (s: number, a: number) => void; onJournal: () => void }) {
  const { done, press, burst } = useCompleting(surah.n);
  return (
    <motion.div
      className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-3 border border-[var(--box-line)] px-3 py-2.5"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: { duration: 0.1 } }}
      transition={{ duration: 0.22, ease: EASE_OUT }}
    >
      <div className="flex min-w-[170px] flex-1 items-baseline gap-2.5">
        <span className="font-mono text-[11px] text-[var(--box-faint)] tabular-nums">{pad3(surah.n)}</span>
        <span className="truncate font-serif text-[18px] italic">{surah.tc}</span>
        <span className="label-sm shrink-0 text-[var(--box-faint)]">{surah.count} ayat</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={press}
          data-sfx="none"
          aria-pressed={!!done}
          className={cn(
            "pill relative flex h-8 items-center gap-2 border px-3 text-[13px] transition-colors",
            done ? "border-[var(--box-fg)] bg-[var(--box-fg)] text-[var(--box-bg-solid)]" : "border-[var(--box-line)] text-[var(--box-fg)] hover:border-[var(--box-fg)]",
          )}
        >
          <span className="relative flex h-3.5 w-3.5 items-center justify-center">
            <Burst k={burst} />
            {done ? <Check size={13} strokeWidth={2.4} /> : <span className="h-3 w-3 rounded-full border border-current" />}
          </span>
          {done ? `Completed · ${fmtDate(done)}` : "Mark as completed"}
        </button>
        {hasKept && (
          <button type="button" onClick={onJournal} className="pill flex h-8 items-center gap-1.5 border border-[var(--box-line)] px-3 text-[13px] text-[var(--box-muted)] transition-colors hover:border-[var(--box-fg)] hover:text-[var(--box-fg)]">
            <NotebookPen size={13} strokeWidth={1.6} />
            Notes &amp; highlights
          </button>
        )}
        <button type="button" onClick={() => onGo(surah.n, 1)} className="pill flex h-8 items-center border border-[var(--box-line)] px-3 text-[13px] text-[var(--box-muted)] transition-colors hover:border-[var(--box-fg)] hover:text-[var(--box-fg)]">
          Read →
        </button>
      </div>
    </motion.div>
  );
}

/** A surah in the list of what is kept: its name, and a glance at what is in it. */
function KeptRow({ surah, kept, done, onOpen }: { surah: Surah; kept: Kept; done: boolean; onOpen: () => void }) {
  const colours = HIGHLIGHT_COLORS.filter((c) => kept.hl.some((h) => h.color === c));
  return (
    <button type="button" onClick={onOpen} className="group flex items-center gap-3 border-t border-[var(--box-line)] py-2.5 text-left transition-colors hover:bg-[var(--box-hover)]">
      <span className="w-[3ch] shrink-0 font-mono text-[11px] text-[var(--box-faint)] tabular-nums">{pad3(surah.n)}</span>
      <span className="min-w-0 flex-1 truncate font-serif text-[16px] italic">{surah.tc}</span>
      <span className="flex shrink-0 items-center gap-3 text-[var(--box-faint)]">
        {kept.hl.length > 0 && (
          <span className="flex items-center gap-1.5" title={`${kept.hl.length} highlight${kept.hl.length === 1 ? "" : "s"}`}>
            <span className="flex">
              {colours.map((c, i) => (
                <span key={c} className={cn("swatch-edge h-2.5 w-2.5 rounded-full", i > 0 && "-ml-1")} style={{ background: HIGHLIGHT_HEX[c] }} />
              ))}
            </span>
            <span className="font-mono text-[10px] tabular-nums">{kept.hl.length}</span>
          </span>
        )}
        {kept.notes.length > 0 && <Count icon={<StickyNote size={12} strokeWidth={1.6} />} n={kept.notes.length} what="note" />}
        {kept.voice.length > 0 && <Count icon={<Mic size={12} strokeWidth={1.6} />} n={kept.voice.length} what="voice note" />}
        {kept.marks.length > 0 && <Count icon={<Bookmark size={12} strokeWidth={1.6} />} n={kept.marks.length} what="bookmark" />}
        {kept.reflection && <span title="Your reflection"><QuillGlyph size={13} /></span>}
        <span className={cn("flex h-4 w-4 items-center justify-center rounded-full border", done ? "border-[var(--box-fg)] bg-[var(--box-fg)] text-[var(--box-bg-solid)]" : "border-[var(--box-line)] text-transparent")} title={done ? "Completed" : "Not completed yet"}>
          <Check size={10} strokeWidth={2.6} />
        </span>
        <span className="label-sm opacity-0 transition-opacity group-hover:opacity-100">Open →</span>
      </span>
    </button>
  );
}

function Count({ icon, n, what }: { icon: React.ReactNode; n: number; what: string }) {
  return (
    <span className="flex items-center gap-1" title={`${n} ${what}${n === 1 ? "" : "s"}`}>
      {icon}
      <span className="font-mono text-[10px] tabular-nums">{n}</span>
    </span>
  );
}

/* ── a surah's journal: everything the reader kept in it, ayah by ayah ── */

function SurahJournal({ surah, kept, onBack, onGo }: { surah: Surah; kept: Kept | null; onBack: () => void; onGo: (s: number, a: number) => void }) {
  // the ayat with anything in them, in order
  const byAyah = useMemo(() => {
    const m = new Map<number, { hl: Highlight[]; notes: Note[]; voice: Note[]; mark: boolean }>();
    const of = (key: string) => {
      const a = Number(key.split(":")[1]);
      let x = m.get(a);
      if (!x) m.set(a, (x = { hl: [], notes: [], voice: [], mark: false }));
      return x;
    };
    if (kept) {
      kept.hl.forEach((h) => of(h.key).hl.push(h));
      kept.notes.forEach((n) => of(n.key).notes.push(n));
      kept.voice.forEach((n) => of(n.key).voice.push(n));
      kept.marks.forEach((k) => (of(k).mark = true));
    }
    for (const x of m.values()) {
      // the Arabic first, then the translation's, each in reading order
      x.hl.sort((a, b) => (a.field === "ar" ? 0 : 1) - (b.field === "ar" ? 0 : 1) || a.start - b.start);
      x.notes.sort((a, b) => a.at - b.at);
    }
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [kept]);
  const r = kept?.reflection;
  return (
    <>
      <button type="button" onClick={onBack} className="label -mb-2 flex w-max items-center gap-2 text-[var(--box-faint)] transition-colors hover:text-[var(--box-fg)]">
        <ArrowLeft size={13} strokeWidth={1.8} /> Progress
      </button>

      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4 border-b border-[var(--box-line)] pb-5">
        <div className="min-w-0">
          <div className="label text-[var(--box-faint)]">
            Surah {surah.n} · {surah.place === "makkah" ? "Makkan" : "Madinan"} · {surah.count} ayat
          </div>
          <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span className="display font-serif text-[30px] italic leading-none md:text-[38px]">{surah.tc}</span>
            <span className="font-kufi text-[26px] leading-none text-[var(--box-muted)] md:text-[30px]" dir="rtl" lang="ar">
              {surah.ar}
            </span>
          </div>
          <div className="label mt-2 text-[var(--box-faint)]">{surah.en}</div>
        </div>
        <div className="flex flex-col items-start gap-3">
          <CompleteMark surah={surah} />
          <button type="button" onClick={() => onGo(surah.n, 1)} className="label text-[var(--box-muted)] transition-colors hover:text-[var(--box-fg)]">
            Read this surah →
          </button>
        </div>
      </div>

      {r && (
        <div className="border border-[var(--box-line)] p-4 md:p-5">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[15px]">Your reflection</span>
            <span className="label-sm text-[var(--box-faint)]">{fmtDate(r.updatedAt)}</span>
          </div>
          {r.summary.trim() && <p className="mt-3 whitespace-pre-line font-serif text-[16px] leading-relaxed">{r.summary}</p>}
          {r.lessons.trim() && (
            <>
              <div className="label-sm mt-4 text-[var(--box-faint)]">Lessons</div>
              <p className="mt-1.5 whitespace-pre-line font-serif text-[15.5px] leading-relaxed text-[var(--box-muted)]">{r.lessons}</p>
            </>
          )}
          {r.recordings.length > 0 && (
            <div className="label-sm mt-4 flex items-center gap-2 text-[var(--box-faint)]">
              <Mic size={12} strokeWidth={1.6} /> {r.recordings.length} recording{r.recordings.length === 1 ? "" : "s"} · in the reflection
            </div>
          )}
        </div>
      )}

      {byAyah.length === 0 && !r ? (
        <div className="border border-dashed border-[var(--box-line)] px-4 py-8 text-center text-[13.5px] text-[var(--box-muted)]">Nothing kept in this surah yet.</div>
      ) : (
        byAyah.length > 0 && (
          <div>
            <div className="mb-4 text-[15px]">Ayah by ayah</div>
            <div className="flex flex-col">
              {byAyah.map(([a, x]) => (
                <div key={a} className="relative border-l border-[var(--box-line)] pb-7 pl-5 last:pb-1">
                  <span className="absolute -left-[4px] top-[7px] h-[7px] w-[7px] rotate-45 bg-[var(--color-gold)]" />
                  <div className="flex items-baseline gap-2.5">
                    <button type="button" onClick={() => onGo(surah.n, a)} className="font-mono text-[12px] tabular-nums text-[var(--box-fg)] hover:text-[var(--color-gold)]">
                      {surah.n}:{a}
                    </button>
                    {x.mark && (
                      <span className="text-[var(--box-accent)]" title="Bookmarked">
                        <Bookmark size={12} strokeWidth={1.8} />
                      </span>
                    )}
                    <button type="button" onClick={() => onGo(surah.n, a)} className="label-sm ml-auto text-[var(--box-faint)] hover:text-[var(--box-fg)]">
                      Open →
                    </button>
                  </div>
                  {x.hl.length > 0 && (
                    <div className="mt-2.5 flex flex-col gap-2">
                      {x.hl.map((h) => (
                        <p key={h.id} className={h.field === "ar" ? "quran text-right text-[21px] leading-[2]" : "font-serif text-[15.5px] leading-relaxed"} dir={h.field === "ar" ? "rtl" : "ltr"} lang={h.field === "ar" ? "ar" : undefined}>
                          <mark className="hl" data-c={h.color}>
                            {h.text}
                          </mark>
                        </p>
                      ))}
                    </div>
                  )}
                  {x.notes.map((n) => (
                    <div key={n.id} className="mt-3 border-l-2 border-[var(--color-gold)]/60 pl-3">
                      {n.quote && (
                        <div className={cn("line-clamp-2 text-[12.5px] text-[var(--box-faint)]", /[؀-ۿ]/.test(n.quote) ? "quran text-right text-[15px]" : "font-serif italic")} dir="auto">
                          “{n.quote}”
                        </div>
                      )}
                      {n.text.trim() && <p className="whitespace-pre-line font-hand text-[21px] leading-[1.25] text-[var(--box-fg)]">{n.text}</p>}
                    </div>
                  ))}
                  {x.voice.map((n) => (
                    <VoicePlay key={n.id} note={n} />
                  ))}
                </div>
              ))}
            </div>
          </div>
        )
      )}
    </>
  );
}

/** A voice note in the journal: play it where it is listed. */
function VoicePlay({ note }: { note: Note }) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const audio = useRef<HTMLAudioElement | null>(null);
  const url = useRef<string | null>(null);
  useEffect(
    () => () => {
      audio.current?.pause();
      if (url.current) URL.revokeObjectURL(url.current);
    },
    [],
  );
  const dur = note.dur ?? 0;
  const toggle = async () => {
    if (!audio.current) {
      const blob = note.audio ? await get<Blob>(voiceKey(note.audio)) : null;
      if (!blob) return;
      url.current = URL.createObjectURL(blob);
      const a = new Audio(url.current);
      a.ontimeupdate = () => setProgress(a.duration && isFinite(a.duration) ? a.currentTime / a.duration : a.currentTime / (dur || 1));
      a.onended = () => {
        setPlaying(false);
        setProgress(0);
      };
      audio.current = a;
    }
    if (playing) {
      audio.current.pause();
      setPlaying(false);
    } else {
      await audio.current.play().catch(() => {});
      setPlaying(true);
    }
  };
  return (
    <div className="mt-3 flex max-w-[360px] items-center gap-3">
      <button type="button" onClick={toggle} aria-label={playing ? "Pause the voice note" : "Play the voice note"} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--box-line)] transition-colors hover:border-[var(--box-fg)]">
        {playing ? <Pause size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" className="translate-x-px" />}
      </button>
      <div className="min-w-0 flex-1">
        <div className="h-[2px] w-full bg-[var(--box-line)]">
          <div className="h-full bg-[var(--color-gold)]" style={{ width: `${progress * 100}%` }} />
        </div>
        <div className="label-sm mt-1.5 flex justify-between text-[var(--box-faint)]">
          <span>Voice note{note.quote ? ` · on “${note.quote.slice(0, 28)}${note.quote.length > 28 ? "…" : ""}”` : ""}</span>
          <span className="tabular-nums">
            {Math.floor(dur / 60)}:{String(Math.floor(dur % 60)).padStart(2, "0")}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ── the reading goal ─────────────────────────────────────────── */

function GoalBox({ goal, done, surahs, editing, onEdit }: { goal: Goal | null; done: Record<string, number>; surahs: Surah[]; editing: boolean; onEdit: (v: boolean) => void }) {
  const setGoal = useStore((s) => s.setGoal);
  return (
    <div className="border border-[var(--box-line)] p-4 md:p-5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[15px]">Reading goal</span>
        {goal && !editing && (
          <span className="flex gap-3">
            <button type="button" onClick={() => onEdit(true)} className="label-sm text-[var(--box-faint)] hover:text-[var(--box-fg)]">
              Change
            </button>
            <button type="button" onClick={() => setGoal(null)} className="label-sm text-[var(--box-faint)] hover:text-[var(--box-fg)]">
              Remove
            </button>
          </span>
        )}
      </div>
      <AnimatePresence mode="wait" initial={false}>
        {editing ? (
          <motion.div key="edit" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25, ease: EASE_OUT }}>
            <GoalEditor
              goal={goal}
              onSave={(g) => {
                setGoal(g);
                onEdit(false);
              }}
              onCancel={goal ? () => onEdit(false) : undefined}
            />
          </motion.div>
        ) : (
          goal && (
            <motion.div key="show" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25, ease: EASE_OUT }}>
              <GoalStatus goal={goal} done={done} surahs={surahs} />
            </motion.div>
          )
        )}
      </AnimatePresence>
    </div>
  );
}

function GoalStatus({ goal, done, surahs }: { goal: Goal; done: Record<string, number>; surahs: Surah[] }) {
  const now = new Date();
  if (goal.kind === "khatm") {
    const by = new Date(goal.by + "T23:59:59");
    const left = Math.max(0, Math.ceil((by.getTime() - now.getTime()) / DAY));
    const n = Object.keys(done).length;
    const ayatLeft = surahs.filter((s) => !done[s.n]).reduce((a, s) => a + s.count, 0);
    const perDay = left ? Math.ceil(ayatLeft / left) : ayatLeft;
    return (
      <div className="mt-3">
        <div className="font-serif text-[18px]">The whole Qur'an by {fmtDate(goal.by)}</div>
        <Bar part={n} whole={114} />
        <div className="mt-2 text-[13px] text-[var(--box-muted)]">
          {n === 114
            ? "All 114 surahs completed. Alhamdulillah."
            : left === 0
              ? `${114 - n} surahs to go; the date has passed. Choose a new one when you are ready.`
              : `${114 - n} surahs to go, ${left} day${left === 1 ? "" : "s"} left: about ${perDay} ayat a day.`}
        </div>
      </div>
    );
  }
  const from = periodStart(goal.kind, now).getTime();
  const end = periodEnd(goal.kind, now).getTime();
  const n = Object.values(done).filter((t) => t >= from && t < end).length;
  const daysLeft = Math.max(1, Math.ceil((end - now.getTime()) / DAY));
  return (
    <div className="mt-3">
      <div className="font-serif text-[18px]">
        {goal.count} surah{goal.count === 1 ? "" : "s"} {goal.kind === "week" ? "a week" : "a month"}
      </div>
      <Bar part={Math.min(n, goal.count)} whole={goal.count} />
      <div className="mt-2 text-[13px] text-[var(--box-muted)]">
        {n >= goal.count
          ? `${n} completed this ${goal.kind}. Reached.`
          : `${n} of ${goal.count} this ${goal.kind} · ${daysLeft} day${daysLeft === 1 ? "" : "s"} left`}
      </div>
    </div>
  );
}

function Bar({ part, whole }: { part: number; whole: number }) {
  return (
    <div className="mt-3 h-[3px] w-full bg-[var(--box-line)]">
      <motion.div className="h-full bg-[var(--color-gold)]" initial={false} animate={{ width: `${Math.min(100, (part / Math.max(1, whole)) * 100)}%` }} transition={{ duration: 0.6, ease: EASE_OUT }} />
    </div>
  );
}

const plusMonths = (m: number) => {
  const d = new Date();
  d.setMonth(d.getMonth() + m);
  return d.toISOString().slice(0, 10);
};

function GoalEditor({ goal, onSave, onCancel }: { goal: Goal | null; onSave: (g: Goal) => void; onCancel?: () => void }) {
  const [kind, setKind] = useState<Goal["kind"]>(goal?.kind ?? "week");
  const [count, setCount] = useState(goal && goal.kind !== "khatm" ? goal.count : 2);
  const [by, setBy] = useState(goal?.kind === "khatm" ? goal.by : plusMonths(6));
  const today = new Date().toISOString().slice(0, 10);
  const choices: [Goal["kind"], string, string][] = [
    ["week", "Each week", "Week"],
    ["month", "Each month", "Month"],
    ["khatm", "Whole Qur'an", "Qur'an"],
  ];
  return (
    <div className="mt-3 flex flex-col gap-4">
      <Segmented value={kind} onChange={setKind} options={choices} />
      {kind === "khatm" ? (
        <label className="flex flex-wrap items-center gap-3 font-serif text-[17px]">
          Complete all 114 surahs by
          <input
            type="date"
            value={by}
            min={today}
            onChange={(e) => setBy(e.target.value)}
            className="border-b border-[var(--box-line)] bg-transparent px-1 py-0.5 font-sans text-[14px] text-[var(--box-fg)] outline-none [color-scheme:light_dark] focus:border-[var(--color-gold)]"
          />
        </label>
      ) : (
        <div className="flex flex-wrap items-center gap-3 font-serif text-[17px]">
          Complete
          <span className="flex items-center border border-[var(--box-line)]">
            <button type="button" aria-label="Fewer" onClick={() => setCount((c) => Math.max(1, c - 1))} className="h-8 w-8 text-[var(--box-muted)] hover:text-[var(--box-fg)]">
              −
            </button>
            <span className="w-8 text-center font-sans text-[15px] tabular-nums">{count}</span>
            <button type="button" aria-label="More" onClick={() => setCount((c) => Math.min(114, c + 1))} className="h-8 w-8 text-[var(--box-muted)] hover:text-[var(--box-fg)]">
              +
            </button>
          </span>
          surah{count === 1 ? "" : "s"} {kind === "week" ? "every week" : "every month"}
        </div>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onSave(kind === "khatm" ? { kind, by: by || plusMonths(6), from: Date.now() } : { kind, count })}
          className="btn-primary label border border-[var(--box-fg)] px-3 py-2 transition-colors hover:bg-[var(--box-fg)] hover:text-[var(--box-bg-solid)]"
        >
          Set goal
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="btn-secondary label border border-[var(--box-line)] px-3 py-2 text-[var(--box-muted)] hover:border-[var(--box-fg)]">
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
