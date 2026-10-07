import { AnimatePresence, motion } from "framer-motion";
import { THEMES } from "@/lib/themes";
import { useStore } from "@/lib/store";
import { EASE_OUT, cn } from "@/lib/utils";

/**
 * Page one: the themes along the foot of the screen, under the cover, so the reader can choose the
 * look they like from the start (Settings → Display has them too). Each is a small picture of its
 * own sky and box; on a phone, eight across, the one chosen is named beneath them.
 */
export function CoverThemes({ show, mobile }: { show: boolean; mobile: boolean }) {
  const theme = useStore((s) => s.settings.theme);
  const set = useStore((s) => s.set);
  const chosen = THEMES.find((t) => t.id === theme) ?? THEMES[0];
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="pointer-events-none fixed inset-x-0 z-20 flex justify-center px-4"
          style={{ bottom: `calc(${mobile ? 18 : 26}px + var(--app-bottom, env(safe-area-inset-bottom, 0px)))` }}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0, transition: { delay: 1.1, duration: 0.8, ease: EASE_OUT } }}
          exit={{ opacity: 0, y: 8, transition: { duration: 0.25 } }}
        >
          <div className="pointer-events-auto flex flex-col items-center gap-2">
          <div className="flex items-start gap-1.5 md:gap-2.5" role="radiogroup" aria-label="Theme">
            {THEMES.map((t) => {
              const on = theme === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  aria-label={t.name}
                  title={t.name}
                  onClick={() => set({ theme: t.id })}
                  className="group flex w-[calc((100vw-2rem-2.625rem)/8)] max-w-[52px] flex-col items-center gap-1.5 md:w-[66px] md:max-w-none"
                >
                  <span
                    className={cn(
                      "relative flex h-[34px] w-full items-center justify-center overflow-hidden transition-all duration-300 md:h-[40px]",
                      on ? "ring-1 ring-[var(--outside-fg)] ring-offset-2 ring-offset-transparent" : "opacity-75 group-hover:opacity-100",
                    )}
                    style={{ background: t.preview.bg, borderRadius: Math.min(t.preview.r, 8) }}
                  >
                    <span
                      className="block h-[62%] w-[64%] transition-transform duration-300 group-hover:scale-[1.06]"
                      style={{ background: t.preview.box, borderRadius: Math.min(t.preview.r, 5), border: t.preview.b.replace(/^\d+(\.\d+)?px/, "1px") }}
                    >
                      <span className="mx-auto mt-[38%] block h-[2px] w-[40%]" style={{ background: t.preview.ac }} />
                    </span>
                  </span>
                  <span className={cn("hidden h-3.5 items-center text-[10.5px] leading-none whitespace-nowrap transition-colors md:flex", on ? "text-[var(--outside-fg)]" : "text-[var(--outside-muted)]")} style={t.face}>{t.name}</span>
                </button>
              );
            })}
          </div>
          <span className="flex h-3.5 items-center whitespace-nowrap text-[11px] leading-none text-[var(--outside-fg)] md:hidden" style={chosen.face} aria-hidden>
            {chosen.name}
          </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
