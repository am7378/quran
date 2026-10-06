import { motion } from "framer-motion";
import { useEffect, useRef } from "react";
import { ArrowRight } from "lucide-react";
import { BracketButton, Clock } from "@/components/bits";
import { CoverSearch, CoverSearchField } from "@/components/CoverSearch";
import { SettingsGlyph } from "@/components/ImmersivePanel";
import type { Surah } from "@/lib/data";
import type { Result } from "@/lib/search";
import { useUI } from "@/lib/ui";
import { useStore } from "@/lib/store";
import { ayn } from "@/lib/names";
import { EASE_OUT, cn } from "@/lib/utils";

/**
 * Page one: the frame itself, small, like the cover of the book. It has the
 * reading page's header and footer and the same box theme; entering grows
 * this same frame into the index, and Settings grows it to full size. Its foot
 * is a search: pressed, or simply typed into, the cover becomes the search, and
 * what is picked opens straight in the reader.
 */
export function Intro({
  onEnter,
  onSettings,
  settingsOpen,
  mobile,
  index,
  searching,
  onSearching,
  onPick,
  onContinue,
}: {
  onEnter: () => void;
  onSettings: () => void;
  settingsOpen: boolean;
  mobile: boolean;
  index: { surahs: Surah[]; juz: Record<string, string> } | null;
  searching: boolean;
  onSearching: (on: boolean) => void;
  onPick: (r: Result) => void;
  onContinue: (surah: number, ayah: number) => void; // straight back to where the reader left off
}) {
  // where the reading stopped last time (not the very start of the Qur'an, which is no place to come back to)
  const last = useStore((s) => s.last);
  const resume = last && !(last.s === 1 && last.v <= 1) ? last : null;
  const resumeName = resume ? index?.surahs[resume.s - 1]?.tc : undefined;
  const started = useRef(false);
  const go = () => {
    if (started.current) return;
    started.current = true;
    onEnter();
  };
  const field = useRef<HTMLInputElement>(null);
  // (the field is focused in the press itself, so a phone brings its keyboard up)
  const openSearch = () => {
    field.current?.focus({ preventScroll: true });
    onSearching(true);
  };
  const closeSearch = () => {
    field.current?.blur();
    onSearching(false);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (settingsOpen || e.defaultPrevented) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest?.("input, textarea, [contenteditable='true']")) return;
      if (searching) {
        if (e.key === "Escape") closeSearch();
        return;
      }
      // typing on the cover searches: the first letter goes into the field
      if (e.key.length === 1 && e.key !== " " && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (e.key === "/") e.preventDefault();
        openSearch();
        return;
      }
      if (e.key !== "Enter") return;
      // a focused button takes its own Enter
      if (t?.closest?.("button, a")) return;
      go();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsOpen, searching]);

  const rise = (delay: number) => ({
    initial: { opacity: 0, y: 14, filter: "blur(6px)" },
    animate: { opacity: 1, y: 0, filter: "blur(0px)" },
    transition: { duration: 0.9, ease: EASE_OUT, delay },
  });

  return (
    <div className="cover-page relative flex h-full flex-col text-[var(--box-fg)]">
      {/* header, as on the reading page: the time, and the way to About and Settings */}
      <motion.header
        className="relative z-10 flex h-12 shrink-0 items-center justify-between border-b border-[var(--box-line)] pl-5 pr-2 md:h-[52px] md:pl-7"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.3 }}
      >
        <Clock className="label-sm text-[var(--box-faint)]" />
        <span className="flex items-center">
          <BracketButton onClick={() => useUI.getState().setAbout(true)} title="About this reader">
            About
          </BracketButton>
          {mobile ? (
            <button
              type="button"
              onClick={onSettings}
              aria-label="Settings"
              title="Settings"
              className="flex h-9 w-9 items-center justify-center text-[var(--box-muted)] transition-colors hover:bg-[var(--box-hover)] hover:text-[var(--box-fg)]"
            >
              <SettingsGlyph open={settingsOpen} />
            </button>
          ) : (
            <BracketButton onClick={onSettings} active={settingsOpen} title="Settings">
              Settings
            </BracketButton>
          )}
        </span>
      </motion.header>

      {/* the cover */}
      <div className={cn("relative flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden px-6 text-center transition-[opacity,filter,transform] duration-500 ease-out", searching && "pointer-events-none -translate-y-2 opacity-0 blur-[3px]")} aria-hidden={searching}>
        <motion.span
          className="font-kufi leading-none text-[var(--box-fg)]"
          style={{ fontSize: mobile ? 52 : 72 }}
          dir="rtl"
          lang="ar"
          {...rise(0.55)}
        >
          القرآن الكريم
        </motion.span>
        <motion.span className="display cover-name mt-5 font-serif italic leading-none" style={{ fontSize: mobile ? 24 : 30 }} {...rise(0.7)}>
          Al-Qur’ān al-Karīm
        </motion.span>
        <motion.div {...rise(0.9)} className="mt-9">
          <button
            type="button"
            onClick={go}
            tabIndex={searching ? -1 : 0}
            aria-label="Read the Qur'an"
            className="btn-primary group relative inline-flex items-center gap-3 overflow-hidden border border-[var(--box-fg)]/60 px-5 py-3 transition-colors duration-300 hover:border-[var(--box-fg)] hover:bg-[var(--box-fg)] hover:text-[var(--box-bg-solid)]"
          >
            {/* a light passing across on hover */}
            <span className="pointer-events-none absolute -inset-y-4 -left-1/2 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/40 to-transparent opacity-0 transition-all duration-700 group-hover:left-[120%] group-hover:opacity-100" />
            <span className="label relative">Read the Qur'an</span>
            <ArrowRight size={14} strokeWidth={1.6} className="relative transition-transform duration-500 ease-out group-hover:translate-x-1" />
          </button>
        </motion.div>
      </div>

      {/* footer, as on the reading page: the search, at rest */}
      <motion.footer
        className="frame-foot relative z-10 flex h-10 shrink-0 items-stretch justify-center border-t border-[var(--box-line)] px-5 md:h-11 md:px-7"
        initial={{ opacity: 0 }}
        animate={{ opacity: searching ? 0 : 1 }}
        transition={searching ? { duration: 0.25 } : { duration: 0.6, delay: 0.2 }}
      >
        <CoverSearchField onOpen={openSearch} hidden={searching} short={!!resume && mobile} className="flex-1" />
        {/* and, when there is a place to go back to, Continue: the foot split by a line, the button
            on the right, as wide as its words */}
        {resume && (
          <>
            <span aria-hidden className="w-px shrink-0 bg-[var(--box-line)]" />
            <button
              type="button"
              onClick={() => onContinue(resume.s, resume.v)}
              tabIndex={searching ? -1 : 0}
              aria-label={`Continue reading${resumeName ? ` ${ayn(resumeName)},` : ""} at ayah ${resume.s}:${resume.v}`}
              title="Continue where you left off"
              className={cn("group -mr-5 flex shrink-0 items-center gap-2 pl-4 pr-5 text-[var(--box-faint)] transition-[color,background-color,opacity] duration-300 hover:bg-[var(--box-hover)] hover:text-[var(--box-fg)] md:-mr-7 md:pl-5 md:pr-7", searching && "pointer-events-none opacity-0")}
            >
              <span className="label-sm whitespace-nowrap">
                Continue <span className="tabular-nums text-[var(--box-muted)] transition-colors duration-300 group-hover:text-[var(--box-fg)]">{resume.s}:{resume.v}</span>
              </span>
              <ArrowRight size={12} strokeWidth={1.7} className="shrink-0 transition-transform duration-300 group-hover:translate-x-0.5" />
            </button>
          </>
        )}
      </motion.footer>

      <CoverSearch surahs={index?.surahs ?? []} juz={index?.juz ?? {}} open={searching} onClose={closeSearch} onPick={onPick} inputRef={field} />
    </div>
  );
}
