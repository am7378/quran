import { motion, useMotionValueEvent, useSpring, useTransform } from "framer-motion";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Rect } from "@/lib/layout";
import { flipAngle, settleFlip, settlingFace, useUI } from "@/lib/ui";
import { EASE_IN_OUT } from "@/lib/utils";

/**
 * The frame: one box that holds every page after the entrance. It turns a
 * few degrees toward the cursor, as if trying to face it, and can be turned
 * over entirely: the reading page's surah summary lives on its back.
 */
export function Frame({
  rect,
  children,
  amplitude = 1,
  instant,
  quick,
}: {
  rect: Rect;
  children: ReactNode;
  amplitude?: number; // 0 disables the tilt
  instant?: boolean;
  quick?: boolean; // into focus and out of it: a shorter move
}) {
  const rx = useSpring(0, { stiffness: 90, damping: 18, mass: 0.6 });
  const ry = useSpring(0, { stiffness: 90, damping: 18, mass: 0.6 });
  const held = useRef(false);
  const flipped = useUI((s) => s.flipped);

  // turning over: 0° front, ±180° back (a finger can turn it either way); the faces swap edge-on
  const [showBack, setShowBack] = useState(false);
  const norm = (a: number) => (((a % 360) + 540) % 360) - 180; // −180…180
  useMotionValueEvent(flipAngle, "change", (v) => setShowBack(Math.abs(norm(v)) > 90));
  useEffect(() => {
    if (settlingFace() !== flipped) settleFlip(flipped);
  }, [flipped]);
  // past edge-on the back face turns in from the other side, so it never sits mirrored
  // (no counter-rotation needed, and it scrolls and takes clicks normally)
  const rotateY = useTransform([ry, flipAngle] as never, ([a, b]: number[]) => {
    const n = norm(b);
    return a + (n > 90 ? n - 180 : n < -90 ? n + 180 : n);
  });
  const scale = useTransform(flipAngle, (f) => 1 - 0.07 * Math.abs(Math.sin((f * Math.PI) / 180)));
  // what sits around the frame (the theme above, the slider below) does not turn with it: it fades
  // as the frame turns away and is gone before the back comes round
  const stillOpacity = useTransform(flipAngle, (f) => Math.max(0, Math.cos((Math.min(70, Math.abs(norm(f))) / 70) * (Math.PI / 2))));
  const stillVisibility = useTransform(stillOpacity, (o) => (o < 0.02 ? "hidden" : "visible"));

  useEffect(() => {
    if (!amplitude || matchMedia("(pointer: coarse)").matches) {
      rx.set(0);
      ry.set(0);
      return;
    }
    const move = (e: PointerEvent) => {
      if (held.current) return;
      // over the edge tab the frame keeps still: the tab does the showing
      if ((e.target as Element | null)?.closest?.("[data-no-tilt]")) {
        rx.set(0);
        ry.set(0);
        return;
      }
      const nx = (e.clientX - (rect.left + rect.width / 2)) / (window.innerWidth / 2);
      const ny = (e.clientY - (rect.top + rect.height / 2)) / (window.innerHeight / 2);
      ry.set(Math.max(-1, Math.min(1, nx)) * 3.4 * amplitude);
      rx.set(-Math.max(-1, Math.min(1, ny)) * 2.4 * amplitude);
    };
    const down = () => (held.current = true); // keep still while selecting text or dragging
    const up = () => (held.current = false);
    const leave = () => {
      rx.set(0);
      ry.set(0);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerdown", down);
    window.addEventListener("pointerup", up);
    document.addEventListener("mouseleave", leave);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerdown", down);
      window.removeEventListener("pointerup", up);
      document.removeEventListener("mouseleave", leave);
    };
  }, [amplitude, rect.left, rect.top, rect.width, rect.height, rx, ry]);

  return (
    <motion.div
      className="fixed z-10"
      style={{ perspective: 2000 }}
      initial={{ opacity: 0, y: 14, left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
      animate={{ opacity: 1, y: 0, left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
      transition={{
        ...(instant ? { duration: 0 } : quick ? { duration: 0.55, ease: EASE_IN_OUT } : { duration: 0.9, ease: EASE_IN_OUT }),
        // it comes in once, when the site opens
        opacity: { duration: 0.9, delay: 0.1 },
        y: { duration: 1, delay: 0.1, ease: [0.22, 1, 0.36, 1] },
      }}
    >
      <motion.div className="relative h-full w-full" style={{ rotateX: rx, rotateY, scale }}>
        {/* the box's shape, edge and shadow come from the theme (index.css: --box-*) */}
        <div className="frame-box absolute inset-0 bg-[var(--box-bg)]" />
        <div className="grain-local frame-radius" />
        <div className="frame-radius relative h-full w-full overflow-hidden p-[3px]" style={{ visibility: showBack ? "hidden" : "visible" }}>
          {children}
        </div>
        {/* the back face: the reading page portals the surah summary here */}
        <div data-frame-back className="frame-radius-in absolute inset-[3px] overflow-hidden" style={{ visibility: showBack ? "visible" : "hidden" }} />
        <div data-frame-outside className="pointer-events-none absolute inset-0" />
      </motion.div>
      <motion.div data-frame-still className="pointer-events-none absolute inset-0" style={{ opacity: stillOpacity, visibility: stillVisibility }} />
      {/* beside the frame, staying whichever face is showing (the tabs that turn it over and back) */}
      <div data-frame-edges className="pointer-events-none absolute inset-0" />
    </motion.div>
  );
}
