import { motion } from "framer-motion";
import { useEffect, useRef } from "react";
import { ArrowRight } from "lucide-react";
import { BracketButton, Clock } from "@/components/bits";
import { SettingsGlyph } from "@/components/ImmersivePanel";
import { useUI } from "@/lib/ui";
import { EASE_OUT } from "@/lib/utils";

/**
 * Page one: the frame itself, small, like the cover of the book. It has the
 * reading page's header and footer and the same box theme; entering grows
 * this same frame into the index, and Settings grows it to full size.
 */
export function Intro({
  onEnter,
  onSettings,
  settingsOpen,
  mobile,
}: {
  onEnter: () => void;
  onSettings: () => void;
  settingsOpen: boolean;
  mobile: boolean;
}) {
  const started = useRef(false);
  const go = () => {
    if (started.current) return;
    started.current = true;
    onEnter();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || settingsOpen || e.defaultPrevented) return;
      // a focused button takes its own Enter
      if ((e.target as HTMLElement | null)?.closest?.("button, input, textarea, a")) return;
      go();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsOpen]);

  const rise = (delay: number) => ({
    initial: { opacity: 0, y: 14, filter: "blur(6px)" },
    animate: { opacity: 1, y: 0, filter: "blur(0px)" },
    transition: { duration: 0.9, ease: EASE_OUT, delay },
  });

  return (
    <div className="cover-page relative flex h-full flex-col text-[var(--box-fg)]">
      {/* header, as on the reading page */}
      <motion.header
        className="relative z-10 flex h-12 shrink-0 items-center justify-end border-b border-[var(--box-line)] pl-5 pr-2 md:h-[52px] md:pl-7"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.3 }}
      >
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
      </motion.header>

      {/* the cover */}
      <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden px-6 text-center">
        <motion.span
          className="font-kufi leading-none text-[var(--box-fg)]"
          style={{ fontSize: mobile ? 52 : 72 }}
          dir="rtl"
          lang="ar"
          {...rise(0.55)}
        >
          القرآن الكريم
        </motion.span>
        <motion.span className="display mt-5 font-serif italic leading-none" style={{ fontSize: mobile ? 24 : 30 }} {...rise(0.7)}>
          Al-Qur’ān al-Karīm
        </motion.span>
        <motion.div {...rise(0.9)} className="mt-9">
          <button
            type="button"
            onClick={go}
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

      {/* footer, as on the reading page */}
      <motion.footer
        className="frame-foot relative z-10 flex h-8 shrink-0 items-center justify-center border-t border-[var(--box-line)] px-5 md:px-7"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.3 }}
      >
        <Clock className="label-sm text-[var(--box-faint)]" />
      </motion.footer>
    </div>
  );
}
