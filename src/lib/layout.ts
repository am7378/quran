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
 */
export function useViewport() {
  const touch = typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches;
  const read = () => {
    const w = touch ? document.documentElement.clientWidth : window.innerWidth;
    let h = touch ? document.documentElement.clientHeight : window.innerHeight;
    // an iPhone home-screen app, its status bar see-through: iOS lays the page out short of the
    // screen by the status bar's height, though the app fills the screen. The screen it is, then.
    if ((navigator as Navigator & { standalone?: boolean }).standalone === true) {
      const portrait = matchMedia("(orientation: portrait)").matches;
      h = Math.max(h, window.innerHeight, portrait ? screen.height : screen.width);
    }
    return { w, h, insets: safeInsets(), standalone: isStandalone() };
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
  // the layers that fill the screen (the sky, the notes, the dialogs) take this height too (index.css)
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--app-h", `${vp.h}px`);
    root.style.setProperty("--icb-gap", `${Math.max(0, vp.h - root.clientHeight)}px`);
  }, [vp.h]);
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
      return { left: 10, top, width: w - 20, height: h - top - (ins.bottom + 78) }; // the slider below
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
