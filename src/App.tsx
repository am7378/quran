import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useState } from "react";
import { Backdrop, type Phase } from "@/components/Backdrop";
import { Frame } from "@/components/Frame";
import { Grain } from "@/components/bits";
import { ContextMenu } from "@/components/ContextMenu";
import { CoverThemes } from "@/components/CoverThemes";
import { Intro } from "@/pages/Intro";
import { Select, type OpenRequest } from "@/pages/Select";
import { Read } from "@/read/Read";
import { SettingsPanel } from "@/read/Settings";
import { AboutPanel } from "@/components/About";
import { loadIndex, type Surah } from "@/lib/data";
import { frameRect, useViewport } from "@/lib/layout";
import { useStore } from "@/lib/store";
import { useUI } from "@/lib/ui";
import { isLongPressMenu, watchLongPress, watchTwoFingerTap } from "@/lib/touch";
import { watchSounds } from "@/lib/uiSounds";

type Start = { surah: number; ayah: number; from?: OpenRequest["from"]; showOpener?: boolean };

/** "#/2/255" opens straight onto that ayah (shared links). */
function readHash(): Start | null {
  const m = location.hash.match(/^#\/(\d{1,3})(?:\/(\d{1,3}))?/);
  if (!m) return null;
  const s = Number(m[1]);
  if (s < 1 || s > 114) return null;
  return { surah: s, ayah: m[2] ? Number(m[2]) : 1 };
}

export default function App() {
  const vp = useViewport();
  const settings = useStore((s) => s.settings);
  const last = useStore((s) => s.last);
  const [index, setIndex] = useState<{ surahs: Surah[]; juz: Record<string, string> } | null>(null);
  const [linked] = useState(readHash);
  const [phase, setPhase] = useState<Phase>(linked ? "read" : "intro");
  const [entering, setEntering] = useState(false);
  const [start, setStart] = useState<Start>(linked ?? { surah: 1, ayah: 1 });
  const [indexAt, setIndexAt] = useState({ surah: last?.s ?? 1, ayah: last?.v ?? 1 }); // where the index opens
  const [firstFrame, setFirstFrame] = useState(true);
  const [coverSettings, setCoverSettings] = useState(false); // Settings opened from page one
  // the index, come to from the cover: it offers to go on where the reader left off
  const [resume, setResume] = useState<{ s: number; v: number } | null>(null);
  const about = useUI((s) => s.about);
  const setAbout = useUI((s) => s.setAbout);

  useEffect(() => {
    loadIndex().then(setIndex);
  }, []);

  // the site's own right-click menu; pages add their own items first (and prevent this fallback)
  useEffect(() => {
    const on = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest("input, textarea")) return; // where people type, the browser's own
      // the browser's menu from a long press stays away: the site raises its own (watchLongPress)
      if (isLongPressMenu(e)) return e.preventDefault();
      if (e.defaultPrevented) return;
      e.preventDefault();
      const enter = document.querySelector<HTMLButtonElement>('button[aria-label="Read the Qur\'an"]');
      useUI.getState().openMenu(e.clientX, e.clientY, [
        ...(enter ? [{ type: "item" as const, label: "Read the Qur'an", hint: "Enter", onSelect: () => enter.click() }] : []),
        { type: "item" as const, label: "Reload", onSelect: () => location.reload() },
      ]);
    };
    window.addEventListener("contextmenu", on);
    // touch screens: two fingers at once, or a press held where there is no text to select
    const stopTaps = watchTwoFingerTap();
    const stopPress = watchLongPress();
    return () => {
      window.removeEventListener("contextmenu", on);
      stopTaps();
      stopPress();
    };
  }, []);

  // a pasted or edited link (#/18/10) opens that ayah; our own replaceState calls don't fire this
  const [readKey, setReadKey] = useState(0);
  useEffect(() => {
    const on = () => {
      const h = readHash();
      if (!h) return;
      setStart(h);
      setReadKey((k) => k + 1);
      setPhase("read");
    };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);

  // the site's sounds: taps, switches, keys (each kind can be turned off in Settings → Sound)
  useEffect(() => watchSounds(), []);

  useEffect(() => {
    const root = document.documentElement;
    const mono = settings.theme === "mono";
    // Monochrome has its own two choices: the frame dark or light, the page around it dark or light
    root.dataset.box = mono ? (settings.monoCard === "light" ? "paper" : "night") : settings.boxTheme;
    if (mono) root.dataset.sky = settings.monoSky;
    else delete root.dataset.sky;
    root.dataset.theme = settings.theme;
    root.dataset.motion = settings.reduceMotion ? "reduce" : "full";
    root.dataset.arabic = settings.arabicSpacing;
    // the phone's own bar (a home-screen app, Android's browser) takes the colour of the sky
    const sky = getComputedStyle(root).getPropertyValue("--sky").trim();
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", sky || "#0b1320");
  }, [settings.boxTheme, settings.theme, settings.reduceMotion, settings.arabicSpacing, settings.monoSky, settings.monoCard]);

  // after the first frame is on screen, later frame moves animate
  useEffect(() => {
    const t = setTimeout(() => setFirstFrame(false), 50);
    return () => clearTimeout(t);
  }, []);

  // page one: the cover grows into the index, then the index comes in
  const enter = useCallback(() => {
    setCoverSettings(false);
    useUI.getState().setAbout(false);
    const l = useStore.getState().last;
    setResume(l && !(l.s === 1 && l.v <= 1) ? l : null);
    setEntering(true);
    setTimeout(
      () => {
        setPhase("select");
        setEntering(false);
      },
      useStore.getState().settings.reduceMotion ? 0 : 920,
    );
  }, []);
  // a saved ayah picked in the settings on page one
  const goTo = useCallback((surah: number, ayah: number) => {
    setCoverSettings(false);
    setStart({ surah, ayah });
    setPhase("read");
  }, []);

  const onOpen = useCallback((r: OpenRequest) => {
    setCoverSettings(false);
    setStart({ surah: r.surah, ayah: r.ayah, from: r.from, showOpener: r.ayah === 1 });
    setPhase("read");
  }, []);

  const onIndex = useCallback((surah: number, ayah: number) => {
    setResume(null);
    setIndexAt({ surah, ayah: Math.max(1, ayah) });
    history.replaceState(null, "", location.pathname);
    setPhase("select");
  }, []);

  // one frame for the whole site: the cover on page one, grown for the index and the reader
  const focus = useUI((s) => s.focus);
  const reflow = useUI((s) => s.reflow);
  // (in focus the frame meets the strip an iPhone keeps below the page: index.css gives it the frame's colour)
  useEffect(() => {
    document.documentElement.classList.toggle("focus-on", focus && phase === "read");
  }, [focus, phase]);
  const rect =
    focus && phase === "read"
      ? // focus: the frame is the whole screen (below the status bar, opened from the home screen)
        { left: 0, top: vp.standalone ? vp.insets.top : 0, width: vp.w, height: vp.h - (vp.standalone ? vp.insets.top : 0) }
      : frameRect(vp.w, vp.h, phase === "intro" && !entering && !coverSettings && !about ? "intro" : phase === "intro" ? "select" : phase, vp);

  return (
    <>
      <Backdrop theme={settings.theme} still={focus && phase === "read"} />

      <Frame rect={rect} instant={firstFrame} quick={reflow} amplitude={settings.reduceMotion || settings.theme === "mono" || settings.theme === "folio" || settings.theme === "paper" || focus ? 0 : phase === "read" ? 0.45 : 1}>
        <AnimatePresence>
          {phase === "intro" && !entering && (
            <motion.div key="intro" className="absolute inset-[3px]" exit={{ opacity: 0, transition: { duration: 0.25 } }}>
              <Intro onEnter={enter} onSettings={() => setCoverSettings((o) => !o)} settingsOpen={coverSettings} mobile={vp.mobile} />
            </motion.div>
          )}
          {phase === "select" && index && (
            <motion.div key="select" className="absolute inset-[3px]" exit={{ opacity: 0, transition: { duration: 0.45 } }}>
              <Select surahs={index.surahs} juz={index.juz} initialSurah={indexAt.surah} initialAyah={indexAt.ayah} onOpen={onOpen} mobile={vp.mobile} resume={resume} onSettings={() => setCoverSettings((o) => !o)} settingsOpen={coverSettings} />
            </motion.div>
          )}
          {phase === "read" && index && (
            <motion.div key={`read-${readKey}`} className="absolute inset-[3px]" exit={{ opacity: 0, transition: { duration: 0.3 } }}>
              <Read
                surahs={index.surahs}
                juz={index.juz}
                start={start}
                onIndex={onIndex}
                mobile={vp.mobile}
                below={vp.h - (rect.top + rect.height)}
              />
            </motion.div>
          )}
        </AnimatePresence>
        {(phase === "intro" || phase === "select") && index && (
          <SettingsPanel open={coverSettings} onClose={() => setCoverSettings(false)} surahs={index.surahs} onGo={goTo} mobile={vp.mobile} />
        )}
        <AboutPanel open={about} onClose={() => setAbout(false)} />
      </Frame>

      <CoverThemes show={phase === "intro" && !entering && !coverSettings && !about} mobile={vp.mobile} />
      <ContextMenu />
      {/* Paper draws its icons in ink: the line a little uneven, as by a pen */}
      <svg width="0" height="0" className="absolute" aria-hidden>
        <filter id="ink-line" x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="1" seed="3" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="0.9" />
        </filter>
      </svg>
      <Grain on={settings.grain} />
    </>
  );
}
