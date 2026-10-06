import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ImmersivePanel, MenuGlyph, Reveal } from "@/components/ImmersivePanel";
import { HIGHLIGHT_COLORS, HIGHLIGHT_HEX, useStore, type HighlightColor, type Settings } from "@/lib/store";
import { FolderPicker } from "./Folders";
import { FolderPlus } from "lucide-react";
import { useUI } from "@/lib/ui";
import { ProgressTab } from "./Progress";
import { THEMES } from "@/lib/themes";
import { GuideTab } from "./Guide";
import type { Surah, Translation, Verse } from "@/lib/data";
import { TRANSLATIONS, loadSurah, translationText } from "@/lib/data";
import { EASE_OUT, cn } from "@/lib/utils";
import { Segmented } from "@/components/ui/segmented";
import { ayn, nameMarks } from "@/lib/names";

type Tab = "reading" | "translation" | "display" | "sound" | "saved" | "progress" | "guide";
const TABS: { id: Tab; name: string }[] = [
  { id: "reading", name: "Reading" },
  { id: "translation", name: "Translation" },
  { id: "display", name: "Display" },
  { id: "sound", name: "Sound" },
  { id: "saved", name: "Saved" },
  { id: "progress", name: "Progress" },
  { id: "guide", name: "Guide" },
];

export function SettingsPanel({
  open,
  startTab,
  onClose,
  surahs,
  onGo,
  mobile,
}: {
  open: boolean;
  startTab?: Tab; // opened for one section (Saved, from the header)
  onClose: () => void;
  surahs: Surah[];
  onGo: (s: number, a: number) => void;
  mobile: boolean;
}) {
  const [tab, setTab] = useState<Tab>("reading");
  useEffect(() => {
    if (open && startTab) setTab(startTab);
  }, [open, startTab]);
  const settings = useStore((s) => s.settings);
  const set = useStore((s) => s.set);

  return (
    <ImmersivePanel open={open} from="left" onClose={onClose} label="Settings">
      <div className="flex h-full flex-col">
        <div className="flex items-start justify-between px-5 pt-4 md:px-8 md:pt-6">
          <Reveal>
            <div className="label text-[var(--box-faint)]">Settings</div>
            <div className="mt-1 text-[13px] text-[var(--box-muted)]">
              <button type="button" onClick={() => useUI.getState().setAbout(true)} className="underline decoration-[var(--box-line)] underline-offset-4 transition-colors hover:text-[var(--box-fg)] hover:decoration-current">
                About this reader
              </button>
            </div>
          </Reveal>
          <button type="button" onClick={onClose} aria-label="Close settings" className="flex h-9 w-9 items-center justify-center hover:bg-[var(--box-hover)]">
            <MenuGlyph open />
          </button>
        </div>

        <div className={cn("flex min-h-0 flex-1 gap-6 px-5 pb-5 md:gap-14 md:px-8", mobile ? "flex-col pt-3" : "items-stretch pt-8")}>
          <nav className={cn("shrink-0", mobile ? "flex gap-5 overflow-x-auto pt-3" : "flex w-[34%] flex-col justify-center")} aria-label="Settings sections">
            {TABS.map((t) => (
              <Reveal key={t.id}>
                <button
                  type="button"
                  onClick={() => setTab(t.id)}
                  aria-current={tab === t.id}
                  className={cn(
                    "group relative text-left font-sans leading-[1.1] tracking-[-0.02em] transition-colors duration-300",
                    mobile ? "text-[22px]" : "text-[clamp(30px,4.2vw,56px)]",
                    tab === t.id ? "text-[var(--box-fg)]" : "text-[var(--box-faint)] hover:text-[var(--box-muted)]",
                  )}
                >
                  {t.name}
                  {tab === t.id && (
                    <motion.span
                      layoutId="tab-dot"
                      className={cn(
                        "absolute h-1.5 w-1.5 rotate-45 bg-[var(--color-gold)]",
                        // side by side on a phone, so the mark sits above the chosen one
                        mobile ? "-top-2.5 left-1/2 -ml-[3px]" : "-left-6 top-1/2 -mt-[3px]",
                      )}
                    />
                  )}
                </button>
              </Reveal>
            ))}
          </nav>

          <Reveal className="thin-scroll min-h-0 flex-1 overflow-y-auto md:border-l md:border-[var(--box-line)] md:pl-10">
            <AnimatePresence mode="wait">
              <motion.div
                key={tab}
                initial={{ opacity: 0, y: 12, filter: "blur(4px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, y: -6, transition: { duration: 0.12 } }}
                transition={{ duration: 0.3, ease: EASE_OUT }}
                className="flex flex-col gap-7 py-1 md:py-4"
              >
                {tab === "reading" && <ReadingTab s={settings} set={set} />}
                {tab === "translation" && <TranslationTab s={settings} set={set} />}
                {tab === "display" && <DisplayTab s={settings} set={set} />}
                {tab === "sound" && <SoundTab s={settings} set={set} />}
                {tab === "saved" && <SavedTab surahs={surahs} onGo={onGo} />}
                {tab === "progress" && <ProgressTab surahs={surahs} onGo={onGo} />}
                {tab === "guide" && <GuideTab />}
              </motion.div>
            </AnimatePresence>
          </Reveal>
        </div>
      </div>
    </ImmersivePanel>
  );
}

type TabProps = { s: Settings; set: (p: Partial<Settings>) => void };

function ReadingTab({ s, set }: TabProps) {
  return (
    <>
      <Row label="Show">
        <Segmented
          value={s.readingMode}
          onChange={(v) => set({ readingMode: v })}
          options={[
            ["both", "Arabic + translation", "Both"],
            ["arabic", "Arabic only", "Arabic"],
            ["translation", "Translation only", "Translation"],
          ]}
        />
      </Row>
      {s.readingMode !== "both" && (
        <Row label="Layout" hint="With multiple ayahs">
          <Segmented value={s.book ? "book" : "ayahs"} onChange={(v) => set({ book: v === "book" })} options={[["ayahs", "Ayah by ayah"], ["book", "As a book"]]} />
        </Row>
      )}
      {s.readingMode === "translation" && s.book && (
        <Toggle
          label="Theme headings in the book"
          on={s.bookThemes}
          set={(v) => set({ bookThemes: v })}
        />
      )}
      <Row label="View">
        <Segmented value={String(s.view) as "1" | "3"} onChange={(v) => set({ view: Number(v) as 1 | 3 })} options={[["1", "One ayah"], ["3", "Multiple ayahs"]]} />
      </Row>
      <Row label="Arabic script">
        <Segmented
          value={s.script}
          onChange={(v) => set({ script: v })}
          options={[
            ["uthmani", "Madani"],
            ["indopak", "Indo-Pak"],
          ]}
        />
      </Row>
      <Row label="Arabic spacing" hint="Close sets the words and lines nearer together, as a printed mushaf does">
        <Segmented
          value={s.arabicSpacing}
          onChange={(v) => set({ arabicSpacing: v })}
          options={[
            ["airy", "Airy"],
            ["close", "Close"],
          ]}
        />
      </Row>
      <Toggle label="Word meanings on hover" on={s.wordHover} set={(v) => set({ wordHover: v })} />
      <Toggle label="Transliteration in word meanings" on={s.translit} set={(v) => set({ translit: v })} />
      <Toggle label="Context in Quraan Made Easy" hint="The explanations in brackets" on={s.showContext} set={(v) => set({ showContext: v })} />
    </>
  );
}

// one short ayah to compare the translations by (Al-Fātiĥah 1:5), the same wherever the panel opens,
// so the three fit in view without scrolling
const SAMPLE = { surah: 1, ayah: 5 };
let sampleVerse: Promise<Verse | undefined> | null = null;

function TranslationTab({ s, set }: TabProps) {
  const [verse, setVerse] = useState<Verse | null>(null);
  useEffect(() => {
    let alive = true;
    sampleVerse ??= loadSurah(SAMPLE.surah).then((d) => d.v[SAMPLE.ayah - 1]);
    sampleVerse.then((v) => alive && v && setVerse(v)).catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  // the main translation, then up to two more shown under it, in the order they were added
  const shown: Translation[] = [s.translation, ...s.also.filter((t) => t !== s.translation)].slice(0, 3);
  const show = (t: Translation) => set({ also: [...s.also.filter((x) => x !== t && x !== s.translation), t].slice(0, 2) });
  const hide = (t: Translation) => set({ also: s.also.filter((x) => x !== t) });
  const makeMain = (t: Translation) => set({ translation: t, also: [s.translation, ...s.also.filter((x) => x !== t && x !== s.translation)].slice(0, 2) });
  return (
    <div className="flex flex-col gap-3 md:gap-5">
      {/* (on a phone the cards' own labels say it, and all three fit in view) */}
      <div className="hidden text-[13px] text-[var(--box-muted)] md:block">
        Up to three, one under another.
      </div>
      {(Object.keys(TRANSLATIONS) as Translation[]).map((t) => {
        const at = shown.indexOf(t);
        const main = at === 0, on = at >= 0;
        const sample = verse ? translationText(verse, t, false) : "";
        return (
          <div
            key={t}
            className={cn("relative border px-3 py-2.5 transition-colors md:p-5", on ? "border-[var(--box-fg)]" : "border-[var(--box-line)] hover:border-[var(--box-muted)]")}
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-serif text-[18px] italic md:text-[22px]">{TRANSLATIONS[t].name}</span>
              <span className={cn("label-sm shrink-0", on ? "text-[var(--color-gold)]" : "text-[var(--box-faint)]")}>
                {main ? "Main" : on ? `Also shown · ${at + 1} of ${shown.length}` : "Not shown"}
              </span>
            </div>
            {/* by whom (not when it is the name again: Saheeh International) */}
            {TRANSLATIONS[t].by.toLowerCase() !== TRANSLATIONS[t].name.toLowerCase() && <div className="label-sm mt-0.5 text-[var(--box-faint)] md:mt-1">{TRANSLATIONS[t].by}</div>}
            {sample && (
              <p className="mt-1.5 font-serif text-[14.5px] leading-snug text-[var(--box-muted)] md:mt-3 md:text-[15px] md:leading-relaxed">
                <span className="label-sm mr-2 text-[var(--box-faint)]">{SAMPLE.surah}:{SAMPLE.ayah}</span>
                {sample}
              </p>
            )}
            <div className="mt-2 flex flex-wrap gap-2 md:mt-3">
              {!main && (
                <button type="button" onClick={() => makeMain(t)} className="btn-secondary pill label border border-[var(--box-line)] px-2.5 py-1 hover:border-[var(--box-fg)] md:py-1.5">
                  Make main
                </button>
              )}
              {!main && !on && (
                <button type="button" onClick={() => show(t)} className="btn-secondary pill label border border-[var(--box-line)] px-2.5 py-1 hover:border-[var(--box-fg)] md:py-1.5">
                  Also show
                </button>
              )}
              {!main && on && (
                <button type="button" onClick={() => hide(t)} className="btn-secondary pill label border border-[var(--box-line)] px-2.5 py-1 hover:border-[var(--box-fg)] md:py-1.5">
                  Hide
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DisplayTab({ s, set }: TabProps) {
  return (
    <>
      <Row label="Arabic size" inline>
        <Stepper value={s.arabicScale} onChange={(v) => set({ arabicScale: v })} />
      </Row>
      <Row label="Translation size" inline>
        <Stepper value={s.transScale} onChange={(v) => set({ transScale: v })} />
      </Row>
      <Row label="Theme">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => set({ theme: t.id })}
              aria-pressed={s.theme === t.id}
              className={cn("group flex flex-col gap-2 border p-2 text-left transition-colors", s.theme === t.id ? "border-[var(--box-fg)]" : "border-[var(--box-line)] hover:border-[var(--box-muted)]")}
            >
              <span className="relative flex aspect-[4/3] items-center justify-center overflow-hidden" style={{ background: t.preview.bg }}>
                <span
                  className="flex h-[62%] w-[66%] flex-col items-center justify-center gap-1 transition-transform duration-300 group-hover:scale-[1.04]"
                  style={{ background: t.preview.box, borderRadius: t.preview.r, border: t.preview.b, color: t.preview.fg }}
                >
                  <span className="quran text-[15px] leading-none">بِسۡمِ ٱللَّهِ</span>
                  <span className="h-[2px] w-6" style={{ background: t.preview.ac }} />
                </span>
              </span>
              <span className="text-[13px] leading-tight" style={t.face}>{t.name}</span>
              <span className="label-sm -mt-1.5 text-[var(--box-faint)]">{t.line}</span>
            </button>
          ))}
        </div>
      </Row>
      {s.theme === "classic" && (
        <Row label="Frame">
          <Segmented value={s.boxTheme} onChange={(v) => set({ boxTheme: v })} options={[["night", "Night"], ["paper", "Paper"]]} />
        </Row>
      )}
      {s.theme === "mono" && (
        <>
          <Row label="Background">
            <Segmented value={s.monoSky} onChange={(v) => set({ monoSky: v })} options={[["dark", "Dark"], ["light", "Light"]]} />
          </Row>
          <Row label="Frame">
            <Segmented value={s.monoCard} onChange={(v) => set({ monoCard: v })} options={[["light", "Light"], ["dark", "Dark"]]} />
          </Row>
        </>
      )}
      <Toggle label="Ayah slider" on={s.slider} set={(v) => set({ slider: v })} />
      <Toggle label="Film grain" on={s.grain} set={(v) => set({ grain: v })} />
      <Toggle label="Reduce motion" on={s.reduceMotion} set={(v) => set({ reduceMotion: v })} />
    </>
  );
}

function SoundTab({ s, set }: TabProps) {
  const off = !s.sound;
  return (
    <>
      <Toggle label="Sounds" hint="Quiet sounds as you use the reader. Each kind can be turned off below." on={s.sound} set={(v) => set({ sound: v })} />
      <div className={cn("flex flex-col gap-7 border-l border-[var(--box-line)] pl-5 transition-opacity duration-300", off && "pointer-events-none opacity-40")} aria-disabled={off || undefined}>
        <Toggle label="Taps and switches" hint="Buttons, switches and menus" on={s.soundTaps} set={(v) => set({ soundTaps: v })} />
        <Toggle label="Typing" hint="Writing a note, a reflection or a search" on={s.soundTyping} set={(v) => set({ soundTyping: v })} />
        <Toggle label="Highlighter" hint="The marker drawn across the words" on={s.sounds} set={(v) => set({ sounds: v })} />
        <Toggle label="Ayah slider" hint="A fine click for each ayah as you slide" on={s.soundSlider} set={(v) => set({ soundSlider: v })} />
        <Toggle label="Moving notes" hint="A note picked up and put down" on={s.soundNotes} set={(v) => set({ soundNotes: v })} />
        <Toggle label="Recording" hint="A voice note starting and stopping" on={s.soundRecord} set={(v) => set({ soundRecord: v })} />
        <Toggle label="Completing a surah" hint="A soft chime when you mark one as completed" on={s.soundComplete} set={(v) => set({ soundComplete: v })} />
      </div>
    </>
  );
}

type SavedKind = "bookmarks" | "highlights" | "notes" | "voice" | "reflections";
const SAVED_TABS: { id: SavedKind; name: string; empty: string }[] = [
  { id: "bookmarks", name: "Bookmarks", empty: "No bookmarks yet." },
  { id: "highlights", name: "Highlights", empty: "No highlights yet." },
  { id: "notes", name: "Notes", empty: "No notes yet." },
  { id: "voice", name: "Voice notes", empty: "No voice notes yet." },
  { id: "reflections", name: "Reflections", empty: "No reflections yet." },
];

type SavedRow = { id: string; surah: number; ayah: number; ref: string; text: string; style: "serif" | "arabic" | "hand" | "mono"; swatch?: string; sub?: string };

function SavedTab({ surahs, onGo }: { surahs: Surah[]; onGo: (s: number, a: number) => void }) {
  const bookmarks = useStore((s) => s.bookmarks);
  const highlights = useStore((s) => s.highlights);
  const notes = useStore((s) => s.notes);
  const reflections = useStore((s) => s.reflections);
  const folders = useStore((s) => s.folders);
  const inFolders = useStore((s) => s.inFolders);
  const clearAll = useStore((s) => s.clearAll);
  const [kind, setKind] = useState<SavedKind>("bookmarks");
  const [confirm, setConfirm] = useState(false);
  const [hlColor, setHlColor] = useState<HighlightColor | "all">("all"); // highlights of one colour
  const [folder, setFolder] = useState<string>("all"); // bookmarks of one folder
  const [filing, setFiling] = useState<string | null>(null); // the bookmark whose folders are open
  const folderList = Object.values(folders).sort((a, b) => a.at - b.at);
  const curFolder = folder !== "all" ? folders[folder] : undefined;
  useEffect(() => {
    if (folder !== "all" && !folders[folder]) setFolder("all");
  }, [folder, folders]);

  const split = (k: string) => k.split(":").map(Number) as [number, number];
  const rows: Record<SavedKind, SavedRow[]> = {
    bookmarks: Object.entries(bookmarks)
      .sort((a, b) => b[1] - a[1])
      .map(([k, at]) => {
        const [s, a] = split(k);
        const names = (inFolders[k] ?? []).map((id) => folders[id]?.name).filter(Boolean);
        return { id: k, surah: s, ayah: a, ref: k, text: `Ayah ${a}`, style: "serif", sub: names.length ? names.join(" · ") : new Date(at).toLocaleDateString() };
      }),
    highlights: Object.values(highlights)
      .sort((a, b) => b.at - a.at)
      .map((h) => {
        const [s, a] = split(h.key);
        return { id: h.id, surah: s, ayah: a, ref: h.key, text: h.text, style: h.field === "ar" ? "arabic" : "serif", swatch: h.color };
      }),
    notes: Object.values(notes)
      .filter((n) => n.kind !== "voice")
      .sort((a, b) => b.at - a.at)
      .map((n) => {
        const [s, a] = split(n.key);
        return { id: n.id, surah: s, ayah: a, ref: n.key, text: n.text || (n.quote ? `“${n.quote}”` : "Empty note"), style: "hand" };
      }),
    voice: Object.values(notes)
      .filter((n) => n.kind === "voice")
      .sort((a, b) => b.at - a.at)
      .map((n) => {
        const [s, a] = split(n.key);
        const d = n.dur ?? 0;
        return { id: n.id, surah: s, ayah: a, ref: n.key, text: `Voice note · ${Math.floor(d / 60)}:${String(Math.floor(d % 60)).padStart(2, "0")}`, style: "serif", sub: new Date(n.at).toLocaleDateString() };
      }),
    reflections: Object.entries(reflections)
      .filter(([, r]) => r.summary || r.lessons || r.recordings.length)
      .sort((a, b) => b[1].updatedAt - a[1].updatedAt)
      .map(([s, r]) => ({
        id: s,
        surah: Number(s),
        ayah: 1,
        ref: s,
        text: r.summary || r.lessons || `${r.recordings.length} recording${r.recordings.length === 1 ? "" : "s"}`,
        style: "serif",
        sub: r.recordings.length ? `${r.recordings.length} voice` : undefined,
      })),
  };

  // the list shown: one colour of highlight, one folder of bookmarks, or all of them
  let list = rows[kind];
  if (kind === "highlights" && hlColor !== "all") list = list.filter((r) => r.swatch === hlColor);
  if (kind === "bookmarks" && curFolder) list = list.filter((r) => (inFolders[r.id] ?? []).includes(curFolder.id));
  // grouped by surah, in reading order
  const groups = new Map<number, SavedRow[]>();
  [...list].sort((a, b) => a.surah - b.surah || a.ayah - b.ayah).forEach((r) => groups.set(r.surah, [...(groups.get(r.surah) ?? []), r]));
  const tab = SAVED_TABS.find((t) => t.id === kind)!;
  const total = Object.values(rows).reduce((n, r) => n + r.length, 0);
  const empty =
    kind === "highlights" && hlColor !== "all" && rows.highlights.length
      ? `No ${hlColor} highlights yet.`
      : kind === "bookmarks" && curFolder && rows.bookmarks.length
        ? `Nothing in ${curFolder.name} yet. Bookmark an ayah and choose this folder, or use Folders beside a bookmark below All.`
        : tab.empty;

  return (
    <>
      <div className="flex flex-wrap gap-1.5">
        {SAVED_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setKind(t.id)}
            aria-pressed={kind === t.id}
            className={cn(
              "relative flex items-center gap-2 border px-3 py-1.5 text-[13px] transition-colors",
              kind === t.id ? "border-[var(--box-fg)] text-[var(--box-fg)]" : "border-[var(--box-line)] text-[var(--box-muted)] hover:border-[var(--box-muted)]",
            )}
          >
            {t.name}
            <span className={cn("font-mono text-[10px] tabular-nums", kind === t.id ? "text-[var(--color-gold)]" : "text-[var(--box-faint)]")}>{rows[t.id].length}</span>
          </button>
        ))}
      </div>

      {/* highlights: all of them, or one colour */}
      {kind === "highlights" && rows.highlights.length > 0 && (
        <div className="-mt-2 flex flex-wrap items-center gap-1.5" role="group" aria-label="Highlight colour">
          <FilterChip on={hlColor === "all"} onClick={() => setHlColor("all")} count={rows.highlights.length}>
            All
          </FilterChip>
          {HIGHLIGHT_COLORS.map((c) => {
            const n = rows.highlights.filter((r) => r.swatch === c).length;
            return (
              <FilterChip key={c} on={hlColor === c} onClick={() => setHlColor(c)} count={n} dim={!n} label={`${c} highlights`}>
                <span className={cn("block h-3.5 w-3.5 rounded-full", hlColor !== c && "swatch-edge")} style={{ background: HIGHLIGHT_HEX[c] }} />
              </FilterChip>
            );
          })}
        </div>
      )}

      {/* bookmarks: All, and the reader's own folders */}
      {kind === "bookmarks" && (
        <div className="-mt-2 flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Bookmark folders">
            <FilterChip on={folder === "all"} onClick={() => setFolder("all")} count={rows.bookmarks.length}>
              All
            </FilterChip>
            {folderList.map((f) => (
              <FilterChip key={f.id} on={folder === f.id} onClick={() => setFolder(f.id)} count={rows.bookmarks.filter((r) => (inFolders[r.id] ?? []).includes(f.id)).length}>
                {f.name}
              </FilterChip>
            ))}
            <NewFolder onMade={(id) => setFolder(id)} />
          </div>
          {curFolder && <FolderTools key={curFolder.id} id={curFolder.id} name={curFolder.name} />}
        </div>
      )}

      {list.length === 0 ? (
        <div className="border border-dashed border-[var(--box-line)] px-4 py-8 text-center text-[13.5px] text-[var(--box-muted)]">{empty}</div>
      ) : (
        <div className="flex flex-col gap-6">
          {[...groups.entries()].map(([s, items]) => (
            <div key={s}>
              <div className="mb-1 flex items-baseline gap-2.5">
                <span className="font-mono text-[10px] text-[var(--box-faint)] tabular-nums">{String(s).padStart(3, "0")}</span>
                <span className="font-serif text-[17px] italic">{nameMarks(surahs[s - 1]?.tc)}</span>
                <span className="font-kufi text-[13px] text-[var(--box-faint)]" dir="rtl">
                  {surahs[s - 1]?.ar}
                </span>
                <span className="label-sm ml-auto text-[var(--box-faint)]">{items.length}</span>
              </div>
              <div className="flex flex-col">
                {items.map((r) => (
                  <div key={r.id} className="border-t border-[var(--box-line)]">
                    <div className="group flex items-baseline gap-3 transition-colors hover:bg-[var(--box-hover)]">
                      <button type="button" onClick={() => onGo(r.surah, r.ayah)} className="flex min-w-0 flex-1 items-baseline gap-3 py-2 text-left">
                        <span className="w-[4.5ch] shrink-0 font-mono text-[11px] text-[var(--box-faint)] tabular-nums">{kind === "reflections" ? "—" : r.ayah}</span>
                        {r.swatch && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: HIGHLIGHT_HEX[r.swatch as HighlightColor] }} />}
                        <span
                          className={cn(
                            "min-w-0 flex-1 truncate",
                            r.style === "arabic" ? "quran text-right text-[18px]" : r.style === "hand" ? "font-hand text-[19px]" : "font-serif text-[15px]",
                          )}
                        >
                          {r.text}
                        </span>
                        {r.sub && <span className="label-sm max-w-[40%] shrink-0 truncate text-[var(--box-faint)]">{r.sub}</span>}
                        <span className="label-sm shrink-0 text-[var(--box-faint)] opacity-0 transition-opacity group-hover:opacity-100">Open →</span>
                      </button>
                      {kind === "bookmarks" && (
                        <button
                          type="button"
                          onClick={() => setFiling((f) => (f === r.id ? null : r.id))}
                          aria-expanded={filing === r.id}
                          title="Choose its folders"
                          className={cn("label-sm shrink-0 px-1.5 py-2 transition-colors", filing === r.id ? "text-[var(--box-fg)]" : "text-[var(--box-faint)] hover:text-[var(--box-fg)]")}
                        >
                          Folders
                        </button>
                      )}
                    </div>
                    <AnimatePresence initial={false}>
                      {filing === r.id && (
                        <motion.div
                          className="overflow-hidden"
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.25, ease: EASE_OUT }}
                        >
                          <div className="mb-2 ml-[4.5ch] border-l border-[var(--box-line)] pl-2">
                            <FolderPicker bkey={r.id} />
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-4 border-t border-[var(--box-line)] pt-5">
        <span className="text-[12.5px] text-[var(--box-faint)]">{total} saved</span>
        <button
          type="button"
          onClick={() => (confirm ? (clearAll(), setConfirm(false)) : setConfirm(true))}
          onBlur={() => setConfirm(false)}
          className={cn("label border px-3 py-2 transition-colors", confirm ? "border-[#e0563b] bg-[#e0563b] text-white" : "border-[var(--box-line)] text-[var(--box-muted)] hover:border-[var(--box-fg)]")}
        >
          {confirm ? "Press again to delete everything" : "Delete all saved items"}
        </button>
      </div>
    </>
  );
}

function FilterChip({ on, onClick, count, dim, label, children }: { on: boolean; onClick: () => void; count: number; dim?: boolean; label?: string; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      aria-label={label}
      className={cn(
        "pill flex h-8 items-center gap-2 border px-2.5 text-[12.5px] transition-colors",
        on ? "border-[var(--box-fg)] bg-[var(--box-hover)] text-[var(--box-fg)]" : "border-[var(--box-line)] text-[var(--box-muted)] hover:border-[var(--box-muted)]",
        dim && !on && "opacity-50",
      )}
    >
      {children}
      <span className="font-mono text-[10px] tabular-nums text-[var(--box-faint)]">{count}</span>
    </button>
  );
}

/** "+ Folder": a name, then the new folder is the one shown. */
function NewFolder({ onMade }: { onMade: (id: string) => void }) {
  const addFolder = useStore((s) => s.addFolder);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const done = () => {
    if (name.trim()) onMade(addFolder(name));
    setName("");
    setOpen(false);
  };
  return open ? (
    <form
      className="pill flex h-8 items-center gap-1.5 border border-[var(--box-fg)] pl-2.5 pr-1"
      onSubmit={(e) => {
        e.preventDefault();
        done();
      }}
    >
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={done}
        onKeyDown={(e) => e.key === "Escape" && (e.stopPropagation(), setName(""), setOpen(false))}
        placeholder="Folder name"
        maxLength={40}
        className="w-[13ch] bg-transparent text-[12.5px] text-[var(--box-fg)] outline-none placeholder:text-[var(--box-faint)]"
      />
      <button type="submit" className="label-sm px-1 text-[var(--box-muted)] hover:text-[var(--box-fg)]">
        Add
      </button>
    </form>
  ) : (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="pill flex h-8 items-center gap-1.5 border border-dashed border-[var(--box-line)] px-2.5 text-[12.5px] text-[var(--box-muted)] transition-colors hover:border-[var(--box-fg)] hover:text-[var(--box-fg)]"
    >
      <FolderPlus size={14} strokeWidth={1.5} />
      Folder
    </button>
  );
}

/** A folder's own tools: its name changed, or the folder removed (its bookmarks stay under All). */
function FolderTools({ id, name }: { id: string; name: string }) {
  const rename = useStore((s) => s.renameFolder);
  const remove = useStore((s) => s.removeFolder);
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState(name);
  const [sure, setSure] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-3 text-[12.5px] text-[var(--box-faint)]">
      {edit ? (
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            rename(id, v);
            setEdit(false);
          }}
        >
          <input
            autoFocus
            value={v}
            onChange={(e) => setV(e.target.value)}
            maxLength={40}
            className="border-b border-[var(--box-line)] bg-transparent py-0.5 text-[13px] text-[var(--box-fg)] outline-none focus:border-[var(--color-gold)]"
          />
          <button type="submit" className="label-sm text-[var(--box-muted)] hover:text-[var(--box-fg)]">
            Save
          </button>
        </form>
      ) : (
        <button type="button" onClick={() => setEdit(true)} className="label-sm hover:text-[var(--box-fg)]">
          Rename
        </button>
      )}
      <button
        type="button"
        onClick={() => (sure ? remove(id) : setSure(true))}
        onBlur={() => setSure(false)}
        className={cn("label-sm transition-colors", sure ? "text-[#e0563b]" : "hover:text-[var(--box-fg)]")}
      >
        {sure ? "Press again: the bookmarks stay under All" : "Delete folder"}
      </button>
    </div>
  );
}

/* ── small controls ───────────────────────────────────────────── */

function Row({ label, hint, children, inline }: { label: string; hint?: string; children: ReactNode; inline?: boolean }) {
  return (
    <div className={cn("flex gap-3", inline ? "items-center justify-between gap-8" : "flex-col items-start")}>
      <div>
        <div className="text-[15px]">{label}</div>
        {hint && <div className="mt-0.5 max-w-[52ch] text-[12.5px] text-[var(--box-faint)]">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

function Toggle({ label, hint, on, set }: { label: string; hint?: string; on: boolean; set: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => set(!on)} aria-pressed={on} className="flex items-center justify-between gap-6 text-left">
      <span>
        <span className="block text-[15px]">{label}</span>
        {hint && <span className="mt-0.5 block max-w-[46ch] text-[12.5px] text-[var(--box-faint)]">{hint}</span>}
      </span>
      <span className={cn("pill relative h-5 w-9 shrink-0 border transition-colors", on ? "border-[var(--color-gold)]" : "border-[var(--box-line)]")}>
        <motion.span
          className={cn("pill absolute top-[3px] h-3 w-3", on ? "bg-[var(--color-gold)]" : "bg-[var(--box-faint)]")}
          animate={{ left: on ? 19 : 3 }}
          transition={{ duration: 0.3, ease: EASE_OUT }}
        />
      </span>
    </button>
  );
}

function Stepper({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const steps = [0.8, 0.9, 1, 1.12, 1.25, 1.4];
  const i = steps.findIndex((s) => Math.abs(s - value) < 0.01);
  return (
    <div className="flex shrink-0 items-center gap-1">
      {steps.map((s, k) => (
        <button key={s} type="button" onClick={() => onChange(s)} aria-label={`Size ${k + 1}`} className="flex h-8 w-7 items-end justify-center pb-1.5">
          <span className={cn("block w-2 transition-colors", k <= i ? "bg-[var(--box-fg)]" : "bg-[var(--box-line)]")} style={{ height: 6 + k * 3 }} />
        </button>
      ))}
    </div>
  );
}

function Group({ title, count, empty, children }: { title: string; count: number; empty: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-[15px]">{title}</span>
        <span className="label-sm text-[var(--box-faint)]">{count}</span>
      </div>
      {count === 0 ? <div className="text-[13px] text-[var(--box-faint)]">{empty}</div> : <div className="flex flex-col">{children}</div>}
    </div>
  );
}

function Item({ left, title, onClick, swatch, arabic, hand }: { left: string; title: string; onClick: () => void; swatch?: string; arabic?: boolean; hand?: boolean }) {
  return (
    <button type="button" onClick={onClick} className="group flex items-baseline gap-3 border-t border-[var(--box-line)] py-2 text-left transition-colors hover:bg-[var(--box-hover)]">
      <span className="font-mono text-[11px] text-[var(--box-faint)] tabular-nums">{left}</span>
      {swatch && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: { yellow: "#f5e27a", green: "#a2dd8f", pink: "#f3a0c1", blue: "#96c5f4", orange: "#f6b06f" }[swatch] }} />}
      <span className={cn("min-w-0 flex-1 truncate", arabic ? "quran text-right text-[18px]" : hand ? "font-hand text-[19px]" : "font-serif text-[15px]")}>{title}</span>
      <span className="label-sm text-[var(--box-faint)] opacity-0 transition-opacity group-hover:opacity-100">Open →</span>
    </button>
  );
}
