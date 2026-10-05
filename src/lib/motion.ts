import { create } from "zustand";

/**
 * A phone at rest: no finger on the page, no scrolling, for a little while. The skies behind the
 * frame (each drawn by the graphics chip, over and over) then hold still until the reader touches
 * the page again: a phone left open on a surah does not keep drawing what is mostly hidden behind
 * the frame, and stays cool. A desktop's sky goes on.
 */
export const isTouch = () => typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches;

export const useIdle = create<{ idle: boolean }>(() => ({ idle: false }));

export function watchIdle(after = 12000) {
  if (!isTouch()) return () => {};
  let timer = 0;
  let woke = 0;
  const wake = () => {
    const now = performance.now();
    if (useIdle.getState().idle) useIdle.setState({ idle: false });
    else if (now - woke < 400) return; // (scrolling: once in a while is enough)
    woke = now;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => useIdle.setState({ idle: true }), after);
  };
  const events = ["pointerdown", "touchstart", "wheel", "keydown", "scroll"] as const;
  events.forEach((t) => document.addEventListener(t, wake, { capture: true, passive: true }));
  wake();
  return () => {
    window.clearTimeout(timer);
    events.forEach((t) => document.removeEventListener(t, wake, { capture: true }));
  };
}

/** How often a sky is drawn, and at most how many pixels: less on a phone (its skies are soft
 *  gradients and noise, the difference unseen), more on a desktop. */
export const SKY = () => (isTouch() ? { fps: 20, pixels: 450_000 } : { fps: 30, pixels: 1_600_000 });
