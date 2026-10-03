import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { Check } from "lucide-react";
import type { Surah } from "@/lib/data";
import { pad3 } from "@/lib/data";
import { useStore, type Goal } from "@/lib/store";
import { EASE_OUT, cn } from "@/lib/utils";

/**
 * Progress, as the reader marks it: a surah is completed when they tick it at its end. That is
 * the only thing counted. A goal, if they set one, is measured against it.
 */

const TOTAL_AYAT = 6236;
const fmtDate = (t: number | string) => new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

/** The tick at the end of a surah: completed, or not yet. */
export function CompleteMark({ surah }: { surah: Surah }) {
  const done = useStore((s) => s.done[surah.n]);
  const toggle = useStore((s) => s.toggleDone);
  return (
    <button
      type="button"
      onClick={() => toggle(surah.n)}
      aria-pressed={!!done}
      className="group flex items-center gap-3 text-left"
      title={done ? "Completed. Tap to undo." : `Mark ${surah.tc} as completed`}
    >
      <span
        className={cn(
          "pill relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-colors duration-300",
          done ? "border-[var(--box-fg)] bg-[var(--box-fg)] text-[var(--box-bg-solid)]" : "border-[var(--box-muted)] text-transparent group-hover:border-[var(--box-fg)]",
        )}
      >
        <AnimatePresence initial={false}>
          {done && (
            <motion.span key="tick" initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }} transition={{ duration: 0.25, ease: EASE_OUT }}>
              <Check size={15} strokeWidth={2.2} />
            </motion.span>
          )}
        </AnimatePresence>
      </span>
      <span className="flex flex-col">
        <span className="text-[14px] text-[var(--box-fg)]">{done ? "Completed" : "Mark as completed"}</span>
        {done ? <span className="label-sm text-[var(--box-faint)]">{fmtDate(done)}</span> : null}
      </span>
    </button>
  );
}

/* ── the goal's period: this week (from Monday), this month ── */
function periodStart(kind: "week" | "month", now = new Date()) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (kind === "month") d.setDate(1);
  else d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}
function periodEnd(kind: "week" | "month", now = new Date()) {
  const s = periodStart(kind, now);
  const e = new Date(s);
  if (kind === "month") e.setMonth(e.getMonth() + 1);
  else e.setDate(e.getDate() + 7);
  return e;
}
const DAY = 86_400_000;

export function ProgressTab({ surahs, onGo }: { surahs: Surah[]; onGo: (s: number, a: number) => void }) {
  const done = useStore((s) => s.done);
  const goal = useStore((s) => s.goal);
  const toggle = useStore((s) => s.toggleDone);
  const [confirm, setConfirm] = useState(false);
  const [editing, setEditing] = useState(false);

  const n = Object.keys(done).length;
  const ayat = Object.keys(done).reduce((a, s) => a + (surahs[Number(s) - 1]?.count ?? 0), 0);
  const recent = Object.entries(done)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  return (
    <>
      <div className="text-[13px] text-[var(--box-muted)]">Mark a surah as completed at its end.</div>

      <div>
        <div className="flex items-baseline gap-3">
          <span className="display font-serif text-[44px] leading-none italic tabular-nums md:text-[56px]">{n}</span>
          <span className="label text-[var(--box-faint)]">of 114 surahs completed</span>
        </div>
        <div className="mt-3 h-[3px] w-full bg-[var(--box-line)]">
          <motion.div className="h-full bg-[var(--box-fg)]" initial={false} animate={{ width: `${(n / 114) * 100}%` }} transition={{ duration: 0.6, ease: EASE_OUT }} />
        </div>
        <div className="label-sm mt-2 text-[var(--box-faint)] tabular-nums">
          {ayat.toLocaleString()} of {TOTAL_AYAT.toLocaleString()} ayat · {((ayat / TOTAL_AYAT) * 100).toFixed(ayat ? 1 : 0)}%
        </div>
      </div>

      {/* the 114, in order: completed ones filled */}
      <div className="grid grid-cols-[repeat(19,minmax(0,1fr))] gap-[3px]">
        {surahs.map((s) => (
          <button
            key={s.n}
            type="button"
            onClick={() => onGo(s.n, 1)}
            title={`${pad3(s.n)} ${s.tc}${done[s.n] ? ` · completed ${fmtDate(done[s.n])}` : ""}`}
            aria-label={`${s.tc}${done[s.n] ? ", completed" : ""}`}
            className={cn("aspect-square border transition-colors", done[s.n] ? "border-[var(--box-fg)] bg-[var(--box-fg)]" : "border-[var(--box-line)] hover:border-[var(--box-muted)]")}
          />
        ))}
      </div>

      <GoalBox goal={goal} done={done} surahs={surahs} editing={editing || !goal} onEdit={setEditing} />

      {recent.length > 0 && (
        <div>
          <div className="mb-1 text-[15px]">Recently completed</div>
          {recent.map(([s, at]) => (
            <div key={s} className="flex items-baseline gap-3 border-t border-[var(--box-line)] py-2">
              <span className="w-[3ch] font-mono text-[11px] text-[var(--box-faint)] tabular-nums">{pad3(Number(s))}</span>
              <button type="button" onClick={() => onGo(Number(s), 1)} className="min-w-0 flex-1 truncate text-left font-serif text-[16px] italic hover:text-[var(--color-gold)]">
                {surahs[Number(s) - 1]?.tc}
              </button>
              <span className="label-sm text-[var(--box-faint)]">{fmtDate(at)}</span>
              <button type="button" onClick={() => toggle(Number(s))} className="label-sm text-[var(--box-faint)] hover:text-[var(--box-fg)]">
                Undo
              </button>
            </div>
          ))}
        </div>
      )}

      {n > 0 && (
        <div className="flex items-center justify-end gap-4 border-t border-[var(--box-line)] pt-5">
          <button
            type="button"
            onClick={() => (confirm ? (useStore.setState({ done: {} }), setConfirm(false)) : setConfirm(true))}
            onBlur={() => setConfirm(false)}
            className={cn("label border px-3 py-2 transition-colors", confirm ? "border-[var(--box-fg)] bg-[var(--box-fg)] text-[var(--box-bg-solid)]" : "border-[var(--box-line)] text-[var(--box-muted)] hover:border-[var(--box-fg)]")}
          >
            {confirm ? "Press again to clear all ticks" : "Start again"}
          </button>
        </div>
      )}
    </>
  );
}

/* ── the reading goal ─────────────────────────────────────────── */

function GoalBox({ goal, done, surahs, editing, onEdit }: { goal: Goal | null; done: Record<string, number>; surahs: Surah[]; editing: boolean; onEdit: (v: boolean) => void }) {
  const setGoal = useStore((s) => s.setGoal);
  return (
    <div className="border border-[var(--box-line)] p-4 md:p-5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[15px]">Reading goal</span>
        {goal && !editing && (
          <span className="flex gap-3">
            <button type="button" onClick={() => onEdit(true)} className="label-sm text-[var(--box-faint)] hover:text-[var(--box-fg)]">
              Change
            </button>
            <button type="button" onClick={() => setGoal(null)} className="label-sm text-[var(--box-faint)] hover:text-[var(--box-fg)]">
              Remove
            </button>
          </span>
        )}
      </div>
      <AnimatePresence mode="wait" initial={false}>
        {editing ? (
          <motion.div key="edit" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25, ease: EASE_OUT }}>
            <GoalEditor
              goal={goal}
              onSave={(g) => {
                setGoal(g);
                onEdit(false);
              }}
              onCancel={goal ? () => onEdit(false) : undefined}
            />
          </motion.div>
        ) : (
          goal && (
            <motion.div key="show" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25, ease: EASE_OUT }}>
              <GoalStatus goal={goal} done={done} surahs={surahs} />
            </motion.div>
          )
        )}
      </AnimatePresence>
    </div>
  );
}

function GoalStatus({ goal, done, surahs }: { goal: Goal; done: Record<string, number>; surahs: Surah[] }) {
  const now = new Date();
  if (goal.kind === "khatm") {
    const by = new Date(goal.by + "T23:59:59");
    const left = Math.max(0, Math.ceil((by.getTime() - now.getTime()) / DAY));
    const n = Object.keys(done).length;
    const ayatLeft = surahs.filter((s) => !done[s.n]).reduce((a, s) => a + s.count, 0);
    const perDay = left ? Math.ceil(ayatLeft / left) : ayatLeft;
    return (
      <div className="mt-3">
        <div className="font-serif text-[18px]">The whole Qur'an by {fmtDate(goal.by)}</div>
        <Bar part={n} whole={114} />
        <div className="mt-2 text-[13px] text-[var(--box-muted)]">
          {n === 114
            ? "All 114 surahs completed. Alhamdulillah."
            : left === 0
              ? `${114 - n} surahs to go; the date has passed. Choose a new one when you are ready.`
              : `${114 - n} surahs to go, ${left} day${left === 1 ? "" : "s"} left: about ${perDay} ayat a day.`}
        </div>
      </div>
    );
  }
  const from = periodStart(goal.kind, now).getTime();
  const end = periodEnd(goal.kind, now).getTime();
  const n = Object.values(done).filter((t) => t >= from && t < end).length;
  const daysLeft = Math.max(1, Math.ceil((end - now.getTime()) / DAY));
  return (
    <div className="mt-3">
      <div className="font-serif text-[18px]">
        {goal.count} surah{goal.count === 1 ? "" : "s"} {goal.kind === "week" ? "a week" : "a month"}
      </div>
      <Bar part={Math.min(n, goal.count)} whole={goal.count} />
      <div className="mt-2 text-[13px] text-[var(--box-muted)]">
        {n >= goal.count
          ? `${n} completed this ${goal.kind}. Reached.`
          : `${n} of ${goal.count} this ${goal.kind} · ${daysLeft} day${daysLeft === 1 ? "" : "s"} left`}
      </div>
    </div>
  );
}

function Bar({ part, whole }: { part: number; whole: number }) {
  return (
    <div className="mt-3 h-[3px] w-full bg-[var(--box-line)]">
      <motion.div className="h-full bg-[var(--color-gold)]" initial={false} animate={{ width: `${Math.min(100, (part / Math.max(1, whole)) * 100)}%` }} transition={{ duration: 0.6, ease: EASE_OUT }} />
    </div>
  );
}

const plusMonths = (m: number) => {
  const d = new Date();
  d.setMonth(d.getMonth() + m);
  return d.toISOString().slice(0, 10);
};

function GoalEditor({ goal, onSave, onCancel }: { goal: Goal | null; onSave: (g: Goal) => void; onCancel?: () => void }) {
  const [kind, setKind] = useState<Goal["kind"]>(goal?.kind ?? "week");
  const [count, setCount] = useState(goal && goal.kind !== "khatm" ? goal.count : 2);
  const [by, setBy] = useState(goal?.kind === "khatm" ? goal.by : plusMonths(6));
  const today = new Date().toISOString().slice(0, 10);
  const choices: [Goal["kind"], string][] = [
    ["week", "Each week"],
    ["month", "Each month"],
    ["khatm", "Whole Qur'an"],
  ];
  return (
    <div className="mt-3 flex flex-col gap-4">
      <div className="pill flex w-max max-w-full flex-wrap border border-[var(--box-line)] p-0.5">
        {choices.map(([k, l]) => (
          <button key={k} type="button" onClick={() => setKind(k)} aria-pressed={kind === k} className={cn("label relative px-3 py-2 transition-colors", kind === k ? "text-[var(--panel-bg)]" : "text-[var(--box-muted)] hover:text-[var(--box-fg)]")}>
            {kind === k && <motion.span layoutId="goal-kind" className="pill absolute inset-0 bg-[var(--box-fg)]" transition={{ duration: 0.3, ease: EASE_OUT }} />}
            <span className="relative">{l}</span>
          </button>
        ))}
      </div>
      {kind === "khatm" ? (
        <label className="flex flex-wrap items-center gap-3 font-serif text-[17px]">
          Complete all 114 surahs by
          <input
            type="date"
            value={by}
            min={today}
            onChange={(e) => setBy(e.target.value)}
            className="border-b border-[var(--box-line)] bg-transparent px-1 py-0.5 font-sans text-[14px] text-[var(--box-fg)] outline-none [color-scheme:light_dark] focus:border-[var(--color-gold)]"
          />
        </label>
      ) : (
        <div className="flex flex-wrap items-center gap-3 font-serif text-[17px]">
          Complete
          <span className="flex items-center border border-[var(--box-line)]">
            <button type="button" aria-label="Fewer" onClick={() => setCount((c) => Math.max(1, c - 1))} className="h-8 w-8 text-[var(--box-muted)] hover:text-[var(--box-fg)]">
              −
            </button>
            <span className="w-8 text-center font-sans text-[15px] tabular-nums">{count}</span>
            <button type="button" aria-label="More" onClick={() => setCount((c) => Math.min(114, c + 1))} className="h-8 w-8 text-[var(--box-muted)] hover:text-[var(--box-fg)]">
              +
            </button>
          </span>
          surah{count === 1 ? "" : "s"} {kind === "week" ? "every week" : "every month"}
        </div>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onSave(kind === "khatm" ? { kind, by: by || plusMonths(6), from: Date.now() } : { kind, count })}
          className="btn-primary label border border-[var(--box-fg)] px-3 py-2 transition-colors hover:bg-[var(--box-fg)] hover:text-[var(--box-bg-solid)]"
        >
          Set goal
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="btn-secondary label border border-[var(--box-line)] px-3 py-2 text-[var(--box-muted)] hover:border-[var(--box-fg)]">
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
