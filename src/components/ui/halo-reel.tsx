"use client";

import * as React from "react";
import { animate, motion, useMotionValueEvent, useTransform, type MotionValue } from "framer-motion";
import { cn } from "@/lib/utils";

/* ── Halo Reel (adapted) ─────────────────────────────────────────
 * Cards ride an ellipse pinned to the stage's left edge, as in the original:
 *
 *   x = cx + rx·cos θ    y = cy + ry·sin θ    scale = min + (1−min)·(cos θ + 1)/2
 *
 * One `pos` motion value (a continuous index into the list) drives the whole
 * ring. Unlike the original, which repeats a few items around a closed ring,
 * this ring scrolls through a long list (114 surahs), so only the cards near
 * the visible arc are mounted: card k sits at θ = (k − pos)·step.
 * ─────────────────────────────────────────────────────────────── */

export type ReelGeometry = {
  cx: number; // ellipse centre, px from stage left
  cy: number; // px from stage top
  rx: number;
  ry: number;
  cardW: number;
  cardH: number;
  step: number; // radians between neighbours
  minScale: number;
};

type Props = {
  count: number;
  pos: MotionValue<number>;
  geometry: ReelGeometry;
  visible?: number; // cards mounted on each side of the front
  renderCard: (index: number, isFront: boolean) => React.ReactNode;
  onCardClick: (absIndex: number, isFront: boolean) => void;
  className?: string;
  label?: string;
};

const mod = (a: number, n: number) => ((a % n) + n) % n;

export function HaloReel({ count, pos, geometry, visible = 8, renderCard, onCardClick, className, label }: Props) {
  const stageRef = React.useRef<HTMLDivElement>(null);
  const [center, setCenter] = React.useState(() => Math.round(pos.get()));
  const centerRef = React.useRef(center);
  useMotionValueEvent(pos, "change", (v) => {
    const c = Math.round(v);
    if (c !== centerRef.current) {
      centerRef.current = c;
      setCenter(c);
    }
  });

  /* ── drag, wheel, keys ─────────────────────────────────────── */
  const drag = React.useRef({ active: false, startY: 0, startX: 0, startPos: 0, moved: 0, lastY: 0, lastT: 0, v: 0 });
  const target = React.useRef<number | null>(null);

  const settle = (to: number, soft = false) => {
    target.current = to;
    animate(pos, to, soft ? { type: "spring", stiffness: 140, damping: 22 } : { duration: 0.55, ease: [0.16, 1, 0.3, 1] });
  };

  const perPx = 1 / Math.max(40, geometry.ry * geometry.step);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    pos.stop();
    drag.current = { active: true, startY: e.clientY, startX: e.clientX, startPos: pos.get(), moved: 0, lastY: e.clientY, lastT: performance.now(), v: 0 };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d.active) return;
    const dy = e.clientY - d.startY;
    d.moved = Math.max(d.moved, Math.abs(dy), Math.abs(e.clientX - d.startX));
    const now = performance.now();
    const dt = Math.max(1, now - d.lastT);
    d.v = 0.8 * d.v + 0.2 * ((e.clientY - d.lastY) / dt);
    d.lastY = e.clientY;
    d.lastT = now;
    pos.set(d.startPos - dy * perPx);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d.active) return;
    d.active = false;
    if (d.moved < 6) {
      // a click: find the card under the pointer
      const el = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest<HTMLElement>("[data-abs]");
      if (el) {
        const abs = Number(el.dataset.abs);
        const isFront = abs === Math.round(pos.get());
        if (!isFront) settle(abs);
        onCardClick(abs, isFront);
        return;
      }
      settle(Math.round(pos.get()));
      return;
    }
    const fling = -d.v * 220 * perPx; // px/ms → index
    settle(Math.round(pos.get() + Math.max(-6, Math.min(6, fling))), true);
  };

  React.useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    let acc = 0;
    let timer = 0;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      acc += Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      const threshold = e.deltaMode === 1 ? 1 : 42;
      if (Math.abs(acc) >= threshold) {
        const steps = Math.sign(acc) * Math.max(1, Math.floor(Math.abs(acc) / threshold));
        acc = 0;
        const base = target.current ?? Math.round(pos.get());
        settle(base + steps);
      }
      clearTimeout(timer);
      timer = window.setTimeout(() => {
        acc = 0;
        target.current = null;
      }, 220);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const dir = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
    if (dir) {
      e.preventDefault();
      settle((target.current ?? Math.round(pos.get())) + dir);
    } else if (e.key === "Enter") {
      e.preventDefault();
      onCardClick(Math.round(pos.get()), true);
    }
  };

  const items: number[] = [];
  for (let d = -visible; d <= visible; d++) items.push(center + d);

  return (
    <div
      ref={stageRef}
      role="listbox"
      aria-label={label ?? "Carousel"}
      aria-roledescription="carousel"
      tabIndex={0}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      className={cn("relative touch-none select-none outline-none cursor-grab active:cursor-grabbing", className)}
    >
      {items.map((abs) => (
        <ReelCard key={abs} abs={abs} pos={pos} g={geometry} visible={visible}>
          {renderCard(mod(abs, count), abs === center)}
        </ReelCard>
      ))}
    </div>
  );
}

function ReelCard({
  abs,
  pos,
  g,
  visible,
  children,
}: {
  abs: number;
  pos: MotionValue<number>;
  g: ReelGeometry;
  visible: number;
  children: React.ReactNode;
}) {
  const theta = useTransform(pos, (p) => (abs - p) * g.step);
  const x = useTransform(theta, (t) => g.cx + g.rx * Math.cos(t) - g.cardW / 2);
  const y = useTransform(theta, (t) => g.cy + g.ry * Math.sin(t) - g.cardH / 2);
  const scale = useTransform(theta, (t) => g.minScale + (1 - g.minScale) * ((Math.cos(t) + 1) / 2));
  // the nearer the front, the higher; changing only as cards pass one another (not every frame: a
  // new stacking order each frame makes the browser re-sort the layers, which a phone feels)
  const zIndex = useTransform(pos, (p) => 100 - Math.round(Math.abs(abs - p)));
  const opacity = useTransform(pos, (p) => {
    const d = Math.abs(abs - p);
    return d > visible - 1 ? Math.max(0, visible - d) : 1;
  });
  const shade = useTransform(theta, (t) => 0.55 * (1 - Math.max(0, Math.cos(t))) ** 1.4);
  return (
    <motion.div
      data-abs={abs}
      className="absolute left-0 top-0 will-change-transform"
      style={{ x, y, scale, zIndex, opacity, width: g.cardW, height: g.cardH }}
    >
      <div className="h-full w-full shadow-[0_18px_40px_-12px_rgba(0,0,0,0.7)]">{children}</div>
      <motion.div className="pointer-events-none absolute inset-0 bg-black" style={{ opacity: shade }} />
    </motion.div>
  );
}

export default HaloReel;
