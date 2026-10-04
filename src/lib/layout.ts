import { useEffect, useLayoutEffect, useState } from "react";

export type Rect = { left: number; top: number; width: number; height: number };
export type Insets = { top: number; right: number; bottom: number; left: number };

/** Opened from the home screen, as an app of its own (no browser around it). */
export const isStandalone = () =>
  typeof matchMedia !== "undefined" &&
  (matchMedia("(display-mode: standalone)").matches || matchMedia("(display-mode: fullscreen)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);

/** The phone's own edges the page draws under: the status bar, the home indicator (CSS env()). */
let probe: HTMLDivElement | null = null;
function insetProbe() {
  if (!probe) {
    probe = document.createElement("div");
    probe.style.cssText =
      "position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)";
    document.body.appendChild(probe);
  }
  return probe;
}
export function safeInsets(): Insets {
  if (typeof document === "undefined" || !document.body) return { top: 0, right: 0, bottom: 0, left: 0 };
  const cs = getComputedStyle(insetProbe());
  return { top: parseFloat(cs.paddingTop) || 0, right: parseFloat(cs.paddingRight) || 0, bottom: parseFloat(cs.paddingBottom) || 0, left: parseFloat(cs.paddingLeft) || 0 };
}

/**
 * The size the frame is laid out for. On a touch screen it is the page's own layout size (not what
 * a zoom or the keyboard leaves visible), and it changes only when the width does (the phone
 * turned): the browser's bars, the keyboard opening to write a note, a zoom, none of them reshape
 * the frame. A desktop window follows its size as it is resized. From the home screen, the edges
 * the phone keeps for itself are known too (insets).
 *
 * iOS 26 (WebKit bug 301108): a home-screen app whose status bar is see-through is drawn from the
 * top of the screen but made one status bar shorter than it. The strip left at the foot is not the
 * page's: iOS fills it with the page's background colour and nothing can be drawn there. The page
 * then ends above the home indicator, so no room is kept for it (short: the strip's height).
 *
 * iOS can tell the page its insets late (an app opened quickly, from its offline copy): until then
 * they read 0. The page is short by the status bar's height, so that height is known from the
 * start; and the insets are read again whenever iOS changes them.
 */
export function useViewport() {
  const touch = typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches;
  // keep: on a touch screen the size held so far, while the width stays the same
  const read = (keep?: { w: number; h: number }) => {
    let w = touch ? document.documentElement.clientWidth : window.innerWidth;
    let h = touch ? document.documentElement.clientHeight : window.innerHeight;
    if (keep && Math.abs(w - keep.w) < 2) ({ w, h } = keep);
    const standalone = isStandalone();
    const insets = safeInsets();
    let short = 0;
    if (standalone && (navigator as Navigator & { standalone?: boolean }).standalone === true) {
      // the page runs under the status bar (index.html), so a page short of the screen is the bug
      const screenH = matchMedia("(orientation: portrait)").matches ? screen.height : screen.width;
      short = screenH - h > 1 ? screenH - h : 0;
      if (short) {
        insets.top = Math.max(insets.top, short);
        insets.bottom = Math.max(0, insets.bottom - short);
      }
    }
    return { w, h, insets, standalone, short };
  };
  const [vp, setVp] = useState(() => read());
  useEffect(() => {
    const same = (a: ReturnType<typeof read>, b: ReturnType<typeof read>) => JSON.stringify(a) === JSON.stringify(b);
    const take = (keep: boolean) => setVp((cur) => {
      const next = read(keep && touch ? cur : undefined);
      return same(next, cur) ? cur : next;
    });
    const on = () => take(true);
    // read again, size and all, once the page has settled; then the insets whenever iOS gives them
    // (the probe's padding changes with them), and when the app comes back to the screen
    const timers = [60, 300, 900].map((ms) => window.setTimeout(() => take(false), ms));
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(on) : null;
    ro?.observe(insetProbe(), { box: "border-box" });
    const seen = () => document.visibilityState === "visible" && on();
    window.addEventListener("resize", on);
    window.addEventListener("orientationchange", on);
    window.addEventListener("pageshow", on);
    document.addEventListener("visibilitychange", seen);
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      ro?.disconnect();
      window.removeEventListener("resize", on);
      window.removeEventListener("orientationchange", on);
      window.removeEventListener("pageshow", on);
      document.removeEventListener("visibilitychange", seen);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // the strip at the foot, if any (the sky fades into its colour, index.css), and the room the
  // home indicator needs, for what is held to the bottom of the screen
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("ios-short", vp.short > 0);
    if (vp.standalone) root.style.setProperty("--app-bottom", `${vp.insets.bottom}px`);
    else root.style.removeProperty("--app-bottom");
  }, [vp.short, vp.standalone, vp.insets.bottom]);
  return { ...vp, mobile: vp.w < 768 };
}

/**
 * The frame keeps the browser window's aspect ratio at a medium size.
 * On the reading page it rises a little to leave room for the ayah slider;
 * on page one it is small, the cover of the book. Opened from a phone's home screen, there is no
 * browser around it: the frame takes the whole screen but for the passage's theme under the status
 * bar and the slider above the home indicator.
 */
export function frameRect(w: number, h: number, phase: "intro" | "select" | "read", app?: { standalone: boolean; insets: Insets }): Rect {
  const mobile = w < 768;
  const ins = app?.insets ?? { top: 0, right: 0, bottom: 0, left: 0 };
  if (mobile && app?.standalone) {
    if (phase === "read") {
      const top = ins.top + 46; // the theme, just under the status bar
      return { left: 10, top, width: w - 20, height: h - top - (ins.bottom + 74) }; // the slider below
    }
    if (phase === "select") {
      const top = ins.top + 14;
      return { left: 10, top, width: w - 20, height: h - top - ins.bottom - 14 };
    }
  }
  if (phase === "intro") {
    const width = mobile ? w - 20 : Math.round(Math.min(640, Math.max(460, w * 0.44)));
    const height = Math.round(Math.min(h * (mobile ? 0.7 : 0.8), Math.max(mobile ? 420 : 430, h * (mobile ? 0.6 : 0.56))));
    return { left: Math.round((w - width) / 2), top: Math.round((h - height + ins.top - ins.bottom) / 2), width, height };
  }
  if (mobile) {
    const width = w - 20;
    const height = phase === "read" ? h * 0.74 : h * 0.8;
    const top = phase === "read" ? h * 0.085 : (h - height) / 2;
    return { left: 10, top, width, height };
  }
  const k = phase === "read" ? 0.76 : 0.76;
  const width = Math.round(w * k);
  const height = Math.round(h * (phase === "read" ? 0.72 : 0.76));
  const top = Math.round((h - height) / 2 - (phase === "read" ? h * 0.025 : 0));
  return { left: Math.round((w - width) / 2), top, width, height };
}
