import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Undo2 } from "lucide-react";
import { loadSummaries, pad3, type Surah, type SurahData, type SummarySection } from "@/lib/data";
import { SurahArt } from "@/components/SurahCard";
import { EASE_OUT, cn } from "@/lib/utils";
import { ayn, nameMarks } from "@/lib/names";

/**
 * The back of the frame: what the surah is about — its connection to the
 * surah before it and a summary of its contents — followed by the themes
 * it moves through, each a link to where that theme begins.
 */
export function SurahSummary({
  surah,
  data,
  onBack,
  onGo,
  mobile,
  atStart,
}: {
  surah: Surah;
  data: SurahData | null;
  onBack: () => void;
  onGo: (ayah: number) => void;
  mobile: boolean;
  atStart: boolean; // turned over from the opening page: going back begins the surah at ayah 1
}) {
  const [sections, setSections] = useState<SummarySection[] | null>(null);
  const [failed, setFailed] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  // take focus once the face is showing, so arrows, space and page keys scroll it
  useEffect(() => {
    const t = setTimeout(() => scroller.current?.focus({ preventScroll: true }), 650);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    let alive = true;
    loadSummaries()
      .then((all) => alive && setSections(all[String(surah.n)] ?? []))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [surah.n]);

  // themes with the ayah each begins at
  const themes = useMemo(() => {
    if (!data) return [];
    const out: { title: string; from: number; to: number }[] = [];
    data.v.forEach((v, i) => {
      if (v.h) out.push({ title: data.themes[i] ?? v.h, from: v.n, to: v.n });
      else if (out.length) out[out.length - 1].to = v.n;
    });
    return out;
  }, [data]);

  // the name's meaning as The Clear Quran gives it, its added words (˹…˺) read as part of it
  const meaning = (surah.ct || surah.en).replace(/[˹˺]/g, "");
  // (on a phone the picture and its details side by side, filling the width)
  const card = (
    <motion.aside
      className={mobile ? "flex w-full items-start gap-5" : "w-full max-w-[min(220px,32vh)] shrink-0"}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: EASE_OUT, delay: 0.2 }}
    >
      <div className={cn("relative aspect-[3/4] overflow-hidden", mobile ? "w-[44%] max-w-[180px] shrink-0" : "w-full")}>
        <SurahArt n={surah.n} blur={10} />
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-2 text-center text-white">
          <span className={cn("font-kufi leading-none", mobile ? "text-[34px]" : "text-[44px]")} dir="rtl" lang="ar">
            {surah.ar}
          </span>
          <span className={cn("display font-serif italic", mobile ? "text-[18px]" : "text-[22px]")}>{nameMarks(surah.tc)}</span>
        </div>
      </div>
      {/* each detail under its name, all to the left, so a long meaning has room */}
      <dl className={cn("flex flex-col gap-3.5", mobile ? "min-w-0 flex-1" : "mt-5")}>
        <div>
          <dt className="label text-[var(--box-faint)]">Meaning</dt>
          <dd className="mt-1 font-serif text-[16px] leading-snug text-[var(--box-fg)]">{meaning}</dd>
        </div>
        <div>
          <dt className="label text-[var(--box-faint)]">Revealed</dt>
          <dd className="mt-1 font-serif text-[16px] text-[var(--box-fg)]">{surah.place === "makkah" ? "Makkah" : "Madinah"}</dd>
        </div>
        <div>
          <dt className="label text-[var(--box-faint)]">Ayat</dt>
          <dd className="mt-1 font-serif text-[16px] tabular-nums text-[var(--box-fg)]">{surah.count}</dd>
        </div>
      </dl>
    </motion.aside>
  );

  return (
    <div className="dark-scope relative flex h-full flex-col bg-[var(--panel-bg)] text-[var(--box-fg)]">
      <div className="grain-local" />
      {/* header */}
      <div className="relative z-10 flex h-12 shrink-0 items-center justify-between gap-3 border-b border-[var(--box-line)] pl-5 pr-2 md:h-[52px] md:pl-7">
        <div className="flex min-w-0 items-baseline gap-2.5">
          <span className="font-mono text-[11px] text-[var(--box-faint)] tabular-nums">{pad3(surah.n)}</span>
          <span className="-my-[0.15em] truncate py-[0.15em] font-serif text-[18px] italic leading-[1.1] md:text-[20px]">{nameMarks(surah.tc)}</span>
          <span className="label hidden text-[var(--box-faint)] sm:inline">About this surah</span>
        </div>
      </div>

      <div className="relative z-10 flex min-h-0 flex-1">
        {/* the card stays put beside the text; only the text scrolls (a wheel over the card scrolls it too) */}
        {!mobile && (
          <div
            className="flex w-[clamp(230px,30%,330px)] shrink-0 items-start justify-end overflow-hidden py-12 pl-10 pr-2"
            onWheel={(e) => scroller.current?.scrollBy({ top: e.deltaY })}
          >
            {card}
          </div>
        )}
      <div ref={scroller} tabIndex={-1} className="thin-scroll relative min-h-0 flex-1 overflow-y-auto overscroll-contain outline-none [touch-action:pan-y]">
        <div className={cn("mx-auto flex flex-col gap-10 px-5 py-8 md:px-10 md:py-12", !mobile && "max-w-[760px] pl-10")}>
          {mobile && card}

          {/* reading column */}
          <div className="min-w-0">
            {sections === null && !failed && <div className="label text-[var(--box-faint)]">Opening the summary…</div>}
            {failed && <p className="font-serif text-[17px] text-[var(--box-muted)]">The summary didn't load. Check your connection and turn the frame again.</p>}
            {sections?.length === 0 && (
              <p className="font-serif text-[18px] leading-relaxed text-[var(--box-muted)]">
                {nameMarks(surah.tc)} opens the Qur'an and is recited in every unit of prayer. Its themes are listed below.
              </p>
            )}
            {sections?.map((s, i) => (
              <motion.section
                key={i}
                className="mb-12 last:mb-6"
                initial={{ opacity: 0, y: 16, filter: "blur(4px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                transition={{ duration: 0.6, ease: EASE_OUT, delay: 0.3 + i * 0.08 }}
              >
                <div className="label mb-2 text-[var(--box-accent)]">{s.kind}</div>
                <h2 className="display mb-5 font-serif text-[24px] leading-tight italic md:text-[30px]">{s.title}</h2>
                <div className="flex flex-col gap-4 font-serif text-[17px] leading-[1.7] text-[var(--box-fg)]/90 md:text-[18px]">
                  {s.blocks.map((b, j) =>
                    b.type === "p" ? (
                      <p key={j}>{b.text}</p>
                    ) : (
                      <ul key={j} className="flex flex-col gap-2.5">
                        {b.items.map((it, k) => (
                          <li key={k} className="flex gap-3">
                            <span className="mt-[0.72em] h-[5px] w-[5px] shrink-0 rotate-45 bg-[var(--box-accent)]" />
                            <span>{b.type === "ol" ? <span className="mr-1.5 font-mono text-[13px] text-[var(--box-faint)]">{k + 1}.</span> : null}{it}</span>
                          </li>
                        ))}
                      </ul>
                    ),
                  )}
                </div>
              </motion.section>
            ))}

            {themes.length > 0 && (
              <motion.section
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: EASE_OUT, delay: 0.45 }}
                className="mt-4 border-t border-[var(--box-line)] pt-8"
              >
                <div className="label mb-2 text-[var(--box-accent)]">In this surah</div>
                <h2 className="display mb-5 font-serif text-[24px] italic md:text-[30px]">Its themes, ayah by ayah</h2>
                <ol className="flex flex-col">
                  {themes.map((t) => (
                    <li key={t.from}>
                      <button
                        type="button"
                        onClick={() => onGo(t.from)}
                        className="group flex w-full items-baseline gap-4 border-t border-[var(--box-line)] py-2.5 text-left transition-colors hover:bg-[var(--box-hover)]"
                      >
                        <span className="w-[5.5ch] shrink-0 font-mono text-[11px] text-[var(--box-faint)] tabular-nums">
                          {t.from === t.to ? t.from : `${t.from}–${t.to}`}
                        </span>
                        <span className="flex-1 font-serif text-[16px] md:text-[17px]">{t.title}</span>
                        <span className="label text-[var(--box-faint)] opacity-0 transition-opacity group-hover:opacity-100">Read →</span>
                      </button>
                    </li>
                  ))}
                </ol>
              </motion.section>
            )}
            {/* the way back stays at the foot of the text however far it scrolls (phone and desktop alike) */}
            <div className="pointer-events-none sticky -bottom-px -mb-8 mt-10 pb-5 pt-10 md:-mb-12 md:pb-6" style={{ background: "linear-gradient(to bottom, transparent, var(--panel-bg) 55%)" }}>
              <button
                type="button"
                onClick={onBack}
                aria-label={atStart ? "Turn back and begin the surah at ayah 1" : "Turn back to the ayahs"}
                className="btn-primary pointer-events-auto inline-flex items-center gap-2.5 border border-[var(--box-fg)]/60 bg-[var(--panel-bg)] px-4 py-3 transition-colors hover:border-[var(--box-fg)] hover:bg-[var(--box-fg)] hover:text-[var(--box-bg-solid)] active:bg-[var(--box-hover)]"
              >
                <Undo2 size={14} strokeWidth={1.6} />
                <span className="label">{atStart ? `Begin ${ayn(surah.tc)} · ayah 1` : "Back to the ayahs"}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
