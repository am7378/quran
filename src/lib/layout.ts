import { useEffect, useState } from "react";

export type Rect = { left: number; top: number; width: number; height: number };

export function useViewport() {
  const read = () => ({ w: window.innerWidth, h: window.innerHeight });
  const [vp, setVp] = useState(read);
  useEffect(() => {
    const on = () => setVp(read());
    window.addEventListener("resize", on);
    window.visualViewport?.addEventListener("resize", on);
    return () => {
      window.removeEventListener("resize", on);
      window.visualViewport?.removeEventListener("resize", on);
    };
  }, []);
  return { ...vp, mobile: vp.w < 768 };
}

/**
 * The frame keeps the browser window's aspect ratio at a medium size.
 * On the reading page it rises a little to leave room for the ayah slider;
 * on page one it is small, the cover of the book.
 */
export function frameRect(w: number, h: number, phase: "intro" | "select" | "read"): Rect {
  const mobile = w < 768;
  if (phase === "intro") {
    const width = mobile ? w - 20 : Math.round(Math.min(640, Math.max(460, w * 0.44)));
    const height = Math.round(Math.min(h * (mobile ? 0.7 : 0.8), Math.max(mobile ? 420 : 430, h * (mobile ? 0.6 : 0.56))));
    return { left: Math.round((w - width) / 2), top: Math.round((h - height) / 2), width, height };
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
