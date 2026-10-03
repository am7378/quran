import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { get } from "idb-keyval";
import { Copy, Download, Share2, X as Close } from "lucide-react";
import type { Note } from "@/lib/store";
import { EASE_OUT, cn, copyText } from "@/lib/utils";
import { grain, wrap } from "./Share";
import { voiceKey } from "./VoiceNote";

/**
 * Sharing a note: a written note leaves as a picture of the sticky note itself (with its text
 * alongside), a voice note as a short video of its card playing the recording.
 */

const S = 1080;

/** the night the site sits in, as the ground the note lies on */
function ground(g: CanvasRenderingContext2D) {
  const bg = g.createLinearGradient(0, 0, S * 0.5, S);
  bg.addColorStop(0, "#15284a");
  bg.addColorStop(1, "#070b14");
  g.fillStyle = bg;
  g.fillRect(0, 0, S, S);
  const glow = (x: number, y: number, r: number, col: string) => {
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, col);
    rg.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = rg;
    g.fillRect(0, 0, S, S);
  };
  glow(S * 0.82, S * 0.08, S * 0.6, "rgba(201,162,74,0.18)");
  glow(S * 0.1, S * 0.95, S * 0.7, "rgba(62,107,115,0.3)");
  g.fillStyle = g.createPattern(grain(), "repeat")!;
  g.fillRect(0, 0, S, S);
}

function caption(g: CanvasRenderingContext2D, text: string) {
  g.save();
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillStyle = "rgba(239,233,221,0.6)";
  g.font = '22px "Geist Mono Variable", monospace';
  if ("letterSpacing" in g) (g as unknown as { letterSpacing: string }).letterSpacing = "4px";
  g.fillText(text.toUpperCase(), S / 2, S - 62);
  g.restore();
}

function tape(g: CanvasRenderingContext2D, x: number, y: number, w: number, rot: number) {
  g.save();
  g.translate(x, y);
  g.rotate((rot * Math.PI) / 180);
  g.fillStyle = "rgba(255,255,255,0.5)";
  g.shadowColor = "rgba(0,0,0,0.12)";
  g.shadowBlur = 3;
  g.shadowOffsetY = 1;
  g.fillRect(-w / 2, -26, w, 52);
  g.restore();
}

/** the page curl in the bottom-right corner */
function curl(g: CanvasRenderingContext2D, x: number, y: number, size: number, back: string, front: string) {
  const grd = g.createLinearGradient(x - size, y - size, x, y);
  grd.addColorStop(0, "rgba(0,0,0,0)");
  grd.addColorStop(0.45, "rgba(0,0,0,0)");
  grd.addColorStop(0.5, "rgba(0,0,0,0.16)");
  grd.addColorStop(0.56, back);
  grd.addColorStop(1, front);
  g.fillStyle = grd;
  g.fillRect(x - size, y - size, size, size);
}

async function fonts() {
  await Promise.all([document.fonts.load('48px "Caveat Variable"'), document.fonts.load('22px "Geist Mono Variable"')]).catch(() => {});
}

const toBlob = (c: HTMLCanvasElement, type = "image/png") =>
  new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("render failed"))), type, 0.95));

/** A written note as the yellow sticky note it is, lying on the night. */
export async function renderNoteImage(note: Note, surahName: string): Promise<Blob> {
  await fonts();
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d")!;
  ground(g);

  const P = 700, x0 = (S - P) / 2, y0 = (S - P) / 2 - 30;
  g.save();
  g.translate(S / 2, y0 + P / 2);
  g.rotate((Math.max(-3, Math.min(3, note.rot)) * Math.PI) / 180);
  g.translate(-S / 2, -(y0 + P / 2));
  // the paper, its lines and its light
  g.save();
  g.shadowColor = "rgba(0,0,0,0.5)";
  g.shadowBlur = 70;
  g.shadowOffsetY = 34;
  const paper = g.createLinearGradient(x0, y0, x0 + P * 0.6, y0 + P);
  paper.addColorStop(0, "#fff1a1");
  paper.addColorStop(0.55, "#fde47a");
  paper.addColorStop(1, "#f7d65e");
  g.fillStyle = paper;
  g.fillRect(x0, y0, P, P);
  g.restore();
  const lift = g.createLinearGradient(0, y0, 0, y0 + 90);
  lift.addColorStop(0, "rgba(255,255,255,0.35)");
  lift.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = lift;
  g.fillRect(x0, y0, P, 90);
  const LH = 58;
  g.fillStyle = "rgba(80,110,170,0.28)";
  for (let y = y0 + 150; y < y0 + P - 20; y += LH) g.fillRect(x0, y, P, 2);
  curl(g, x0 + P, y0 + P, 80, "#f3e08a", "#fff4b8");
  tape(g, S / 2, y0 + 4, 210, -3);

  // the ayah it is on, the words it holds on to, and what was written
  const padX = 56;
  g.textBaseline = "alphabetic";
  g.fillStyle = "#6b5a24";
  g.font = '22px "Geist Mono Variable", monospace';
  if ("letterSpacing" in g) (g as unknown as { letterSpacing: string }).letterSpacing = "4px";
  g.fillText(`AYAH ${note.key}`, x0 + padX, y0 + 92);
  if ("letterSpacing" in g) (g as unknown as { letterSpacing: string }).letterSpacing = "0px";
  let line = y0 + 150 - 12; // writing sits on the ruled lines
  if (note.quote) {
    g.font = '36px "Caveat Variable", cursive';
    const q = wrap(g, `“${note.quote}”`, P - padX * 2 - 22).slice(0, 2);
    g.fillStyle = "#c9a24a";
    g.fillRect(x0 + padX, line - LH + 18, 4, q.length * LH - 4);
    g.fillStyle = "#6b5a24";
    for (const l of q) {
      g.fillText(l, x0 + padX + 20, line);
      line += LH;
    }
  }
  const room = Math.floor((y0 + P - 40 - line) / LH) + 1;
  let size = 48;
  let lines: string[] = [];
  for (; size >= 30; size -= 3) {
    g.font = `${size}px "Caveat Variable", cursive`;
    lines = note.text.split("\n").flatMap((p) => (p.trim() ? wrap(g, p, P - padX * 2) : [""]));
    if (lines.length <= room) break;
  }
  if (lines.length > room) {
    lines = lines.slice(0, room);
    lines[room - 1] = lines[room - 1].replace(/\s*\S*$/, "") + "…";
  }
  g.fillStyle = "#2b2410";
  for (const l of lines) {
    g.fillText(l, x0 + padX, line);
    line += LH;
  }
  g.restore();

  caption(g, `${surahName} · ${note.key}`);
  return toBlob(c);
}

/** the same recording-shaped bars the card draws */
export function noteBars(note: Note, n = 26) {
  let s = [...(note.audio ?? note.id)].reduce((a, c) => a + c.charCodeAt(0), 7);
  return Array.from({ length: n }, () => {
    s = (s * 9301 + 49297) % 233280;
    return 0.25 + (s / 233280) * 0.75;
  });
}

const clock = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

function drawVoice(g: CanvasRenderingContext2D, note: Note, surahName: string, bars: number[], t: number, dur: number) {
  ground(g);
  const W = 780, H = 430, x0 = (S - W) / 2, y0 = (S - H) / 2 - 30;
  g.save();
  g.translate(S / 2, S / 2 - 30);
  g.rotate((Math.max(-3, Math.min(3, note.rot)) * Math.PI) / 180);
  g.translate(-S / 2, -(S / 2 - 30));
  g.save();
  g.shadowColor = "rgba(0,0,0,0.5)";
  g.shadowBlur = 70;
  g.shadowOffsetY = 34;
  const kraft = g.createLinearGradient(x0, y0, x0 + W * 0.6, y0 + H);
  kraft.addColorStop(0, "#e9d7ae");
  kraft.addColorStop(0.6, "#dcc38f");
  kraft.addColorStop(1, "#d2b67c");
  g.fillStyle = kraft;
  g.fillRect(x0, y0, W, H);
  g.restore();
  curl(g, x0 + W, y0 + H, 70, "#c9ad74", "#ecdcb4");
  tape(g, x0 + 150, y0 + 4, 170, 4);

  g.fillStyle = "#3a2c14";
  g.font = '58px "Caveat Variable", cursive';
  g.textBaseline = "alphabetic";
  g.fillText("voice note", x0 + 50, y0 + 100);
  if (note.quote) {
    g.fillStyle = "#6b5024";
    g.font = '36px "Caveat Variable", cursive';
    const q = wrap(g, `on “${note.quote}”`, W - 100)[0] ?? "";
    g.fillText(q, x0 + 50, y0 + 148);
  }
  // play button and the recording's shape, filling as it plays
  const cy = y0 + H - 150, r = 44;
  g.fillStyle = "#3a2c14";
  g.beginPath();
  g.arc(x0 + 50 + r, cy, r, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#e9d7ae";
  if (t > 0 && t < dur) {
    g.fillRect(x0 + 50 + r - 13, cy - 15, 9, 30);
    g.fillRect(x0 + 50 + r + 4, cy - 15, 9, 30);
  } else {
    g.beginPath();
    g.moveTo(x0 + 50 + r - 10, cy - 17);
    g.lineTo(x0 + 50 + r + 16, cy);
    g.lineTo(x0 + 50 + r - 10, cy + 17);
    g.fill();
  }
  const bx = x0 + 50 + r * 2 + 30, bw = W - (bx - x0) - 50, gap = 5;
  const each = (bw - gap * (bars.length - 1)) / bars.length;
  const p = dur ? t / dur : 0;
  bars.forEach((b, i) => {
    const h = b * 74;
    g.fillStyle = i / bars.length < p ? "#8a5a12" : "rgba(58,44,20,0.35)";
    g.fillRect(bx + i * (each + gap), cy - h / 2, each, h);
  });
  g.fillStyle = "#6b5024";
  g.font = '22px "Geist Mono Variable", monospace';
  if ("letterSpacing" in g) (g as unknown as { letterSpacing: string }).letterSpacing = "4px";
  g.fillText(`AYAH ${note.key}`, x0 + 50, y0 + H - 42);
  const tm = `${clock(Math.min(t, dur))} / ${clock(dur)}`;
  g.fillText(tm, x0 + W - 90 - g.measureText(tm).width, y0 + H - 42);
  if ("letterSpacing" in g) (g as unknown as { letterSpacing: string }).letterSpacing = "0px";
  g.restore();
  caption(g, `${surahName} · ${note.key}`);
}

const VIDEO_TYPES = ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];

/** A voice note as a video: its card, playing, with the recording as the sound. */
export async function renderVoiceVideo(note: Note, surahName: string, onProgress: (p: number) => void): Promise<Blob> {
  const audio = note.audio ? await get<Blob>(voiceKey(note.audio)) : null;
  if (!audio) throw new Error("The recording isn't on this device");
  if (typeof MediaRecorder === "undefined") throw new Error("This browser can't make videos");
  await fonts();
  const type = VIDEO_TYPES.find((t) => MediaRecorder.isTypeSupported(t));
  if (!type) throw new Error("This browser can't make videos");

  const ac = new AudioContext();
  const buf = await ac.decodeAudioData(await audio.arrayBuffer());
  const dur = buf.duration;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d")!;
  const bars = noteBars(note, 40);
  drawVoice(g, note, surahName, bars, 0, dur);

  const dest = ac.createMediaStreamDestination(); // heard by the video only, not the room
  const src = ac.createBufferSource();
  src.buffer = buf;
  src.connect(dest);
  const stream = new MediaStream([...c.captureStream(30).getVideoTracks(), ...dest.stream.getAudioTracks()]);
  const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 4_000_000 });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise<Blob>((res) => (rec.onstop = () => res(new Blob(chunks, { type: type.split(";")[0] }))));

  rec.start(250);
  const lead = 0.4; // a moment of the card before it plays, and after
  const t0 = ac.currentTime;
  src.start(t0 + lead);
  const tick = window.setInterval(() => {
    const t = ac.currentTime - t0 - lead;
    drawVoice(g, note, surahName, bars, Math.max(0, t), dur);
    onProgress(Math.max(0, Math.min(1, (t + lead) / (dur + lead * 2))));
    if (t >= dur + lead) {
      window.clearInterval(tick);
      rec.stop();
      stream.getTracks().forEach((tr) => tr.stop());
      ac.close();
    }
  }, 1000 / 30);
  return done;
}

const shareText = (note: Note, surahName: string) =>
  note.kind === "voice"
    ? `A voice note on ${surahName} ${note.key}`
    : `${note.text.trim()}${note.quote ? `\n\non “${note.quote}”` : ""}\n\n— my note on ${surahName} ${note.key}`;

/** The dialog: the picture or the video, and the ways to send it. */
export function NoteShareDialog({ note, surahName, onClose, onToast }: { note: Note | null; surahName: string; onClose: () => void; onToast: (m: string) => void }) {
  const [blob, setBlob] = useState<Blob | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const voice = note?.kind === "voice";

  useEffect(() => {
    setBlob(null);
    setUrl(null);
    setError(null);
    setProgress(0);
    if (!note) return;
    let alive = true;
    let made: string | null = null;
    (voice ? renderVoiceVideo(note, surahName, (p) => alive && setProgress(p)) : renderNoteImage(note, surahName))
      .then((b) => {
        if (!alive) return;
        made = URL.createObjectURL(b);
        setBlob(b);
        setUrl(made);
      })
      .catch((e: Error) => alive && setError(e.message || "This note couldn't be drawn"));
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [note, surahName, voice]);

  useEffect(() => {
    if (!note) return;
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [note, onClose]);

  const ext = blob?.type.includes("mp4") ? "mp4" : blob?.type.includes("webm") ? "webm" : "png";
  const name = note ? `quran-note-${note.key.replace(":", "-")}.${ext}` : "";
  const file = blob ? new File([blob], name, { type: blob.type }) : null;
  const canShare = !!file && !!navigator.canShare?.({ files: [file] });

  const save = () => {
    if (!blob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  const share = async () => {
    if (!file || !note || busy.current) return;
    busy.current = true;
    try {
      await navigator.share({ files: [file], text: shareText(note, surahName), title: `Note on ${surahName} ${note.key}` });
    } catch {
      /* the share sheet was dismissed */
    } finally {
      busy.current = false;
    }
  };

  return createPortal(
    <AnimatePresence>
      {note && (
        <motion.div
          key="note-share"
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onPointerDown={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            role="dialog"
            aria-label={`Share your note on ${note.key}`}
            className="theme-dialog relative flex max-h-[92vh] w-full max-w-[760px] flex-col overflow-hidden border-[3px] border-[#06080c] bg-[#0a0f18] text-[#efe9dd] shadow-[0_40px_120px_-30px_rgba(0,0,0,0.8)] md:flex-row"
            initial={{ y: 20, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, ease: EASE_OUT }}
          >
            <div className="grain-local" />
            <div className="relative flex min-h-[240px] flex-1 items-center justify-center bg-black/30 p-5 md:p-7">
              {url ? (
                voice ? (
                  <video src={url} controls playsInline className="max-h-[52vh] max-w-full shadow-[0_20px_60px_-20px_rgba(0,0,0,0.9)] md:max-h-[64vh]" />
                ) : (
                  <img src={url} alt={`Your note on ${note.key}`} className="max-h-[52vh] max-w-full object-contain shadow-[0_20px_60px_-20px_rgba(0,0,0,0.9)] md:max-h-[64vh]" />
                )
              ) : error ? (
                <span className="max-w-[30ch] text-center font-serif text-[16px] text-white/60">{error}</span>
              ) : (
                <div className="flex w-48 flex-col items-center gap-3">
                  <span className="label text-white/45">{voice ? "Making the video…" : "Drawing the note…"}</span>
                  {voice && (
                    <span className="relative h-px w-full bg-white/15">
                      <span className="absolute inset-y-0 left-0 bg-[#c9a24a]" style={{ width: `${progress * 100}%` }} />
                    </span>
                  )}
                </div>
              )}
            </div>
            <div className="relative flex w-full flex-col gap-5 border-t border-white/10 p-5 md:w-[260px] md:border-l md:border-t-0 md:p-6">
              <div className="flex items-start justify-between">
                <div>
                  <div className="label text-white/45">Share your note</div>
                  <div className="mt-1 font-serif text-[20px] italic">
                    {surahName} <span className="font-mono text-[13px] not-italic text-white/60">{note.key}</span>
                  </div>
                </div>
                <button type="button" onClick={onClose} aria-label="Close" className="flex h-8 w-8 items-center justify-center text-white/60 hover:bg-white/10 hover:text-white">
                  <Close size={16} />
                </button>
              </div>
              <div className="flex flex-col">
                {canShare && (
                  <button
                    type="button"
                    onClick={share}
                    className="mb-3 flex items-center justify-center gap-2 border border-white/60 px-3 py-2.5 transition-colors hover:bg-[#efe9dd] hover:text-[#0a0f18]"
                  >
                    <Share2 size={14} />
                    <span className="label">Share {voice ? "video" : "image"}</span>
                  </button>
                )}
                <Row icon={<Download size={14} />} label={voice ? "Save video" : "Save image"} onClick={save} disabled={!blob} />
                {!voice && (
                  <Row
                    icon={<Copy size={14} />}
                    label="Copy text"
                    onClick={async () => (await copyText(shareText(note, surahName))) && onToast("Note copied")}
                  />
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function Row({ icon, label, onClick, disabled }: { icon: React.ReactNode; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn("flex items-center gap-3 border-t border-white/10 py-2.5 text-left text-white/75 transition-colors hover:text-white disabled:opacity-40")}
    >
      {icon}
      <span className="text-[13px]">{label}</span>
    </button>
  );
}
