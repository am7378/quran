import { AnimatePresence, motion } from "framer-motion";
import type { Surah } from "@/lib/data";
import { EASE_OUT } from "@/lib/utils";

/**
 * Blue's cover: a poster's row of captions across the top of the screen (as d3's "10th October
 * 2023 · … · 365 days of design"), here the Qur'an's own measure, counted from the index: its
 * surahs, its ayat, its parts.
 */
export function CoverSpec({ show, surahs, juz }: { show: boolean; surahs: Surah[]; juz: Record<string, string> }) {
  const ayat = surahs.reduce((a, s) => a + s.count, 0);
  const makkan = surahs.filter((s) => s.place === "makkah").length;
  return (
    <AnimatePresence>
      {show && surahs.length > 0 && (
        <motion.div
          className="spec-row pointer-events-none fixed z-20"
          // just inside the print's edge (the sky's black border, skies.tsx)
          style={{ top: "calc(2.8vmin + 18px)", left: "calc(2.8vmin + 24px)", right: "calc(2.8vmin + 24px)" }}
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0, transition: { delay: 0.9, duration: 0.8, ease: EASE_OUT } }}
          exit={{ opacity: 0, transition: { duration: 0.25 } }}
          aria-hidden
        >
          <span>(al-Qur’ān al-Karīm)</span>
          <span>{surahs.length} surahs</span>
          <span>{ayat.toLocaleString("en")} ayat</span>
          <span>
            {makkan} Makkan · {surahs.length - makkan} Madinan
          </span>
          <span>{Object.keys(juz).length} juz</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
