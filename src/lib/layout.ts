import { useEffect, useLayoutEffect, useState } from "react";

export type Rect = { left: number; top: number; width: number; height: number };
export type Insets = { top: number; right: number; bottom: number; left: number };

/** Opened from the home screen, as an app of its own (no browser around it). */
export const isStandalone = () =>
  typeof matchMedia !== "undefined" &&
  (matchMedia("(display-mode: standalone)").matches || matchMedia("(display-mode: fullscreen)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);

/** The phone's own edges the page draws under: the status bar, the home indicator (CSS env()). */
let probe: HTMLDivElement | null = null;
export function safeInsets(): Insets {
  if (typeof document === "undefined" || !document.body) return { top: 0, right: 0, bottom: 0, left: 0 };
  if (!probe) {
    probe = document.createElement("div");
    probe.style.cssText =
      "position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)";
    document.body.appendChild(probe);
  }
  const cs = getComputedStyle(probe);
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
 */
export function useViewport() {
  const touch = typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches;
  const read = () => {
    const w = touch ? document.documentElement.clientWidth : window.innerWidth;
    const h = touch ? document.documentElement.clientHeight : window.innerHeight;
    const standalone = isStandalone();
    const insets = safeInsets();
    let short = 0;
    if (standalone && (navigator as Navigator & { standalone?: boolean }).standalone === true) {
      const screenH = matchMedia("(orientation: portrait)").matches ? screen.height : screen.width;
      // (only when the page runs under the status bar: under an opaque one it starts below it)
      short = insets.top > 0 && screenH - h > 1 ? screenH - h : 0;
      if (short) insets.bottom = Math.max(0, insets.bottom - short);
    }
    return { w, h, insets, standalone, short };
  };
  const [vp, setVp] = useState(read);
  useEffect(() => {
    const on = () => {
      const next = read();
      setVp((cur) => (touch && Math.abs(next.w - cur.w) < 2 ? cur : next));
    };
    // (the insets are only known once the page is laid out: read them again then)
    const t = window.setTimeout(() => setVp(read()), 60);
    window.addEventListener("resize", on);
    window.addEventListener("orientationchange", on);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("resize", on);
      window.removeEventListener("orientationchange", on);
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
