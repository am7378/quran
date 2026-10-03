import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronDown, Search } from "lucide-react";
import { arabicText, loadSummaries, pad3, translationText, TRANSLATIONS, type Surah, type SummarySection, type Verse } from "@/lib/data";
import { useStore } from "@/lib/store";
import { EASE_OUT, cn } from "@/lib/utils";

/**
 * The index, seen other ways than the ring of surahs: by juz, by where each surah was revealed,
 * by the themes of each surah, by topic, the supplications, the prostrations, and the summaries.
 * Every one is taken from the books or the mushaf, nothing guessed: the themes and topics and
 * supplications are The Clear Quran's (its headings, its thematic index), the summaries Quraan
 * Made Easy's, the prostrations where the Madani mushaf sets the sign.
 */
export type IndexKind = "ring" | "juz" | "revelation" | "themes" | "topics" | "duas" | "sajdah" | "summaries";
export const INDEX_VIEWS: { id: IndexKind; name: string; line: string }[] = [
  { id: "ring", name: "Surahs", line: "The 114, one after another" },
  { id: "juz", name: "Juz", line: "The thirty parts" },
  { id: "revelation", name: "Makkan · Madinan", line: "Where each surah was revealed" },
  { id: "themes", name: "Themes", line: "Each surah's themes, ayah by ayah" },
  { id: "topics", name: "Topics", line: "Patience, prayer, the prophets…" },
  { id: "duas", name: "Supplications", line: "The du'ās, by who made them" },
  { id: "sajdah", name: "Prostrations", line: "The fifteen ayat of sajdah" },
  { id: "summaries", name: "Summaries", line: "What each surah is about" },
];

type Open = (surah: number, ayah: number) => void;
type Ref = [number, number] | [number, number, number];
type Collections = { duas: { who: string; refs: Ref[] }[]; sajdah: [number, number, number][]; verses: Record<string, Verse>; juzOpen: Record<string, string> };
// the index's own outline: ۩ DOCTRINE › A) … › a. … › 1) … › topics (mark: the book's A) a. 1))
type TopicHead = { kind: "section" | "group" | "sub" | "item"; title: string; mark?: string };
type Topic = { kind: "topic"; title: string; mark?: string; entries: (string | Ref)[][] };
type TopicNode = TopicHead | Topic;

const cache = new Map<string, Promise<unknown>>();
function load<T>(file: string): Promise<T> {
  let p = cache.get(file);
  if (!p) {
    p = fetch(`${import.meta.env.BASE_URL}data/${file}`).then((r) => r.json());
    p.catch(() => cache.delete(file));
    cache.set(file, p);
  }
  return p as Promise<T>;
}
function useData<T>(file: string) {
  const [d, setD] = useState<T | null>(null);
  useEffect(() => {
    let live = true;
    load<T>(file).then((x) => live && setD(x));
    return () => {
      live = false;
    };
  }, [file]);
  return d;
}

export function IndexView({ kind, surahs, juz, onOpen, mobile }: { kind: IndexKind; surahs: Surah[]; juz: Record<string, string>; onOpen: Open; mobile: boolean }) {
  return (
    <div className="thin-scroll h-full overflow-y-auto overscroll-contain px-5 pb-10 md:px-8">
      {kind === "juz" && <JuzView surahs={surahs} juz={juz} onOpen={onOpen} />}
      {kind === "revelation" && <RevelationView surahs={surahs} onOpen={onOpen} />}
      {kind === "themes" && <ThemesView surahs={surahs} onOpen={onOpen} />}
      {kind === "topics" && <TopicsView surahs={surahs} onOpen={onOpen} />}
      {kind === "duas" && <DuasView surahs={surahs} onOpen={onOpen} />}
      {kind === "sajdah" && <SajdahView surahs={surahs} onOpen={onOpen} />}
      {kind === "summaries" && <SummariesView surahs={surahs} onOpen={onOpen} mobile={mobile} />}
    </div>
  );
}

/* ── small parts ──────────────────────────────────────────────── */

function Source({ children }: { children: ReactNode }) {
  return <div className="label-sm mb-5 text-[var(--box-faint)]">{children}</div>;
}

function Filter({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="search-input mb-5 flex h-10 items-center gap-2.5 border-b border-[var(--box-line)] focus-within:border-[var(--color-gold)]">
      <Search size={15} strokeWidth={1.5} className="shrink-0 text-[var(--box-faint)]" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent text-[14px] text-[var(--box-fg)] outline-none placeholder:text-[var(--box-faint)]"
      />
      {value && (
        <button type="button" onClick={() => onChange("")} className="label-sm text-[var(--box-faint)] hover:text-[var(--box-fg)]">
          Clear
        </button>
      )}
    </label>
  );
}

/** "2:153–157", a tap opens the reader there */
function RefChip({ r, onOpen }: { r: Ref; onOpen: Open }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(r[0], r[1])}
      className="pill mx-0.5 my-0.5 inline-flex h-6 items-center border border-[var(--box-line)] px-1.5 align-middle font-mono text-[11px] tabular-nums text-[var(--box-muted)] transition-colors hover:border-[var(--box-fg)] hover:text-[var(--box-fg)]"
    >
      {r[0]}:{r[1]}
      {r[2] ? `–${r[2]}` : ""}
    </button>
  );
}

function SurahLine({ s, right, onClick, open }: { s: Surah; right?: ReactNode; onClick: (e?: React.MouseEvent) => void; open?: boolean }) {
  const folds = open !== undefined;
  return (
    <button type="button" onClick={(e) => onClick(e)} aria-expanded={folds ? open : undefined} className="group flex w-full items-center gap-3 border-t border-[var(--box-line)] py-2.5 text-left transition-colors hover:bg-[var(--box-hover)]">
      {folds && <Fold open={!!open} />}
      <span className="w-[3.2ch] shrink-0 font-mono text-[11px] text-[var(--box-faint)] tabular-nums">{pad3(s.n)}</span>
      <span className="min-w-0 flex-1 truncate font-serif text-[17px] italic">{s.tc}</span>
      <span className="font-kufi text-[15px] text-[var(--box-muted)]" dir="rtl">
        {s.ar}
      </span>
      {right}
      {!folds && <Go />}
    </button>
  );
}

/** the round arrow in front of a row that opens: down, or up once open */
function Fold({ open }: { open: boolean }) {
  return (
    <span
      className={cn(
        "pill flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors duration-300",
        open ? "border-[var(--box-fg)] text-[var(--box-fg)]" : "border-[var(--box-line)] text-[var(--box-muted)] group-hover:border-[var(--box-fg)] group-hover:text-[var(--box-fg)]",
      )}
    >
      <ChevronDown size={13} strokeWidth={2} className={cn("transition-transform duration-300", open && "rotate-180")} />
    </span>
  );
}

/** the arrow at the end of a row that opens the reader */
const Go = () => <span className="shrink-0 text-[13px] text-[var(--box-faint)] transition-all duration-300 group-hover:translate-x-0.5 group-hover:text-[var(--box-fg)]">→</span>;

/** a theme, a part of a topic: a row that opens the reader at its ayah */
function Line({ n, children, onClick }: { n: ReactNode; children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="group -mx-2 flex w-[calc(100%+1rem)] items-baseline gap-3 px-2 py-1.5 text-left transition-colors hover:bg-[var(--box-hover)]">
      <span className="w-[4ch] shrink-0 font-mono text-[11px] tabular-nums text-[var(--box-faint)]">{n}</span>
      <span className="min-w-0 flex-1 text-[14.5px] leading-snug transition-colors group-hover:text-[var(--color-gold)]">{children}</span>
      <Go />
    </button>
  );
}

/**
 * An open list keeps its row in view: the row stays at the top while its list scrolls under it, so
 * closing it never needs a scroll back up. Closing a list scrolled past brings its row back first.
 */
function useFold() {
  const [open, setOpen] = useState<number | null>(null);
  const toggle = (k: number, el: HTMLElement | null) => {
    if (open === k && el) {
      // the row sits in its sticky header, inside the block holding the list
      const sc = el.closest<HTMLElement>(".thin-scroll");
      const block = el.parentElement?.parentElement;
      const above = sc && block ? block.getBoundingClientRect().top - sc.getBoundingClientRect().top : 0;
      if (sc && above < 0) sc.scrollTop += above;
    }
    setOpen((o) => (o === k ? null : k));
  };
  return [open, toggle] as const;
}

const Loading = () => <div className="label py-10 text-center text-[var(--box-faint)]">Opening…</div>;

/** An ayah's Arabic and its translation (the reader's own choice of each). */
function AyahText({ v, size = 22 }: { v: Verse; size?: number }) {
  const settings = useStore((s) => s.settings);
  return (
    <>
      <p className="quran text-right leading-[2]" style={{ fontSize: size }} dir="rtl" lang="ar">
        {arabicText(v, settings.script)}
      </p>
      <p className="mt-1.5 font-serif text-[15.5px] leading-relaxed text-[var(--box-fg)]/90" dir="ltr">
        {translationText(v, settings.translation, settings.showContext)}
      </p>
    </>
  );
}

/* ── by juz ───────────────────────────────────────────────────── */

function JuzView({ surahs, juz, onOpen }: { surahs: Surah[]; juz: Record<string, string>; onOpen: Open }) {
  const col = useData<Collections>("collections.json");
  const parts = useMemo(() => {
    const starts = Array.from({ length: 30 }, (_, i) => juz[String(i + 1)].split(":").map(Number) as [number, number]);
    return starts.map(([s, a], i) => {
      const next = starts[i + 1];
      const end: [number, number] = next ? (next[1] > 1 ? [next[0], next[1] - 1] : [next[0] - 1, surahs[next[0] - 2].count]) : [114, 6];
      const list: number[] = [];
      for (let n = s; n <= end[0]; n++) list.push(n);
      return { n: i + 1, s, a, end, list };
    });
  }, [juz, surahs]);
  return (
    <>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {parts.map((p) => (
          <div key={p.n} className="flex flex-col border border-[var(--box-line)] p-3.5 transition-colors hover:border-[var(--box-muted)]">
            <button type="button" onClick={() => onOpen(p.s, p.a)} className="text-left">
              <div className="flex items-baseline justify-between gap-3">
                <span className="flex items-baseline gap-2">
                  <span className="label text-[var(--box-faint)]">Juz</span>
                  <span className="display font-serif text-[26px] leading-none italic tabular-nums">{p.n}</span>
                </span>
                <span className="label-sm tabular-nums text-[var(--box-faint)]">
                  {p.s}:{p.a} – {p.end[0]}:{p.end[1]}
                </span>
              </div>
              <div className="quran mt-2 truncate text-right text-[19px] leading-[1.9] text-[var(--box-fg)]" dir="rtl" lang="ar">
                {col?.juzOpen[String(p.n)] ?? " "}
              </div>
            </button>
            <div className="mt-1.5 flex flex-wrap gap-x-2 gap-y-0.5">
              {p.list.map((n) => (
                <button key={n} type="button" onClick={() => onOpen(n, n === p.s ? p.a : 1)} className="text-[12.5px] text-[var(--box-muted)] transition-colors hover:text-[var(--box-fg)]">
                  {surahs[n - 1].tc}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

/* ── Makkan and Madinan ───────────────────────────────────────── */

function RevelationView({ surahs, onOpen }: { surahs: Surah[]; onOpen: Open }) {
  const cols: [string, Surah[]][] = [
    ["Makkan", surahs.filter((s) => s.place === "makkah")],
    ["Madinan", surahs.filter((s) => s.place === "madinah")],
  ];
  return (
    <>
      <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
        {cols.map(([name, list]) => (
          <div key={name}>
            <div className="mb-2 flex items-baseline justify-between">
              <span className="display font-serif text-[24px] italic">{name}</span>
              <span className="label text-[var(--box-faint)]">{list.length} surahs</span>
            </div>
            {list.map((s) => (
              <SurahLine key={s.n} s={s} onClick={() => onOpen(s.n, 1)} right={<span className="label-sm w-[5ch] text-right tabular-nums text-[var(--box-faint)]">{s.count}</span>} />
            ))}
          </div>
        ))}
      </div>
    </>
  );
}

/* ── the themes of each surah ─────────────────────────────────── */

function ThemesView({ surahs, onOpen }: { surahs: Surah[]; onOpen: Open }) {
  const themes = useData<Record<string, [number, string][]>>("themes.json");
  const [q, setQ] = useState("");
  const [open, toggle] = useFold();
  const needle = q.trim().toLowerCase();
  if (!themes) return <Loading />;
  return (
    <>
      <Source>From The Clear Quran</Source>
      <Filter value={q} onChange={setQ} placeholder="Find a theme: mercy, Moses, charity…" />
      {surahs.map((s) => {
        const all = themes[String(s.n)] ?? [];
        const list = needle ? all.filter(([, h]) => h.toLowerCase().includes(needle)) : all;
        if (needle && !list.length) return null;
        const shown = !!needle || open === s.n;
        return (
          <div key={s.n}>
            <div className={cn(shown && "sticky top-0 z-[5] bg-[var(--box-bg-solid)]")}>
              <SurahLine
                s={s}
                open={shown}
                onClick={(e?: React.MouseEvent) => !needle && toggle(s.n, (e?.currentTarget as HTMLElement) ?? null)}
                right={<span className="label-sm w-[3ch] text-right tabular-nums text-[var(--box-faint)]">{list.length}</span>}
              />
            </div>
            <AnimatePresence initial={false}>
              {shown && (
                <motion.div className="overflow-hidden" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3, ease: EASE_OUT }}>
                  <div className="mb-3 ml-[calc(1.5rem+0.75rem)] border-l border-[var(--box-line)] pl-3">
                    {list.map(([a, h]) => (
                      <Line key={a} n={a} onClick={() => onOpen(s.n, a)}>
                        {h}
                      </Line>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </>
  );
}

/* ── topics: The Clear Quran's thematic index ─────────────────── */

function TopicsView({ surahs, onOpen }: { surahs: Surah[]; onOpen: Open }) {
  const data = useData<{ nodes: TopicNode[] }>("topics.json");
  const themes = useData<Record<string, [number, string][]>>("themes.json");
  const [q, setQ] = useState("");
  const [open, toggleOne] = useFold();
  const needle = q.trim().toLowerCase();
  if (!data) return <Loading />;
  const text = (e: (string | Ref)[]) => e.filter((x) => typeof x === "string").join(" ").toLowerCase();
  // with a search, the topics that match (by name or by any of their parts), each under its section
  const rows: { node: TopicNode; i: number; entries?: (string | Ref)[][] }[] = [];
  data.nodes.forEach((n, i) => {
    if (n.kind !== "topic") {
      if (!needle) rows.push({ node: n, i });
      else if (n.kind === "section") rows.push({ node: n, i });
      return;
    }
    if (!needle) return rows.push({ node: n, i });
    const hit = n.title.toLowerCase().includes(needle);
    const entries = hit ? n.entries : n.entries.filter((e) => text(e).includes(needle));
    if (entries.length) rows.push({ node: n, i, entries });
  });
  const cleaned = needle ? rows.filter((r, k) => r.node.kind !== "section" || (rows[k + 1] && rows[k + 1].node.kind === "topic")) : rows;
  return (
    <>
      <Source>The Clear Quran's thematic index</Source>
      <Filter value={q} onChange={setQ} placeholder="Find a topic: patience, forgiveness, parents…" />
      {needle && cleaned.length === 0 && <div className="py-6 text-center text-[13.5px] text-[var(--box-muted)]">Nothing in the index for “{q.trim()}”.</div>}
      {cleaned.map(({ node, i, entries }) => {
        if (node.kind === "section") return <div key={i} className="display mb-2 mt-8 font-serif text-[28px] italic first:mt-0">{node.title}</div>;
        // each level of the book's outline its own kind of heading, set apart from the topic above it
        if (node.kind === "group")
          return (
            <div key={i} className="mb-1 mt-10 flex items-baseline gap-2.5 border-b border-[var(--box-line)] pb-2">
              {node.mark && <span className="label text-[var(--color-gold)]">{node.mark}</span>}
              <span className="font-serif text-[20px] leading-tight">{node.title}</span>
            </div>
          );
        if (node.kind === "sub")
          return (
            <div key={i} className="label mb-1 mt-7 text-[var(--box-muted)]">
              {node.mark && <span className="mr-2 text-[var(--color-gold)]">{node.mark}</span>}
              {node.title}
            </div>
          );
        if (node.kind === "item")
          return (
            <div key={i} className="mb-0.5 mt-5 font-serif text-[15.5px] italic leading-snug text-[var(--box-muted)]">
              {node.mark && <span className="mr-1.5 font-mono text-[12px] not-italic text-[var(--box-faint)]">{node.mark}</span>}
              {node.title}
            </div>
          );
        const t = node as Topic;
        const shown = !!needle || open === i || !t.title;
        const list = entries ?? t.entries;
        const count = list.reduce((n, e) => n + e.filter((x) => typeof x !== "string").length, 0);
        return (
          <div key={i} className="border-t border-[var(--box-line)]">
            {node.title && (
              <div className={cn(shown && !needle && "sticky top-0 z-[5] bg-[var(--box-bg-solid)]")}>
                <button
                  type="button"
                  onClick={(e) => !needle && toggleOne(i, e.currentTarget)}
                  aria-expanded={shown}
                  className="group flex w-full items-center gap-3 py-2.5 text-left transition-colors hover:bg-[var(--box-hover)]"
                >
                  {!needle && <Fold open={shown} />}
                  <span className="min-w-0 flex-1 font-serif text-[16.5px]">
                    {t.mark && <span className="mr-1.5 font-mono text-[12px] text-[var(--box-faint)]">{t.mark}</span>}
                    {node.title}
                  </span>
                  <span className="label-sm tabular-nums text-[var(--box-faint)]">{count}</span>
                </button>
              </div>
            )}
            <AnimatePresence initial={false}>
              {shown && (
                <motion.ul className="overflow-hidden" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3, ease: EASE_OUT }}>
                  <div className={cn("flex flex-col gap-1.5 pb-3", node.title && !needle && "ml-[calc(1.5rem+0.75rem)] border-l border-[var(--box-line)] pl-3")}>
                    {list.map((e, k) => (
                      <li key={k} className="text-[14px] leading-relaxed text-[var(--box-fg)]/90">
                        {e.map((x, j) => (typeof x === "string" ? <span key={j}>{x} </span> : <RefChip key={j} r={x} onOpen={onOpen} />))}
                      </li>
                    ))}
                  </div>
                </motion.ul>
              )}
            </AnimatePresence>
          </div>
        );
      })}
      {needle.length > 2 && themes && <ThemeHits themes={themes} needle={needle} surahs={surahs} onOpen={onOpen} />}
    </>
  );
}

/** a search's matches among the surahs' theme headings, under the index's own */
function ThemeHits({ themes, needle, surahs, onOpen }: { themes: Record<string, [number, string][]>; needle: string; surahs: Surah[]; onOpen: Open }) {
  const hits: [number, number, string][] = [];
  for (const [s, list] of Object.entries(themes)) for (const [a, h] of list) if (h.toLowerCase().includes(needle)) hits.push([Number(s), a, h]);
  if (!hits.length) return null;
  return (
    <div className="mt-8">
      <div className="label mb-1 text-[var(--color-gold)]">In the surahs' themes</div>
      <div className="label-sm mb-2 text-[var(--box-faint)]">The Clear Quran's headings that name it, where each theme begins</div>
      {hits.slice(0, 60).map(([s, a, h]) => (
        <button key={`${s}:${a}`} type="button" onClick={() => onOpen(s, a)} className="flex w-full items-baseline gap-3 border-t border-[var(--box-line)] py-2 text-left transition-colors hover:bg-[var(--box-hover)]">
          <span className="w-[7ch] shrink-0 font-mono text-[11px] tabular-nums text-[var(--box-faint)]">
            {s}:{a}
          </span>
          <span className="min-w-0 flex-1 text-[14.5px]">{h}</span>
          <span className="hidden shrink-0 font-serif text-[13px] italic text-[var(--box-muted)] sm:inline">{surahs[s - 1]?.tc}</span>
        </button>
      ))}
    </div>
  );
}

/* ── the supplications ────────────────────────────────────────── */

function DuasView({ surahs, onOpen }: { surahs: Surah[]; onOpen: Open }) {
  const col = useData<Collections>("collections.json");
  if (!col) return <Loading />;
  return (
    <>
      <Source>From The Clear Quran's thematic index</Source>
      <div className="flex flex-col gap-10">
        {col.duas.map((d) => (
          <section key={d.who}>
            <div className="display mb-3 font-serif text-[22px] italic first-letter:uppercase">{d.who}</div>
            <div className="flex flex-col">
              {d.refs.map((r) => {
                const to = r[2] ?? r[1];
                const vs: Verse[] = [];
                for (let n = r[1]; n <= to; n++) {
                  const v = col.verses[`${r[0]}:${n}`];
                  if (v) vs.push(v);
                }
                return (
                  <div key={`${r[0]}:${r[1]}`} className="border-t border-[var(--box-line)] py-4">
                    <div className="mb-2 flex items-baseline justify-between gap-3">
                      <span className="label text-[var(--box-faint)]">
                        {surahs[r[0] - 1]?.tc} · {r[0]}:{r[1]}
                        {r[2] ? `–${r[2]}` : ""}
                      </span>
                      <button type="button" onClick={() => onOpen(r[0], r[1])} className="label-sm text-[var(--box-muted)] hover:text-[var(--box-fg)]">
                        Open →
                      </button>
                    </div>
                    <div className="flex flex-col gap-4">
                      {vs.map((v) => (
                        <div key={v.n}>
                          {vs.length > 1 && <div className="label-sm mb-0.5 tabular-nums text-[var(--box-faint)]">{`${r[0]}:${v.n}`}</div>}
                          <AyahText v={v} />
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}

/* ── the prostrations ─────────────────────────────────────────── */

function SajdahView({ surahs, onOpen }: { surahs: Surah[]; onOpen: Open }) {
  const col = useData<Collections>("collections.json");
  if (!col) return <Loading />;
  return (
    <>
      <div className="flex flex-col">
        {col.sajdah.map(([s, a], i) => (
          <div key={`${s}:${a}`} className="border-t border-[var(--box-line)] py-4">
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <span className="flex items-baseline gap-3">
                <span className="font-mono text-[11px] tabular-nums text-[var(--box-faint)]">{String(i + 1).padStart(2, "0")}</span>
                <span className="font-serif text-[17px] italic">{surahs[s - 1]?.tc}</span>
                <span className="label-sm tabular-nums text-[var(--box-faint)]">
                  {s}:{a}
                </span>
              </span>
              <button type="button" onClick={() => onOpen(s, a)} className="label-sm text-[var(--box-muted)] hover:text-[var(--box-fg)]">
                Open →
              </button>
            </div>
            {col.verses[`${s}:${a}`] && <AyahText v={col.verses[`${s}:${a}`]} size={21} />}
          </div>
        ))}
      </div>
    </>
  );
}

/* ── the summaries ────────────────────────────────────────────── */

function SummariesView({ surahs, onOpen, mobile }: { surahs: Surah[]; onOpen: Open; mobile: boolean }) {
  const [all, setAll] = useState<Record<string, SummarySection[]> | null>(null);
  const [pick, setPick] = useState<number | null>(mobile ? null : 1);
  const [q, setQ] = useState("");
  useEffect(() => {
    loadSummaries().then(setAll);
  }, []);
  if (!all) return <Loading />;
  const needle = q.trim().toLowerCase();
  const list = surahs.filter((s) => !needle || `${s.n} ${s.tc} ${s.tr} ${s.en}`.toLowerCase().includes(needle));
  const cur = pick ? surahs[pick - 1] : null;
  const detail = cur && (
    <motion.div key={cur.n} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE_OUT }}>
      {mobile && (
        <button type="button" onClick={() => setPick(null)} className="label mb-4 text-[var(--box-muted)] hover:text-[var(--box-fg)]">
          ← All surahs
        </button>
      )}
      <div className="flex items-baseline justify-between gap-3">
        <span className="display font-serif text-[30px] leading-tight italic">{cur.tc}</span>
        <span className="font-kufi text-[22px] text-[var(--box-muted)]" dir="rtl">
          {cur.ar}
        </span>
      </div>
      <div className="label mt-1 text-[var(--box-faint)]">
        {cur.place === "makkah" ? "Makkan" : "Madinan"} · {cur.count} ayat
      </div>
      <div className="mt-6 flex flex-col gap-8">
        {(all[String(cur.n)] ?? []).map((sec, i) => (
          <section key={i}>
            <div className="label mb-1.5 text-[var(--box-accent)]">{sec.kind}</div>
            <h3 className="mb-3 font-serif text-[20px] leading-snug">{sec.title}</h3>
            <div className="flex flex-col gap-3 font-serif text-[16px] leading-[1.7] text-[var(--box-fg)]/90">
              {sec.blocks.map((b, j) =>
                b.type === "p" ? (
                  <p key={j}>{b.text}</p>
                ) : (
                  <ul key={j} className="flex flex-col gap-2">
                    {b.items.map((it, k) => (
                      <li key={k} className="flex gap-3">
                        <span className="mt-[0.72em] h-[5px] w-[5px] shrink-0 rotate-45 bg-[var(--box-accent)]" />
                        <span>{it}</span>
                      </li>
                    ))}
                  </ul>
                ),
              )}
            </div>
          </section>
        ))}
        {!(all[String(cur.n)] ?? []).length && <p className="font-serif text-[16px] text-[var(--box-muted)]">Quraan Made Easy gives no introduction for this surah.</p>}
      </div>
      <button type="button" onClick={() => onOpen(cur.n, 1)} className="btn-primary label mt-8 border border-[var(--box-fg)] px-3 py-2 transition-colors hover:bg-[var(--box-fg)] hover:text-[var(--box-bg-solid)]">
        Read {cur.tc} →
      </button>
    </motion.div>
  );
  if (mobile && cur) return <>{detail}</>;
  return (
    <>
      <Source>From Quraan Made Easy</Source>
      <div className={cn(mobile ? "" : "grid grid-cols-[minmax(220px,0.8fr)_1.6fr] gap-10")}>
        <div className={cn(!mobile && "sticky top-0 max-h-[calc(100vh-14rem)] self-start overflow-y-auto pr-2 thin-scroll")}>
          <Filter value={q} onChange={setQ} placeholder="Find a surah" />
          {list.map((s) => (
            <button
              key={s.n}
              type="button"
              onClick={() => setPick(s.n)}
              className={cn("flex w-full items-baseline gap-3 border-t border-[var(--box-line)] py-2 text-left transition-colors hover:bg-[var(--box-hover)]", pick === s.n && "bg-[var(--box-hover)]")}
            >
              <span className="w-[3.2ch] shrink-0 font-mono text-[11px] tabular-nums text-[var(--box-faint)]">{pad3(s.n)}</span>
              <span className={cn("min-w-0 flex-1 truncate font-serif text-[16px] italic", pick === s.n && "text-[var(--color-gold)]")}>{s.tc}</span>
            </button>
          ))}
        </div>
        {!mobile && <div>{detail}</div>}
      </div>
    </>
  );
}
