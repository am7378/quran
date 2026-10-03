import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { set } from "idb-keyval";
import { Mic, Square, X } from "lucide-react";
import { EASE_OUT, cn, uid } from "@/lib/utils";

export const voiceKey = (id: string) => `voice:${id}`;

/**
 * A small recorder anchored to the ayah's mic button. Press to record, press
 * again to stop; the recording is kept on this device as a voice note.
 */
export function VoiceRecorder({
  anchor,
  ayahKey,
  quote,
  onClose,
  onSaved,
}: {
  anchor: DOMRect | null;
  ayahKey: string;
  quote?: string; // recording on a highlighted passage
  onClose: () => void;
  onSaved: (audio: string, dur: number) => void;
}) {
  const [state, setState] = useState<"idle" | "recording" | "denied" | "unsupported">(() =>
    typeof MediaRecorder === "undefined" || !navigator.mediaDevices ? "unsupported" : "idle",
  );
  const [elapsed, setElapsed] = useState(0);
  const media = useRef<{ rec: MediaRecorder; stream: MediaStream; chunks: Blob[]; start: number; ctx: AudioContext; raf: number } | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!anchor) return;
    const down = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node) && !media.current) onClose();
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && (stop(true), onClose());
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("keydown", key);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor]);

  useEffect(() => () => stop(true), []); // eslint-disable-line react-hooks/exhaustive-deps

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      const ctx = new AudioContext();
      const an = ctx.createAnalyser();
      an.fftSize = 256;
      ctx.createMediaStreamSource(stream).connect(an);
      const buf = new Uint8Array(an.fftSize);
      const draw = () => {
        const c = canvas.current;
        const m = media.current;
        if (!m) return;
        if (c) {
          const g = c.getContext("2d")!;
          const w = (c.width = c.clientWidth * devicePixelRatio);
          const h = (c.height = c.clientHeight * devicePixelRatio);
          an.getByteTimeDomainData(buf);
          g.clearRect(0, 0, w, h);
          const bars = 28;
          for (let i = 0; i < bars; i++) {
            const v = Math.abs(buf[Math.floor((i / bars) * buf.length)] - 128) / 128;
            const bh = Math.max(2, v * h * 2);
            g.fillStyle = i % 2 ? "#c9a24a" : "#efe9dd";
            g.fillRect((i / bars) * w + 1, (h - bh) / 2, w / bars - 2, bh);
          }
        }
        setElapsed((performance.now() - m.start) / 1000);
        m.raf = requestAnimationFrame(draw);
      };
      media.current = { rec, stream, chunks, start: performance.now(), ctx, raf: 0 };
      rec.start(250);
      setState("recording");
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
    m.rec.onstop = async () => {
      m.stream.getTracks().forEach((t) => t.stop());
      m.ctx.close();
      if (discard || dur < 0.6) return;
      const id = uid();
      await set(voiceKey(id), new Blob(m.chunks, { type: m.rec.mimeType || "audio/webm" }));
      onSaved(id, dur);
    };
    if (m.rec.state !== "inactive") m.rec.stop();
    media.current = null;
    setState("idle");
  };

  const left = anchor ? Math.min(window.innerWidth - 276, Math.max(12, anchor.left + anchor.width / 2 - 132)) : 0;
  const above = anchor ? anchor.top > 200 : true;
  const top = anchor ? (above ? anchor.top - 12 : anchor.bottom + 12) : 0;

  return createPortal(
    <AnimatePresence>
      {anchor && (
        <motion.div
          ref={box}
          key="rec"
          role="dialog"
          aria-label={`Voice note on ayah ${ayahKey}`}
          className="theme-pop fixed z-[80] w-[264px] border border-[var(--box-line)] bg-[var(--box-bg-solid)] p-4 text-[var(--box-fg)] shadow-[0_24px_60px_-18px_rgba(0,0,0,0.75)]"
          style={{ left, top, translateY: above ? "-100%" : "0%" }}
          initial={{ opacity: 0, y: above ? 8 : -8, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.15 } }}
          transition={{ duration: 0.25, ease: EASE_OUT }}
        >
          <div className="flex items-center justify-between">
            <span className="label text-[var(--box-faint)]">Voice note · {ayahKey}</span>
            <button type="button" aria-label="Close" onClick={() => (stop(true), onClose())} className="flex h-6 w-6 items-center justify-center text-[var(--box-faint)] hover:text-[var(--box-fg)]">
              <X size={13} />
            </button>
          </div>
          {quote && (
            <p
              className={cn("mt-2 line-clamp-2 border-l-2 border-[var(--color-gold)] pl-2 text-[13px] leading-snug text-[var(--box-muted)]", /[؀-ۿ]/.test(quote) ? "quran text-right text-[16px]" : "font-serif italic")}
              dir="auto"
            >
              {quote}
            </p>
          )}
          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              disabled={state === "unsupported"}
              onClick={() => (state === "recording" ? (stop(), onClose()) : start())}
              aria-label={state === "recording" ? "Stop and save" : "Start recording"}
              className={`relative flex h-12 w-12 shrink-0 items-center justify-center border transition-colors ${
                state === "recording" ? "border-[#e0563b] bg-[#e0563b] text-white" : "border-[var(--box-fg)] hover:bg-[var(--box-fg)] hover:text-[var(--box-bg-solid)]"
              }`}
            >
              {state === "recording" ? <Square size={14} fill="currentColor" /> : <Mic size={17} strokeWidth={1.6} />}
              {state === "recording" && <span className="absolute inset-0 animate-ping border border-[#e0563b] opacity-40" />}
            </button>
            <div className="min-w-0 flex-1">
              {state === "recording" ? (
                <>
                  <canvas ref={canvas} className="h-8 w-full" />
                  <div className="label mt-1 text-[#e0563b] tabular-nums">
                    ● {Math.floor(elapsed / 60)}:{String(Math.floor(elapsed % 60)).padStart(2, "0")} — press to save
                  </div>
                </>
              ) : (
                <p className="text-[12.5px] leading-snug text-[var(--box-muted)]">
                  {state === "denied"
                    ? "Microphone access is blocked. Allow it for this site, then press again."
                    : state === "unsupported"
                      ? "This browser can't record audio."
                      : "Press to record your thoughts on this ayah."}
                </p>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
