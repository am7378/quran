import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Bookmark, Check, ChevronDown, ChevronLeft, ChevronRight, Copy, Maximize2, Mic, Search, Share2, StickyNote } from "lucide-react";
import { QuillGlyph } from "@/components/glyphs";
import { EASE_IN_OUT, EASE_OUT, cn } from "@/lib/utils";
import { THEMES } from "@/lib/themes";
import { glossFor } from "./terms";

/**
 * The guide: every feature of the reader, one at a time, each shown working on a small stage
 * (words that explain themselves when touched, a highlight drawn, the frame turning over, the
 * slider moving, focus filling the screen) beside a few lines on how to use it.
 */
type Step = { title: string; text: ReactNode; demo: () => ReactNode };

const STEPS: Step[] = [
  {
    title: "One ayah, or many",
    text: "The switch at the top right of the reader: one ayah fills the frame, or many run one after another. Tap the one already chosen for the ways to read: Arabic and translation, either alone, and with many ayahs, either alone as a book.",
    demo: () => <ViewDemo />,
  },
  {
    title: "Touch a word",
    text: "Hover over an Arabic word, or tap it, for its meaning and how it is said; a tap also plays its recitation. Underlined English words explain themselves the same way. Try it here.",
    demo: () => <WordDemo />,
  },
  {
    title: "Highlight",
    text: "Select words, in the Arabic or the English, and they are marked like a highlighter. Choose its colour, copy it, or add a note or a voice note to it. In Saved, see them all, or one colour at a time.",
    demo: () => <HighlightDemo />,
  },
  {
    title: "Each ayah's own tools",
    text: "Beside every ayah: bookmark it, write a note, record a voice note, copy it, or share it as a picture. Make folders in Saved, and a bookmark asks which ones to go in.",
    demo: () => <ToolsDemo />,
  },
  {
    title: "Notes on the page",
    text: "Notes sit over the ayah they belong to. Drag one anywhere; push it against an edge and it tucks away, a corner left to pull it back. The folded corner shares it, as a picture or, for a voice note, a video.",
    demo: () => <NoteDemo />,
  },
  {
    title: "The explanations in brackets",
    text: "Quraan Made Easy explains as it translates: the bold words read on their own, the lighter words in brackets explain. The context switch shows or hides them. Try it.",
    demo: () => <ContextDemo />,
  },
  {
    title: "The other side of the frame",
    text: "The lines beside the frame (on a phone, a swipe in from either side of it) turn it over: what the surah is about, and its themes ayah by ayah. Tap the stage.",
    demo: () => <FlipDemo />,
  },
  {
    title: "Move through the surah",
    text: "The slider under the frame goes straight to any ayah. The quill at its end opens your reflection on the surah: write it, or record it.",
    demo: () => <SliderDemo />,
  },
  {
    title: "Find anything",
    text: "Search by number (18), reference (2:255), name (Kahf, الكهف) or a word (mercy). Index returns to the surahs, and shows them other ways too: by juz, theme or topic, the supplications, the prostrations, the summaries.",
    demo: () => <SearchDemo />,
  },
  {
    title: "Complete a surah",
    text: "At the end of a surah, tick it as completed. Settings → Progress shows every surah you have completed, and a reading goal if you set one.",
    demo: () => <CompleteDemo />,
  },
  {
    title: "Focus",
    text: "The focus button (or F) clears everything away: the frame fills the screen, only the ayahs and their tools stay. Esc, or the corner button, brings it all back.",
    demo: () => <FocusDemo />,
  },
  {
    title: "The site's own menu",
    text: "Right-click anywhere, or tap with two fingers at once on a phone, for a menu of what you can do right there.",
    demo: () => <MenuDemo />,
  },
  {
    title: "Make it yours",
    text: "Five themes, each its own look, type and motion: choose one on the first page, or in Display, with the sizes of the Arabic and the translation and the highlighter's sound.",
    demo: () => <ThemesDemo />,
  },
];

/* ── the keys of a computer (Read.tsx keysNow, Select.tsx): every button's action, listed ── */
const MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const CMD = MAC ? "⌘" : "Ctrl";
const KEYS: { group: string; rows: [string, string[][]][] }[] = [
  {
    group: "Moving through a surah",
    rows: [
      ["Next ayah · previous ayah", [["↓"], ["↑"]]],
      ["A page at a time", [["Space"], ["PgDn"], ["PgUp"]]],
      ["The opening page · the closing page", [["Home"], ["End"]]],
      ["Next surah · previous surah", [["]"], ["["]]],
      ["The surah index", [["I"]]],
    ],
  },
  {
    group: "Opening",
    rows: [
      ["Search", [["/"]]],
      ["Saved", [["S"]]],
      ["Settings", [[","]]],
      ["Reflect on the surah", [["R"]]],
      ["The surah's summary (the frame turned over)", [["T"]]],
      ["These keys", [["?"]]],
      ["Close, go back", [["Esc"]]],
    ],
  },
  {
    group: "The way of reading",
    rows: [
      ["One ayah · many ayahs", [["V"]]],
      ["The bracketed context, on or off", [["C"]]],
      ["Arabic and translation · Arabic · translation", [["M"]]],
      ["Focus", [["F"]]],
    ],
  },
  {
    group: "The ayah in the frame",
    rows: [
      ["Bookmark it", [["B"]]],
      ["Write a note", [["N"]]],
      ["Record a voice note", [["Shift", "N"]]],
      ["Share it as an image", [["P"]]],
      ["Copy it", [[CMD, "C"]]],
    ],
  },
  {
    group: "A highlight (just made, or its menu open)",
    rows: [
      ["Copy its words", [[CMD, "C"]]],
      ["Its colour", [["1"], ["2"], ["3"], ["4"], ["5"]]],
      ["A note on it · a voice note", [["N"], ["Shift", "N"]]],
      ["Share it as an image", [["P"]]],
      ["Remove it", [["Delete"]]],
    ],
  },
  {
    group: "The cover and the index",
    rows: [
      ["Search", [["/"], ["or just type"]]],
      ["Open (the Qur'an, the surah in front)", [["Enter"]]],
      ["Turn the surahs", [["←"], ["→"]]],
      ["Continue where you left off", [["C"]]],
      ["Settings (the index)", [[","]]],
    ],
  },
];

/** "?" asks for the keys: the guide opens on them */
let keysWanted = false;
export const wantKeys = () => {
  keysWanted = true;
};

function KeysList() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!keysWanted) return;
    keysWanted = false;
    ref.current?.scrollIntoView({ block: "start" });
  }, []);
  return (
    <div ref={ref} id="guide-keys" className="mt-4 border-t border-[var(--box-line)] pt-7">
      <h3 className="display font-serif text-[24px] leading-tight italic md:text-[28px]">Keyboard shortcuts</h3>
      <p className="mt-2 max-w-[52ch] text-[14.5px] leading-relaxed text-[var(--box-muted)]">On a computer, every button has its key. Press ? on the reading page to come back here.</p>
      <div className="mt-6 grid gap-x-10 gap-y-7 md:grid-cols-2">
        {KEYS.map((g) => (
          <div key={g.group}>
            <div className="label mb-2.5 text-[var(--box-faint)]">{g.group}</div>
            <div className="flex flex-col">
              {g.rows.map(([what, keys]) => (
                <div key={what} className="flex items-center justify-between gap-4 border-b border-[var(--box-line)] py-[7px] last:border-b-0">
                  <span className="text-[13.5px] text-[var(--box-muted)]">{what}</span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    {keys.map((combo, ci) => (
                      <span key={ci} className="flex items-center gap-0.5">
                        {combo.map((key) => (key.startsWith("or ") ? <span key={key} className="text-[12px] text-[var(--box-faint)]">{key}</span> : <kbd key={key} className="kbd">{key}</kbd>))}
                      </span>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function GuideTab() {
  // (the keys only where there is a keyboard to press them: a computer, a pointer that hovers)
  const [keyboard] = useState(() => typeof matchMedia !== "undefined" && matchMedia("(hover: hover) and (pointer: fine)").matches);
  const [i, setI] = useState(0);
  const step = STEPS[i];
  const go = (d: number) => setI((x) => Math.max(0, Math.min(STEPS.length - 1, x + d)));
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest?.("input, textarea")) return;
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <span className="label text-[var(--box-faint)] tabular-nums">
          {i + 1} / {STEPS.length}
        </span>
        <div className="flex gap-1">
          {STEPS.map((s, k) => (
            <button
              key={s.title}
              type="button"
              aria-label={s.title}
              onClick={() => setI(k)}
              className={cn("pill h-1.5 transition-all duration-300", k === i ? "w-5 bg-[var(--box-accent)]" : "w-1.5 bg-[var(--box-line)] hover:bg-[var(--box-faint)]")}
            />
          ))}
        </div>
      </div>
      <AnimatePresence mode="wait">
        <motion.div
          key={i}
          initial={{ opacity: 0, x: 18 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -18, transition: { duration: 0.16 } }}
          transition={{ duration: 0.35, ease: EASE_OUT }}
          className="flex flex-col gap-4"
        >
          <div className="guide-stage relative aspect-[16/10] w-full overflow-hidden border border-[var(--box-line)] bg-[var(--box-hover)]">{step.demo()}</div>
          <div>
            <h3 className="display font-serif text-[24px] leading-tight italic md:text-[28px]">{step.title}</h3>
            <p className="mt-2 max-w-[52ch] text-[14.5px] leading-relaxed text-[var(--box-muted)]">{step.text}</p>
          </div>
        </motion.div>
      </AnimatePresence>
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => go(-1)} disabled={i === 0} className="btn-secondary pill label flex items-center gap-1 border border-[var(--box-line)] px-3 py-2 disabled:opacity-30">
          <ChevronLeft size={14} /> Back
        </button>
        <button
          type="button"
          onClick={() => (i === STEPS.length - 1 ? setI(0) : go(1))}
          className="btn-primary pill label flex items-center gap-1 border border-[var(--box-fg)] px-3 py-2 hover:bg-[var(--box-fg)] hover:text-[var(--box-bg-solid)]"
        >
          {i === STEPS.length - 1 ? "From the start" : "Next"} <ChevronRight size={14} />
        </button>
      </div>
      {keyboard && <KeysList />}
    </div>
  );
}

/* ── the demos ──────────────────────────────────────────────────── */

/** a value that steps through n states every ms (the demos' slow loops) */
function useLoop(n: number, ms: number) {
  const [k, setK] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setK((x) => (x + 1) % n), ms);
    return () => window.clearInterval(t);
  }, [n, ms]);
  return k;
}

const Mini = ({ children, className }: { children: ReactNode; className?: string }) => (
  <div className={cn("absolute inset-[8%] flex flex-col border border-[var(--box-line)] bg-[var(--box-bg-solid)]", className)}>
    <div className="flex h-6 shrink-0 items-center justify-between border-b border-[var(--box-line)] px-3">
      <span className="font-serif text-[11px] italic">Al-Fātiĥah</span>
      <span className="flex gap-1">
        {[0, 1, 2].map((d) => (
          <span key={d} className="h-1 w-3 bg-[var(--box-line)]" />
        ))}
      </span>
    </div>
    <div className="relative min-h-0 flex-1 overflow-hidden">{children}</div>
  </div>
);

function ViewDemo() {
  const k = useLoop(3, 2400);
  const many = k === 2;
  return (
    <Mini>
      <div className="absolute right-2 top-2 z-10 flex border border-[var(--box-line)] p-0.5">
        {[false, true].map((m) => (
          <span key={String(m)} className={cn("flex h-4 items-center justify-center gap-0.5 transition-all duration-300", m === many ? "w-7 bg-[var(--box-fg)]" : "w-5")}>
            <span className={cn("flex flex-col gap-[2px]", m === many ? "text-[var(--box-bg-solid)]" : "text-[var(--box-muted)]")}>
              {Array.from({ length: m ? 3 : 1 }, (_, i) => (
                <span key={i} className="block h-px w-2.5 bg-current" />
              ))}
            </span>
            {m === many && <ChevronDown size={7} strokeWidth={3} className="text-[var(--box-bg-solid)]" />}
          </span>
        ))}
      </div>
      <AnimatePresence>
        {k === 1 && (
          <motion.div
            className="absolute right-2 top-8 z-20 w-[52%] border border-[var(--box-line)] bg-[var(--box-bg-solid)] p-1 text-[10px] shadow-lg"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease: EASE_OUT }}
          >
            {["Arabic + translation", "Arabic only", "Translation only"].map((l, i) => (
              <div key={l} className={cn("flex items-center gap-1.5 px-1.5 py-1", i === 0 && "bg-[var(--box-hover)]")}>
                <Check size={9} strokeWidth={3} className={i === 0 ? "text-[var(--color-gold)]" : "text-transparent"} />
                {l}
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence mode="wait">
        {many ? (
          <motion.div key="many" className="flex h-full flex-col gap-3 px-6 py-5" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            {["ٱلۡحَمۡدُ لِلَّهِ رَبِّ ٱلۡعَٰلَمِينَ", "ٱلرَّحۡمَٰنِ ٱلرَّحِيمِ", "مَٰلِكِ يَوۡمِ ٱلدِّينِ"].map((t, i) => (
              <div key={i} className="border-b border-[var(--box-line)] pb-2">
                <div className="quran text-[17px]">{t}</div>
                <div className="mt-1 h-1.5 w-3/4 bg-[var(--box-line)]" />
              </div>
            ))}
          </motion.div>
        ) : (
          <motion.div key="one" className="flex h-full flex-col items-center justify-center gap-3 px-6" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <div className="quran text-[28px]">ٱلۡحَمۡدُ لِلَّهِ رَبِّ ٱلۡعَٰلَمِينَ</div>
            <div className="h-1.5 w-2/3 bg-[var(--box-line)]" />
            <div className="h-1.5 w-1/2 bg-[var(--box-line)]" />
          </motion.div>
        )}
      </AnimatePresence>
    </Mini>
  );
}

// 1:2, its words as the reader gives them, and Quraan Made Easy's English for it
const WORDS = [
  { a: "ٱلۡحَمۡدُ", m: "All praises and thanks", t: "al-ḥamdu" },
  { a: "لِلَّهِ", m: "(be) to Allah", t: "lillahi" },
  { a: "رَبِّ", m: "the Lord", t: "rabbi" },
  { a: "ٱلۡعَٰلَمِينَ", m: "of the universe", t: "l-ʿālamīna" },
];

function WordDemo() {
  const auto = useLoop(WORDS.length, 1800);
  const [hover, setHover] = useState<number | null>(null);
  const [gl, setGl] = useState(false);
  const gloss = glossFor("Rabb");
  const k = hover ?? auto;
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 px-5">
      <div className="quran flex flex-wrap justify-center gap-x-3 text-[28px] md:text-[34px]" dir="rtl">
        {WORDS.map((w, i) => (
          <span
            key={i}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            onClick={() => setHover(i)}
            className={cn("relative cursor-pointer transition-colors", i === k && !gl && "text-[var(--box-accent)]")}
          >
            {w.a}
            {i === k && !gl && (
              <motion.span
                layoutId="guide-tip"
                className="absolute bottom-full left-1/2 z-10 mb-2 w-max -translate-x-1/2 border-t-2 border-[var(--color-gold)] bg-[var(--tip-bg)] px-3 py-1.5 text-center font-sans text-[var(--tip-fg)] shadow-lg"
                dir="ltr"
                transition={{ duration: 0.3, ease: EASE_OUT }}
              >
                <span className="block text-[13px] leading-tight">{w.m}</span>
                <span className="label-sm mt-0.5 block opacity-60">{w.t}</span>
              </motion.span>
            )}
          </span>
        ))}
      </div>
      {/* its underlined word opens the glossary, as in the reader */}
      <p className="relative max-w-[34ch] text-center font-serif text-[15px] leading-relaxed">
        All praise belongs to Allaah, the{" "}
        <span className="gl" onMouseEnter={() => setGl(true)} onMouseLeave={() => setGl(false)} onClick={() => setGl((o) => !o)}>
          Rabb
        </span>{" "}
        <span className="ctx">(the Cherisher, the Creator, the Sustainer)</span> of the universe <span className="ctx">(and whatever it contains)...</span>
        <AnimatePresence>
          {gl && gloss && (
            <motion.span
              className="absolute bottom-full left-1/2 z-10 mb-3 block w-[min(300px,72vw)] -translate-x-1/2 border-t-2 border-[var(--color-gold)] bg-[var(--tip-bg)] px-3 py-2 text-left font-sans text-[12px] leading-snug text-[var(--tip-fg)] shadow-lg"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25, ease: EASE_OUT }}
            >
              <span className="label-sm block opacity-70">{gloss.term}</span>
              <span className="mt-1 block">{gloss.text.split(". ")[0]}.</span>
            </motion.span>
          )}
        </AnimatePresence>
      </p>
    </div>
  );
}

const HL = ["#f5e27a", "#a2dd8f", "#f3a0c1", "#96c5f4", "#f6b06f"];

function HighlightDemo() {
  const k = useLoop(4, 1600);
  const color = HL[Math.floor(Date.now() / 6400) % HL.length];
  return (
    <div className="flex h-full flex-col justify-center gap-4 px-8 md:px-12">
      <p className="relative font-serif text-[17px] leading-relaxed md:text-[19px]">
        Allaah <span className="ctx">(is such that)</span> besides Him there is no Ilaah,{" "}
        <span className="relative inline">
          <motion.span
            className="absolute inset-y-[-2px] left-0 -z-0"
            style={{ background: color }}
            initial={false}
            animate={{ width: k === 0 ? "0%" : "100%" }}
            transition={{ duration: k === 1 ? 0.6 : 0.2, ease: EASE_IN_OUT }}
          />
          <span className={cn("relative transition-colors duration-300", k > 0 && "text-[#111]")}>He is Ever Living, The Maintainer</span>
        </span>{" "}
        <span className="ctx">(of everything).</span>
      </p>
      <AnimatePresence>
        {k >= 2 && (
          <motion.div className="flex w-max items-center gap-1 border border-[var(--box-line)] bg-[var(--box-bg-solid)] p-1.5 shadow-lg" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            {HL.map((c) => (
              <span key={c} className={cn("h-4 w-4 rounded-full", c === color && "ring-2 ring-[var(--box-fg)] ring-offset-2 ring-offset-[var(--box-bg-solid)]")} style={{ background: c }} />
            ))}
            <span className="mx-1 h-4 w-px bg-[var(--box-line)]" />
            <Copy size={13} /> <StickyNote size={13} /> <Mic size={13} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ToolsDemo() {
  const k = useLoop(6, 900);
  const tools = [
    [Bookmark, "Bookmark"],
    [StickyNote, "Note"],
    [Mic, "Voice note"],
    [Copy, "Copy"],
    [Share2, "Share"],
  ] as const;
  return (
    <div className="flex h-full items-center justify-center gap-10 px-6">
      <div className="quran text-[26px]">ٱللَّهُ لَآ إِلَٰهَ إِلَّا هُوَ</div>
      <div className="flex flex-col gap-1">
        {tools.map(([I, l], i) => (
          <motion.div key={l} className="flex items-center gap-3" animate={{ opacity: k >= i ? 1 : 0.25, x: k === i ? 4 : 0 }} transition={{ duration: 0.3 }}>
            <span className={cn("flex h-7 w-7 items-center justify-center", k === i && "bg-[var(--box-hover)] text-[var(--box-accent)]")}>
              <I size={14} />
            </span>
            <span className="label">{l}</span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function NoteDemo() {
  const k = useLoop(3, 2000);
  return (
    <div className="relative h-full">
      <motion.div
        className="note-paper absolute top-[18%] h-[58%] w-[34%] p-3 shadow-xl"
        animate={{ left: k === 0 ? "18%" : k === 1 ? "52%" : "92%", rotate: k === 2 ? 0 : -3 }}
        transition={{ duration: 0.9, ease: EASE_IN_OUT }}
      >
        <span className="block font-mono text-[8px] uppercase tracking-[0.14em] text-[#6b5a24]">ayah 2:255</span>
        <span className="mt-1 block font-hand text-[17px] leading-tight text-[#2b2410]">Read before sleeping</span>
      </motion.div>
      <span className="label absolute bottom-3 left-1/2 -translate-x-1/2 text-[var(--box-faint)]">{["Drag it…", "anywhere…", "or tuck it away"][k]}</span>
    </div>
  );
}

function ContextDemo() {
  const [on, setOn] = useState(true);
  return (
    <div className="flex h-full flex-col justify-center gap-5 px-8 md:px-12">
      <p className="font-serif text-[17px] leading-relaxed md:text-[19px]">
        <span className="font-[560]">Allaah</span>
        <AnimatePresence initial={false}>
          {on && (
            <motion.span className="ctx" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {" "}(is such that)
            </motion.span>
          )}
        </AnimatePresence>{" "}
        <span className="font-[560]">besides Him there is no Ilaah, He is Ever Living, The Maintainer</span>
        <AnimatePresence initial={false}>
          {on && (
            <motion.span className="ctx" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {" "}(of everything).
            </motion.span>
          )}
        </AnimatePresence>
        .
      </p>
      <button type="button" onClick={() => setOn((x) => !x)} className="label flex w-max items-center gap-2 text-[var(--box-muted)] hover:text-[var(--box-fg)]" aria-pressed={on}>
        ( context )
        <span className={cn("pill relative inline-block h-[11px] w-[20px] border", on ? "border-[var(--box-accent)]" : "border-current")}>
          <span className={cn("pill absolute top-[1.5px] h-[6px] w-[6px] transition-all duration-300", on ? "left-[11px] bg-[var(--box-accent)]" : "left-[1.5px] bg-current")} />
        </span>
      </button>
    </div>
  );
}

function FlipDemo() {
  const auto = useLoop(2, 2600);
  const [manual, setManual] = useState<number | null>(null);
  const back = (manual ?? auto) === 1;
  return (
    <button type="button" onClick={() => setManual((m) => ((m ?? auto) === 1 ? 0 : 1))} className="absolute inset-0 cursor-pointer" style={{ perspective: 900 }} aria-label="Turn the frame over">
      <motion.div className="absolute inset-[12%]" animate={{ rotateY: back ? -180 : 0 }} transition={{ duration: 0.9, ease: EASE_IN_OUT }} style={{ transformStyle: "preserve-3d" }}>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 border border-[var(--box-line)] bg-[var(--box-bg-solid)]" style={{ backfaceVisibility: "hidden" }}>
          <span className="quran text-[26px]">ٱلۡحَمۡدُ لِلَّهِ</span>
          <span className="h-1.5 w-1/2 bg-[var(--box-line)]" />
        </div>
        <div className="dark-scope absolute inset-0 flex flex-col justify-center gap-2 border border-[var(--box-line)] bg-[var(--panel-bg)] px-6 text-left text-[var(--box-fg)]" style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}>
          <span className="label text-[var(--box-accent)]">Summary</span>
          <span className="font-serif text-[16px] italic">What the surah is about</span>
          <span className="h-1.5 w-4/5 bg-[var(--box-line)]" />
          <span className="h-1.5 w-3/5 bg-[var(--box-line)]" />
        </div>
      </motion.div>
      <motion.span className="absolute right-[6%] top-1/2 h-12 w-[3px] -translate-y-1/2" animate={{ backgroundColor: back ? "var(--box-line)" : "var(--box-accent)" }} />
    </button>
  );
}

function SliderDemo() {
  const k = useLoop(4, 1300);
  const at = [0.08, 0.42, 0.78, 0.97][k];
  return (
    <div className="flex h-full flex-col items-center justify-center gap-8 px-8">
      <div className="label text-[var(--box-faint)] tabular-nums">Ayah {Math.max(1, Math.round(at * 286))} of 286</div>
      <div className="flex w-full items-center gap-3">
        <span className="label-sm text-[var(--box-faint)]">1</span>
        <div className="relative h-[3px] flex-1 bg-[var(--box-line)]">
          <motion.div className="absolute inset-y-0 left-0 bg-[var(--box-fg)]" animate={{ width: `${at * 100}%` }} transition={{ duration: 0.8, ease: EASE_IN_OUT }} />
          <motion.span className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--box-fg)] shadow" animate={{ left: `${at * 100}%` }} transition={{ duration: 0.8, ease: EASE_IN_OUT }} />
        </div>
        <span className="label-sm text-[var(--box-faint)]">286</span>
        <motion.span animate={{ color: k === 3 ? "var(--color-gold)" : "var(--box-fg)", scale: k === 3 ? 1.15 : 1 }}>
          <QuillGlyph size={17} />
        </motion.span>
      </div>
    </div>
  );
}

function SearchDemo() {
  const word = "mercy";
  const k = useLoop(word.length + 4, 380);
  const typed = word.slice(0, Math.min(word.length, k));
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-8">
      <div className="search-input flex w-full max-w-[360px] items-center gap-2">
        <Search size={13} className="shrink-0 opacity-60" />
        <span>{typed}</span>
        <motion.span className="h-3.5 w-px bg-current" animate={{ opacity: [1, 0, 1] }} transition={{ repeat: Infinity, duration: 1 }} />
      </div>
      <AnimatePresence>
        {k >= word.length && (
          <motion.div className="w-full max-w-[360px] border border-[var(--box-line)] bg-[var(--box-bg-solid)]" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            {["7:156 … My mercy encompasses all things", "39:53 … do not despair of the mercy of Allaah", "21:107 … a mercy to the worlds"].map((r) => (
              <div key={r} className="border-b border-[var(--box-line)] px-3 py-2 font-serif text-[13px] last:border-b-0">
                {r}
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function CompleteDemo() {
  const done = useLoop(2, 2200) === 1;
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 px-8 text-center">
      <div className="label text-[var(--box-faint)]">End of Al-Fātiĥah</div>
      <div className="flex items-center gap-3">
        <span className={cn("flex h-7 w-7 items-center justify-center rounded-full border transition-colors duration-300", done ? "border-[var(--box-fg)] bg-[var(--box-fg)] text-[var(--box-bg-solid)]" : "border-[var(--box-muted)] text-transparent")}>
          <Check size={15} strokeWidth={2.2} />
        </span>
        <span className="text-left">
          <span className="block text-[14px]">{done ? "Completed" : "Mark as completed"}</span>
          <span className="label-sm block text-[var(--box-faint)]">{done ? "Today" : ""}</span>
        </span>
      </div>
      <div className="w-[70%]">
        <div className="flex items-baseline justify-between">
          <span className="label-sm text-[var(--box-faint)]">Progress</span>
          <span className="label-sm tabular-nums text-[var(--box-muted)]">{done ? 13 : 12} of 114</span>
        </div>
        <div className="mt-1.5 h-[3px] w-full bg-[var(--box-line)]">
          <motion.div className="h-full bg-[var(--box-fg)]" animate={{ width: `${((done ? 13 : 12) / 114) * 100}%` }} transition={{ duration: 0.6, ease: EASE_OUT }} />
        </div>
      </div>
    </div>
  );
}

function FocusDemo() {
  const on = useLoop(2, 2400) === 1;
  return (
    <div className="relative h-full">
      <motion.div className="absolute flex flex-col border border-[var(--box-line)] bg-[var(--box-bg-solid)]" animate={on ? { inset: "0%" } : { inset: "14%" }} transition={{ duration: 0.8, ease: EASE_IN_OUT }}>
        <motion.div className="flex shrink-0 items-center justify-between overflow-hidden border-b border-[var(--box-line)] px-3" animate={{ height: on ? 0 : 22, opacity: on ? 0 : 1 }}>
          <span className="font-serif text-[11px] italic">Al-Baqarah</span>
          <Maximize2 size={10} className="text-[var(--box-accent)]" />
        </motion.div>
        <div className="flex flex-1 items-center justify-center">
          <span className="quran text-[26px]">ٱللَّهُ لَآ إِلَٰهَ إِلَّا هُوَ</span>
        </div>
      </motion.div>
      <motion.div className="absolute bottom-[5%] left-[20%] right-[20%] h-[3px] bg-[var(--box-line)]" animate={{ opacity: on ? 0 : 1 }} />
    </div>
  );
}

function MenuDemo() {
  const k = useLoop(3, 1500);
  return (
    <div className="relative h-full">
      <motion.span className="absolute h-3 w-3 rotate-45 border-l-2 border-t-2 border-[var(--box-fg)]" animate={{ left: k === 0 ? "30%" : "46%", top: k === 0 ? "60%" : "34%" }} transition={{ duration: 0.7, ease: EASE_IN_OUT }} />
      <AnimatePresence>
        {k >= 1 && (
          <motion.div className="absolute left-[48%] top-[38%] w-[200px] border border-[var(--box-line)] bg-[var(--box-bg-solid)] py-1 shadow-xl" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
            {["Copy ayah", "Share ayah", "Bookmark", "Multiple ayahs", "Hide the bracketed context"].map((l, i) => (
              <div key={l} className={cn("px-3 py-1.5 text-[12px]", k === 2 && i === 1 && "bg-[var(--box-hover)]")}>
                {l}
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ThemesDemo() {
  const k = useLoop(THEMES.length, 1500);
  const t = { name: THEMES[k].name, ...THEMES[k].preview };
  return (
    <motion.div className="absolute inset-0 flex items-center justify-center" animate={{ backgroundColor: t.bg }} transition={{ duration: 0.6 }}>
      <motion.div className="flex h-[64%] w-[62%] flex-col items-center justify-center gap-2" animate={{ backgroundColor: t.box, borderRadius: t.r, color: t.fg }} style={{ border: t.b }} transition={{ duration: 0.6 }}>
        <span className="quran text-[24px]">بِسۡمِ ٱللَّهِ</span>
        <motion.span className="h-[3px] w-10" animate={{ backgroundColor: t.ac }} />
        <span className="font-sans text-[11px] uppercase tracking-[0.2em]" style={{ color: t.fg }}>
          {t.name}
        </span>
      </motion.div>
    </motion.div>
  );
}
