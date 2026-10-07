/*
 * One ayah at a time, moved by the reader's own hand (a finger, the wheel, the keys): the page is
 * not left to the browser's snapping, which each phone does its own way and which a long ayah
 * defeats (Safari rests one only at its top or its end; a phone's flick carries past its end).
 *
 * The rules, the same everywhere:
 * - an ayah that fits the frame is one page: a swipe (a short way, or a light flick) takes the
 *   reader to the next or the one before, never further, and anything less settles back;
 * - a long ayah (taller than the frame) is read with ordinary scrolling, a flick gliding on and
 *   coming softly to rest, but never past its top or its end: there it stops, and only a new swipe
 *   from there goes on to the next ayah (or back to the one before, arrived at its end);
 * - the wheel the same, a turn of it at a time (a trackpad's glide is part of its turn); the keys
 *   a part of a long ayah at a time, then on.
 *
 * Every place is held as an ayah and how far into it, read afresh each frame: an ayah near the
 * frame laying itself out (and the page keeping the reader's place under it) never throws a
 * glide off. The browser's own scrolling is off for the finger (touch-action, index.css) and the
 * wheel; the page is moved here, frame by frame, so everything that follows the scrolling hears it.
 */

const TAU = 380; // how far a flick carries: its speed (px/ms) times this
const NEXT_BY = 0.12; // of the frame's height: a swipe this far from an edge goes on
const NEXT_FLICK = 0.35; // px/ms: or a flick this quick (and at least a little way)
const TURN_GAP = 180; // ms between wheel events that make one turn of it

export type Pager = {
  /** a key: a part of a long ayah at a time (or half a part, for the arrows), then on to the next */
  step: (dir: 1 | -1, small: boolean) => void;
  /** whatever is moving the page here, stopped (the page about to move it itself) */
  stop: () => void;
  destroy: () => void;
};

export function createPager(
  sc: HTMLElement,
  { touch, reduce, settled, moving, selecting }: { touch: boolean; reduce: () => boolean; settled: () => void; moving: () => void; selecting: () => boolean },
): Pager {
  const H = () => sc.clientHeight;
  const list = () => Array.from(sc.querySelectorAll<HTMLElement>("[data-n]"));
  // how far an ayah can be scrolled within (0: it fits)
  const room = (el: HTMLElement) => Math.max(0, el.offsetHeight - H());
  // the ayah the frame is on (the last one whose top is at or above the frame's top), with its neighbours
  const at = (top: number) => {
    const els = list();
    let lo = 0, hi = els.length - 1, k = -1;
    while (lo <= hi) {
      const m = (lo + hi) >> 1;
      if (els[m].offsetTop <= top + 1) (k = m), (lo = m + 1);
      else hi = m - 1;
    }
    if (k < 0) return null;
    return { el: els[k], prev: els[k - 1] ?? null, next: els[k + 1] ?? null };
  };
  // places: an ayah's top at the frame's top, and its end at the frame's foot
  const topOf = (el: HTMLElement) => () => el.offsetTop;
  const endOf = (el: HTMLElement) => () => el.offsetTop + room(el);

  /* ── at rest on an ayah's top, the browser's snapping holds it there (heights changing above it
     move nothing); while anything moves it, and resting partway down a long ayah, there is none ── */
  const rest = (on: boolean) => sc.classList.toggle("resting", on);
  const settle = () => {
    const p = at(sc.scrollTop);
    rest(!!p && Math.abs(sc.scrollTop - p.el.offsetTop) <= 1);
    settled();
  };

  /* ── moving the page ── */
  let raf = 0;
  let follow: { el: HTMLElement; rel: number } | null = null; // where a turn of the wheel is taking the page
  const stop = () => {
    cancelAnimationFrame(raf);
    raf = 0;
    follow = null;
  };
  /**
   * To a place, in about `ms`, leaving at speed v (px/ms) and coming to rest on it (a cubic: no
   * overshoot). The place is read again each frame, and the way still to go kept in proportion.
   */
  const glide = (to: () => number, v = 0, ms?: number) => {
    stop();
    rest(false);
    const start = sc.scrollTop, d0 = to() - start;
    moving();
    if (Math.abs(d0) < 0.5 || reduce()) {
      sc.scrollTop = to();
      settle();
      return;
    }
    const dur = ms ?? Math.min(560, Math.max(260, 220 + Math.abs(d0) * 0.22));
    // its slope at the start, as fast as the finger was going (kept below an overshoot)
    const m0 = Math.max(0, Math.min(2.6, (v * dur) / d0));
    const t0 = performance.now();
    // (where it set out from, kept as the same distance short of the place: an ayah above changing
    // height moves both alike)
    const short = d0;
    const tick = () => {
      moving();
      const t = Math.min(1, (performance.now() - t0) / dur);
      const s = m0 * t + (3 - 2 * m0) * t * t + (m0 - 2) * t * t * t;
      sc.scrollTop = to() - short * (1 - s);
      if (t < 1) raf = requestAnimationFrame(tick);
      else {
        raf = 0;
        settle();
      }
    };
    raf = requestAnimationFrame(tick);
  };
  // a flick inside a long ayah: carried on by its speed, at rest by its top or its end at the latest
  const carry = (el: HTMLElement, v: number) => {
    const rel = Math.max(0, Math.min(room(el), sc.scrollTop - el.offsetTop + v * TAU));
    const d = el.offsetTop + rel - sc.scrollTop;
    if (Math.abs(d) < 1) return settle();
    // the time it takes, so that it leaves at the finger's speed and slows steadily to rest
    glide(() => el.offsetTop + rel, v, Math.min(1200, Math.max(200, (2.2 * Math.abs(d)) / Math.max(0.05, Math.abs(v)))));
  };

  /* ── the finger ── */
  type G = {
    y0: number; x0: number; t0: number; axis: "y" | null; held: boolean;
    el: HTMLElement; rel0: number; prev: HTMLElement | null; next: HTMLElement | null;
    atStart: boolean; atEnd: boolean;
    samples: { t: number; y: number }[];
  };
  let g: G | null = null;
  const onStart = (e: TouchEvent) => {
    if (e.touches.length !== 1) return void (g = null);
    stop();
    rest(false);
    const t = e.touches[0];
    const top = sc.scrollTop;
    const p = at(top);
    if (!p) return;
    const rel0 = top - p.el.offsetTop;
    g = {
      y0: t.clientY, x0: t.clientX, t0: performance.now(), axis: null, held: false,
      el: p.el, rel0, prev: p.prev, next: p.next,
      atStart: rel0 <= 2, atEnd: rel0 >= room(p.el) - 2,
      samples: [{ t: performance.now(), y: t.clientY }],
    };
  };
  const onMove = (e: TouchEvent) => {
    if (!g || g.held) return;
    const t = e.touches[0];
    if (!t) return;
    if (!g.axis) {
      const dx = t.clientX - g.x0, dy = t.clientY - g.y0;
      if (Math.hypot(dx, dy) < 8) return;
      // sideways is the frame's own turning (Read); words being selected keep the page still
      if (Math.abs(dx) > Math.abs(dy) || selecting()) return void (g = null);
      g.axis = "y";
      g.y0 = t.clientY; // (from here: no jump by the first few pixels)
    }
    if (e.cancelable) e.preventDefault();
    moving();
    const now = performance.now();
    g.samples.push({ t: now, y: t.clientY });
    while (g.samples.length > 2 && now - g.samples[0].t > 100) g.samples.shift();
    // what this swipe may reach: within the ayah it began in, and from an edge of it on into the
    // next (or back into the one before), but no further, and never past its own end from inside it
    const a = g.el.offsetTop, b = a + room(g.el);
    const lo = g.atStart && g.prev ? g.prev.offsetTop + room(g.prev) : a;
    const hi = g.atEnd && g.next ? g.next.offsetTop : b;
    sc.scrollTop = Math.max(lo, Math.min(hi, a + g.rel0 - (t.clientY - g.y0)));
  };
  const onEnd = () => {
    const G0 = g;
    g = null;
    if (!G0 || G0.axis !== "y" || G0.held) return settle();
    // its speed at the lift (px/ms; forward, deeper into the surah, is positive)
    const s = G0.samples, n = s.length;
    let v = 0;
    if (n >= 2) {
      const dt = s[n - 1].t - s[0].t;
      if (dt > 0 && performance.now() - s[n - 1].t < 80) v = -(s[n - 1].y - s[0].y) / dt;
    }
    const { el, prev, next, atStart, atEnd } = G0;
    const a = el.offsetTop, b = a + room(el), pos = sc.scrollTop, h = H();
    const moved = pos - (a + G0.rel0);
    // on to the next ayah: from this one's end, far enough or quick enough, forward
    if (next && atEnd && (pos - b > NEXT_BY * h || (v > NEXT_FLICK && moved > 10))) return glide(topOf(next), Math.max(0, v));
    // back to the one before (arrived at its end): from this one's top, the same, backward
    if (prev && atStart && (a - pos > NEXT_BY * h || (v < -NEXT_FLICK && moved < -10))) return glide(endOf(prev), Math.min(0, v));
    // within a long ayah: the flick carried on, at rest by its top or end at the latest
    if (pos >= a && pos <= b && b > a) return carry(el, v);
    // not far enough: back to the edge it left
    glide(pos > b ? endOf(el) : topOf(el));
  };
  const onCancel = () => {
    const G0 = g;
    g = null;
    if (!G0 || G0.axis !== "y") return settle();
    const a = G0.el.offsetTop, b = a + room(G0.el), pos = sc.scrollTop;
    if (pos > b) glide(endOf(G0.el));
    else if (pos < a) glide(topOf(G0.el));
    else settle();
  };
  // a press held to select words: the page is left where it is
  const onLongPress = () => {
    if (g) g.held = true;
  };

  /* ── the wheel ── */
  let lastWheel = 0;
  let turn: { used: boolean; acc: number; el: HTMLElement; prev: HTMLElement | null; next: HTMLElement | null; atStart: boolean; atEnd: boolean } | null = null;
  const chase = () => {
    if (!follow) return void (raf = 0);
    moving();
    const target = follow.el.offsetTop + follow.rel;
    const d = target - sc.scrollTop;
    if (Math.abs(d) < 2) {
      sc.scrollTop = target;
      follow = null;
      raf = 0;
      settle();
      return;
    }
    // (a quarter of the way each frame, and never less than a whole pixel: the page's own rounding
    // would otherwise keep it a few pixels short for ever)
    sc.scrollTop += Math.sign(d) * Math.max(1.5, Math.abs(d) * 0.24);
    raf = requestAnimationFrame(chase);
  };
  const onWheel = (e: WheelEvent) => {
    if (e.ctrlKey) return; // (the page zoomed)
    const d = (Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : 0) * (e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? H() : 1);
    e.preventDefault();
    if (!d) return;
    rest(false);
    const now = performance.now();
    if (now - lastWheel > TURN_GAP || !turn) {
      // a new turn: from where the page is (or is going)
      const top = follow ? follow.el.offsetTop + follow.rel : sc.scrollTop;
      const p = at(top);
      if (!p) return;
      const rel = top - p.el.offsetTop;
      turn = { used: false, acc: 0, el: p.el, prev: p.prev, next: p.next, atStart: rel <= 2, atEnd: rel >= room(p.el) - 2 };
    }
    lastWheel = now;
    const T = turn;
    if (T.used) return;
    const r = room(T.el);
    const rel = follow && follow.el === T.el ? follow.rel : sc.scrollTop - T.el.offsetTop;
    // at an edge, heading out: a little of the turn and it goes on (and only the one step)
    if ((d > 0 && T.atEnd && rel >= r - 2) || (d < 0 && T.atStart && rel <= 2)) {
      T.acc += d;
      if (Math.abs(T.acc) < 24) return;
      T.used = true;
      const to = d > 0 ? T.next && topOf(T.next) : T.prev && endOf(T.prev);
      if (to) glide(to);
      return;
    }
    // within a long ayah: the page follows the wheel, smoothly, and stops at its top or end
    const want = Math.max(0, Math.min(r, rel + d));
    if (want === rel) return;
    if (raf && !follow) stop(); // (a glide under way gives way to the wheel)
    follow = { el: T.el, rel: want };
    if (!raf) raf = requestAnimationFrame(chase);
  };

  /* ── the keys ── */
  const step = (dir: 1 | -1, small: boolean) => {
    const top = follow ? follow.el.offsetTop + follow.rel : sc.scrollTop;
    const p = at(top);
    if (!p) return;
    const rel = top - p.el.offsetTop, r = room(p.el);
    const left = dir > 0 ? r - rel : rel;
    if (left > 2) {
      const to = Math.max(0, Math.min(r, rel + dir * Math.min(left, H() * (small ? 0.45 : 0.85))));
      return glide(() => p.el.offsetTop + to);
    }
    const to = dir > 0 ? p.next && topOf(p.next) : p.prev && endOf(p.prev);
    if (to) glide(to);
  };

  settle();
  const opts = { passive: false } as const;
  if (touch) {
    sc.addEventListener("touchstart", onStart, { passive: true });
    sc.addEventListener("touchmove", onMove, opts);
    sc.addEventListener("touchend", onEnd, { passive: true });
    sc.addEventListener("touchcancel", onCancel, { passive: true });
    sc.addEventListener("longpress", onLongPress);
  }
  sc.addEventListener("wheel", onWheel, opts);
  return {
    step,
    stop,
    destroy: () => {
      stop();
      rest(false);
      sc.removeEventListener("touchstart", onStart);
      sc.removeEventListener("touchmove", onMove);
      sc.removeEventListener("touchend", onEnd);
      sc.removeEventListener("touchcancel", onCancel);
      sc.removeEventListener("longpress", onLongPress);
      sc.removeEventListener("wheel", onWheel);
    },
  };
}
