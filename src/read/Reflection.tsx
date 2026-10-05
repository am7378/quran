import { useEffect, useRef, useState } from "react";
import { sfx } from "@/lib/sound";
import { get, set, del } from "idb-keyval";
import { Mic, Pause, Play, Square, Trash2 } from "lucide-react";
import { ImmersivePanel, MenuGlyph, Reveal } from "@/components/ImmersivePanel";
import { useStore, type Recording } from "@/lib/store";
import type { Surah } from "@/lib/data";
import { pad3 } from "@/lib/data";
import { SurahArt } from "@/components/SurahCard";
import { cn, uid } from "@/lib/utils";
import { ayn, nameMarks } from "@/lib/names";

const recKey = (s: number, id: string) => `rec:${s}:${id}`;

/**
 * The surah reflection: reached from the end of the ayah slider. Type a
 * summary and the lessons you took, or record them in your own voice.
 */
export function ReflectionPanel({ open, onClose, surah, mobile }: { open: boolean; onClose: () => void; surah: Surah; mobile: boolean }) {
  const reflection = useStore((s) => s.reflections[surah.n]);
  const save = useStore((s) => s.saveReflection);
  const [summary, setSummary] = useState(reflection?.summary ?? "");
  const [lessons, setLessons] = useState(reflection?.lessons ?? "");

  useEffect(() => {
    if (open) {
      setSummary(reflection?.summary ?? "");
      setLessons(reflection?.lessons ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, surah.n]);

  useEffect(() => {
    if (!open) return;
    if (summary === (reflection?.summary ?? "") && lessons === (reflection?.lessons ?? "")) return;
    const t = setTimeout(() => save(surah.n, { summary, lessons }), 500);
    return () => clearTimeout(t);
  }, [summary, lessons, open, surah.n, reflection, save]);

  const saved = reflection?.updatedAt ? new Date(reflection.updatedAt) : null;

  return (
    <ImmersivePanel open={open} from="right" onClose={onClose} label={`Reflection on ${ayn(surah.tc)}`}>
      <div className="flex h-full flex-col">
        <div className="flex items-start justify-between px-5 pt-4 md:px-8 md:pt-6">
          <Reveal>
            <div className="label text-[var(--box-faint)]">Reflection · {pad3(surah.n)}</div>
            <div className="mt-1 text-[13px] text-[var(--box-muted)]">What this surah left with you.</div>
          </Reveal>
          <button type="button" onClick={onClose} aria-label="Close reflection" className="flex h-9 w-9 items-center justify-center text-[var(--box-fg)] hover:bg-[var(--box-hover)]">
            <MenuGlyph open />
          </button>
        </div>

        <div className="thin-scroll grid flex-1 grid-cols-1 gap-8 overflow-y-auto px-5 pb-6 pt-6 md:grid-cols-[1.1fr_1fr] md:gap-12 md:px-8 md:pt-8">
          <div className="flex flex-col gap-7">
            <Reveal className="flex items-end gap-4">
              <div className="relative h-24 w-[68px] shrink-0 overflow-hidden md:h-28 md:w-20">
                <SurahArt n={surah.n} blur={6} />
              </div>
              <div>
                <div className="font-kufi text-[28px] leading-none md:text-[34px]" dir="rtl">
                  {surah.ar}
                </div>
                <div className="display mt-2 font-serif text-[30px] leading-none italic md:text-[40px]">{nameMarks(surah.tc)}</div>
                <div className="label mt-2 text-[var(--box-muted)]">{surah.en} · {surah.count} ayat</div>
              </div>
            </Reveal>
            <Reveal>
              <Field label="Summary" value={summary} onChange={setSummary} rows={mobile ? 4 : 5} hint="What is the surah about?" />
            </Reveal>
            <Reveal>
              <Field label="Lessons learned" value={lessons} onChange={setLessons} rows={mobile ? 4 : 5} hint="What will you carry into your day?" />
            </Reveal>
          </div>
          <Reveal className="flex flex-col">
            <Recorder surah={surah.n} />
          </Reveal>
        </div>

        <Reveal className="flex items-center justify-between border-t border-[var(--box-line)] px-5 py-3 md:px-8">
          <span className="label text-[var(--box-faint)]">
            {saved ? `Saved on this device · ${saved.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "Saved on this device as you type"}
          </span>
          <button type="button" onClick={onClose} className="label border border-[var(--box-fg)] px-3 py-1.5 transition-colors hover:bg-[var(--box-fg)] hover:text-[var(--panel-bg)]">
            Done
          </button>
        </Reveal>
      </div>
    </ImmersivePanel>
  );
}

function Field({ label, value, onChange, rows, hint }: { label: string; value: string; onChange: (v: string) => void; rows: number; hint: string }) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between">
        <span className="text-[13px] text-[var(--box-fg)]">{label}</span>
        <span className="label-sm text-[var(--box-faint)]">{value.trim() ? `${value.trim().split(/\s+/).length} words` : ""}</span>
      </span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={hint}
        className="mt-2 w-full resize-none border-b border-[var(--box-line)] bg-transparent pb-2 font-serif text-[18px] leading-[1.6] text-[var(--box-fg)] outline-none transition-colors placeholder:text-[var(--box-faint)] focus:border-[var(--color-gold)]"
        dir="auto"
      />
    </label>
  );
}

/* ── voice recorder ───────────────────────────────────────────── */

const NO_RECORDINGS: Recording[] = [];

function Recorder({ surah }: { surah: number }) {
  // a stable fallback: a fresh [] here would re-render forever
  const recordings = useStore((s) => s.reflections[surah]?.recordings ?? NO_RECORDINGS);
  const save = useStore((s) => s.saveReflection);
  const [state, setState] = useState<"idle" | "recording" | "denied" | "unsupported">(() =>
    typeof MediaRecorder === "undefined" || !navigator.mediaDevices ? "unsupported" : "idle",
  );
  const [elapsed, setElapsed] = useState(0);
  const media = useRef<{ rec: MediaRecorder; stream: MediaStream; chunks: Blob[]; start: number; ctx: AudioContext; raf: number } | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => () => stop(true), []); // eslint-disable-line react-hooks/exhaustive-deps

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      const ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(stream);
      const an = ctx.createAnalyser();
      an.fftSize = 512;
      src.connect(an);
      const buf = new Uint8Array(an.fftSize);
      const draw = () => {
        const c = canvas.current;
        if (c && media.current) {
          const g = c.getContext("2d")!;
          const w = (c.width = c.clientWidth * devicePixelRatio);
          const h = (c.height = c.clientHeight * devicePixelRatio);
          an.getByteTimeDomainData(buf);
          g.clearRect(0, 0, w, h);
          const bars = 48;
          for (let i = 0; i < bars; i++) {
            const v = Math.abs(buf[Math.floor((i / bars) * buf.length)] - 128) / 128;
            const bh = Math.max(2, v * h * 1.8);
            g.fillStyle = i % 2 ? "rgba(201,162,74,0.9)" : "rgba(239,233,221,0.85)";
            g.fillRect((i / bars) * w + 1, (h - bh) / 2, w / bars - 2, bh);
          }
          setElapsed((performance.now() - media.current.start) / 1000);
          media.current.raf = requestAnimationFrame(draw);
        }
      };
      media.current = { rec, stream, chunks, start: performance.now(), ctx, raf: 0 };
      rec.start(250);
      setState("recording");
      sfx("recOn");
      media.current.raf = requestAnimationFrame(draw);
    } catch {
      setState("denied");
    }
  };

  const stop = (discard = false) => {
    const m = media.current;
    if (!m) return;
    cancelAnimationFrame(m.raf);
    const dur = (performance.now() - m.start) / 1000;
    if (!discard) sfx("recOff");
    m.rec.onstop = async () => {
      m.stream.getTracks().forEach((t) => t.stop());
      m.ctx.close();
      if (discard || dur < 0.6) return;
      const blob = new Blob(m.chunks, { type: m.rec.mimeType || "audio/webm" });
      const id = uid();
      await set(recKey(surah, id), blob);
      const cur = useStore.getState().reflections[surah]?.recordings ?? [];
      save(surah, { recordings: [{ id, at: Date.now(), dur }, ...cur] });
    };
    if (m.rec.state !== "inactive") m.rec.stop();
    media.current = null;
    setState("idle");
    setElapsed(0);
  };

  const removeRec = async (r: Recording) => {
    await del(recKey(surah, r.id));
    save(surah, { recordings: recordings.filter((x) => x.id !== r.id) });
  };

  return (
    <div className="flex h-full flex-col border border-[var(--box-line)] p-4 md:p-5">
      <div className="flex items-baseline justify-between">
        <span className="text-[13px]">Voice</span>
        <span className="label-sm text-[var(--box-faint)]">{recordings.length} recording{recordings.length === 1 ? "" : "s"}</span>
      </div>

      <div className="mt-4 flex items-center gap-4">
        <button
          type="button"
          disabled={state === "unsupported"}
          data-sfx="none"
          onClick={() => (state === "recording" ? stop() : start())}
          aria-label={state === "recording" ? "Stop recording" : "Record your reflection"}
          className={cn(
            "relative flex h-14 w-14 shrink-0 items-center justify-center border transition-all duration-300",
            state === "recording" ? "border-[#e0563b] bg-[#e0563b] text-white" : "border-[var(--box-fg)] hover:bg-[var(--box-fg)] hover:text-[var(--panel-bg)]",
          )}
        >
          {state === "recording" ? <Square size={16} fill="currentColor" /> : <Mic size={18} strokeWidth={1.6} />}
          {state === "recording" && <span className="absolute inset-0 animate-ping border border-[#e0563b] opacity-40" />}
        </button>
        <div className="min-w-0 flex-1">
          {state === "recording" ? (
            <>
              <canvas ref={canvas} className="h-10 w-full" />
              <div className="label mt-1 text-[#e0563b] tabular-nums">● Recording {fmt(elapsed)}</div>
            </>
          ) : (
            <div className="font-serif text-[15px] leading-snug text-[var(--box-muted)]">
              {state === "denied"
                ? "Microphone access is blocked. Allow it for this site in your browser settings, then press record again."
                : state === "unsupported"
                  ? "This browser can't record audio. Type your reflection instead."
                  : "Press to record your summary in your own words. Recordings stay on this device."}
            </div>
          )}
        </div>
      </div>

      <div className="thin-scroll mt-5 flex-1 overflow-y-auto">
        {recordings.map((r, i) => (
          <RecordingRow key={r.id} r={r} n={recordings.length - i} surah={surah} onDelete={() => removeRec(r)} />
        ))}
      </div>
    </div>
  );
}

function RecordingRow({ r, n, surah, onDelete }: { r: Recording; n: number; surah: number; onDelete: () => void }) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const audio = useRef<HTMLAudioElement | null>(null);
  const url = useRef<string | null>(null);

  useEffect(
    () => () => {
      audio.current?.pause();
      if (url.current) URL.revokeObjectURL(url.current);
    },
    [],
  );

  const toggle = async () => {
    if (!audio.current) {
      const blob = await get<Blob>(recKey(surah, r.id));
      if (!blob) return;
      url.current = URL.createObjectURL(blob);
      const a = new Audio(url.current);
      a.ontimeupdate = () => setProgress(a.duration && isFinite(a.duration) ? a.currentTime / a.duration : a.currentTime / r.dur);
      a.onended = () => {
        setPlaying(false);
        setProgress(0);
      };
      audio.current = a;
    }
    if (playing) {
      audio.current.pause();
      setPlaying(false);
    } else {
      await audio.current.play();
      setPlaying(true);
    }
  };

  return (
    <div className="group flex items-center gap-3 border-t border-[var(--box-line)] py-2.5">
      <button type="button" onClick={toggle} aria-label={playing ? "Pause" : "Play"} className="flex h-8 w-8 items-center justify-center border border-[var(--box-line)] hover:border-[var(--box-fg)]">
        {playing ? <Pause size={13} /> : <Play size={13} />}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between">
          <span className="label">Recording {n}</span>
          <span className="label-sm text-[var(--box-faint)] tabular-nums">{fmt(r.dur)}</span>
        </div>
        <div className="mt-1.5 h-px bg-[var(--box-line)]">
          <div className="h-px bg-[var(--color-gold)] transition-[width] duration-200" style={{ width: `${Math.min(1, progress) * 100}%` }} />
        </div>
        <div className="label-sm mt-1 text-[var(--box-faint)]">{new Date(r.at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</div>
      </div>
      <button type="button" onClick={onDelete} aria-label="Delete recording" className="flex h-8 w-8 items-center justify-center text-[var(--box-faint)] opacity-0 transition-opacity hover:text-[var(--box-fg)] group-hover:opacity-100 focus:opacity-100">
        <Trash2 size={13} />
      </button>
    </div>
  );
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
