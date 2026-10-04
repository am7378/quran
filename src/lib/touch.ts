/**
 * Touch screens. The phone's own text selection and its menus are off (index.css, html.touch): the
 * site does both itself.
 * - A press held on the reading text selects words (Read.tsx listens for the "longpress" event and
 *   claims it); a press held anywhere else brings the site's menu.
 * - A tap with two fingers at once brings the menu too: both down together, both up again quickly,
 *   barely moving.
 */
let lastTouch = -Infinity;
let fromGesture = false;

export const LONG_PRESS_MS = 480;

/** True for a context menu that the browser raised from a long press (the site raises its own). */
export function isLongPressMenu(e: MouseEvent) {
  if (fromGesture) return false;
  const type = (e as PointerEvent).pointerType;
  if (type) return type === "touch" || type === "pen";
  return performance.now() - lastTouch < 1200;
}

/** The site's menu, raised where the finger(s) were. */
function raiseMenu(x: number, y: number) {
  const target = document.elementFromPoint(x, y);
  if (!target) return;
  fromGesture = true;
  try {
    target.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 2 }));
  } finally {
    fromGesture = false;
  }
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
    if (ok) raiseMenu(x, y);
  };
  const cancel = () => (tap = null);
  document.addEventListener("touchstart", start, { passive: true, capture: true });
  document.addEventListener("touchmove", move, { passive: true, capture: true });
  document.addEventListener("touchend", end, { passive: true, capture: true });
  document.addEventListener("touchcancel", cancel, { passive: true, capture: true });
  return () => {
    document.removeEventListener("touchstart", start, { capture: true });
    document.removeEventListener("touchmove", move, { capture: true });
    document.removeEventListener("touchend", end, { capture: true });
    document.removeEventListener("touchcancel", cancel, { capture: true });
  };
}

/** Where a "longpress" happened; a listener that takes it calls preventDefault (no menu then). */
export type LongPressDetail = { x: number; y: number };

/**
 * A press held still: first offered as a "longpress" event to what was pressed (the reading text
 * takes it, to select words), otherwise the site's menu. Not where people type, nor on things that
 * are dragged (the surah cards, the slider, the notes: they are touch-none).
 */
export function watchLongPress() {
  let held: { x: number; y: number; target: Element; timer: number } | null = null;
  let fired = 0; // when the last press was taken, so its tap does not also click
  const clear = () => {
    if (held) window.clearTimeout(held.timer);
    held = null;
  };
  const start = (e: TouchEvent) => {
    clear();
    const t = e.touches[0];
    const target = e.target as Element | null;
    if (e.touches.length !== 1 || !t || !target) return;
    if (target.closest?.('input, textarea, select, [contenteditable="true"], .touch-none, [data-no-longpress]')) return;
    const x = t.clientX, y = t.clientY;
    held = {
      x,
      y,
      target,
      timer: window.setTimeout(() => {
        const h = held;
        held = null;
        if (!h || !h.target.isConnected) return;
        fired = performance.now();
        navigator.vibrate?.(8);
        const ev = new CustomEvent<LongPressDetail>("longpress", { bubbles: true, cancelable: true, detail: { x: h.x, y: h.y } });
        if (h.target.dispatchEvent(ev)) raiseMenu(h.x, h.y);
      }, LONG_PRESS_MS),
    };
  };
  const move = (e: TouchEvent) => {
    const t = e.touches[0];
    if (held && (e.touches.length !== 1 || !t || Math.hypot(t.clientX - held.x, t.clientY - held.y) > 10)) clear();
  };
  // the finger lifted after a press that was taken: no click after it
  const end = (e: TouchEvent) => {
    clear();
    if (performance.now() - fired < 2000 && e.cancelable) {
      e.preventDefault();
      fired = 0;
    }
  };
  document.addEventListener("touchstart", start, { passive: true, capture: true });
  document.addEventListener("touchmove", move, { passive: true, capture: true });
  document.addEventListener("touchend", end, { passive: false, capture: true });
  document.addEventListener("touchcancel", clear, { passive: true, capture: true });
  return () => {
    clear();
    document.removeEventListener("touchstart", start, { capture: true });
    document.removeEventListener("touchmove", move, { capture: true });
    document.removeEventListener("touchend", end, { capture: true });
    document.removeEventListener("touchcancel", clear, { capture: true });
  };
}
