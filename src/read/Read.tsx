import { AnimatePresence, motion } from "framer-motion";
import { startTransition, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  LayoutGrid,
  Search as SearchIcon,
  Bookmark,
  Check,
  ChevronDown,
  Copy,
  Mic,
  Share2,
  StickyNote,
  Highlighter,
  Settings2,
  Rows3,
  RectangleHorizontal,
  BookOpen,
  Maximize2,
  Minimize2,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  CornerDownRight,
  Pause,
  Play,
  Trash2,
  Volume2,
  X as XIcon,
} from "lucide-react";
import { Actions, AyahSection, ContextToggle, onAyahHeights, type AyahAction } from "./Ayah";
import { HONORIFICS, glossByTerm, glossFor, loadGlossary } from "./terms";
import { HighlightMenu, StickyNotes, Toast, WordTip, tipHover, type Tip } from "./Overlays";
import { ReflectionPanel } from "./Reflection";
import { SettingsPanel } from "./Settings";
import { SurahSummary } from "./Summary";
import { ShareDialog, type ShareContent } from "./Share";
import { arabicFor, translationFor } from "./align";
import { NoteShareDialog } from "./NoteShare";
import { BookText } from "./Book";
import { VoiceRecorder } from "./VoiceNote";
import { rangeToOffsets, rangeToArabicWords, snapToLatinWords, trimRange, arabicWords, translationPieces } from "./text";
import { AyahSlider } from "@/components/ui/slider";
import { SurahArt } from "@/components/SurahCard";
import { SearchBox } from "@/components/SearchBox";
import { ImmersivePanel, MenuGlyph, Reveal, SettingsGlyph } from "@/components/ImmersivePanel";
import { BracketButton } from "@/components/bits";
import { QuillGlyph } from "@/components/glyphs";
import { arabicText, loadSurah, pad3, spellHonorifics, translationText, type Surah, type SurahData, type Verse } from "@/lib/data";
import { useStore, type Highlight, type HighlightField, type Settings } from "@/lib/store";
import { flipAngle, holdFlip, settleFlip, useUI, type MenuItem } from "@/lib/ui";
import { playHighlight, strokeEnd, strokeMove, strokeRecently } from "@/lib/sound";
import { isLongPressMenu } from "@/lib/touch";
import { useTouchSelect } from "./touchSelect";
import type { Rect } from "@/lib/layout";
import type { Result } from "@/lib/search";
import { EASE_IN_OUT, EASE_OUT, cn, copyText, uid } from "@/lib/utils";
import { CompleteMark } from "./Progress";
import { FolderPop } from "./Folders";
import { IndexView, INDEX_VIEWS, type IndexKind } from "@/pages/IndexViews";
import { AyahPeek } from "./Peek";

const GLOSSED = ".gl, .saw, .hon"; // translation terms and honorifics with a meaning on hover
// the settings an ayah is drawn with
const AYAH_KEYS = ["translation", "also", "book", "bookThemes", "showContext", "readingMode", "arabicScale", "transScale", "wordHover", "script", "arabicSpacing", "view", "reduceMotion"] as const;

type Props = {
  surahs: Surah[];
  juz: Record<string, string>;
  start: { surah: number; ayah: number; from?: Rect; showOpener?: boolean };
  onIndex: (surah: number, ayah: number) => void;
  mobile: boolean;
  below: number; // space between the frame's bottom edge and the window's
};

// the King Fahd Complex (QPC) Hafs text of 1:1
const BISMILLAH = "بِسۡمِ ٱللَّهِ ٱلرَّحۡمَٰنِ ٱلرَّحِيمِ";

export function Read({ surahs, juz, start, onIndex, mobile, below }: Props) {
  const settings = useStore((s) => s.settings);
  const set = useStore((s) => s.set);
  const bookmarks = useStore((s) => s.bookmarks);
  const allHighlights = useStore((s) => s.highlights);
  const allNotes = useStore((s) => s.notes);
  const toggleBookmark = useStore((s) => s.toggleBookmark);
  const addHighlight = useStore((s) => s.addHighlight);
  const removeHighlight = useStore((s) => s.removeHighlight);
  const addNote = useStore((s) => s.addNote);
  const setLast = useStore((s) => s.setLast);

  const [surahN, setSurahN] = useState(start.surah);
  const [data, setData] = useState<SurahData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(start.showOpener ? 0 : start.ayah);
  const [lastShown, setLastShown] = useState(active); // the last ayah showing in the frame
  const target = useRef<{ ayah: number; smooth: boolean } | null>({ ayah: start.showOpener ? 0 : start.ayah, smooth: false });
  const [zoom, setZoom] = useState<Rect | null>(start.from ?? null);

  // the ayahs as a book: the multiple-ayah view, with the Arabic alone or a translation alone
  const bookMode = settings.view === 3 && settings.readingMode !== "both" && settings.book;
  const [panel, setPanel] = useState<null | "settings" | "saved" | "reflection" | "search">(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const closeTip = useCallback(() => setTip(null), []);
  // a panel opened over the page: what was floating over the page goes
  useEffect(() => {
    if (!panel) return;
    setTip(null);
    useUI.getState().setPeek(null);
  }, [panel]);
  const [menu, setMenu] = useState<{ id: string; at: { x: number; y: number; bottom: number; below?: boolean } } | null>(null);
  const [focusNote, setFocusNote] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  // bookmarked with folders of one's own: the popup to file it, where it was bookmarked
  const [folderPop, setFolderPop] = useState<{ key: string; x: number; y: number } | null>(null);
  const closeFolderPop = useCallback(() => setFolderPop(null), []);
  const lastPt = useRef({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
  useEffect(() => {
    const on = (e: PointerEvent) => (lastPt.current = { x: e.clientX, y: e.clientY });
    window.addEventListener("pointerdown", on, true);
    return () => window.removeEventListener("pointerdown", on, true);
  }, []);
  const [outside, setOutside] = useState<HTMLElement | null>(null); // around the frame, not turning with it
  const [turning, setTurning] = useState<HTMLElement | null>(null); // over the frame, turning with it
  const [edges, setEdges] = useState<HTMLElement | null>(null); // beside the frame, whichever face shows
  const [backFace, setBackFace] = useState<HTMLElement | null>(null);
  const [share, setShare] = useState<ShareContent | null>(null);
  // a voice note on an ayah, or on a highlighted part of one (hid + quote)
  const [recorder, setRecorder] = useState<{ key: string; anchor: DOMRect; hid?: string; quote?: string } | null>(null);
  const flipped = useUI((s) => s.flipped);
  const setFlipped = useUI((s) => s.setFlipped);
  const openMenu = useUI((s) => s.openMenu);
  const noteShare = useUI((s) => s.noteShare);
  const focus = useUI((s) => s.focus);
  const aboutOpen = useUI((s) => s.about);
  const closeNoteShare = useCallback(() => useUI.getState().shareNote(null), []);
  useEffect(() => () => setFlipped(false), [setFlipped]); // leaving the reader turns the frame back

  const rootRef = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const surah = surahs[surahN - 1];

  useLayoutEffect(() => {
    setOutside(document.querySelector<HTMLElement>("[data-frame-still]"));
    setTurning(document.querySelector<HTMLElement>("[data-frame-outside]"));
    setEdges(document.querySelector<HTMLElement>("[data-frame-edges]"));
    setBackFace(document.querySelector<HTMLElement>("[data-frame-back]"));
  }, []);

  const [viewH, setViewH] = useState(0);
  const [viewW, setViewW] = useState(0);
  // the ayah being read when the frame changed size (a phone's keyboard opening under a panel,
  // a window resized): every page changes height with it, and the reader stays on that ayah
  const keepOnResize = useRef<number | null>(null);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const measure = () => {
      setViewW(Math.round(el.clientWidth / 16) * 16);
      const h = Math.round(el.clientHeight / 8) * 8;
      setViewH((old) => {
        if (old && old !== h && keepOnResize.current === null) keepOnResize.current = activeRef.current;
        return h;
      });
    };
    // (while the frame moves into focus or out of it, the ayahs wait: they are fitted once, at the
    // size it comes to, not at every size on the way)
    const ro = new ResizeObserver(() => !useUI.getState().reflow && measure());
    ro.observe(el);
    const off = useUI.subscribe((st, prev) => {
      if (prev.reflow && !st.reflow) measure();
    });
    return () => {
      ro.disconnect();
      off();
    };
  }, []);
  useLayoutEffect(() => {
    const keep = keepOnResize.current;
    keepOnResize.current = null;
    if (keep === null) return;
    const place = () => {
      const sc = scroller.current;
      const el = sc?.querySelector<HTMLElement>(`[data-n="${keep}"]`);
      if (sc && el) sc.scrollTop = el.offsetTop;
      anchorNow.current();
    };
    place();
    // and again once long ayahs have refitted to the new height
    let raf = requestAnimationFrame(() => (raf = requestAnimationFrame(place)));
    return () => cancelAnimationFrame(raf);
  }, [viewH]);

  // the Indo-Pak bismillah is taken from 1:1 of the Indo-Pak text itself
  const [bismIP, setBismIP] = useState<string | null>(null);
  useEffect(() => {
    if (settings.script !== "indopak" || bismIP) return;
    loadSurah(1)
      .then((d) => d.v[0]?.ip && setBismIP(d.v[0].ip.join(" ")))
      .catch(() => {});
  }, [settings.script, bismIP]);

  /* ── load the surah ─────────────────────────────────────────── */
  const mountedAt = useRef(performance.now());
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let alive = true;
    setError(null);
    setData(null);
    // the glossary comes first, so its terms are marked up when the ayahs render. Coming from the
    // index, the surah is set out once the index has faded and in small pieces (a transition), so
    // the frame moving into place never waits on a long surah being built
    Promise.all([loadSurah(surahN), loadGlossary()])
      .then(([d]) => {
        if (!alive) return;
        const wait = Math.max(0, 420 - (performance.now() - mountedAt.current));
        window.setTimeout(() => alive && startTransition(() => setData(d)), wait);
      })
      .catch(() => alive && setError(`${surahs[surahN - 1]?.tc ?? "This surah"} didn't load. Check your connection and try again.`));
    // warm the neighbours
    if (surahN < 114) loadSurah(surahN + 1).catch(() => {});
    return () => {
      alive = false;
    };
  }, [surahN, surahs, retry]);

  // the one-ayah view's anchor (below): told at once when the page itself moves the reader
  const anchorNow = useRef<() => void>(() => {});
  // (and told to follow a glide the page makes, for as long as it lasts)
  const anchorFollow = useRef<(ms: number) => void>(() => {});

  /* ── scroll to a pending target once the surah is rendered ──── */
  const scrollToAyah = useCallback((ayah: number, smooth = true) => {
    const sc = scroller.current;
    if (!sc) return;
    const el = sc.querySelector<HTMLElement>(`[data-n="${ayah}"]`);
    if (!el) return;
    const topOf = () => {
      let top = el.offsetTop;
      // scrolling freely, the last ayahs rest with the surah's end at the foot of the box (any
      // further and the closing page takes over)
      if (sc.classList.contains("flow") && ayah > 0) {
        const pages = sc.querySelectorAll<HTMLElement>("[data-n]");
        const closing = pages[pages.length - 1];
        if (closing && closing !== el) top = Math.min(top, closing.offsetTop - sc.clientHeight);
      }
      return top;
    };
    const top = topOf();
    if (!smooth || settings.reduceMotion) {
      sc.scrollTo({ top, behavior: "auto" });
      anchorNow.current();
      // held there for a few frames while the ayahs around it are laid out and take their own
      // heights (an ayah taller than the frame does not snap back by itself); anything else that
      // moves the page meanwhile (the reader, the page keeping its place) ends it
      const hold = (frames: number, want: number) =>
        requestAnimationFrame(() => {
          if (Math.abs(sc.scrollTop - want) > 1) return;
          const t = topOf();
          if (Math.abs(t - want) > 1) sc.scrollTop = t;
          anchorNow.current();
          if (frames > 1) hold(frames - 1, sc.scrollTop);
        });
      hold(3, sc.scrollTop);
      return;
    }
    // the ayahs passed on the way are laid out only as they come near, each moving the ones after
    // it a little: a glide lands where the ayah has come to be, once it has stopped
    const started = performance.now();
    const settle = () => {
      if (performance.now() - started > 2500) return; // the reader has scrolled on since
      const t = topOf();
      if (Math.abs(t - sc.scrollTop) > 2) sc.scrollTo({ top: t, behavior: "smooth" });
    };
    anchorFollow.current(2600);
    const glide = () => {
      sc.scrollTo({ top: topOf(), behavior: "smooth" });
      if ("onscrollend" in window) sc.addEventListener("scrollend", settle, { once: true });
      else setTimeout(settle, 900);
    };
    // far away, most of the way is one step and only the last screen glides
    const far = top - sc.scrollTop;
    if (Math.abs(far) > sc.clientHeight * 2.5) {
      sc.scrollTop = top - Math.sign(far) * sc.clientHeight;
      requestAnimationFrame(() => requestAnimationFrame(glide));
    } else glide();
  }, [settings.reduceMotion]);

  useLayoutEffect(() => {
    if (!data || !target.current) return;
    const t = target.current;
    target.current = null;
    requestAnimationFrame(() => {
      scrollToAyah(t.ayah, t.smooth);
      setActive(t.ayah);
    });
  }, [data, scrollToAyah]);

  // keep the ayah in view when the layout changes (view toggle, reading mode, sizes)
  const activeRef = useRef(active);
  activeRef.current = active;
  useLayoutEffect(() => {
    if (!data) return;
    requestAnimationFrame(() => {
      scrollToAyah(activeRef.current, false);
      // a change of the way of reading, from the view switch's menu, faded the page out: back in
      const sc = scroller.current;
      if (fadeOut.current && sc) {
        fadeOut.current.cancel();
        fadeOut.current = null;
        sc.animate([{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }], { duration: 380, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "backwards" });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.readingMode, settings.book, settings.bookThemes, settings.arabicScale, settings.arabicSpacing, settings.transScale, settings.translation]);

  /* ── the multiple-ayah view scrolls freely, but its opening page and its
     closing page are pages. The moment the scrolling crosses into one (the
     opening page left behind, the last ayah's end reaching the foot of the
     box), the page comes whole into view or goes whole out of it, the way the
     reader was heading; a finger that stops between them settles the same way
     when it lifts. ── */
  useEffect(() => {
    const sc = scroller.current;
    if (!sc || !data || settings.view !== 3) return;
    let last = sc.scrollTop;
    let rest = sc.scrollTop; // where the scroll last came to rest
    let snapping = 0; // until when a snap is under way (the wheel waits for it)
    let fingers = 0;
    let timer = 0;
    const zones = () => {
      const opener = sc.querySelector<HTMLElement>('[data-n="0"]');
      const pages = sc.querySelectorAll<HTMLElement>("[data-n]");
      const closing = pages[pages.length - 1];
      const h = sc.clientHeight;
      return {
        end: opener ? opener.offsetTop + opener.offsetHeight : 0, // ayah 1 at the top
        a: closing && closing !== opener ? closing.offsetTop - h : Infinity, // the last ayah's end at the foot
        b: closing && closing !== opener ? closing.offsetTop : Infinity, // the closing page whole
      };
    };
    const snap = (to: number) => {
      if (Math.abs(to - sc.scrollTop) < 2) return;
      snapping = performance.now() + (settings.reduceMotion ? 50 : 700);
      sc.scrollTo({ top: to, behavior: settings.reduceMotion ? "auto" : "smooth" });
    };
    const busy = () => performance.now() < snapping;
    // only the reader's own scrolling (a finger, the wheel, the keys) brings a page in or out: the
    // page placing itself (a view switch, an ayah laid out above, a jump) never does
    let userAt = -Infinity;
    const byUser = () => fingers > 0 || performance.now() - userAt < 1500;
    const touched = () => (userAt = performance.now());
    // a finger let go (or the scroll stopped) somewhere inside a page: whole in or whole out
    const settle = () => {
      window.clearTimeout(timer);
      if (fingers > 0 || busy()) return;
      const top = sc.scrollTop;
      const down = top >= rest;
      rest = top;
      if (!byUser() || !sc.classList.contains("flow")) return;
      const { end, a, b } = zones();
      if (top > 1 && top < end - 1) snap(down ? (top > end * 0.12 ? end : 0) : top < end * 0.88 ? 0 : end);
      else if (top > a + 1 && top < b - 1) snap(down ? b : top < a + (b - a) * 0.88 ? a : b);
    };
    const onScroll = () => {
      const top = sc.scrollTop;
      if (fingers === 0 && !busy() && byUser() && sc.classList.contains("flow")) {
        const { end, a, b } = zones();
        if (top > last && last <= 1 && top > 1 && top < end) snap(end); // leaving the opening page
        else if (top < last && last >= end - 1 && top < end - 1 && top > 0) snap(0); // back to it
        else if (top > last && last <= a + 1 && top > a + 1 && top < b) snap(b); // the end of the surah
        else if (top < last && last >= b - 1 && top < b - 1 && top > a) snap(a); // back from it
      }
      last = top;
      window.clearTimeout(timer);
      timer = window.setTimeout(settle, "onscrollend" in window ? 500 : 140);
    };
    const onEnd = () => {
      snapping = 0;
      settle();
    };
    // while a page comes into place the wheel waits, so the snap lands where it should
    const onWheel = (e: WheelEvent) => {
      touched();
      if (busy()) e.preventDefault();
    };
    const touchStart = (e: TouchEvent) => {
      fingers = e.touches.length;
      snapping = 0;
      touched();
    };
    const touchEnd = (e: TouchEvent) => {
      fingers = e.touches.length;
      touched(); // (the glide after it is still the reader's)
      if (!fingers) {
        window.clearTimeout(timer);
        timer = window.setTimeout(settle, "onscrollend" in window ? 500 : 140); // after any glide
      }
    };
    sc.addEventListener("scroll", onScroll, { passive: true });
    sc.addEventListener("scrollend", onEnd);
    sc.addEventListener("wheel", onWheel, { passive: false });
    sc.addEventListener("touchstart", touchStart, { passive: true });
    sc.addEventListener("touchend", touchEnd, { passive: true });
    sc.addEventListener("touchcancel", touchEnd, { passive: true });
    sc.addEventListener("keydown", touched);
    sc.addEventListener("pointerdown", touched); // (a scrollbar dragged)
    return () => {
      window.clearTimeout(timer);
      sc.removeEventListener("keydown", touched);
      sc.removeEventListener("pointerdown", touched);
      sc.removeEventListener("scroll", onScroll);
      sc.removeEventListener("scrollend", onEnd);
      sc.removeEventListener("wheel", onWheel);
      sc.removeEventListener("touchstart", touchStart);
      sc.removeEventListener("touchend", touchEnd);
      sc.removeEventListener("touchcancel", touchEnd);
    };
  }, [data, settings.view, settings.reduceMotion]);

  /* ── which ayah is in the frame ─────────────────────────────── */
  // and where the reader is, to the pixel: the ayah at the frame's top and how far into it (kept
  // through a change of the context, however it is switched: below)
  const spot = useRef<{ n: number; off: number; frac: number } | null>(null);
  useEffect(() => {
    const sc = scroller.current;
    if (!sc) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const items = sc.querySelectorAll<HTMLElement>("[data-n]");
        const y = sc.scrollTop + 8;
        let cur = 0;
        for (const el of items) {
          if (el.offsetTop <= y) cur = Number(el.dataset.n);
          else break;
        }
        // at the very bottom, the last ayah is the active one
        if (sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 4 && items.length) cur = Number(items[items.length - 1].dataset.n);
        // scrolling freely, the surah's end at the foot of the box: the reader is on its last ayah
        else if (sc.classList.contains("flow") && items.length > 1) {
          const closing = items[items.length - 1];
          if (sc.scrollTop >= closing.offsetTop - sc.clientHeight - 4) cur = Number(closing.dataset.n) - 1;
        }
        let top: HTMLElement | null = null;
        for (const el of items) {
          if (el.offsetTop <= sc.scrollTop + 2) top = el;
          else break;
        }
        if (top) {
          const off = sc.scrollTop - top.offsetTop;
          spot.current = { n: Number(top.dataset.n), off, frac: top.offsetHeight ? off / top.offsetHeight : 0 };
        }
        // the ayahs showing in the frame (their notes float over it)
        let last = cur;
        for (const el of items) {
          const n = Number(el.dataset.n);
          if (n > cur && el.offsetTop < sc.scrollTop + sc.clientHeight - 24) last = n;
        }
        setActive((a) => (a === cur ? a : cur));
        setLastShown((l) => (l === last ? l : last));
        setTip(null);
      });
    };
    sc.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      sc.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [data]);

  /* ── scrolling freely, an ayah above the frame that is not laid out (or is laid out as it
     comes near, or let go as it moves away) can change from the height it held to its own:
     the page moves by the difference before it is drawn, so what the reader sees stays still
     (the browser's own anchoring is off here, and Safari has none). The one-ayah view needs
     none of this: it snaps back to the ayah it rests on by itself. Ayahs laid out on both
     sides of a change are left to their own code (the context switch keeps its place). ── */
  useLayoutEffect(() => {
    const sc = scroller.current;
    if (!sc || !data || bookMode) return;
    const secs = sc.querySelectorAll<HTMLElement>("section[data-key]");
    const height = new Map<Element, number>();
    const laid = new Map<Element, boolean>();
    const isLaid = (el: HTMLElement) => {
      const c = el.firstElementChild as HTMLElement | null;
      return !c || typeof c.checkVisibility !== "function" || c.checkVisibility({ contentVisibilityAuto: true });
    };
    const ro = new ResizeObserver((entries) => {
      const flow = sc.classList.contains("flow");
      const top = sc.scrollTop;
      let moved = 0, shift = 0;
      const els = entries.map((e) => e.target as HTMLElement).sort((a, b) => a.offsetTop - b.offsetTop);
      for (const el of els) {
        const h = el.offsetHeight, was = height.get(el);
        const now = isLaid(el), before = laid.get(el);
        height.set(el, h);
        laid.set(el, now);
        if (was === undefined || before === undefined || h === was) continue;
        // where it began before the ones above it changed this frame
        if (flow && !(before && now) && el.offsetTop - moved < top) shift += h - was;
        moved += h - was;
      }
      if (shift) sc.scrollTop = top + shift;
    });
    secs.forEach((s) => ro.observe(s));
    return () => ro.disconnect();
  }, [data, bookMode]);

  /* ── one ayah at a time: the reader stays on the ayah they are reading, at the same place in it,
     whatever changes height (the context switched on or off, a long ayah above laid out, an ayah
     refitting). The browser's snapping alone may land on the next ayah once heights change (a long
     ayah grown shorter under the reader, on a phone especially). ── */
  useLayoutEffect(() => {
    const sc = scroller.current;
    if (!sc || !data || settings.view !== 1) return;
    const items = () => sc.querySelectorAll<HTMLElement>("[data-n]");
    // the ayah at the top of the frame, and how far into it the reader has scrolled
    let anchor: { el: HTMLElement; off: number } | null = null;
    const note = () => {
      const y = sc.scrollTop + 2;
      let cur: HTMLElement | null = null;
      for (const el of items()) {
        if (el.offsetTop <= y) cur = el;
        else break;
      }
      anchor = cur ? { el: cur, off: sc.scrollTop - cur.offsetTop } : null;
    };
    // the place is taken again only from the reader's own scrolling (a finger, the wheel, the keys,
    // and the glide or snap that follows), or when the page moves them itself (anchorNow): never
    // from the page keeping its place, whose steps can each be a little off (Safari) and would be
    // taken up as the place, adding up until the reader is on another ayah
    let placing = false;
    let theirs = 0;
    let held = false; // (a finger or a button down: all the scrolling is theirs, an edge's autoscroll too)
    const touched = () => (theirs = performance.now() + 1200);
    const press = () => ((held = true), touched());
    const lift = () => ((held = false), touched());
    const onScroll = () => {
      if (placing || (!held && performance.now() > theirs)) return;
      theirs = Math.max(theirs, performance.now() + 250); // (a glide carrying on)
      note();
    };
    const inputs = ["touchstart", "touchmove", "wheel", "keydown", "pointerdown"] as const;
    inputs.forEach((t) => sc.addEventListener(t, touched, { passive: true }));
    sc.addEventListener("pointerdown", press, { passive: true });
    sc.addEventListener("touchstart", press, { passive: true });
    window.addEventListener("pointerup", lift, { passive: true });
    window.addEventListener("pointercancel", lift, { passive: true });
    window.addEventListener("touchend", lift, { passive: true });
    window.addEventListener("touchcancel", lift, { passive: true });
    anchorNow.current = note;
    anchorFollow.current = (ms) => (theirs = Math.max(theirs, performance.now() + ms));
    const place = () => {
      const a = anchor;
      if (!a || !a.el.isConnected) return;
      const room = Math.max(0, a.el.offsetHeight - sc.clientHeight);
      const want = a.el.offsetTop + Math.min(Math.max(0, a.off), room);
      if (Math.abs(sc.scrollTop - want) < 1) return;
      placing = true;
      sc.scrollTop = want;
      a.off = want - a.el.offsetTop;
      requestAnimationFrame(() => (placing = false));
    };
    const ro = new ResizeObserver(place);
    const offHeights = onAyahHeights(place);
    sc.querySelectorAll("section[data-key]").forEach((s) => ro.observe(s));
    note();
    sc.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      anchorNow.current = () => {};
      anchorFollow.current = () => {};
      ro.disconnect();
      offHeights();
      sc.removeEventListener("scroll", onScroll);
      inputs.forEach((t) => sc.removeEventListener(t, touched));
      sc.removeEventListener("pointerdown", press);
      sc.removeEventListener("touchstart", press);
      window.removeEventListener("pointerup", lift);
      window.removeEventListener("pointercancel", lift);
      window.removeEventListener("touchend", lift);
      window.removeEventListener("touchcancel", lift);
    };
  }, [data, settings.view, bookMode]);

  /* ── switching between one ayah and the multiple-ayah view: the page fades
     out, changes its layout while it cannot be seen, keeps the same ayah at the
     top, and fades back in once the long ayahs have settled their size. The
     context on and off in the multiple-ayah view fades through the same way
     (in the one-ayah view the ayah crossfades it by itself). ── */
  const fadeOut = useRef<Animation | null>(null);
  const fadeThen = useCallback(async (apply: () => void) => {
    const sc = scroller.current;
    if (sc && !useStore.getState().settings.reduceMotion) {
      fadeOut.current?.cancel();
      const a = sc.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: 180,
        easing: "cubic-bezier(0.4, 0, 1, 1)",
        fill: "forwards",
      });
      fadeOut.current = a;
      await a.finished.catch(() => {});
    }
    apply();
  }, []);
  const switchView = useCallback(
    (v: 1 | 3) => {
      if (useStore.getState().settings.view !== v) fadeThen(() => set({ view: v }));
    },
    [fadeThen, set],
  );
  const setMode = useCallback((p: Partial<Settings>) => fadeThen(() => set(p)), [fadeThen, set]);

  /* the context switched on or off: every ayah near the frame changes height. Where the reader is
     (the ayah at the top of the frame, and how far into it) is noted at the press, and kept while
     the ayahs settle their new heights; switched again before they have, the place first noted is
     the one kept. The reader scrolling lets it go. */
  const ctxKeep = useRef<{ n: number; off: number; frac: number } | null>(null);
  const placeKept = useRef<() => void>(() => {});
  // the place set again whenever an ayah changes height (after the page is laid out, before it is
  // drawn: no frame shows another ayah), and each frame while it is held (below)
  useLayoutEffect(() => {
    const sc = scroller.current;
    if (!sc || !data || settings.view !== 3) return;
    placeKept.current = () => {
      const k = ctxKeep.current;
      const el = k && sc.querySelector<HTMLElement>(`[data-n="${k.n}"]`);
      if (!k || !el) return;
      // the same part of the ayah: as far into it, in proportion (its words came or went)
      const want = el.offsetTop + (k.off < 4 ? 0 : Math.round(k.frac * el.offsetHeight));
      if (Math.abs(sc.scrollTop - want) > 1) sc.scrollTop = want;
    };
    const ro = new ResizeObserver(() => placeKept.current());
    sc.querySelectorAll("[data-n]").forEach((el) => ro.observe(el));
    const offHeights = onAyahHeights(() => placeKept.current());
    return () => {
      ro.disconnect();
      offHeights();
      placeKept.current = () => {};
    };
  }, [data, settings.view, bookMode]);
  const toggleContext = useCallback(() => {
    // (at once, from the state as it is now: quick presses each count)
    set({ showContext: !useStore.getState().settings.showContext });
  }, [set]);
  const seen = useRef({ view: settings.view, ctx: settings.showContext });
  useLayoutEffect(() => {
    const was = seen.current;
    seen.current = { view: settings.view, ctx: settings.showContext };
    const sc = scroller.current;
    if (!sc) return;
    if (was.view === settings.view) {
      if (was.ctx === settings.showContext) return;
      // (the one-ayah view keeps its place itself: its anchor, above)
      if (settings.view !== 3) return;
      // the words settling in softly; the reader held where they were (the place noted just before)
      if (!settings.reduceMotion && settings.translation === "qme" && settings.readingMode !== "arabic")
        sc.animate([{ opacity: 0.2 }, { opacity: 1 }], { duration: 320, easing: "cubic-bezier(0, 0, 0.2, 1)" });
      if (!ctxKeep.current && spot.current) ctxKeep.current = { ...spot.current };
      placeKept.current();
      // held until the reader scrolls, or the ayahs out of sight have all changed (Ayah.tsx: a few
      // at a time, nearest first, within about a second of the switch)
      const letGo = () => {
        ctxKeep.current = null;
      };
      const opts = { passive: true } as const;
      sc.addEventListener("wheel", letGo, opts);
      sc.addEventListener("touchstart", letGo, opts);
      sc.addEventListener("pointerdown", letGo, opts);
      sc.addEventListener("keydown", letGo);
      const timer = window.setTimeout(letGo, 2600);
      let raf = requestAnimationFrame(function hold() {
        placeKept.current();
        if (ctxKeep.current) raf = requestAnimationFrame(hold);
      });
      fadeOut.current?.cancel();
      fadeOut.current = null;
      return () => {
        cancelAnimationFrame(raf);
        window.clearTimeout(timer);
        sc.removeEventListener("wheel", letGo);
        sc.removeEventListener("touchstart", letGo);
        sc.removeEventListener("pointerdown", letGo);
        sc.removeEventListener("keydown", letGo);
      };
    }
    ctxKeep.current = null;
    const place = () => {
      const n = activeRef.current;
      const el = sc.querySelector<HTMLElement>(`[data-n="${n}"]`);
      if (!el) return;
      let top = el.offsetTop;
      // scrolling freely, the last ayahs rest with the surah's end at the foot of the frame (as a
      // jump does): the closing page is not half brought in, to be snapped on into
      if (settings.view === 3 && n > 0) {
        const pages = sc.querySelectorAll<HTMLElement>("[data-n]");
        const closing = pages[pages.length - 1];
        if (closing && closing !== el) top = Math.min(top, closing.offsetTop - sc.clientHeight);
      }
      sc.scrollTop = Math.max(0, top);
      anchorNow.current();
    };
    place();
    if (settings.reduceMotion) {
      fadeOut.current?.cancel();
      fadeOut.current = null;
      return;
    }
    // hidden until it is laid out (a change from the settings panel has had no fade-out)
    sc.style.opacity = "0";
    let raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame(() => {
        place();
        sc.style.opacity = "";
        sc.animate([{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }], {
          duration: 420,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
          fill: "backwards",
        });
        fadeOut.current?.cancel();
        fadeOut.current = null;
      });
    });
    return () => cancelAnimationFrame(raf);
  }, [settings.view, settings.showContext, settings.reduceMotion]); // eslint-disable-line react-hooks/exhaustive-deps

  const verse: Verse | null = data && active >= 1 ? data.v[active - 1] ?? null : null;
  const theme = data && active >= 1 ? data.themes[active - 1] : null;

  useEffect(() => {
    if (!data) return;
    const a = Math.min(data.v.length, Math.max(1, active)); // (the closing page is the last ayah's)
    const t = setTimeout(() => {
      history.replaceState(null, "", `#/${surahN}/${a}`);
      setLast(surahN, a);
    }, 400);
    return () => clearTimeout(t);
  }, [active, surahN, data, setLast]);

  /* ── navigation ─────────────────────────────────────────────── */
  const go = useCallback(
    (s: number, a: number) => {
      setPanel(null);
      setMenu(null);
      if (s === surahN && data) {
        scrollToAyah(a);
      } else {
        target.current = { ayah: a, smooth: false };
        setActive(a);
        setSurahN(s);
      }
    },
    [surahN, data, scrollToAyah],
  );

  const onPick = (r: Result) => {
    if (r.kind === "surah") go(r.surah.n, 1);
    else go(r.surah.n, r.ayah);
  };

  /* ── helpers ────────────────────────────────────────────────── */
  const flash = useCallback((m: string) => {
    setToast(m);
    window.setTimeout(() => setToast((t) => (t === m ? null : t)), 1800);
  }, []);

  // what gets copied: the ayah, its translation and the reference — no translation name
  const ayahText = useCallback(
    (v: Verse) => `${arabicText(v, settings.script)}\n\n${translationText(v, settings.translation, settings.showContext)}\n\n— ${surah.tc} ${surahN}:${v.n}`,
    [settings.translation, settings.showContext, settings.script, surah, surahN],
  );

  const newNote = useCallback(
    (key: string, extra?: { hid?: string; quote?: string; kind?: "text" | "voice"; audio?: string; dur?: number }) => {
      const fr = rootRef.current?.getBoundingClientRect();
      const vw = window.innerWidth, vh = window.innerHeight;
      const size = mobile ? 190 : 232;
      const existing = Object.values(useStore.getState().notes).filter((n) => n.key === key && !n.docked).length;
      const x = mobile ? (vw - size) / 2 / vw : ((fr ? fr.right : vw * 0.88) - size * 0.55 - existing * 26) / vw;
      const y = ((fr ? fr.top : vh * 0.12) + 40 + existing * 30) / vh;
      const id = uid();
      addNote({ id, key, text: "", x, y, rot: Math.round((Math.random() * 6 - 3) * 10) / 10, at: Date.now(), ...extra });
      if (extra?.kind !== "voice") setFocusNote(id);
    },
    [addNote, mobile],
  );

  const openShare = useCallback(
    (v: Verse) =>
      setShare({
        arabic: arabicText(v, settings.script),
        translation: translationText(v, settings.translation, false),
        surahName: surah.tc,
        ref: `${surahN}:${v.n}`,
        url: `${location.origin}${location.pathname}#/${surahN}/${v.n}`,
        surah: surahN,
        script: settings.script,
        theme: settings.theme,
        box: settings.theme === "mono" ? (settings.monoCard === "light" ? "paper" : "night") : settings.boxTheme,
        sky: settings.monoSky,
      }),
    [settings.translation, settings.script, settings.theme, settings.boxTheme, settings.monoCard, settings.monoSky, surah, surahN],
  );

  // a part of an ayah (a highlight): the part, with the other side's words to choose from (Share.tsx)
  const openSharePart = useCallback(
    (h: Highlight) => {
      const n = Number(h.key.split(":")[1]);
      const v = data?.v[n - 1];
      if (!v) return;
      const tr = h.field === "ar" ? settings.translation : h.field;
      const whole = translationText(v, tr, false);
      const trWords = whole.split(/\s+/).filter(Boolean);
      const aw = arabicWords(v, settings.script);
      const base = {
        surahName: surah.tc,
        ref: `${surahN}:${n}`,
        url: `${location.origin}${location.pathname}#/${surahN}/${n}`,
        surah: surahN,
        script: settings.script,
        theme: settings.theme,
        box: settings.theme === "mono" ? (settings.monoCard === "light" ? "paper" : "night") : settings.boxTheme,
        sky: settings.monoSky,
      } as const;
      if (h.field === "ar") {
        const idx = aw.words.filter((w) => w.start >= h.start && w.end <= h.end).map((w) => w.i);
        if (!idx.length) return;
        const span: [number, number] = [Math.min(...idx), Math.max(...idx)];
        setShare({ ...base, arabic: h.text, translation: whole, part: { side: "ar", other: trWords, guess: translationFor(v.m, span, trWords) } });
      } else {
        setShare({ ...base, arabic: arabicText(v, settings.script), translation: spellHonorifics(h.text), part: { side: "tr", other: aw.words.map((w) => w.text), guess: arabicFor(v.m, h.text) } });
      }
    },
    [data, settings.translation, settings.script, settings.theme, settings.boxTheme, settings.monoCard, settings.monoSky, surah, surahN],
  );

  // one function for the life of the reader, so the ayahs (memoised) don't redraw each time it would change
  const actionImpl = useRef<(a: AyahAction, v: Verse, anchor?: HTMLElement) => void>(() => {});
  const onAction = useCallback((a: AyahAction, v: Verse, anchor?: HTMLElement) => actionImpl.current(a, v, anchor), []);
  actionImpl.current = async (a: AyahAction, v: Verse, anchor?: HTMLElement) => {
    const key = `${surahN}:${v.n}`;
    if (a === "bookmark") {
      const was = !!useStore.getState().bookmarks[key];
      toggleBookmark(key);
      flash(was ? `Bookmark removed · ${key}` : `Bookmarked ${key}`);
      if (was) setFolderPop((p) => (p?.key === key ? null : p));
      else if (Object.keys(useStore.getState().folders).length) {
        const r = anchor?.getBoundingClientRect();
        setFolderPop({ key, x: r ? r.left + r.width / 2 : lastPt.current.x, y: r ? r.top + r.height / 2 : lastPt.current.y });
      }
    } else if (a === "copy") {
      (await copyText(ayahText(v))) ? flash(`Copied ${key}`) : flash("Copy was blocked by the browser");
    } else if (a === "share") {
      openShare(v);
    } else if (a === "note") {
      newNote(key);
    } else if (a === "voice") {
      const r = anchor?.getBoundingClientRect() ?? new DOMRect(window.innerWidth / 2, window.innerHeight / 2, 0, 0);
      setRecorder({ key, anchor: r });
    } else if (a === "context") {
      toggleContext();
    }
  };

  /* ── highlighting: select text, get a yellow highlight ──────── */
  // below: the menu opens under the highlight, leaving the word's meaning above it in view
  const openMenuFor = (id: string, below = false, fresh = false) => {
    requestAnimationFrame(() => {
      const marks = rootRef.current?.querySelectorAll<HTMLElement>(`mark[data-hid="${id}"]`);
      if (!marks?.length) return;
      if (fresh && !settings.reduceMotion) {
        // the marker drawn across: the new highlight sweeps in along the line
        marks.forEach((m) => {
          m.classList.remove("fresh");
          void m.offsetWidth;
          m.classList.add("fresh");
          window.setTimeout(() => m.classList.remove("fresh"), 700);
        });
      }
      const r1 = marks[0].getBoundingClientRect();
      const r2 = marks[marks.length - 1].getBoundingClientRect();
      const x = Math.max(150, Math.min(window.innerWidth - 150, (r1.left + r2.right) / 2 || r1.left + r1.width / 2));
      setMenu({ id, at: { x, y: Math.min(r1.top, r2.top), bottom: Math.max(r1.bottom, r2.bottom), below } });
    });
  };

  // the words selected, by the browser (a mouse) or by the site's own touch selection (given)
  const onSelectEnd = (given?: unknown) => {
    setTimeout(() => {
      const sel = window.getSelection();
      let range: Range;
      if (given instanceof Range) range = given;
      else if (sel && !sel.isCollapsed && sel.rangeCount) range = sel.getRangeAt(0);
      else return;
      if (!data) return;
      const startEl = range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement;
      const field = startEl?.closest<HTMLElement>("[data-field]");
      if (!field || !rootRef.current?.contains(field)) return;
      if (!field.contains(range.endContainer)) range.setEnd(field, field.childNodes.length);
      const key = field.dataset.key!;
      const fieldName = field.dataset.field as HighlightField;
      const v = data.v[Number(key.split(":")[1]) - 1];
      if (!v) return;
      let off: [number, number] | null;
      let canon: string;
      let aw: ReturnType<typeof arabicWords> | null = null;
      if (fieldName === "ar") {
        aw = arabicWords(v, settings.script);
        canon = aw.canon;
        off = rangeToArabicWords(range, field, aw.words); // whole words, in either script
      } else {
        canon = translationPieces(v, fieldName).canon;
        off = rangeToOffsets(range, field);
        if (off) off = snapToLatinWords(canon, trimRange(canon, off));
      }
      if (!off) return;
      const [s, e] = off;
      if (e - s < 1) return;
      // a highlight of its own, even over another: it joins those of its colour once its colour
      // is settled (the menu closes), and where colours differ both stay, their inks combined
      const id = uid();
      // the text kept with the highlight is what was shown (the Arabic in the script being read)
      const text = aw ? aw.words.filter((w) => w.start >= s && w.end <= e).map((w) => w.text).join(" ") : canon.slice(s, e);
      addHighlight({ id, key, field: fieldName, start: s, end: e, color: "yellow", text, at: Date.now() });
      sel?.removeAllRanges();
      strokeEnd();
      const snd = useStore.getState().settings;
      if (snd.sound && snd.sounds && !strokeRecently()) playHighlight(Math.min(1, text.length / 120));
      openMenuFor(id, false, true);
    }, 10);
  };
  const selectEnd = useRef(onSelectEnd);
  selectEnd.current = onSelectEnd;

  // a touch screen selects words the site's own way: a press held on a word, then drawn across
  const touchPick = useTouchSelect({ root: rootRef, scroller, scrollsFreely: settings.view === 3, onDone: (r) => selectEnd.current(r) });

  /* the marker heard as it is drawn: while a selection in the ayahs grows or shrinks under a
     mouse (or a phone's handles), a felt-tip sound follows it */
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onPhone = matchMedia("(pointer: coarse)").matches;
    let down = false;
    let len = 0;
    const press = (e: MouseEvent) => {
      down = e.button === 0 && !!(e.target as HTMLElement).closest("[data-field]");
      len = 0;
    };
    const lift = () => {
      down = false;
      strokeEnd();
    };
    const change = () => {
      const snd = useStore.getState().settings;
      if (!snd.sound || !snd.sounds) return;
      const sel = window.getSelection();
      const inside = !!sel && !sel.isCollapsed && root.contains(sel.anchorNode) && !!(sel.anchorNode?.parentElement?.closest("[data-field]"));
      if (!inside) {
        len = 0;
        return;
      }
      if (!down && !onPhone) return; // a phone's selection moves under its handles, not a pressed mouse
      const n = sel!.toString().length;
      if (n !== len) strokeMove(Math.abs(n - len));
      len = n;
    };
    root.addEventListener("mousedown", press);
    window.addEventListener("mouseup", lift);
    document.addEventListener("selectionchange", change);
    return () => {
      root.removeEventListener("mousedown", press);
      window.removeEventListener("mouseup", lift);
      document.removeEventListener("selectionchange", change);
      strokeEnd();
    };
  }, []);

  /* on a touch screen, the highlight waits until the selection has stopped changing
     (the handles can be dragged to widen it first), the way a phone's own text does */
  const touching = useRef(false);
  useEffect(() => {
    if (!matchMedia("(pointer: coarse)").matches) return;
    let t = 0;
    const settle = () => {
      window.clearTimeout(t);
      t = window.setTimeout(() => {
        const sel = window.getSelection();
        if (touching.current || !sel || sel.isCollapsed || !rootRef.current?.contains(sel.anchorNode)) return;
        selectEnd.current();
      }, 700);
    };
    const down = () => (touching.current = true);
    const up = () => {
      touching.current = false;
      settle();
    };
    document.addEventListener("selectionchange", settle);
    document.addEventListener("touchstart", down, { passive: true });
    document.addEventListener("touchend", up, { passive: true });
    document.addEventListener("touchcancel", up, { passive: true });
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("selectionchange", settle);
      document.removeEventListener("touchstart", down);
      document.removeEventListener("touchend", up);
      document.removeEventListener("touchcancel", up);
    };
  }, []);

  const onFrameClick = (e: React.MouseEvent) => {
    const t = e.target as HTMLElement;
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) return;
    // read as a book: an ayah's number opens its tools
    const end = t.closest<HTMLElement>("[data-ayah-end]");
    if (end && data) {
      const v = data.v[Number(end.dataset.ayahEnd) - 1];
      if (!v) return;
      const key = `${surahN}:${v.n}`;
      const I = (n: React.ReactNode) => <span className="flex w-4 justify-center">{n}</span>;
      const marked = !!useStore.getState().bookmarks[key];
      openMenu(e.clientX, e.clientY, [
        { type: "label", label: `Ayah ${key}` },
        { type: "item", label: marked ? "Remove bookmark" : "Bookmark", icon: I(<Bookmark size={14} />), onSelect: () => onAction("bookmark", v) },
        { type: "item", label: "Write a note", icon: I(<StickyNote size={14} />), onSelect: () => onAction("note", v) },
        { type: "item", label: "Record a voice note", icon: I(<Mic size={14} />), onSelect: () => onAction("voice", v, end) },
        { type: "item", label: "Copy", icon: I(<Copy size={14} />), onSelect: () => onAction("copy", v) },
        { type: "item", label: "Share", icon: I(<Share2 size={14} />), onSelect: () => onAction("share", v) },
      ]);
      return;
    }
    const mark = t.closest<HTMLElement>("mark.hl");
    const word = t.closest<HTMLElement>(".word");
    const coarse = matchMedia("(pointer: coarse)").matches;
    // a highlighted word is still a word: it is heard and explained, and its highlight's
    // menu opens below it so the meaning above stays readable
    if (mark && !word) {
      const gl = t.closest<HTMLElement>(GLOSSED);
      if (gl && coarse) showGloss(gl);
      openMenuFor(mark.dataset.hid!, !!gl);
      return;
    }
    if (mark) openMenuFor(mark.dataset.hid!, true);
    if (word && data) {
      const key = word.closest<HTMLElement>("[data-key]")!.dataset.key!;
      const [s, a] = key.split(":").map(Number);
      const w = Number(word.dataset.w) + 1;
      try {
        audio.current?.pause();
        audio.current = new Audio(`https://audio.qurancdn.com/wbw/${pad3(s)}_${pad3(a)}_${pad3(w)}.mp3`);
        audio.current.play().catch(() => {});
      } catch {
        /* audio unavailable */
      }
      if (matchMedia("(pointer: coarse)").matches) showTip(word);
      return;
    }
    // touch: tap a glossary term to read its meaning
    const gl = t.closest<HTMLElement>(GLOSSED);
    if (gl && matchMedia("(pointer: coarse)").matches) showGloss(gl);
  };

  const showTip = (word: HTMLElement) => {
    if (!data) return;
    const key = word.closest<HTMLElement>("[data-key]")?.dataset.key;
    if (!key) return;
    const v = data.v[Number(key.split(":")[1]) - 1];
    const i = Number(word.dataset.w);
    const r = word.getBoundingClientRect();
    setTip({ x: r.left, y: r.top, w: r.width, h: r.height, meaning: v.m[i], translit: v.t[i], ref: `${key}:${i + 1}`, arabic: v.a[i] });
  };

  // a term of the translation (Taqwa, Kuffaar…) explained by the translation's glossary; ﷺ spelled out
  const showGloss = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const hon = el.dataset.hon;
    if (hon && HONORIFICS[hon]) {
      setTip({ x: r.left, y: r.top, w: r.width, h: r.height, ref: `hon:${hon}`, gloss: { term: HONORIFICS[hon].show, text: HONORIFICS[hon].meaning, saw: true } });
      return;
    }
    const g = (el.dataset.gloss && glossByTerm(el.dataset.gloss)) || glossFor(el.textContent ?? "");
    if (g) setTip({ x: r.left, y: r.top, w: r.width, h: r.height, ref: `gl:${g.term}`, gloss: g });
  };

  const onOver = (e: React.MouseEvent) => {
    if (matchMedia("(pointer: coarse)").matches) return;
    const t = e.target as HTMLElement;
    const gl = t.closest<HTMLElement>(GLOSSED);
    if (gl) {
      tipHover.stay();
      return showGloss(gl);
    }
    if (!settings.wordHover) return;
    const word = t.closest<HTMLElement>(".word");
    if (word) showTip(word);
  };
  const onOut = (e: React.MouseEvent) => {
    const from = (e.target as HTMLElement).closest(`.word, ${GLOSSED}`);
    const to = (e.relatedTarget as HTMLElement | null)?.closest?.(`.word, ${GLOSSED}`);
    if (!from || from === to) return;
    // straight from the term into its meaning (the browser tells the box first, then the term): it stays
    if ((e.relatedTarget as HTMLElement | null)?.closest?.("[data-tip]")) return tipHover.stay();
    // a term's meaning stays a moment, so the pointer can go into it (to follow a "see …")
    if (from.matches(GLOSSED)) tipHover.leave(closeTip);
    else setTip(null);
  };


  /* ── focus: nothing but the Qur'an. The frame fills the screen (and the browser goes full
     screen where it can); the header, footer, slider and tabs go; the ayahs, their meanings,
     highlights, notes and their own buttons stay ── */
  const enterFocus = useCallback((on: boolean) => {
    if (useUI.getState().focus === on) return;
    reflowFor(on);
    setPanel(null);
    setMenu(null);
    const el = document.documentElement;
    if (on && !document.fullscreenElement && el.requestFullscreen) el.requestFullscreen().catch(() => {});
    if (!on && document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }, []);
  useEffect(() => {
    // the browser's own way out of full screen (its Esc) leaves focus too
    const on = () => {
      if (!document.fullscreenElement && useUI.getState().focus) reflowFor(false);
      // the window itself changing size (full screen coming or going) as the frame moves: the page
      // waits for that too
      else if (useUI.getState().reflow) settleReflow(260);
    };
    document.addEventListener("fullscreenchange", on);
    return () => {
      document.removeEventListener("fullscreenchange", on);
      useUI.getState().setFocus(false); // leaving the reader leaves focus
      useUI.getState().setPeek(null);
    };
  }, []);

  // the page goes quiet while the frame moves into focus (or out), and comes back laid out once, on
  // the ayah it was on
  const reflow = useUI((s) => s.reflow);
  const reflowFade = useRef<Animation | null>(null);
  const reflowAt = useRef(0);
  useLayoutEffect(() => {
    const sc = scroller.current;
    if (!sc) return;
    if (reflow) {
      reflowAt.current = activeRef.current;
      if (!settings.reduceMotion) reflowFade.current = sc.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 140, easing: "cubic-bezier(0.4, 0, 1, 1)", fill: "forwards" });
      return;
    }
    let raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame(() => {
        const el = sc.querySelector<HTMLElement>(`[data-n="${reflowAt.current}"]`);
        if (el && settings.view === 1) sc.scrollTop = el.offsetTop;
        anchorNow.current();
        if (!reflowFade.current) return;
        reflowFade.current.cancel();
        reflowFade.current = null;
        sc.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, easing: "cubic-bezier(0, 0, 0.2, 1)", fill: "backwards" });
      });
    });
    return () => cancelAnimationFrame(raf);
  }, [reflow]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── keyboard ───────────────────────────────────────────────── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement).closest?.("input, textarea, [contenteditable]");
      if (typing) return;
      if (e.key === "/" && !panel) {
        e.preventDefault();
        setPanel("search");
      } else if (e.key === "Escape" && useUI.getState().focus) {
        enterFocus(false);
      } else if ((e.key === "f" || e.key === "F") && !e.metaKey && !e.ctrlKey && !e.altKey) {
        enterFocus(!useUI.getState().focus);
      } else if (e.key === "Escape") {
        setPanel(null);
        setMenu(null);
        if (useUI.getState().flipped) setFlipped(false);
      } else if (useUI.getState().flipped) {
        return;
      } else if (!panel && (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "PageDown" || e.key === "PageUp" || e.key === " ")) {
        if (document.activeElement !== scroller.current && !(e.target as HTMLElement).closest?.("[role=slider]")) {
          e.preventDefault();
          const dir = e.key === "ArrowUp" || e.key === "PageUp" ? -1 : 1;
          const next = Math.max(0, Math.min(surah.count, activeRef.current + dir));
          scrollToAyah(next);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panel, surah, scrollToAyah, setFlipped]);

  /* ── derived ────────────────────────────────────────────────── */
  const hlByKey = useMemo(() => {
    const m = new Map<string, Highlight[]>();
    for (const h of Object.values(allHighlights)) {
      if (!h.key.startsWith(`${surahN}:`)) continue;
      const list = m.get(h.key) ?? [];
      list.push(h);
      m.set(h.key, list);
    }
    return m;
  }, [allHighlights, surahN]);
  const [notesByKey, voicesByKey] = useMemo(() => {
    const t = new Map<string, number>(), v = new Map<string, number>();
    for (const n of Object.values(allNotes)) {
      const m = n.kind === "voice" ? v : t;
      m.set(n.key, (m.get(n.key) ?? 0) + 1);
    }
    return [t, v];
  }, [allNotes]);

  // notes float over the frame for the ayahs being read
  const visibleKeys = useMemo(() => {
    const keys = new Set<string>();
    if (active < 1 || panel || flipped) return keys;
    const upto = settings.view === 3 ? Math.max(active, lastShown) : active;
    for (let a = active; a <= upto; a++) keys.add(`${surahN}:${a}`);
    return keys;
  }, [active, lastShown, settings.view, surahN, panel, flipped]);
  const visibleNotes = Object.values(allNotes).filter((n) => visibleKeys.has(n.key));
  const EMPTY: Highlight[] = useMemo(() => [], []);

  // what the ayahs are drawn with: a setting they don't use (mood, box, grain…) doesn't redraw them
  const ayahSettings = useMemo(
    () => settings,
    AYAH_KEYS.map((k) => settings[k]), // eslint-disable-line react-hooks/exhaustive-deps
  );
  // the context switch reaches the ayahs in the frame at once; the rest of a long surah follow once
  // the crossfade has played, in pieces React can pause, so it never stalls on them
  const [lagged, setLagged] = useState(ayahSettings);
  const onlyContext = (a: typeof settings, b: typeof settings) => AYAH_KEYS.every((k) => k === "showContext" || a[k] === b[k]);
  useEffect(() => {
    if (lagged === ayahSettings) return;
    if (!onlyContext(lagged, ayahSettings)) return setLagged(ayahSettings);
    const t = setTimeout(() => startTransition(() => setLagged(ayahSettings)), 480);
    return () => clearTimeout(t);
  }, [ayahSettings]); // eslint-disable-line react-hooks/exhaustive-deps
  const farSettings = onlyContext(lagged, ayahSettings) ? lagged : ayahSettings;

  const menuHl = menu ? allHighlights[menu.id] ?? null : null;

  /* when a highlight's menu closes its colour is settled: it joins every highlight of the same
     colour it overlaps or touches (their notes follow it); other colours stay their own */
  const menuWas = useRef<string | null>(null);
  useEffect(() => {
    const prev = menuWas.current;
    menuWas.current = menu?.id ?? null;
    if (!prev || prev === menu?.id || !data) return;
    const st = useStore.getState();
    const h = st.highlights[prev];
    if (!h) return;
    let s = h.start, e = h.end;
    const joined = new Set<string>();
    for (let grew = true; grew; ) {
      grew = false;
      for (const o of Object.values(st.highlights)) {
        // (not one whose own menu is open now: its colour is still being chosen)
        if (o.id === h.id || o.id === menu?.id || joined.has(o.id) || o.key !== h.key || o.field !== h.field || o.color !== h.color) continue;
        if (o.start <= e && o.end >= s) {
          s = Math.min(s, o.start);
          e = Math.max(e, o.end);
          joined.add(o.id);
          grew = true;
        }
      }
    }
    if (!joined.size) return;
    const v = data.v[Number(h.key.split(":")[1]) - 1];
    if (!v) return;
    let text: string;
    if (h.field === "ar") {
      const aw = arabicWords(v, settings.script);
      text = aw.words.filter((w) => w.start >= s && w.end <= e).map((w) => w.text).join(" ");
    } else text = translationPieces(v, h.field).canon.slice(s, e);
    for (const n of Object.values(st.notes)) if (n.hid && joined.has(n.hid)) st.updateNote(n.id, { hid: h.id });
    joined.forEach((id) => removeHighlight(id));
    st.updateHighlight(h.id, { start: s, end: e, text });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menu?.id]);

  /* ── the site's own right-click menu: what is under the pointer decides what it offers ─────
     (a note, something open over the page, a highlight, a word, an ayah, the surah's opening or
     closing page; the surah's own things after, unless the menu is already about something small) */
  const onContextMenu = (e: React.MouseEvent) => {
    const t = e.target as HTMLElement;
    if (t.closest("input, textarea")) return; // keep the browser's menu where people type
    if (isLongPressMenu(e.nativeEvent)) return; // a long press is the phone selecting text
    e.preventDefault();
    const I = (n: React.ReactNode) => n;
    const items: MenuItem[] = [];
    const show = () => openMenu(e.clientX, e.clientY, items);

    // a note on the page: its own things
    const noteEl = t.closest<HTMLElement>("[data-note-card]");
    const note = noteEl ? useStore.getState().notes[noteEl.dataset.noteCard!] : null;
    if (noteEl && note) {
      const voice = note.kind === "voice";
      const [ns, na] = note.key.split(":").map(Number);
      const press = (label: string) => noteEl.querySelector<HTMLElement>(`[aria-label="${label}"]`)?.click();
      items.push({ type: "label", label: `${voice ? "Voice note" : "Note"} on ${note.key}` });
      if (note.docked) items.push({ type: "item", label: "Bring it back", icon: I(<CornerDownRight size={14} />), onSelect: () => noteEl.click() });
      if (voice) {
        const playing = !!noteEl.querySelector('[aria-label="Pause"]');
        items.push({ type: "item", label: playing ? "Pause" : "Play", icon: I(playing ? <Pause size={14} /> : <Play size={14} />), onSelect: () => press(playing ? "Pause" : "Play") });
      } else items.push({ type: "item", label: "Write in it", icon: I(<StickyNote size={14} />), onSelect: () => noteEl.querySelector("textarea")?.focus() });
      items.push({ type: "item", label: "Share as an image", icon: I(<Share2 size={14} />), onSelect: () => useUI.getState().shareNote(note) });
      if (!(ns === surahN && na === activeRef.current)) items.push({ type: "item", label: `Go to ayah ${note.key}`, icon: I(<CornerDownRight size={14} />), onSelect: () => go(ns, na) });
      items.push({ type: "sep" });
      items.push({ type: "item", label: voice ? "Delete voice note" : "Delete note", icon: I(<Trash2 size={14} />), onSelect: () => press(voice ? "Delete voice note" : "Delete note") });
      return show();
    }

    // the highlight's colours and tools, or a word's meaning, open: only to close them
    if (t.closest('[role="toolbar"][aria-label="Highlight"], [data-tip]')) {
      items.push({
        type: "item",
        label: "Close",
        hint: "Esc",
        icon: I(<XIcon size={14} />),
        onSelect: () => {
          setMenu(null);
          closeTip();
        },
      });
      return show();
    }

    // something open over the page (a panel, the share window, an ayah opened beside): to close it
    const dialog = t.closest<HTMLElement>('[role="dialog"]');
    if (dialog) {
      const name = dialog.getAttribute("aria-label") ?? "";
      items.push({ type: "label", label: name });
      const peek = useUI.getState().peek;
      if (peek && /^Ayah \d/.test(name))
        items.push({
          type: "item",
          label: `Go to ${peek.s}:${peek.a}`,
          icon: I(<CornerDownRight size={14} />),
          onSelect: () => {
            useUI.getState().setPeek(null);
            go(peek.s, peek.a);
          },
        });
      items.push({
        type: "item",
        label: "Close",
        hint: "Esc",
        icon: I(<XIcon size={14} />),
        onSelect: () => {
          if (panel && dialog.getAttribute("aria-modal") === "true") return setPanel(null);
          const close = dialog.querySelector<HTMLElement>('button[aria-label^="Close"]');
          if (close) close.click();
          else window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
        },
      });
      return show();
    }

    const sec = t.closest<HTMLElement>("section[data-n]");
    const n = sec ? Number(sec.dataset.n) : NaN;
    const v = data && n >= 1 && n <= surah.count ? data.v[n - 1] ?? null : null;
    const sel = window.getSelection();
    const selText = sel && !sel.isCollapsed && rootRef.current?.contains(sel.anchorNode) ? sel.toString().trim() : "";
    const ayahItems = (v: Verse) => {
      const key = `${surahN}:${v.n}`;
      items.push({ type: "label", label: `Ayah ${key}` });
      items.push({ type: "item", label: "Copy ayah", icon: I(<Copy size={14} />), onSelect: () => onAction("copy", v) });
      items.push({ type: "item", label: "Share as an image", icon: I(<Share2 size={14} />), onSelect: () => openShare(v) });
      items.push({ type: "item", label: bookmarks[key] ? "Remove bookmark" : "Bookmark", icon: I(<Bookmark size={14} />), onSelect: () => onAction("bookmark", v) });
      items.push({ type: "item", label: "Write a note", icon: I(<StickyNote size={14} />), onSelect: () => onAction("note", v) });
      items.push({
        type: "item",
        label: "Record a voice note",
        icon: I(<Mic size={14} />),
        onSelect: () => onAction("voice", v, sec?.querySelector<HTMLElement>('[aria-label="Record a voice note on this ayah"]') ?? sec ?? undefined),
      });
    };

    // words chosen with the mouse: what to do with them, and with their ayah
    if (selText) {
      items.push({ type: "item", label: "Highlight", icon: I(<Highlighter size={14} />), onSelect: onSelectEnd });
      items.push({ type: "item", label: "Copy", icon: I(<Copy size={14} />), onSelect: () => copyText(selText).then((ok) => ok && flash("Copied")) });
      if (v) {
        items.push({ type: "sep" });
        ayahItems(v);
      }
      return show();
    }

    // a highlight: its own tools, then its ayah's
    const mark = t.closest<HTMLElement>("mark.hl");
    const h = mark ? useStore.getState().highlights[mark.dataset.hid!] : null;
    if (mark && h) {
      items.push({ type: "label", label: "Highlight" });
      items.push({ type: "item", label: "Colour…", icon: I(<Highlighter size={14} />), onSelect: () => openMenuFor(h.id, true) });
      items.push({ type: "item", label: "Copy its words", icon: I(<Copy size={14} />), onSelect: () => copyText(`${h.text}\n— ${surah.tc} ${h.key}`).then((ok) => ok && flash("Highlight copied")) });
      items.push({ type: "item", label: "Share this part", icon: I(<Share2 size={14} />), onSelect: () => openSharePart(h) });
      items.push({ type: "item", label: "Add a note to it", icon: I(<StickyNote size={14} />), onSelect: () => newNote(h.key, { hid: h.id, quote: h.text }) });
      items.push({ type: "item", label: "Record a voice note on it", icon: I(<Mic size={14} />), onSelect: () => setRecorder({ key: h.key, anchor: mark.getBoundingClientRect(), hid: h.id, quote: h.text }) });
      items.push({ type: "item", label: "Remove", icon: I(<Trash2 size={14} />), onSelect: () => removeHighlight(h.id) });
      if (v) {
        items.push({ type: "sep" });
        ayahItems(v);
      }
      return show();
    }

    // an Arabic word, or a term the translation explains: heard, or explained
    const word = t.closest<HTMLElement>(".word");
    const gl = t.closest<HTMLElement>(GLOSSED);
    if (word) items.push({ type: "item", label: "Hear this word", icon: I(<Volume2 size={14} />), onSelect: () => word.click() });
    else if (gl) items.push({ type: "item", label: `What “${(gl.textContent ?? "").trim().slice(0, 24)}” means`, icon: I(<BookOpen size={14} />), onSelect: () => showGloss(gl) });
    if (word || gl) items.push({ type: "sep" });

    if (v) {
      ayahItems(v);
      items.push({ type: "sep" });
    } else if (sec && n === 0 && !flipped) {
      // the surah's opening page
      items.push({ type: "item", label: "Begin the surah", icon: I(<ArrowDown size={14} />), onSelect: () => scrollToAyah(1) });
      items.push({ type: "sep" });
    } else if (sec && n === surah.count + 1) {
      // its closing page
      const done = !!useStore.getState().done[surahN];
      items.push({ type: "item", label: done ? "Completed · undo" : "Mark as completed", icon: I(<Check size={14} />), onSelect: () => sec.querySelector<HTMLElement>("button[aria-pressed]")?.click() });
      const next = surahs[surahN];
      if (next) items.push({ type: "item", label: `Next · ${next.tc}`, icon: I(<ArrowRight size={14} />), onSelect: () => go(surahN + 1, 0) });
      items.push({ type: "sep" });
    }

    // the surah, and the reader around it
    const inFocus = useUI.getState().focus;
    items.push({ type: "label", label: surah.tc });
    items.push(
      flipped
        ? { type: "item", label: "Back to the ayahs", icon: I(<BookOpen size={14} />), onSelect: () => setFlipped(false) }
        : { type: "item", label: "Surah summary", icon: I(<BookOpen size={14} />), onSelect: () => setFlipped(true) },
    );
    items.push({ type: "item", label: "Reflect on this surah", icon: I(<QuillGlyph size={14} />), onSelect: () => setPanel("reflection") });
    if (!flipped) {
      items.push({
        type: "item",
        label: settings.view === 1 ? "Show multiple ayahs" : "Show one ayah at a time",
        icon: I(settings.view === 1 ? <Rows3 size={14} /> : <RectangleHorizontal size={14} />),
        onSelect: () => switchView(settings.view === 1 ? 3 : 1),
      });
      if (settings.translation === "qme")
        items.push({
          type: "item",
          label: settings.showContext ? "Hide the bracketed context" : "Show the bracketed context",
          icon: I(<span className="font-serif text-[13px] italic">( )</span>),
          onSelect: toggleContext,
        });
      items.push({ type: "item", label: inFocus ? "Leave focus" : "Focus", hint: "F", icon: I(inFocus ? <Minimize2 size={14} /> : <Maximize2 size={14} />), onSelect: () => enterFocus(!inFocus) });
    }
    items.push({ type: "sep" });
    items.push({ type: "item", label: "Search", hint: "/", icon: I(<SearchIcon size={14} />), onSelect: () => setPanel("search") });
    if (surahN > 1) items.push({ type: "item", label: `Previous · ${surahs[surahN - 2].tc}`, icon: I(<ArrowLeft size={14} />), onSelect: () => go(surahN - 1, 0) });
    if (surahN < 114 && !(sec && n === surah.count + 1)) items.push({ type: "item", label: `Next · ${surahs[surahN].tc}`, icon: I(<ArrowRight size={14} />), onSelect: () => go(surahN + 1, 0) });
    items.push({ type: "item", label: "Surah index", icon: I(<LayoutGrid size={14} />), onSelect: () => onIndex(surahN, activeRef.current) });
    items.push({ type: "item", label: "Settings", icon: I(<Settings2 size={14} />), onSelect: () => setPanel("settings") });
    show();
  };

  /* ── turning the frame over with a finger (touch): a sideways swipe from either side of it.
     The first few pixels decide: clearly sideways, it turns live under the finger, and
     letting go settles it on the nearer face, a flick carrying it over; up or down, it is
     left to scrolling; a press held first is the phone selecting words, left alone too.
     (From a wide band at each side, not a thin strip at the very edge: there the phone's own back
     gesture lives.) ── */
  const coarse = useMemo(() => matchMedia("(pointer: coarse)").matches, []);
  // a click on a tab: over toward that side (-1 brings the right edge toward the reader)
  const turnOver = (toward: 1 | -1) => {
    if (useUI.getState().flipped) return backToAyahs(toward);
    settleFlip(true, 0, toward);
    setFlipped(true);
  };
  // from the summary back to the ayahs (from the opening page, straight into ayah 1); a tab turns
  // it on round the way it pulls
  const backToAyahs = (toward?: 1 | -1) => {
    if (activeRef.current < 1) {
      scrollToAyah(1, false);
      setActive(1);
    }
    if (toward) settleFlip(false, 0, toward);
    setFlipped(false);
  };
  // the context switch, at the foot of the frame: wherever Quraan Made Easy's text is showing
  const showCtx = settings.translation === "qme" && settings.readingMode !== "arabic";

  const swipeOff = !data || focus || !!panel || aboutOpen;
  useEffect(() => {
    const face = turning?.parentElement; // the frame as it turns: both its faces
    if (!coarse || !face || swipeOff) return;
    type G = { x0: number; y0: number; t0: number; engaged: boolean; x: number; base: number; width: number; lastX: number; lastT: number; v: number };
    let g: G | null = null;
    const selecting = () => {
      const sel = window.getSelection();
      return !!sel && !sel.isCollapsed;
    };
    // a finger lifted, or a second one come down: the frame settles on the nearer face
    const finish = (allowTurn: boolean) => {
      if (!g?.engaged) {
        g = null;
        return;
      }
      const moved = flipAngle.get() - g.base;
      const vel = g.v * (190 / g.width) * 1000; // degrees a second
      const wasBack = useUI.getState().flipped;
      const turn = allowTurn && (Math.abs(moved) > 70 || (Math.abs(vel) > 300 && Math.sign(vel) === Math.sign(moved) && Math.abs(moved) > 25));
      const toBack = turn ? !wasBack : wasBack;
      settleFlip(toBack, turn ? vel : 0);
      if (toBack !== wasBack) {
        // back from the opening page goes straight into ayah 1, as the tabs do
        if (!toBack && activeRef.current < 1) {
          scrollToAyah(1, false);
          setActive(1);
        }
        setFlipped(toBack);
      }
      g = null;
    };
    const start = (e: TouchEvent) => {
      const t = e.touches[0];
      if (e.touches.length !== 1 || !t) return finish(false); // a pinch, or two fingers for the menu
      const target = e.target as HTMLElement | null;
      const box = face.getBoundingClientRect();
      // only from either side: the outer quarter of the frame (the middle, where the words are,
      // never turns it), wide enough to start inside the phone's own back-gesture strip
      const band = Math.max(64, box.width * 0.25);
      const fromSide = t.clientX - box.left < band || box.right - t.clientX < band;
      if (!fromSide || target?.closest?.("input, textarea, select, [contenteditable], [data-no-swipe]") || selecting()) {
        g = null;
        return;
      }
      const now = performance.now();
      g = { x0: t.clientX, y0: t.clientY, t0: now, engaged: false, x: t.clientX, base: 0, width: box.width || 1, lastX: t.clientX, lastT: now, v: 0 };
    };
    const move = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!g || !t) return;
      if (!g.engaged) {
        const dx = t.clientX - g.x0, dy = t.clientY - g.y0;
        if (Math.hypot(dx, dy) < 10) return;
        // clearly sideways, and not after a press held to select words: otherwise not a turn
        if (Math.abs(dx) < 1.8 * Math.abs(dy) || performance.now() - g.t0 > 450 || selecting()) {
          g = null;
          return;
        }
        g.engaged = true;
        holdFlip();
        g.base = flipAngle.get();
        g.x = t.clientX; // from here, so the frame does not jump by the first few pixels
        setTip(null);
        setMenu(null);
      }
      if (e.cancelable) e.preventDefault();
      const now = performance.now();
      g.v = 0.6 * g.v + 0.4 * ((t.clientX - g.lastX) / Math.max(1, now - g.lastT));
      g.lastX = t.clientX;
      g.lastT = now;
      flipAngle.set(g.base + ((t.clientX - g.x) / g.width) * 190);
    };
    const end = () => finish(true);
    const cancel = () => finish(false);
    face.addEventListener("touchstart", start, { passive: true });
    face.addEventListener("touchmove", move, { passive: false });
    face.addEventListener("touchend", end);
    face.addEventListener("touchcancel", cancel);
    return () => {
      finish(false);
      face.removeEventListener("touchstart", start);
      face.removeEventListener("touchmove", move);
      face.removeEventListener("touchend", end);
      face.removeEventListener("touchcancel", cancel);
    };
  }, [coarse, turning, swipeOff, setFlipped]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <motion.div
      ref={rootRef}
      className="relative flex h-full flex-col"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.3 } }}
      transition={{ duration: 0.4 }}
      onContextMenu={onContextMenu}
    >
      {/* header */}
      <header
        className={cn(
          "relative z-20 flex shrink-0 items-center justify-between gap-1.5 overflow-hidden border-b border-[var(--box-line)] pl-3 pr-[7px] transition-[height,opacity,border-color] duration-500 sm:gap-2 sm:pl-4 md:gap-3 md:pl-7 md:pr-[9px]",
          focus ? "h-0 border-transparent opacity-0" : "h-12 md:h-[52px]",
        )}
        aria-hidden={focus || undefined}
      >
        <div className="flex min-w-0 items-baseline gap-2.5">
          {!mobile && <span className="font-mono text-[11px] text-[var(--box-faint)] tabular-nums">{pad3(surahN)}</span>}
          <FitName text={surah.tc} className="display -my-[0.15em] truncate py-[0.15em] font-serif text-[17px] italic leading-[1.1] md:text-[20px]" />
          {!mobile && <span className="label hidden min-w-0 shrink-[4] truncate text-[var(--box-faint)] lg:inline">{surah.en}</span>}
        </div>
        <div className="flex shrink-0 items-center">
          {mobile ? (
            <>
              <IconTool label="Surah index" onClick={() => onIndex(surahN, active)}>
                <LayoutGrid size={16} strokeWidth={1.5} />
              </IconTool>
              <IconTool label="Search" onClick={() => setPanel("search")}>
                <SearchIcon size={16} strokeWidth={1.5} />
              </IconTool>
              <IconTool label="Saved: your bookmarks, highlights and notes" onClick={() => setPanel(panel === "saved" ? null : "saved")}>
                <Bookmark size={16} strokeWidth={1.5} />
              </IconTool>
              <IconTool label="Settings" onClick={() => setPanel(panel === "settings" ? null : "settings")}>
                <SettingsGlyph open={panel === "settings"} size={16} />
              </IconTool>
            </>
          ) : (
            <>
              <BracketButton onClick={() => onIndex(surahN, active)} title="Back to the surah index">Index</BracketButton>
              <BracketButton onClick={() => setPanel("search")} title="Search (press /)">Search</BracketButton>
              <BracketButton onClick={() => setPanel(panel === "saved" ? null : "saved")} active={panel === "saved"} title="Your bookmarks, highlights and notes">
                Saved
              </BracketButton>
              <BracketButton onClick={() => setPanel(panel === "settings" ? null : "settings")} active={panel === "settings"} title="Settings">
                Settings
              </BracketButton>
            </>
          )}
          <IconTool label="Focus: only the Qur'an (F)" onClick={() => enterFocus(true)}>
            <Maximize2 size={15} strokeWidth={1.5} />
          </IconTool>
          <ViewToggle settings={settings} onView={switchView} onMode={setMode} />
        </div>
      </header>

      {/* ayahs */}
      <div className="relative min-h-0 flex-1">
        <div
          ref={scroller}
          className={cn("snap-scroller relative h-full", settings.view === 3 && "flow")}
          tabIndex={-1}
          onMouseUp={onSelectEnd}
          onKeyUp={(e) => e.shiftKey && onSelectEnd()}
          onClick={onFrameClick}
          onMouseOver={onOver}
          onMouseOut={onOut}
          aria-label={`${surah.tc}, ayat`}
        >
          {data && (
            <>
              <Opener surah={surah} mobile={mobile} viewH={viewH} onSummary={() => setFlipped(true)} bismillah={settings.script === "indopak" && bismIP ? bismIP : BISMILLAH} indopak={settings.script === "indopak" && !!bismIP} />
              {/* scrolling freely, the surah is at least a page of its own: a short one (At-Takathur
                  as a book) sits in the middle of it, so the opening and closing pages are never both
                  half in view, and a swipe still takes the reader on to either of them. (Not
                  positioned: the ayahs' offsets are measured from the scroller. One ayah at a time,
                  it is no box at all, so each ayah is still a full page of the scroller.) */}
              <div className={settings.view === 3 ? "flex min-h-full flex-col justify-center" : "contents"}>
              {bookMode ? (
                <BookText surah={surahN} data={data} settings={ayahSettings} mobile={mobile} hlByKey={hlByKey} bookmarks={bookmarks} />
              ) : data.v.map((v) => {
                const key = `${surahN}:${v.n}`;
                const near = v.n >= active - 2 && v.n <= Math.max(active, lastShown) + 2;
                return (
                  <AyahSection
                    key={key}
                    surah={surahN}
                    verse={v}
                    near={near}
                    settings={near ? ayahSettings : farSettings}
                    mobile={mobile}
                    highlights={hlByKey.get(key) ?? EMPTY}
                    bookmarked={!!bookmarks[key]}
                    notes={notesByKey.get(key) ?? 0}
                    voices={voicesByKey.get(key) ?? 0}
                    onAction={onAction}
                    viewH={viewH}
                    viewW={viewW}
                    isLast={v.n === data.v.length}
                  />
                );
              })}
              </div>
              <Closing surah={surah} next={surahs[surahN] ?? null} onReflect={() => setPanel("reflection")} onNext={() => go(surahN + 1, 0)} />
            </>
          )}
        </div>
        {/* one ayah: the buttons stay still in the corner while the ayahs pass under them, and
            act on whichever ayah is in the frame */}
        <AnimatePresence>
          {settings.view === 1 && verse && (
            <motion.div
              key="actions"
              className="absolute bottom-3 right-[30px] z-20 md:bottom-[18px] md:right-3"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
            >
              <Actions
                bookmarked={!!bookmarks[`${surahN}:${verse.n}`]}
                notes={notesByKey.get(`${surahN}:${verse.n}`) ?? 0}
                voices={voicesByKey.get(`${surahN}:${verse.n}`) ?? 0}
                onAction={(a, el) => onAction(a, verse, el)}
              />
            </motion.div>
          )}
        </AnimatePresence>
        {!data && !error && <Loading name={surah.tc} />}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-8 text-center">
            <p className="max-w-[40ch] font-serif text-[18px] text-[var(--box-muted)]">{error}</p>
            <button type="button" onClick={() => setRetry((r) => r + 1)} className="btn-secondary label border border-[var(--box-fg)] px-3 py-2 hover:bg-[var(--box-fg)] hover:text-[var(--box-bg-solid)]">
              Try again
            </button>
          </div>
        )}
        {/* the card growing into the frame */}
        <AnimatePresence>
          {zoom && (
            <motion.div
              key="zoom"
              className="pointer-events-none absolute z-30 overflow-hidden"
              initial={{ left: zoom.left, top: zoom.top - (mobile ? 48 : 52), width: zoom.width, height: zoom.height, opacity: 1 }}
              animate={{ left: 0, top: 0, width: "100%", height: "100%", opacity: [1, 1, 0] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.1, ease: EASE_IN_OUT, opacity: { duration: 1.5, times: [0, 0.6, 1] } }}
              onAnimationComplete={() => setZoom(null)}
            >
              <SurahArt n={surah.n} blur={22} />
            </motion.div>
          )}
        </AnimatePresence>
        <Toast msg={toast} />
        {focus && <FocusExit onExit={() => enterFocus(false)} />}
      </div>

      {/* footer */}
      <footer
        className={cn(
          "frame-foot relative z-20 flex shrink-0 items-center justify-between gap-4 overflow-hidden border-t border-[var(--box-line)] px-5 transition-[height,opacity,border-color] duration-500 md:px-7",
          focus ? "h-0 border-transparent opacity-0" : "h-8",
        )}
        aria-hidden={focus || undefined}
      >
        <span className="label-sm min-w-0 truncate text-[var(--box-faint)]">
          {verse ? `Juz ${verse.j} · ` : ""}
          {surah.place === "makkah" ? "Makkan" : "Madinan"} · {surah.count} ayat
        </span>
        {showCtx && (
          <div className="label-sm -mr-2 flex h-full shrink-0 items-center">
            <ContextToggle on={settings.showContext} onToggle={toggleContext} />
          </div>
        )}
      </footer>

      {/* panels */}
      <SettingsPanel open={panel === "settings" || panel === "saved"} startTab={panel === "saved" ? "saved" : undefined} onClose={() => setPanel(null)} surahs={surahs} onGo={go} mobile={mobile} />
      <ReflectionPanel open={panel === "reflection"} onClose={() => setPanel(null)} surah={surah} mobile={mobile} />
      <ImmersivePanel open={panel === "search"} from="left" onClose={() => setPanel(null)} label="Search">
        <SearchPanelBody surahs={surahs} juz={juz} onPick={onPick} onClose={() => setPanel(null)} current={surahN} onSurah={(n) => go(n, 1)} onGo={go} />
      </ImmersivePanel>

      {touchPick}
      {/* floating layers live on <body>: the tilted frame would re-anchor fixed positioning */}
      {createPortal(
        <>
          <WordTip tip={tip} translit={settings.translit} onClose={closeTip} />
          <HighlightMenu
            hl={menuHl}
            at={menu?.at ?? null}
            onClose={() => setMenu(null)}
            onCopy={async (h) => {
              (await copyText(`${h.text}\n— ${surah.tc} ${h.key}`)) && flash("Highlight copied");
              setMenu(null);
            }}
            onNote={(h) => {
              newNote(h.key, { hid: h.id, quote: h.text });
              setMenu(null);
            }}
            onVoice={(h, anchor) => {
              setRecorder({ key: h.key, anchor, hid: h.id, quote: h.text });
              setMenu(null);
            }}
            onShare={(h) => {
              openSharePart(h);
              setMenu(null);
            }}
          />
          <StickyNotes notes={visibleNotes} focusId={focusNote} onFocused={() => setFocusNote(null)} />
          <FolderPop at={folderPop} bkey={folderPop?.key ?? null} onClose={closeFolderPop} />
          <AyahPeek />
        </>,
        document.body,
      )}
      <ShareDialog content={share} onClose={() => setShare(null)} onToast={flash} />
      <NoteShareDialog
        note={noteShare}
        surahName={noteShare ? surahs[Number(noteShare.key.split(":")[0]) - 1]?.tc ?? "" : ""}
        onClose={closeNoteShare}
        onToast={flash}
      />
      <VoiceRecorder
        anchor={recorder?.anchor ?? null}
        ayahKey={recorder?.key ?? ""}
        onClose={() => setRecorder(null)}
        quote={recorder?.quote}
        onSaved={(audio, dur) => {
          if (recorder) newNote(recorder.key, { kind: "voice", audio, dur, hid: recorder.hid, quote: recorder.quote });
          flash("Voice note saved");
        }}
      />

      {/* the back of the frame */}
      {backFace &&
        createPortal(
          <div className="h-full">
            {flipped && (
              <SurahSummary
                surah={surah}
                data={data}
                mobile={mobile}
                atStart={active < 1}
                onBack={() => backToAyahs()}
                onGo={(a) => {
                  setFlipped(false);
                  setTimeout(() => scrollToAyah(a, false), 450);
                }}
              />
            )}
          </div>,
          backFace,
        )}

      {/* anchored outside the frame: the theme above, the slider centred in the space below */}
      {outside &&
        createPortal(
          <div className={cn("absolute inset-0 transition-[opacity,visibility] duration-500", focus &&"pointer-events-none invisible opacity-0")}>
                {/* the ayah's theme: one ayah at a time, with its translation showing (not the Arabic alone,
                    not scrolling freely; a book of the translation has its headings in the text) */}
                {/* Royal: the surah's measure in a specimen's row of captions, above its theme */}
                {settings.theme === "royal" && !mobile && data && data.v.length > 0 && (
                  <div className="spec-row pointer-events-none absolute inset-x-0 bottom-full mb-[54px]" aria-hidden>
                    <span>(surah {surahN})</span>
                    <span>{surah.place === "makkah" ? "Makkan" : "Madinan"}</span>
                    <span>{surah.count} ayat</span>
                    <span>{data.v[0].j === data.v[data.v.length - 1].j ? `Juz ${data.v[0].j}` : `Juz ${data.v[0].j}–${data.v[data.v.length - 1].j}`}</span>
                  </div>
                )}
                <AnimatePresence mode="wait">
                  {settings.view === 1 && settings.readingMode !== "arabic" && theme && active >= 1 && !panel && !aboutOpen && (
                    <motion.div
                      key={theme}
                      className="theme-tag-at pointer-events-none absolute bottom-full mb-3 max-w-full md:mb-4"
                      initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
                      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                      exit={{ opacity: 0, y: -6, filter: "blur(4px)", transition: { duration: 0.2 } }}
                      transition={{ duration: 0.5, ease: EASE_OUT }}
                    >
                      <span className="theme-tag display block truncate font-serif text-[17px] italic text-[var(--outside-fg)] md:text-[20px]">{theme}</span>
                    </motion.div>
                  )}
                </AnimatePresence>
                <div
                  className={cn(
                    "absolute left-0 right-0 px-1 transition-opacity duration-300 md:px-[6%]",
                    // a panel over the ayahs: the slider has nothing to show (reflection keeps its button, to close it)
                    (panel && panel !== "reflection") || aboutOpen ? "pointer-events-none opacity-0" : "pointer-events-auto",
                  )}
                  style={{
                    top: `calc(100% + ${Math.max(10, below / 2 - 16)}px)`,
                    ["--box-fg" as string]: "var(--outside-fg)",
                    ["--box-line" as string]: "var(--outside-line)",
                    ["--box-faint" as string]: "var(--outside-faint)",
                    ["--box-bg-solid" as string]: "var(--outside-bg)",
                    ["--box-muted" as string]: "var(--outside-muted)",
                  }}
                >
                  <AyahSlider
                    trackHidden={panel === "reflection"}
                    value={Math.min(surah.count, Math.max(1, active))}
                    max={surah.count}
                    onChange={(v) => {
                      setActive(v);
                      scrollToAyah(v, false);
                    }}
                    onEnd={() => setPanel((p) => (p === "reflection" ? null : "reflection"))}
                    endLabel="Reflect on this surah — write or record your own summary"
                    endIcon={<QuillGlyph size={18} />}
                  />
                </div>
          </div>,
          outside,
        )}
      {/* desktop: a tab on each side turns the frame over, and back again from the summary (with a
          panel open over the page, there is nothing to turn: they fade away) */}
      {edges &&
        data &&
        !coarse &&
        !focus &&
        createPortal(
          <div className={cn("transition-opacity duration-300", (panel || aboutOpen) && "pointer-events-none opacity-0")} aria-hidden={panel || aboutOpen ? true : undefined}>
            <TurnTab side="right" back={flipped} onTurn={() => turnOver(-1)} />
            <TurnTab side="left" back={flipped} onTurn={() => turnOver(1)} />
          </div>,
          edges,
        )}
    </motion.div>
  );
}

/**
 * Just outside the frame's edge, one on each side (desktop): a tab to turn it over and read
 * about the surah, turning toward that side. Hovering it lengthens the line, runs a light along
 * it and names what it opens. (On touch screens a swipe in from either side of the frame turns it.)
 */
function TurnTab({ side, back, onTurn }: { side: "left" | "right"; back: boolean; onTurn: () => void }) {
  const [hover, setHover] = useState(false);
  const right = side === "right";
  return (
    <button
      type="button"
      onClick={onTurn}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
      aria-label={back ? "Turn the frame back to the ayahs" : "Turn the frame over to read the surah summary"}
      data-no-tilt
      className={cn(
        "pointer-events-auto absolute top-1/2 flex h-40 w-10 -translate-y-1/2 items-center",
        right ? "left-full pl-[7px]" : "right-full flex-row-reverse pr-[7px]",
      )}
    >
      <span
        className="relative block w-[4px] overflow-hidden transition-[height,background-color] duration-300 ease-out"
        style={{ height: hover ? 112 : 64, background: hover ? "var(--color-gold)" : "var(--outside-tab)" }}
      >
        {/* a light running along the edge while it is hovered */}
        {hover && (
          <motion.span
            className="absolute inset-x-0 h-8 bg-gradient-to-b from-transparent via-white/80 to-transparent"
            initial={{ top: "-30%" }}
            animate={{ top: "110%" }}
            transition={{ duration: 1.1, repeat: Infinity, ease: EASE_IN_OUT }}
          />
        )}
      </span>
      {/* centred on the line; the padding balances the letter-spacing after the last letter. On
          the left it reads upward, its letters facing out like the right one's */}
      <span
        className={cn(
          "label pointer-events-none absolute top-1/2 whitespace-nowrap leading-none text-[var(--outside-fg)] transition-[opacity,transform] duration-300 [writing-mode:vertical-rl]",
          right ? "left-[19px]" : "right-[19px]",
        )}
        style={{
          opacity: hover ? 1 : 0,
          transform: `translate(${hover ? 0 : right ? -4 : 4}px, -50%)${right ? "" : " rotate(180deg)"}`,
          [right ? "paddingTop" : "paddingBottom"]: "0.09em",
        }}
      >
        {back ? "Back to the ayahs" : "Surah summary"}
      </span>
    </button>
  );
}

function Opener({
  surah,
  mobile,
  viewH,
  onSummary,
  bismillah,
  indopak,
}: {
  surah: Surah;
  mobile: boolean;
  viewH: number;
  onSummary: () => void;
  bismillah: string;
  indopak: boolean;
}) {
  const k = viewH ? Math.min(1, Math.max(0.62, viewH / 600)) : 1; // short frames get a smaller title
  return (
    <section data-n={0} className="snap-item snap-page relative flex min-h-full flex-col items-center justify-center overflow-hidden px-8 text-center">
      <SurahArt n={surah.n} blur={30} className="opacity-45" />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[var(--box-bg-solid)]/30 to-[var(--box-bg-solid)]/70" />
      <div className="relative flex flex-col items-center">
        <motion.span
          className="label text-[var(--box-muted)]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          Surah {surah.n} · {surah.place === "makkah" ? "Makkan" : "Madinan"} · {surah.count} ayat
        </motion.span>
        <motion.span
          className="mt-6 font-kufi leading-none text-[var(--box-fg)]"
          style={{ fontSize: (mobile ? 58 : 86) * k }}
          initial={{ opacity: 0, y: 20, filter: "blur(8px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 1, ease: EASE_OUT, delay: 0.35 }}
          dir="rtl"
          lang="ar"
        >
          {surah.ar}
        </motion.span>
        <motion.span
          className="display mt-6 font-serif italic leading-none"
          style={{ fontSize: (mobile ? 30 : 42) * k }}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: EASE_OUT, delay: 0.55 }}
        >
          {surah.tc}
        </motion.span>
        <span className="label mt-3 text-[var(--box-muted)]">{surah.en}</span>
        {surah.bism && (
          <motion.div
            className={cn("quran text-[var(--box-fg)]", indopak && "indopak")}
            style={{ fontSize: (mobile ? 26 : 34) * k, marginTop: 40 * k }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.92 }}
            transition={{ duration: 1.2, delay: 0.9 }}
            lang="ar"
          >
            {bismillah}
          </motion.div>
        )}
        <motion.div
          className="flex flex-col items-center gap-5"
          style={{ marginTop: 44 * k }}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 1.1, ease: EASE_OUT }}
        >
          <button
            type="button"
            onClick={onSummary}
            className="btn-primary inline-flex items-center justify-center border border-[var(--box-fg)]/60 px-4 py-2.5 transition-colors hover:border-[var(--box-fg)] hover:bg-[var(--box-fg)] hover:text-[var(--box-bg-solid)]"
          >
            <span className="label">{mobile ? "Surah summary" : "Read the surah summary"}</span>
          </button>
          <motion.span className="label text-[var(--box-faint)]" animate={{ y: [0, 5, 0] }} transition={{ duration: 2.2, repeat: 4, ease: "easeInOut" }}>
            Scroll to begin surah ↓
          </motion.span>
        </motion.div>
      </div>
    </section>
  );
}

/** The way out of focus: a quiet corner button that shows when the pointer moves (always, faintly, to a finger). */
function FocusExit({ onExit }: { onExit: () => void }) {
  const [shown, setShown] = useState(true);
  useEffect(() => {
    let t = window.setTimeout(() => setShown(false), 2200);
    const wake = () => {
      setShown(true);
      window.clearTimeout(t);
      t = window.setTimeout(() => setShown(false), 2200);
    };
    window.addEventListener("pointermove", wake);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("pointermove", wake);
    };
  }, []);
  const touch = typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches;
  return (
    <button
      type="button"
      onClick={onExit}
      aria-label="Leave focus (Esc)"
      title="Leave focus (Esc)"
      className={cn(
        "pill absolute right-3 top-3 z-30 flex h-9 w-9 items-center justify-center border border-[var(--box-line)] bg-[var(--box-bg-solid)] text-[var(--box-muted)] transition-opacity duration-500 hover:text-[var(--box-fg)] md:right-5 md:top-5",
        shown ? "opacity-100" : touch ? "opacity-40" : "pointer-events-none opacity-0",
      )}
    >
      <Minimize2 size={14} strokeWidth={1.5} />
    </button>
  );
}

function Closing({ surah, next, onReflect, onNext }: { surah: Surah; next: Surah | null; onReflect: () => void; onNext: () => void }) {
  return (
    <section data-n={surah.count + 1} className="snap-item snap-page relative flex min-h-full flex-col items-center justify-center gap-8 px-8 text-center">
      <div className="label text-[var(--box-faint)]">End of {surah.tc}</div>
      <div className="display font-serif text-[26px] italic md:text-[34px]">What did this surah leave with you?</div>
      <CompleteMark surah={surah} />
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button type="button" onClick={onReflect} className="btn-primary label inline-flex items-center gap-2 border border-[var(--box-fg)] px-3 py-2 transition-colors hover:bg-[var(--box-fg)] hover:text-[var(--box-bg-solid)]">
          <QuillGlyph size={14} />
          Write a reflection
        </button>
        {next && (
          <button type="button" onClick={onNext} className="btn-secondary label border border-[var(--box-line)] px-3 py-2 text-[var(--box-muted)] transition-colors hover:border-[var(--box-fg)] hover:text-[var(--box-fg)]">
            Next · {pad3(next.n)} {next.tc} →
          </button>
        )}
      </div>
    </section>
  );
}

function Loading({ name }: { name: string }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
      <span className="label text-[var(--box-muted)]">Opening {name}</span>
      <span className="relative h-px w-40 overflow-hidden bg-[var(--box-line)]">
        <motion.span className="absolute inset-y-0 w-1/3 bg-[var(--color-gold)]" animate={{ left: ["-35%", "100%"] }} transition={{ duration: 1.1, repeat: Infinity, ease: EASE_IN_OUT }} />
      </span>
    </div>
  );
}

/* ── the view switch: one ayah or many; the one already chosen, tapped again, opens its ways of
   reading (Arabic and a translation, either alone, and in the multiple-ayah view either alone as
   a book), so every way to read is a tap or two from the page ── */
type Mode = { mode: Settings["readingMode"]; book: boolean };
const MODES: Record<1 | 3, (Mode & { label: string; sub?: string })[]> = {
  1: [
    { mode: "both", book: false, label: "Arabic + translation" },
    { mode: "arabic", book: false, label: "Arabic only" },
    { mode: "translation", book: false, label: "Translation only" },
  ],
  3: [
    { mode: "both", book: false, label: "Arabic + translation" },
    { mode: "arabic", book: false, label: "Arabic only", sub: "Ayah by ayah" },
    { mode: "arabic", book: true, label: "Arabic only", sub: "As a book" },
    { mode: "translation", book: false, label: "Translation only", sub: "Ayah by ayah" },
    { mode: "translation", book: true, label: "Translation only", sub: "As a book" },
  ],
};

function ViewToggle({ settings, onView, onMode }: { settings: Settings; onView: (v: 1 | 3) => void; onMode: (p: Partial<Settings>) => void }) {
  const view = settings.view;
  const [open, setOpen] = useState<DOMRect | null>(null);
  const close = useCallback(() => setOpen(null), []);
  return (
    <>
      {/* (the gap beside it the same as the gap above it: in a rounded frame its corner nests in the frame's) */}
      <div className="view-switch pill ml-0.5 flex border border-[var(--box-line)] p-0.5 sm:ml-1 md:ml-2" role="radiogroup" aria-label="View">
        {([1, 3] as const).map((v) => {
          const on = view === v;
          return (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={on}
              aria-haspopup={on ? "menu" : undefined}
              aria-expanded={on ? !!open : undefined}
              aria-label={v === 1 ? "One ayah" : "Multiple ayahs"}
              title={on ? "Ways to read" : v === 1 ? "One ayah" : "Multiple ayahs"}
              // switching views is heard as a switch (as the context switch): up to many, down to one;
              // the chosen one, opening its ways to read, taps
              data-sfx={on ? undefined : v === 3 ? "on" : "off"}
              onClick={(e) => {
                if (!on) return onView(v);
                const r = e.currentTarget.getBoundingClientRect();
                setOpen((o) => (o ? null : r));
              }}
              className={cn("relative flex h-7 items-center justify-center transition-[width] duration-300", on ? "w-10 md:w-11" : "w-7 md:w-8")}
            >
              {on && <motion.span layoutId="view-toggle" className="pill absolute inset-0 bg-[var(--box-fg)]" transition={{ duration: 0.35, ease: EASE_OUT }} />}
              <span className={cn("relative flex items-center gap-1", on ? "text-[var(--box-bg-solid)]" : "text-[var(--box-muted)]")}>
                <span className="flex flex-col items-center justify-center gap-[3px]">
                  {Array.from({ length: v }, (_, i) => (
                    <span key={i} className="block h-px w-3.5 bg-current" />
                  ))}
                </span>
                {on && <ChevronDown size={10} strokeWidth={2.4} className={cn("transition-transform duration-300", open && "rotate-180")} />}
              </span>
            </button>
          );
        })}
      </div>
      {createPortal(<ModeMenu at={open} settings={settings} onPick={onMode} onClose={close} />, document.body)}
    </>
  );
}

function ModeMenu({ at, settings, onPick, onClose }: { at: DOMRect | null; settings: Settings; onPick: (p: Partial<Settings>) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!at) return;
    const down = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      if (ref.current?.contains(t) || t.closest?.('[role="radiogroup"][aria-label="View"]')) return;
      onClose();
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("keydown", key);
    };
  }, [at, onClose]);
  const view = settings.view;
  const cur = (m: Mode) => m.mode === settings.readingMode && (view === 1 || m.mode === "both" || m.book === settings.book);
  const W = 252;
  const left = at ? Math.max(12, Math.min(window.innerWidth - W - 12, at.right - W)) : 0;
  return (
    <AnimatePresence>
      {at && (
        <motion.div
          ref={ref}
          role="menu"
          aria-label={view === 1 ? "One ayah: ways to read" : "Multiple ayahs: ways to read"}
          className="theme-pop fixed z-[80] border border-[var(--box-line)] bg-[var(--box-bg-solid)] p-1.5 text-[var(--box-fg)] shadow-[0_18px_50px_-14px_rgba(0,0,0,0.7)]"
          style={{ left, top: at.bottom + 8, width: W }}
          initial={{ opacity: 0, y: -6, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -4, scale: 0.98, transition: { duration: 0.12 } }}
          transition={{ duration: 0.22, ease: EASE_OUT }}
        >
          <div className="label px-2 pb-1.5 pt-1 text-[var(--box-faint)]">{view === 1 ? "One ayah" : "Multiple ayahs"}</div>
          {MODES[view].map((m) => {
            const on = cur(m);
            return (
              <button
                key={`${m.mode}-${m.book}`}
                type="button"
                role="menuitemradio"
                aria-checked={on}
                onClick={() => {
                  if (!on) onPick(view === 3 && m.mode !== "both" ? { readingMode: m.mode, book: m.book } : { readingMode: m.mode });
                  onClose();
                }}
                className={cn("flex w-full items-center gap-2.5 px-2 py-2 text-left transition-colors hover:bg-[var(--box-hover)]", on && "bg-[var(--box-hover)]")}
              >
                <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center", on ? "text-[var(--color-gold)]" : "text-transparent")}>
                  <Check size={13} strokeWidth={2.4} />
                </span>
                <span className="min-w-0 flex-1 text-[13.5px] leading-tight">{m.label}</span>
                {m.sub && <span className="label-sm shrink-0 text-[var(--box-faint)]">{m.sub}</span>}
              </button>
            );
          })}
          {view === 3 && settings.readingMode === "translation" && settings.book && (
            <MenuSwitch label="Theme headings" on={settings.bookThemes} onClick={() => onPick({ bookThemes: !settings.bookThemes })} />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function MenuSwitch({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="menuitemcheckbox"
      aria-checked={on}
      onClick={onClick}
      className="mt-1 flex w-full items-center justify-between gap-3 border-t border-[var(--box-line)] px-2 pb-1.5 pt-2.5 text-left transition-colors hover:bg-[var(--box-hover)]"
    >
      <span className="text-[13px] text-[var(--box-muted)]">{label}</span>
      <span className={cn("pill relative h-4 w-7 shrink-0 border transition-colors", on ? "border-[var(--color-gold)]" : "border-[var(--box-line)]")}>
        <span className={cn("pill absolute top-[2px] h-2.5 w-2.5 transition-all duration-300", on ? "left-[13px] bg-[var(--color-gold)]" : "left-[2px] bg-[var(--box-faint)]")} />
      </span>
    </button>
  );
}

/** The surah's name in the header: on a narrow phone a long one (Al-Mumtaĥanah) steps down a
 *  little in size to fit whole, rather than being cut. */
function FitName({ text, className }: { text: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el?.parentElement) return;
    const fit = () => {
      el.style.fontSize = "";
      if (el.scrollWidth <= el.clientWidth) return;
      const base = parseFloat(getComputedStyle(el).fontSize);
      el.style.fontSize = `${Math.max(12, Math.floor((base * el.clientWidth * 10) / el.scrollWidth) / 10)}px`;
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el.parentElement);
    document.fonts.addEventListener("loadingdone", fit);
    return () => {
      ro.disconnect();
      document.fonts.removeEventListener("loadingdone", fit);
    };
  }, [text]);
  return (
    <span ref={ref} className={className}>
      {text}
    </span>
  );
}

function IconTool({ children, label, onClick }: { children: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className="pill flex h-9 w-[26px] items-center justify-center text-[var(--box-muted)] hover:bg-[var(--box-hover)] hover:text-[var(--box-fg)] sm:w-8 md:w-9">
      {children}
    </button>
  );
}

function SearchPanelBody({
  surahs,
  juz,
  onPick,
  onClose,
  current,
  onSurah,
  onGo,
}: {
  surahs: Surah[];
  juz: Record<string, string>;
  onPick: (r: Result) => void;
  onClose: () => void;
  current: number;
  onSurah: (n: number) => void;
  onGo: (s: number, a: number) => void;
}) {
  // besides searching, the surahs browsed other ways: by juz, by theme, by topic…
  const [by, setBy] = useState<IndexKind>(searchBy);
  const pick = (k: IndexKind) => {
    searchBy = k;
    setBy(k);
  };
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between px-5 pt-4 md:px-8 md:pt-6">
        <Reveal>
          <div className="label text-[var(--box-faint)]">Search</div>
          <div className="mt-1 text-[13px] text-[var(--box-muted)]">A surah, 2:255, a juz, or any word</div>
        </Reveal>
        <button type="button" onClick={onClose} aria-label="Close search" className="flex h-9 w-9 items-center justify-center hover:bg-[var(--box-hover)]">
          <MenuGlyph open />
        </button>
      </div>
      {/* above the surah list, so its dropdown of results is not covered by the list */}
      <Reveal className="relative z-20 px-5 pt-6 md:px-8 md:pt-8">
        <div className="mx-auto w-full max-w-[640px]">
          {/* (on a touch screen not at once: the keyboard would cover the ways of browsing) */}
          <SearchBox surahs={surahs} juz={juz} onPick={onPick} autoFocus={!window.matchMedia("(pointer: coarse)").matches} dropdown="overlay" inputClassName="h-12 text-[12px]" />
        </div>
      </Reveal>
      {/* or browse: each way of seeing the Qur'an a tab of its own, in plain view */}
      <Reveal className="relative z-10 px-5 pt-6 md:px-8 md:pt-7">
        <div className="mx-auto flex w-full max-w-[860px] flex-wrap justify-center gap-1.5" role="tablist" aria-label="Browse">
          {INDEX_VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              role="tab"
              aria-selected={by === v.id}
              onClick={() => pick(v.id)}
              className={cn(
                "pill relative h-8 border px-3 text-[13px] transition-colors duration-300",
                by === v.id ? "border-[var(--box-fg)] text-[var(--box-bg-solid)]" : "border-[var(--box-line)] text-[var(--box-muted)] hover:border-[var(--box-muted)] hover:text-[var(--box-fg)]",
              )}
            >
              {by === v.id && <motion.span layoutId="browse-by" className="pill absolute inset-0 bg-[var(--box-fg)]" transition={{ duration: 0.35, ease: EASE_OUT }} />}
              <span className="relative">{v.id === "ring" ? "All surahs" : v.name}</span>
            </button>
          ))}
        </div>
      </Reveal>
      <AnimatePresence mode="wait" initial={false}>
        {by !== "ring" ? (
          <motion.div
            key={by}
            className="relative z-0 mt-5 min-h-0 flex-1"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6, transition: { duration: 0.15 } }}
            transition={{ duration: 0.35, ease: EASE_OUT }}
          >
            <IndexView kind={by} surahs={surahs} juz={juz} onOpen={onGo} mobile={window.innerWidth < 768} />
          </motion.div>
        ) : (
      <motion.div
        key="all"
        className="thin-scroll relative z-0 mt-5 min-h-0 flex-1 overflow-y-auto px-5 pb-6 md:px-8"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6, transition: { duration: 0.15 } }}
        transition={{ duration: 0.35, ease: EASE_OUT }}
      >
        <div className="grid grid-cols-2 gap-x-6 sm:grid-cols-3 lg:grid-cols-4">
          {surahs.map((s) => (
            <button
              key={s.n}
              type="button"
              onClick={() => onSurah(s.n)}
              className={cn(
                "group flex items-baseline gap-2 border-t border-[var(--box-line)] py-2 text-left transition-colors hover:text-[var(--box-fg)]",
                s.n === current ? "text-[var(--color-gold)]" : "text-[var(--box-muted)]",
              )}
            >
              <span className="font-mono text-[10px] tabular-nums opacity-60">{pad3(s.n)}</span>
              <span className="truncate font-serif text-[15px] italic">{s.tc}</span>
              <span className="ml-auto font-kufi text-[13px] opacity-60" dir="rtl">
                {s.ar}
              </span>
            </button>
          ))}
        </div>
      </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
let searchBy: IndexKind = "ring"; // the way of browsing last chosen in the search, kept for its next opening

/* ── into focus and out of it: the frame moves (App gives it a shorter move while reflow is on) and
   the page waits until it has stopped, and until the window has finished changing size ── */
let reflowTimer = 0;
function settleReflow(ms: number) {
  window.clearTimeout(reflowTimer);
  reflowTimer = window.setTimeout(() => useUI.getState().setReflow(false), ms);
}
function reflowFor(on: boolean) {
  const ui = useUI.getState();
  ui.setReflow(true);
  ui.setFocus(on);
  settleReflow(620); // (the frame's move is 0.55s)
}
