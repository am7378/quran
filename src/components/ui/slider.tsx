"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { animate, AnimatePresence, motion, useMotionValue, useMotionValueEvent, useSpring, useTransform } from "framer-motion";
import { cn } from "@/lib/utils";
import { sfx } from "@/lib/sound";

/**
 * Ayah slider, adapted from the provided slider. The thumb follows the
 * pointer continuously and settles on the nearest ayah when released, so
 * short surahs feel as smooth as long ones; the hover preview (bubble and
 * shadow fill) glides with the pointer. With `onEnd`, a square button after
 * the track opens the surah reflection (no box: the icon alone, lit on hover).
 */

const THUMB = 16;
const THUMB_REST = 12;
const TRACK = 2;
const H = THUMB + 16;

const springs = {
  fast: { type: "spring" as const, duration: 0.12, bounce: 0 },
  settle: { type: "spring" as const, stiffness: 420, damping: 34 },
};

type Props = {
  value: number;
  min?: number;
  max: number;
  onChange: (v: number) => void;
  onCommit?: (v: number) => void;
  onEnd?: () => void;
  endIcon?: React.ReactNode;
  endLabel?: string;
  format?: (v: number) => string;
  label?: string;
  className?: string;
  trackHidden?: boolean; // only the end button shows (the track has nothing to point at)
};

export function AyahSlider({ value, min = 1, max, onChange, onCommit, onEnd, endIcon, endLabel, format = String, label = "Ayah", className, trackHidden }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const widthRef = useRef(0);
  const dragging = useRef(false);
  const x = useMotionValue(0); // thumb offset along the track (continuous while dragging)
  const [pressed, setPressed] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [hoverV, setHoverV] = useState(min);
  const [focus, setFocus] = useState(false);
  const hx = useMotionValue(0); // pointer position over the track
  const hxs = useSpring(hx, { stiffness: 500, damping: 40, mass: 0.4 });
  const span = Math.max(1, max - min);

  const usable = (w = widthRef.current) => Math.max(0, w - THUMB);
  const toPx = useCallback((v: number, w = widthRef.current) => ((v - min) / span) * usable(w), [min, span]); // eslint-disable-line react-hooks/exhaustive-deps
  const toVal = useCallback((px: number, w = widthRef.current) => Math.round(Math.max(0, Math.min(1, px / Math.max(1, usable(w)))) * span + min), [min, span]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      widthRef.current = e.contentRect.width;
      if (!dragging.current) x.set(toPx(value, e.contentRect.width));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [toPx, value, x]);

  useEffect(() => {
    if (!dragging.current) animate(x, toPx(value), springs.settle);
  }, [value, toPx, x]);

  const fill = useTransform(x, (v) => v + THUMB / 2);

  // hover preview: the bubble and the shadow fill follow the pointer smoothly
  const previewLeft = useTransform([hxs, x] as never, ([h, t]: number[]) => Math.min(h, t + THUMB / 2));
  const previewWidth = useTransform([hxs, x] as never, ([h, t]: number[]) => Math.abs(h - (t + THUMB / 2)));
  const bubbleX = useTransform(hxs, (h) => h);
  useMotionValueEvent(hxs, "change", (h) => {
    if (!dragging.current) setHoverV(toVal(h - THUMB / 2));
  });

  const local = (clientX: number) => clientX - trackRef.current!.getBoundingClientRect().left - THUMB / 2;

  // heard as it moves: a fine click for each ayah passed, a firmer one at either end
  const heard = useRef(value);
  const click = (v: number) => {
    if (v === heard.current) return;
    heard.current = v;
    sfx(v === min || v === max ? "detentEnd" : "detent", (v - min) / span);
  };
  useEffect(() => {
    if (!dragging.current) heard.current = value; // (moved by the page: silent)
  }, [value]);

  const move = (clientX: number) => {
    const end = usable();
    const lx = local(clientX);
    const px = Math.max(0, Math.min(end, lx));
    x.set(px); // continuous: no stepping between ayahs while dragging
    const v = toVal(px);
    click(v);
    if (v !== value) onChange(v);
  };

  const onDown = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    dragging.current = true;
    heard.current = value;
    setPressed(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    move(e.clientX);
  };
  const onMove = (e: React.PointerEvent) => {
    const r = trackRef.current!.getBoundingClientRect();
    hx.set(Math.max(THUMB / 2, Math.min(r.width - THUMB / 2, e.clientX - r.left)));
    if (dragging.current) {
      e.stopPropagation();
      move(e.clientX);
    }
  };
  const onUp = () => {
    if (!dragging.current) return;
    dragging.current = false;
    setPressed(false);
    animate(x, toPx(value), springs.settle); // settle onto the chosen ayah
    sfx("settle");
    onCommit?.(value);
  };

  const onKey = (e: React.KeyboardEvent) => {
    const step = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 10, PageDown: -10 }[e.key];
    let v: number | null = null;
    if (step) v = Math.max(min, Math.min(max, value + step));
    if (e.key === "Home") v = min;
    if (e.key === "End") v = max;
    if (v !== null) {
      e.preventDefault();
      click(v);
      onChange(v);
      onCommit?.(v);
    }
  };

  const hot = pressed || hovering;
  const bubbleValue = pressed ? value : hoverV;

  return (
    <div className={cn("flex w-full select-none items-center gap-3 touch-none", className)}>
      <span className={cn("label w-[3.2ch] shrink-0 text-right tabular-nums text-[var(--box-faint)] transition-opacity duration-300", trackHidden && "opacity-0")}>{format(min)}</span>
      <div className={cn("relative flex-1 transition-opacity duration-300", trackHidden && "pointer-events-none opacity-0")} style={{ height: H }}>
        <div
          ref={trackRef}
          role="slider"
          tabIndex={0}
          aria-label={label}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value}
          aria-valuetext={`${label} ${format(value)} of ${format(max)}`}
          onKeyDown={onKey}
          onFocus={(e) => setFocus(e.currentTarget.matches(":focus-visible"))}
          onBlur={() => setFocus(false)}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerEnter={(e) => {
            const r = trackRef.current!.getBoundingClientRect();
            hx.jump(Math.max(THUMB / 2, Math.min(r.width - THUMB / 2, e.clientX - r.left)));
            setHovering(true);
          }}
          onPointerLeave={() => setHovering(false)}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          className="absolute inset-0 cursor-pointer outline-none"
        >
          {/* track */}
          <div
            className="absolute left-0 right-0 bg-[var(--box-line)] transition-[height,top] duration-150"
            style={{ height: hot ? TRACK + 2 : TRACK, top: H / 2 - (hot ? TRACK + 2 : TRACK) / 2 }}
          >
            <motion.div className="absolute left-0 top-0 h-full bg-[var(--box-fg)]" style={{ width: fill }} />
            <motion.div
              className="absolute top-0 h-full bg-[var(--box-faint)] transition-opacity duration-200"
              style={{ left: previewLeft, width: previewWidth, opacity: hovering && !pressed ? 0.9 : 0 }}
            />
          </div>
          {/* the value bubble */}
          <AnimatePresence>
            {hot && (
              <motion.div
                key="tip"
                className="pointer-events-none absolute z-20"
                style={{ top: -20, left: 0, x: pressed ? fill : bubbleX }}
                initial={{ opacity: 0, y: 5, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 4, scale: 0.95, transition: { duration: 0.12 } }}
                transition={springs.fast}
              >
                <span className="label block -translate-x-1/2 whitespace-nowrap bg-[var(--box-fg)] px-1.5 py-1 text-[var(--box-bg-solid)] tabular-nums">
                  {label} {format(bubbleValue)}
                </span>
              </motion.div>
            )}
          </AnimatePresence>
          {/* thumb */}
          <motion.span
            className="pointer-events-none absolute left-0 z-10 flex items-center justify-center"
            style={{ width: THUMB, height: THUMB, top: H / 2 - THUMB / 2, x }}
          >
            <motion.span
              className="block rounded-full bg-[var(--box-fg)]"
              animate={{ width: hot ? THUMB : THUMB_REST, height: hot ? THUMB : THUMB_REST }}
              transition={springs.fast}
              style={{ boxShadow: "0 1px 6px rgba(0,0,0,0.35)" }}
            />
            {focus && <span className="absolute h-[22px] w-[22px] rounded-full border border-[var(--color-gold)]" />}
          </motion.span>
        </div>

      </div>
      <span className={cn("label w-[3.2ch] shrink-0 tabular-nums text-[var(--box-faint)] transition-opacity duration-300", trackHidden && "opacity-0")}>{format(max)}</span>
      {onEnd && (
        <button
          type="button"
          aria-label={endLabel ?? "Open reflection"}
          title={endLabel}
          onClick={onEnd}
          className="group relative ml-1 flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden text-[var(--box-fg)] transition-colors duration-300 hover:text-[var(--color-gold)]"
        >
          <span className="absolute inset-0 origin-bottom scale-y-0 bg-[var(--color-gold)]/12 transition-transform duration-300 ease-out group-hover:scale-y-100" />
          <span className="relative transition-transform duration-300 group-hover:scale-110">{endIcon}</span>
        </button>
      )}
    </div>
  );
}
