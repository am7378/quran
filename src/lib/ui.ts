import { create } from "zustand";
import { animate, motionValue } from "framer-motion";
import type { ReactNode } from "react";
import type { Note } from "./store";

export type MenuItem =
  | { type: "item"; label: string; hint?: string; icon?: ReactNode; onSelect: () => void; disabled?: boolean }
  | { type: "sep" }
  | { type: "label"; label: string };

type UI = {
  flipped: boolean;
  setFlipped: (b: boolean) => void;
  menu: { x: number; y: number; items: MenuItem[] } | null;
  openMenu: (x: number, y: number, items: MenuItem[]) => void;
  closeMenu: () => void;
  noteShare: Note | null; // a note being shared (its picture or video)
  shareNote: (n: Note | null) => void;
  about: boolean; // the About page, over whatever page is open
  setAbout: (b: boolean) => void;
  focus: boolean; // reading with nothing else: the frame fills the screen, only the ayahs and their tools
  setFocus: (b: boolean) => void;
  // an ayah a note refers to ("see 23:12"), open beside it to read without leaving the page
  peek: Peek | null;
  setPeek: (p: Peek | null) => void;
};

// (from: the note it was opened from; it goes when that note does)
export type Peek = { s: number; a: number; to?: number; x: number; y: number; w: number; h: number; pinned?: boolean; from?: string };

/**
 * How far the frame is turned, in degrees: 0 is the front, ±180 the back. A finger dragging
 * sideways turns it directly; letting go (or a click on the edge) settles it on the nearest face.
 */
export const flipAngle = motionValue(0);
let settling: ReturnType<typeof animate> | null = null;
let settlingTo: boolean | null = null;

/** The face the frame is already on its way to, if it is moving. */
export const settlingFace = () => settlingTo;

/**
 * Turn to the face `back` asks for, whichever way round is nearer (or the way `toward` says:
 * -1 brings the right edge toward the reader, 1 the left); `velocity` carries a flick on.
 */
export function settleFlip(back: boolean, velocity = 0, toward?: 1 | -1) {
  settling?.stop();
  settlingTo = back;
  const a = flipAngle.get();
  const all = back ? [-180, 180, 540, -540] : [0, 360, -360];
  const ahead = toward ? all.filter((f) => Math.sign(f - a) === toward) : [];
  const faces = ahead.length ? ahead : all;
  const target = faces.reduce((best, f) => (Math.abs(f - a) < Math.abs(best - a) ? f : best), faces[0]);
  settling = animate(flipAngle, target, {
    type: "spring",
    stiffness: 70,
    damping: 16,
    mass: 1,
    velocity,
    restDelta: 0.2,
    onComplete: () => {
      settlingTo = null;
      // keep the number small: a full turn is no turn
      const n = ((flipAngle.get() % 360) + 540) % 360 - 180;
      flipAngle.set(Math.abs(n) > 179.5 ? 180 : n);
    },
  });
}

/** Stop any settling so a finger can take the frame where it is. */
export function holdFlip() {
  settling?.stop();
  settling = null;
  settlingTo = null;
}

/** Session-only interface state shared across the frame. */
export const useUI = create<UI>((set) => ({
  flipped: false,
  setFlipped: (flipped) => set({ flipped }),
  menu: null,
  openMenu: (x, y, items) => set({ menu: { x, y, items } }),
  closeMenu: () => set({ menu: null }),
  noteShare: null,
  shareNote: (noteShare) => set({ noteShare }),
  about: false,
  setAbout: (about) => set({ about }),
  focus: false,
  setFocus: (focus) => set({ focus }),
  peek: null,
  setPeek: (peek) => set({ peek }),
}));
