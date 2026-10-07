import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Translation } from "./data";
import type { ThemeId } from "./themes";

export type HighlightColor = "yellow" | "green" | "pink" | "blue" | "orange";
export const HIGHLIGHT_COLORS: HighlightColor[] = ["yellow", "green", "pink", "blue", "orange"];
export const HIGHLIGHT_HEX: Record<HighlightColor, string> = {
  yellow: "#f5e27a",
  green: "#a2dd8f",
  pink: "#f3a0c1",
  blue: "#96c5f4",
  orange: "#f6b06f",
};

/** field: which text of the ayah the highlight lives in */
export type HighlightField = "ar" | Translation;

export type Highlight = {
  id: string;
  key: string; // "2:255"
  field: HighlightField;
  start: number;
  end: number;
  color: HighlightColor;
  text: string;
  at: number;
};

export type Note = {
  id: string;
  key: string;
  hid?: string; // highlight the note is attached to
  quote?: string;
  text: string;
  x: number; // position as a fraction of the viewport
  y: number;
  rot: number;
  at: number;
  kind?: "text" | "voice";
  audio?: string; // IndexedDB key of a voice note
  dur?: number;
  docked?: "left" | "right" | "top" | "bottom" | null; // pushed off the screen edge
};

export type Recording = { id: string; at: number; dur: number };
export type Reflection = { summary: string; lessons: string; updatedAt: number; recordings: Recording[] };

export type Settings = {
  translation: Translation; // the main one (highlights, context, copy and share follow it)
  also: Translation[]; // shown under it, in this order (up to two more)
  showContext: boolean;
  readingMode: "both" | "arabic" | "translation";
  arabicScale: number;
  transScale: number;
  wordHover: boolean;
  translit: boolean;
  boxTheme: "night" | "paper";
  theme: ThemeId; // the whole site's look (lib/themes.ts)
  grain: boolean;
  slider: boolean; // the ayah slider under the reading frame
  reduceMotion: boolean;
  view: 1 | 3;
  book: boolean; // Arabic only or a translation only, in the multiple-ayah view: the ayahs run on like a book
  bookThemes: boolean; // the translation read as a book: its paragraphs headed by their themes
  script: "uthmani" | "indopak"; // the Arabic: Madani (KFGQPC Hafs) or Indo-Pak
  arabicSpacing: "airy" | "close"; // the Arabic's words and lines: as set out on a screen, or closer, as a printed mushaf
  // the site's sounds (lib/sound.ts): all of them, and each kind on its own
  sound: boolean;
  sounds: boolean; // the marker's sound when highlighting
  soundTaps: boolean; // buttons, switches, menus
  soundTyping: boolean; // keys, writing a note or a reflection
  soundNotes: boolean; // a note picked up and put down
  soundRecord: boolean; // a recording starting and stopping
  soundComplete: boolean; // a surah marked as completed
  soundSlider: boolean; // the ayah slider's fine click for each ayah
  // Monochrome's own two choices: the page around the frame, and the frame itself
  monoSky: "dark" | "light";
  monoCard: "dark" | "light";
};

/** A folder of bookmarks, named by the reader; every bookmark is also under All. */
export type Folder = { id: string; name: string; at: number };

/**
 * A reading goal, kept simple: a number of surahs each week or each month, or the whole Qur'an
 * by a date. Progress is the surahs the reader has marked as completed.
 */
export type Goal = { kind: "week" | "month"; count: number } | { kind: "khatm"; by: string; from: number };

type State = {
  settings: Settings;
  folders: Record<string, Folder>;
  inFolders: Record<string, string[]>; // bookmark key -> the folders it is in
  done: Record<string, number>; // surah -> when the reader marked it as completed
  goal: Goal | null;
  addFolder: (name: string) => string;
  renameFolder: (id: string, name: string) => void;
  removeFolder: (id: string) => void;
  setInFolders: (key: string, ids: string[]) => void;
  toggleDone: (surah: number) => void;
  setGoal: (g: Goal | null) => void;
  bookmarks: Record<string, number>;
  highlights: Record<string, Highlight>;
  notes: Record<string, Note>;
  reflections: Record<number, Reflection>;
  last: { s: number; v: number } | null;
  set: (p: Partial<Settings>) => void;
  toggleBookmark: (key: string) => void;
  addHighlight: (h: Highlight) => void;
  updateHighlight: (id: string, p: Partial<Highlight>) => void;
  removeHighlight: (id: string) => void;
  addNote: (n: Note) => void;
  updateNote: (id: string, p: Partial<Note>) => void;
  removeNote: (id: string) => void;
  saveReflection: (s: number, p: Partial<Reflection>) => void;
  setLast: (s: number, v: number) => void;
  clearAll: () => void;
};

const DEFAULTS: Settings = {
  translation: "qme",
  also: [],
  showContext: true,
  readingMode: "both",
  arabicScale: 1,
  transScale: 1,
  wordHover: true,
  translit: true,
  boxTheme: "night",
  theme: "classic",
  slider: true,
  grain: true,
  reduceMotion: false,
  view: 1,
  book: false,
  bookThemes: true,
  script: "uthmani",
  arabicSpacing: "airy",
  sound: true,
  sounds: true,
  soundTaps: true,
  soundTyping: true,
  soundNotes: true,
  soundRecord: true,
  soundComplete: true,
  soundSlider: true,
  monoSky: "dark",
  monoCard: "light",
};

const emptyReflection = (): Reflection => ({ summary: "", lessons: "", updatedAt: 0, recordings: [] });

export const useStore = create<State>()(
  persist(
    (set) => ({
      settings: DEFAULTS,
      folders: {},
      inFolders: {},
      done: {},
      goal: null,
      addFolder: (name) => {
        const id = `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
        set((s) => ({ folders: { ...s.folders, [id]: { id, name: name.trim() || "Folder", at: Date.now() } } }));
        return id;
      },
      renameFolder: (id, name) =>
        set((s) => (s.folders[id] ? { folders: { ...s.folders, [id]: { ...s.folders[id], name: name.trim() || s.folders[id].name } } } : s)),
      removeFolder: (id) =>
        set((s) => {
          const folders = { ...s.folders };
          delete folders[id];
          // its bookmarks stay, under All and their other folders
          const inFolders = Object.fromEntries(Object.entries(s.inFolders).map(([k, ids]) => [k, ids.filter((x) => x !== id)]));
          return { folders, inFolders };
        }),
      setInFolders: (key, ids) => set((s) => ({ inFolders: { ...s.inFolders, [key]: ids } })),
      toggleDone: (surah) =>
        set((s) => {
          const done = { ...s.done };
          if (done[surah]) delete done[surah];
          else done[surah] = Date.now();
          return { done };
        }),
      setGoal: (goal) => set({ goal }),
      bookmarks: {},
      highlights: {},
      notes: {},
      reflections: {},
      last: null,
      set: (p) => set((s) => ({ settings: { ...s.settings, ...p } })),
      toggleBookmark: (key) =>
        set((s) => {
          const b = { ...s.bookmarks };
          const inFolders = { ...s.inFolders };
          if (b[key]) {
            delete b[key];
            delete inFolders[key];
          } else b[key] = Date.now();
          return { bookmarks: b, inFolders };
        }),
      addHighlight: (h) => set((s) => ({ highlights: { ...s.highlights, [h.id]: h } })),
      updateHighlight: (id, p) =>
        set((s) => (s.highlights[id] ? { highlights: { ...s.highlights, [id]: { ...s.highlights[id], ...p } } } : s)),
      removeHighlight: (id) =>
        set((s) => {
          const h = { ...s.highlights };
          delete h[id];
          // notes attached to the highlight stay, but lose the link
          const notes = Object.fromEntries(
            Object.entries(s.notes).map(([k, n]) => [k, n.hid === id ? { ...n, hid: undefined } : n]),
          );
          return { highlights: h, notes };
        }),
      addNote: (n) => set((s) => ({ notes: { ...s.notes, [n.id]: n } })),
      updateNote: (id, p) => set((s) => (s.notes[id] ? { notes: { ...s.notes, [id]: { ...s.notes[id], ...p } } } : s)),
      removeNote: (id) =>
        set((s) => {
          const n = { ...s.notes };
          delete n[id];
          return { notes: n };
        }),
      saveReflection: (surah, p) =>
        set((s) => ({
          reflections: {
            ...s.reflections,
            [surah]: { ...(s.reflections[surah] ?? emptyReflection()), ...p, updatedAt: Date.now() },
          },
        })),
      setLast: (s, v) => set({ last: { s, v } }),
      clearAll: () => set({ bookmarks: {}, inFolders: {}, folders: {}, highlights: {}, notes: {}, reflections: {}, last: null }),
    }),
    {
      name: "quran-reader",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      merge: (persisted, current) => {
        const p = { ...((persisted ?? {}) as Partial<State> & { stats?: unknown }) };
        delete p.stats; // the reading counts the site once kept are gone
        const settings = { ...DEFAULTS, ...(p.settings ?? {}) };
        // (the royal blue theme, once "Royal", is "Blue")
        if ((settings.theme as string) === "royal") settings.theme = "blue";
        return { ...current, ...p, settings };
      },
    },
  ),
);


