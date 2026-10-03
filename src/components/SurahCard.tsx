import { memo } from "react";
import type { Surah } from "@/lib/data";
import { pad3 } from "@/lib/data";
import { themeOf } from "@/lib/surahThemes";
import { MotifArt } from "./Motif";
import { cn } from "@/lib/utils";

/** The blurred artwork alone — also used for the zoom into the reading page. */
export const SurahArt = memo(function SurahArt({ n, blur = 9, className }: { n: number; blur?: number; className?: string }) {
  const t = themeOf(n);
  return (
    <div className={cn("surah-art absolute inset-0 overflow-hidden", className)} aria-hidden>
      <div className="absolute -inset-[12%]" style={{ filter: `blur(${blur}px) saturate(1.15)` }}>
        <MotifArt motif={t.m} p={t.p} seed={n} />
      </div>
      {/* legibility veil + grain */}
      <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.12), rgba(0,0,0,0.05) 40%, rgba(0,0,0,0.42))" }} />
      <div className="grain-local" style={{ opacity: 0.3 }} />
    </div>
  );
});

/** A surah card: Arabic name at the top, transliteration, meaning, number. */
export const SurahCard = memo(function SurahCard({ surah, front }: { surah: Surah; front?: boolean }) {
  const light = themeOf(surah.n).p[0];
  return (
    <div className="surah-card relative h-full w-full overflow-hidden text-white select-none" style={{ fontSize: 10 }}>
      <SurahArt n={surah.n} />
      <div className="absolute inset-0 border border-white/15" />
      <div className="relative flex h-full flex-col justify-between p-[1.1em]">
        <div className="flex items-start justify-between">
          <span className="font-mono text-[1em] tracking-[0.12em] text-white/85 tabular-nums">{pad3(surah.n)}</span>
          <span className="font-mono text-[0.8em] uppercase tracking-[0.14em] text-white/65">
            {surah.place === "makkah" ? "Makkah" : "Madinah"}
          </span>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-[0.35em] text-center">
          <span
            className="font-kufi leading-none text-white"
            style={{ fontSize: "3.3em", textShadow: `0 0 1.4em ${light}66` }}
            dir="rtl"
            lang="ar"
          >
            {surah.ar}
          </span>
          <span className="mt-[0.9em] font-serif text-[1.85em] leading-[1.05] italic text-white">{surah.tc}</span>
          <span className="font-mono text-[0.85em] uppercase tracking-[0.16em] text-white/75">{surah.en}</span>
        </div>
        <div className="flex items-end justify-between">
          <span className="font-mono text-[0.8em] uppercase tracking-[0.14em] text-white/65 tabular-nums">{surah.count} ayat</span>
          <span
            className={cn("h-[0.7em] w-[0.7em] rotate-45 border border-white/60 transition-colors", front && "bg-[var(--color-gold)] border-[var(--color-gold)]")}
          />
        </div>
      </div>
    </div>
  );
});
