import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { Surah } from "@/lib/data";
import { pad3 } from "@/lib/data";
import { searchDirect, searchText, type Result } from "@/lib/search";
import { cn, EASE_OUT } from "@/lib/utils";

type Props = {
  surahs: Surah[];
  juz: Record<string, string>;
  onPick: (r: Result) => void;
  /** live preview of the best surah while typing (used to turn the reel) */
  onPreview?: (s: Surah | null) => void;
  autoFocus?: boolean;
  dropdown?: "overlay" | "inline";
  className?: string;
  inputClassName?: string;
};

export const KIND_LABEL: Record<Result["kind"], string> = { surah: "Surah", ayah: "Ayah", juz: "Juz", text: "Text" };

/** What a query finds: names, numbers and references at once; the words of the text a moment later. */
export function useSearchResults(surahs: Surah[], juz: Record<string, string>, q: string) {
  const [text, setText] = useState<Result[]>([]);
  const [loadingText, setLoadingText] = useState(false);
  const direct = useMemo(() => (surahs.length ? searchDirect(surahs, juz, q) : []), [surahs, juz, q]);
  useEffect(() => {
    const query = q.trim();
    const strongDirect = direct.some((r) => r.score >= 90);
    if (query.length < 3 || /^\d/.test(query) || (strongDirect && query.length < 5)) {
      setText([]);
      setLoadingText(false);
      return;
    }
    setLoadingText(true);
    const t = setTimeout(async () => {
      const res = await searchText(surahs, query);
      setText(res);
      setLoadingText(false);
    }, 200);
    return () => clearTimeout(t);
  }, [q, surahs, direct]);
  return { direct, all: [...direct, ...text], loadingText };
}

/** Arrow keys through the results, Enter to open, Escape to clear and then to leave. */
export function resultKeys(e: React.KeyboardEvent, n: number, setActive: (f: (a: number) => number) => void, open: () => void, escape: () => void) {
  if (e.key === "ArrowDown") {
    e.preventDefault();
    setActive((a) => Math.min(n - 1, a + 1));
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    setActive((a) => Math.max(0, a - 1));
  } else if (e.key === "Enter") {
    e.preventDefault();
    open();
  } else if (e.key === "Escape") {
    escape();
  }
}

export function SearchBox({ surahs, juz, onPick, onPreview, autoFocus, dropdown = "overlay", className, inputClassName }: Props) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const { direct, all, loadingText } = useSearchResults(surahs, juz, q);

  useEffect(() => {
    const best = direct.find((r) => r.kind === "surah" || r.kind === "ayah");
    onPreview?.(best && "surah" in best ? best.surah : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [direct]);

  useEffect(() => setActive(0), [q]);

  useEffect(() => {
    if (autoFocus) setTimeout(() => inputRef.current?.focus(), 350);
  }, [autoFocus]);

  const showList = open && q.trim().length > 0;

  const pick = (r: Result) => {
    onPick(r);
    setOpen(false);
    inputRef.current?.blur();
  };

  const onKey = (e: React.KeyboardEvent) =>
    resultKeys(
      e,
      all.length,
      setActive,
      () => all[active] && pick(all[active]),
      () => (q ? setQ("") : inputRef.current?.blur()),
    );

  useEffect(() => {
    listRef.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  return (
    <div className={cn("relative w-full", className)}>
      <input
        ref={inputRef}
        type="text"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 160)}
        onKeyDown={onKey}
        className={cn("search-input", inputClassName)}
        placeholder="Search…"
        aria-label="Search surahs, ayahs and words"
        aria-autocomplete="list"
        aria-expanded={showList}
        spellCheck={false}
        autoComplete="off"
        dir="auto"
      />
      <AnimatePresence>
        {showList && (
          <motion.div
            ref={listRef}
            role="listbox"
            initial={{ opacity: 0, y: -6, clipPath: "inset(0 0 100% 0)" }}
            animate={{ opacity: 1, y: 0, clipPath: "inset(0 0 0% 0)" }}
            exit={{ opacity: 0, y: -4, clipPath: "inset(0 0 100% 0)" }}
            transition={{ duration: 0.28, ease: EASE_OUT }}
            className={cn(
              "thin-scroll z-40 mt-2 max-h-[min(52vh,340px)] overflow-y-auto border border-[var(--box-line)] bg-[var(--box-bg-solid)] shadow-[0_24px_60px_-20px_rgba(0,0,0,0.7)]",
              dropdown === "overlay" ? "absolute left-0 right-0 top-full" : "relative",
            )}
          >
            <ResultList all={all} active={active} setActive={setActive} pick={pick} loadingText={loadingText} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** The results, one row each: what it is, then where. */
export function ResultList({ all, active, setActive, pick, loadingText }: { all: Result[]; active: number; setActive: (i: number) => void; pick: (r: Result) => void; loadingText: boolean }) {
  return (
    <>
      {all.length === 0 && !loadingText && (
        <div className="px-3 py-3 font-serif text-[15px] text-[var(--box-muted)]">
          Nothing matches. Try a number (18), a reference (2:255), a name (Kahf, الكهف) or a word (mercy).
        </div>
      )}
      {all.map((r, i) => (
        <button
          key={`${r.kind}-${"surah" in r ? r.surah.n : ""}-${"ayah" in r ? r.ayah : ""}-${i}`}
          type="button"
          data-i={i}
          role="option"
          aria-selected={i === active}
          onMouseDown={(e) => e.preventDefault()}
          onMouseEnter={() => setActive(i)}
          onClick={() => pick(r)}
          className={cn(
            "flex w-full items-start gap-3 border-b border-[var(--box-line)] px-3 py-2.5 text-left transition-colors last:border-b-0",
            i === active ? "bg-[var(--box-hover)]" : "",
          )}
        >
          <span
            className={cn(
              "label-sm mt-[3px] w-[4.2em] shrink-0 text-[var(--box-faint)]",
              i === active && "text-[var(--color-gold)]",
            )}
          >
            {KIND_LABEL[r.kind]}
          </span>
          <ResultBody r={r} />
        </button>
      ))}
      {loadingText && <div className="label px-3 py-2.5 text-[var(--box-faint)]">Searching the text…</div>}
    </>
  );
}

function ResultBody({ r }: { r: Result }) {
  if (r.kind === "surah")
    return (
      <span className="flex min-w-0 flex-1 items-baseline justify-between gap-2">
        <span className="min-w-0">
          <span className="font-mono text-[11px] text-[var(--box-faint)] tabular-nums">{pad3(r.surah.n)}</span>{" "}
          <span className="font-serif text-[16px] italic">{r.surah.tc}</span>{" "}
          <span className="label-sm text-[var(--box-muted)]">{r.surah.en}</span>
        </span>
        <span className="font-kufi text-[15px] text-[var(--box-muted)]" dir="rtl">
          {r.surah.ar}
        </span>
      </span>
    );
  if (r.kind === "ayah")
    return (
      <span className="min-w-0 flex-1">
        <span className="font-mono text-[12px] tabular-nums">
          {r.surah.n}:{r.ayah}
        </span>{" "}
        <span className="font-serif text-[16px] italic">{r.surah.tc}</span>{" "}
        <span className="label-sm text-[var(--box-muted)]">
          ayah {r.ayah} of {r.surah.count}
        </span>
      </span>
    );
  if (r.kind === "juz")
    return (
      <span className="min-w-0 flex-1">
        <span className="font-serif text-[16px] italic">Juz {r.juz}</span>{" "}
        <span className="label-sm text-[var(--box-muted)]">
          begins at {r.surah.n}:{r.ayah} · {r.surah.tc}
        </span>
      </span>
    );
  // text match with the query words marked
  const parts: React.ReactNode[] = [];
  const marks = [...r.match].sort((a, b) => a[0] - b[0]);
  let at = 0;
  marks.forEach(([s, e], i) => {
    if (s < at) return;
    parts.push(r.snippet.slice(at, s));
    parts.push(
      <mark key={i} className="bg-transparent text-[var(--color-gold)] underline decoration-[var(--color-gold)]/40 underline-offset-2">
        {r.snippet.slice(s, e)}
      </mark>,
    );
    at = e;
  });
  parts.push(r.snippet.slice(at));
  return (
    <span className="min-w-0 flex-1">
      <span className="font-mono text-[12px] tabular-nums">
        {r.surah.n}:{r.ayah}
      </span>{" "}
      <span className="label-sm text-[var(--box-muted)]">{r.surah.tc}</span>
      <span className="mt-0.5 block font-serif text-[14.5px] leading-snug text-[var(--box-muted)]" dir="auto">
        {parts}
      </span>
    </span>
  );
}
