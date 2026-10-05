import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { LongPressDetail } from "@/lib/touch";

/**
 * Selecting words on a touch screen, the site's own way (the phone's selection is off: index.css
 * html.touch). A press held on a word picks it; still pressing, the finger draws the selection on
 * across whole words (the page scrolls on near its top or foot, when it scrolls freely); lifting
 * the finger hands the words over (onDone), as a mouse's selection is. Words are kept to the one
 * ayah's text the press began in, as a highlight is.
 */

type Caret = { node: Node; offset: number };
type Word = { start: Caret; end: Caret };

function caretAt(x: number, y: number): Caret | null {
  const d = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  const p = d.caretPositionFromPoint?.(x, y);
  if (p) return { node: p.offsetNode, offset: p.offset };
  const r = d.caretRangeFromPoint?.(x, y);
  return r ? { node: r.startContainer, offset: r.startOffset } : null;
}

const space = (c: string | undefined) => !c || /\s/.test(c);

/** The word a caret is in (null between words). */
function wordAt(c: Caret): Word | null {
  if (c.node.nodeType !== Node.TEXT_NODE) return null;
  const t = c.node.textContent ?? "";
  let s = c.offset, e = c.offset;
  if (space(t[s]) && space(t[s - 1])) return null;
  while (s > 0 && !space(t[s - 1])) s--;
  while (e < t.length && !space(t[e])) e++;
  return { start: { node: c.node, offset: s }, end: { node: c.node, offset: e } };
}

function rangeOf(a: Caret, b: Caret) {
  const r = document.createRange();
  r.setStart(a.node, a.offset);
  r.setEnd(b.node, b.offset);
  return r;
}
/** Is caret a before caret b in the text? */
function before(a: Caret, b: Caret) {
  const r = rangeOf(a, a);
  return r.comparePoint(b.node, b.offset) > 0;
}

/* ── the lens: a finger choosing words covers them, so a small round glass above it shows them
   larger, the words chosen marked in it and a dot where the finger is, the way a loupe is held
   over print. Made once as the press is taken (a copy of the ayah's text, in its own type and
   colours), then only moved: no layout of the page while the finger draws. ── */
const MAG = 1.6;
const LENS = 118;
let varNamesCache: string[] | null = null;
// the site's own custom properties (colours, faces): the copy outside the frame wears the same
function varNames() {
  if (varNamesCache) return varNamesCache;
  const names = new Set<string>();
  const walk = (rules: CSSRuleList) => {
    for (const r of Array.from(rules)) {
      if (r instanceof CSSStyleRule) {
        for (let i = 0; i < r.style.length; i++) {
          const p = r.style[i];
          if (p.startsWith("--") && !p.startsWith("--tw-")) names.add(p);
        }
      } else if ("cssRules" in r) walk((r as CSSGroupingRule).cssRules);
    }
  };
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      walk(sheet.cssRules);
    } catch {
      /* another origin's */
    }
  }
  return (varNamesCache = [...names]);
}

function makeLens(field: HTMLElement) {
  const cs = getComputedStyle(field);
  const lens = document.createElement("div");
  lens.className = "touch-lens";
  lens.setAttribute("aria-hidden", "true");
  for (const v of varNames()) {
    const val = cs.getPropertyValue(v);
    if (val) lens.style.setProperty(v, val);
  }
  const glass = document.createElement("div");
  glass.className = "touch-lens-glass";
  glass.style.background = cs.getPropertyValue("--box-bg-solid").trim() || "#fff";
  const inner = document.createElement("div");
  inner.className = "touch-lens-inner";
  inner.style.transform = `scale(${MAG})`;
  const copy = field.cloneNode(true) as HTMLElement;
  // (no copy answers the page's own look-ups for its ayahs)
  for (const x of [copy, ...copy.querySelectorAll<HTMLElement>("[data-field], [data-key], [data-hid], [id]")])
    ["data-field", "data-key", "data-hid", "id"].forEach((a) => x.removeAttribute(a));
  Object.assign(copy.style, {
    margin: "0",
    width: `${field.getBoundingClientRect().width}px`,
    maxWidth: "none",
    fontFamily: cs.fontFamily,
    fontSize: cs.fontSize,
    fontWeight: cs.fontWeight,
    fontStyle: cs.fontStyle,
    fontStretch: cs.fontStretch,
    lineHeight: cs.lineHeight,
    letterSpacing: cs.letterSpacing,
    wordSpacing: cs.wordSpacing,
    color: cs.color,
    direction: cs.direction,
    textAlign: cs.textAlign,
  });
  const picks = document.createElement("div");
  picks.className = "touch-lens-picks";
  const dot = document.createElement("div");
  dot.className = "touch-lens-dot";
  inner.append(picks, copy);
  glass.append(inner, dot);
  lens.append(glass);
  document.body.append(lens);
  glass.animate([{ transform: "scale(0.55)", opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 220, easing: "cubic-bezier(0.22, 1.2, 0.36, 1)" });

  /** the finger at (x, y), the words chosen `rects` (on the screen) */
  const show = (x: number, y: number, rects: DOMRect[]) => {
    const f = field.getBoundingClientRect();
    const W = window.innerWidth, r = LENS / 2;
    // above the finger; near the top of the screen, beside it instead (never under the hand)
    let cx = x, cy = y - 104;
    if (cy - r < 8) {
      cx = x + (x < W / 2 ? 1 : -1) * (LENS * 0.95);
      cy = Math.max(r + 8, y - 24);
    }
    cx = Math.max(r + 6, Math.min(W - r - 6, cx));
    lens.style.transform = `translate3d(${cx - r}px, ${cy - r}px, 0)`;
    inner.style.transform = `translate3d(${r - (x - f.left) * MAG}px, ${r - (y - f.top) * MAG}px, 0) scale(${MAG})`;
    picks.replaceChildren(
      ...rects.map((q) => {
        const d = document.createElement("div");
        d.className = "touch-pick";
        Object.assign(d.style, { position: "absolute", left: `${q.left - f.left}px`, top: `${q.top - f.top}px`, width: `${q.width}px`, height: `${q.height}px` });
        return d;
      }),
    );
  };
  const hide = () => {
    const a = glass.animate([{ transform: "none", opacity: 1 }, { transform: "scale(0.7)", opacity: 0 }], { duration: 140, easing: "cubic-bezier(0.4, 0, 1, 1)", fill: "forwards" });
    a.onfinish = () => lens.remove();
    a.oncancel = () => lens.remove();
  };
  return { show, hide };
}

export function useTouchSelect({
  root,
  onDone,
  scroller,
  scrollsFreely,
}: {
  root: React.RefObject<HTMLElement | null>;
  onDone: (r: Range) => void;
  scroller: React.RefObject<HTMLElement | null>;
  scrollsFreely: boolean;
}) {
  const [rects, setRects] = useState<DOMRect[]>([]);
  const done = useRef(onDone);
  done.current = onDone;
  const free = useRef(scrollsFreely);
  free.current = scrollsFreely;

  useEffect(() => {
    const el = root.current;
    if (!el || !matchMedia("(pointer: coarse)").matches) return;
    let stop: (() => void) | null = null;

    const onPress = (e: Event) => {
      const { x, y } = (e as CustomEvent<LongPressDetail>).detail;
      const c = caretAt(x, y);
      const host = c ? (c.node.nodeType === Node.TEXT_NODE ? c.node.parentElement : (c.node as Element)) : null;
      const field = host?.closest<HTMLElement>("[data-field]");
      if (!c || !field || !el.contains(field)) return; // not on the text: the menu, then
      const w = wordAt(c);
      if (!w) return;
      // really on the word (a caret is also found beyond a line's end)
      const on = [...rangeOf(w.start, w.end).getClientRects()].some((r) => x >= r.left - 8 && x <= r.right + 8 && y >= r.top - 8 && y <= r.bottom + 8);
      if (!on) return;
      e.preventDefault(); // taken: no menu
      stop?.();

      const anchor = w;
      let focus = w;
      let px = x, py = y;
      let raf = 0, scrolling = 0;
      const lens = makeLens(field);
      const selected = () => {
        const s = before(focus.start, anchor.start) ? focus.start : anchor.start;
        const en = before(anchor.end, focus.end) ? focus.end : anchor.end;
        return rangeOf(s, en);
      };
      const paint = () => {
        raf = 0;
        const rs = [...selected().getClientRects()].filter((r) => r.width > 0.5);
        setRects(rs);
        lens.show(px, py, rs);
      };
      const follow = () => {
        const c2 = caretAt(px, py);
        if (c2 && field.contains(c2.node)) focus = wordAt(c2) ?? { start: c2, end: c2 };
        if (!raf) raf = requestAnimationFrame(paint);
      };
      const move = (ev: TouchEvent) => {
        const t = ev.touches[0];
        if (!t) return;
        if (ev.cancelable) ev.preventDefault(); // drawing the selection, not scrolling
        px = t.clientX;
        py = t.clientY;
        follow();
        window.clearInterval(scrolling);
        scrolling = 0;
        const sc = scroller.current;
        if (sc && free.current) {
          const r = sc.getBoundingClientRect();
          const dir = py < r.top + 56 ? -1 : py > r.bottom - 56 ? 1 : 0;
          if (dir)
            scrolling = window.setInterval(() => {
              sc.scrollTop += dir * 7;
              follow();
            }, 16);
        }
      };
      const finish = () => {
        window.clearInterval(scrolling);
        cancelAnimationFrame(raf);
        document.removeEventListener("touchmove", move);
        document.removeEventListener("touchend", lift);
        document.removeEventListener("touchcancel", finish);
        setRects([]);
        lens.hide();
        stop = null;
      };
      const lift = () => {
        const r = selected();
        finish();
        if (!r.collapsed) done.current(r);
      };
      document.addEventListener("touchmove", move, { passive: false });
      document.addEventListener("touchend", lift);
      document.addEventListener("touchcancel", finish);
      stop = finish;
      paint();
    };

    el.addEventListener("longpress", onPress);
    return () => {
      el.removeEventListener("longpress", onPress);
      stop?.();
    };
  }, [root, scroller]);

  return rects.length
    ? createPortal(
        <div className="pointer-events-none fixed inset-0 z-[74]" aria-hidden>
          {rects.map((r, i) => (
            <div key={i} className="touch-pick absolute" style={{ left: r.left, top: r.top, width: r.width, height: r.height }} />
          ))}
        </div>,
        document.body,
      )
    : null;
}
