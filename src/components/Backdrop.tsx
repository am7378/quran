import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { NightHero } from "./ui/hero";
import { MonoSky } from "./ui/mono-sky";
import { AtlasSky, BlueSky, FolioSky, LunarSky, PaperSky } from "./ui/skies";
import type { ThemeId } from "@/lib/themes";
import { isTouch, useIdle } from "@/lib/motion";
import { useStore } from "@/lib/store";

export type Phase = "intro" | "select" | "read";

/** Fixed background: the theme's own sky behind every page, crossfading when the theme changes. */
export function Backdrop({ theme, still: held, grain }: { theme: ThemeId; still?: boolean; grain?: boolean }) {
  // (a phone at rest: the sky holds still until the page is touched again; and always, where the
  // phone or the reader asks for less motion)
  const idle = useIdle((s) => s.idle);
  const phoneStill = useReducedMotion();
  const readerStill = useStore((s) => s.settings.reduceMotion);
  const still = held || idle || !!phoneStill || readerStill;
  return (
    <div className="fixed inset-0 overflow-hidden" aria-hidden>
      <AnimatePresence initial={false}>
        <motion.div key={theme} className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 1.2 }}>
          {theme === "mono" ? (
            <MonoSky className="absolute inset-0" still={still} />
          ) : theme === "atlas" ? (
            <AtlasSky className="absolute inset-0" still={still} />
          ) : theme === "folio" ? (
            <FolioSky className="absolute inset-0" still={still} />
          ) : theme === "lunar" ? (
            <LunarSky className="absolute inset-0" still={still} />
          ) : theme === "blue" ? (
            <BlueSky className="absolute inset-0" still={still} />
          ) : theme === "paper" ? (
            <PaperSky className="absolute inset-0" still={still} />
          ) : (
            <NightHero className="absolute inset-0" still={still} />
          )}
        </motion.div>
      </AnimatePresence>
      {/* keep the edges quiet so the frame reads first */}
      <div className="absolute inset-0" style={{ background: "radial-gradient(130% 100% at 50% 50%, transparent 55%, var(--edge-shade, rgba(0,0,0,0.35)) 100%)" }} />
      {/* a phone's grain: on the sky, still (over the whole page, moving, it is blended again at
          every frame of every scroll) */}
      {grain && isTouch() && <div className="grain grain-sky" />}
      {/* an iPhone home-screen app: into the colour of the strip iOS keeps below the page (index.css) */}
      <div className="ios-strip-fade" />
    </div>
  );
}
