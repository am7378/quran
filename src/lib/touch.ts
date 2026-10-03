/**
 * The site's own right-click menu on a touch screen. A long press belongs to the phone (it
 * selects text, which is how highlighting starts), so the menu comes from a tap with two fingers
 * at once instead: both down together, both up again quickly, barely moving.
 */
let lastTouch = -Infinity;
let fromTwoFingers = false;

/** True for a context menu that a long press raised (leave it to the browser: selecting). */
export function isLongPressMenu(e: MouseEvent) {
  if (fromTwoFingers) return false;
  const type = (e as PointerEvent).pointerType;
  if (type) return type === "touch" || type === "pen";
  return performance.now() - lastTouch < 1200;
}

/** Listen for two-finger taps and raise a context menu where they landed. */
export function watchTwoFingerTap() {
  let tap: { t: number; x: number; y: number; pts: Map<number, [number, number]>; moved: boolean } | null = null;
  const start = (e: TouchEvent) => {
    lastTouch = performance.now();
    if (e.touches.length === 2) {
      const pts = new Map<number, [number, number]>();
      for (const t of Array.from(e.touches)) pts.set(t.identifier, [t.clientX, t.clientY]);
      const [a, b] = [...pts.values()];
      tap = { t: performance.now(), x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2, pts, moved: false };
    } else if (e.touches.length > 2) tap = null;
  };
  const move = (e: TouchEvent) => {
    lastTouch = performance.now();
    if (!tap) return;
    for (const t of Array.from(e.touches)) {
      const p = tap.pts.get(t.identifier);
      if (p && Math.hypot(t.clientX - p[0], t.clientY - p[1]) > 14) tap.moved = true; // a pinch or a scroll
    }
  };
  const end = (e: TouchEvent) => {
    lastTouch = performance.now();
    if (!tap || e.touches.length > 0) return;
    const ok = !tap.moved && performance.now() - tap.t < 450;
    const { x, y } = tap;
    tap = null;
    if (!ok) return;
    const target = document.elementFromPoint(x, y);
    if (!target) return;
    fromTwoFingers = true;
    try {
      target.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 2 }));
    } finally {
      fromTwoFingers = false;
    }
  };
  document.addEventListener("touchstart", start, { passive: true, capture: true });
  document.addEventListener("touchmove", move, { passive: true, capture: true });
  document.addEventListener("touchend", end, { passive: true, capture: true });
  document.addEventListener("touchcancel", () => (tap = null), { passive: true, capture: true });
  return () => {
    document.removeEventListener("touchstart", start, { capture: true });
    document.removeEventListener("touchmove", move, { capture: true });
    document.removeEventListener("touchend", end, { capture: true });
  };
}
