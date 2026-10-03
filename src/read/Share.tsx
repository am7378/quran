import { useEffect, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { MotifArt } from "@/components/Motif";
import { themeOf } from "@/lib/surahThemes";
import { AnimatePresence, motion } from "framer-motion";
import { Copy, Download, ImageIcon, Link2, X as Close } from "lucide-react";
import { EASE_OUT, cn, copyText } from "@/lib/utils";

export type ShareFormat = "square" | "landscape" | "story";
const SIZES: Record<ShareFormat, [number, number]> = { square: [1080, 1080], landscape: [1600, 900], story: [1080, 1920] };

export type ShareContent = {
  arabic: string;
  translation: string;
  surahName: string;
  ref: string;
  url: string;
  surah?: number; // the image takes on this surah's card art
  script?: "uthmani" | "indopak";
};

/**
 * A soft blur that works in every browser (canvas filters don't, everywhere): three passes of a
 * box blur each way, which together are all but a gaussian.
 */
function blurCanvas(c: HTMLCanvasElement, r: number) {
  const g = c.getContext("2d")!;
  const w = c.width, h = c.height;
  const img = g.getImageData(0, 0, w, h);
  const a = img.data;
  const b = new Uint8ClampedArray(a.length);
  const pass = (src: Uint8ClampedArray, dst: Uint8ClampedArray, across: boolean) => {
    const len = across ? w : h, lines = across ? h : w, step = across ? 4 : w * 4, n = 2 * r + 1;
    for (let l = 0; l < lines; l++) {
      const base = across ? l * w * 4 : l * 4;
      for (let ch = 0; ch < 3; ch++) {
        let sum = 0;
        for (let k = -r; k <= r; k++) sum += src[base + Math.min(len - 1, Math.max(0, k)) * step + ch];
        for (let i = 0; i < len; i++) {
          dst[base + i * step + ch] = sum / n;
          sum += src[base + Math.min(len - 1, i + r + 1) * step + ch] - src[base + Math.max(0, i - r) * step + ch];
        }
      }
      for (let i = 0; i < len; i++) dst[base + i * step + 3] = 255;
    }
  };
  for (let p = 0; p < 3; p++) {
    pass(a, b, true);
    pass(b, a, false);
  }
  g.putImageData(img, 0, 0);
}

/**
 * The surah card's artwork (its palette and motif), drawn at a quarter of the image's size,
 * blurred the way the card is, then smoothed up to full size: soft, with no blocks or steps.
 */
async function cardBackdrop(n: number, W: number, H: number): Promise<HTMLCanvasElement | null> {
  try {
    const t = themeOf(n);
    const host = document.createElement("div");
    const root = createRoot(host);
    flushSync(() => root.render(<MotifArt motif={t.m} p={t.p} seed={n} />));
    let svg = host.innerHTML;
    root.unmount();
    svg = svg.replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="280" ');
    const img = new Image();
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    await img.decode();
    // cover the image with the art, as the card does (the art overscans by 12%)
    const s = document.createElement("canvas");
    s.width = Math.round(W / 4);
    s.height = Math.round(H / 4);
    const g = s.getContext("2d", { willReadFrequently: true })!;
    g.fillStyle = "#0b1320";
    g.fillRect(0, 0, s.width, s.height);
    const scale = Math.max(s.width / img.width, s.height / img.height) * 1.24;
    const dw = img.width * scale, dh = img.height * scale;
    g.drawImage(img, (s.width - dw) / 2, (s.height - dh) / 2, dw, dh);
    blurCanvas(s, Math.round(Math.max(s.width, s.height) * 0.03));
    return s;
  } catch {
    return null;
  }
}

/* ── the image ──────────────────────────────────────────────────── */

export function wrap(g: CanvasRenderingContext2D, text: string, width: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (g.measureText(test).width > width && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

function hexA(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

let grainTile: HTMLCanvasElement | null = null;
export function grain() {
  if (grainTile) return grainTile;
  const c = document.createElement("canvas");
  c.width = c.height = 160;
  const g = c.getContext("2d")!;
  const img = g.createImageData(160, 160);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random() * 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 22;
  }
  g.putImageData(img, 0, 0);
  return (grainTile = c);
}

/** Draw the ayah and its translation — nothing else but the reference. */
export async function renderAyahImage(o: ShareContent, format: ShareFormat): Promise<Blob> {
  const [W, H] = SIZES[format];
  const arFont = o.script === "indopak" ? '"IndoPak"' : '"KFGQPC HAFS"';
  await Promise.all([
    document.fonts.load(`64px ${arFont}`),
    document.fonts.load('400 40px "Newsreader Variable"'),
    document.fonts.load('24px "Geist Mono Variable"'),
  ]).catch(() => {});
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;

  const glow = (x: number, y: number, r: number, col: string) => {
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, col);
    rg.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = rg;
    g.fillRect(0, 0, W, H);
  };
  const art = o.surah ? await cardBackdrop(o.surah, W, H) : null;
  if (art) {
    // the surah card's art, blurred by scaling, under a veil dark enough for the text
    const pal = themeOf(o.surah!).p;
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = "high";
    g.drawImage(art, 0, 0, W, H);
    const veil = g.createLinearGradient(0, 0, 0, H);
    veil.addColorStop(0, "rgba(6,8,12,0.52)");
    veil.addColorStop(0.5, "rgba(6,8,12,0.44)");
    veil.addColorStop(1, "rgba(6,8,12,0.66)");
    g.fillStyle = veil;
    g.fillRect(0, 0, W, H);
    glow(W * 0.82, H * 0.08, Math.max(W, H) * 0.6, hexA(pal[0], 0.22));
    glow(W * 0.1, H * 0.95, Math.max(W, H) * 0.7, hexA(pal[1], 0.26));
  } else {
    // lapis night with two soft glows
    const bg = g.createLinearGradient(0, 0, W * 0.5, H);
    bg.addColorStop(0, "#15284a");
    bg.addColorStop(1, "#070b14");
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    glow(W * 0.82, H * 0.08, Math.max(W, H) * 0.6, "rgba(201,162,74,0.20)");
    glow(W * 0.1, H * 0.95, Math.max(W, H) * 0.7, "rgba(62,107,115,0.32)");
  }
  g.fillStyle = g.createPattern(grain(), "repeat")!;
  g.fillRect(0, 0, W, H);
  const m = Math.round(Math.min(W, H) * 0.045);
  g.strokeStyle = "rgba(239,233,221,0.16)";
  g.lineWidth = 2;
  g.strokeRect(m, m, W - 2 * m, H - 2 * m);

  // fit the text into the space inside the frame: as large as it will go (a short ayah fills the
  // picture, whatever its shape), smaller only as far as it must, and centred in that space
  const fs = Math.round(Math.min(W, H) * 0.021); // the reference at the foot
  const top = m + Math.min(W, H) * 0.07;
  const bottom = H - m - fs * 2.2 - fs * 2.4; // above the reference, with air between
  const avail = bottom - top;
  const padX = W * (format === "landscape" ? 0.09 : 0.11);
  const aw = W - 2 * padX;
  // a landscape line of translation stays a comfortable length to read
  const tw = format === "landscape" ? Math.min(aw, W * 0.7) : aw;
  let ar = Math.min(W, H) * (format === "landscape" ? 0.12 : format === "story" ? 0.095 : 0.09);
  let tr = ar * 0.56;
  let arLines: string[] = [], trLines: string[] = [];
  const gap = () => ar * 0.9;
  const height = () => arLines.length * ar * 1.95 + (trLines.length ? gap() + trLines.length * tr * 1.45 : 0);
  for (let i = 0; i < 60; i++) {
    g.font = `${ar}px ${arFont}`;
    g.direction = "rtl";
    arLines = wrap(g, o.arabic, aw);
    g.direction = "ltr";
    g.font = `400 ${tr}px "Newsreader Variable"`;
    trLines = o.translation ? wrap(g, o.translation, tw) : [];
    if (height() <= avail || ar < 22) break;
    ar *= 0.95;
    tr = Math.max(17, ar * 0.56);
  }
  const total = height();
  let y = top + (avail - total) / 2;

  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillStyle = "#efe9dd";
  g.direction = "rtl";
  g.font = `${ar}px ${arFont}`;
  for (const line of arLines) {
    g.fillText(line, W / 2, y + ar * 0.975);
    y += ar * 1.95;
  }
  if (trLines.length) {
    y += gap() / 2;
    g.strokeStyle = "rgba(201,162,74,0.7)";
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(W / 2 - 24, y);
    g.lineTo(W / 2 + 24, y);
    g.stroke();
    y += gap() / 2;
    g.direction = "ltr";
    g.fillStyle = "rgba(239,233,221,0.86)";
    g.font = `400 ${tr}px "Newsreader Variable"`;
    for (const line of trLines) {
      g.fillText(line, W / 2, y + tr * 0.72);
      y += tr * 1.45;
    }
  }

  // the reference only
  g.direction = "ltr";
  g.fillStyle = "rgba(239,233,221,0.58)";
  g.font = `${fs}px "Geist Mono Variable", monospace`;
  if ("letterSpacing" in g) (g as unknown as { letterSpacing: string }).letterSpacing = `${Math.round(fs * 0.18)}px`;
  g.fillText(`${o.surahName}  ·  ${o.ref}`.toUpperCase(), W / 2, H - m - fs * 2.2);

  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("render failed"))), "image/jpeg", 0.95));
}

/* ── the dialog ─────────────────────────────────────────────────── */

type Dest = "story" | "post" | "x";
const DEST_FORMAT: Record<Dest, ShareFormat> = { story: "story", post: "square", x: "landscape" };

export function ShareDialog({ content, onClose, onToast }: { content: ShareContent | null; onClose: () => void; onToast: (m: string) => void }) {
  const [format, setFormat] = useState<ShareFormat>("square");
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const blobs = useRef(new Map<ShareFormat, Blob>());

  useEffect(() => {
    blobs.current.clear();
  }, [content]);

  const get = async (f: ShareFormat) => {
    if (!content) throw new Error("nothing to share");
    let b = blobs.current.get(f);
    if (!b) {
      b = await renderAyahImage(content, f);
      blobs.current.set(f, b);
    }
    return b;
  };

  useEffect(() => {
    if (!content) return;
    let alive = true;
    let made: string | null = null;
    get(format).then((b) => {
      if (!alive) return;
      made = URL.createObjectURL(b);
      setUrl(made);
    });
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, format]);

  useEffect(() => {
    if (!content) return;
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [content, onClose]);

  if (!content) return createPortal(<AnimatePresence />, document.body);
  const name = `quran-${content.ref.replace(":", "-")}`;

  const download = (b: Blob, f: ShareFormat) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(b);
    a.download = `${name}-${f}.jpg`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  const shareTo = async (d: Dest) => {
    const f = DEST_FORMAT[d];
    setFormat(f);
    setBusy(true);
    try {
      const b = await get(f);
      const file = new File([b], `${name}-${f}.jpg`, { type: "image/jpeg" });
      if (navigator.canShare?.({ files: [file] })) {
        // on phones this opens the share sheet, where Instagram (story or post) and X appear
        await navigator.share({ files: [file], title: `${content.surahName} ${content.ref}` });
      } else {
        download(b, f);
        if (d === "x") {
          const text = `${content.translation}\n— ${content.surahName} ${content.ref}`;
          window.open(`https://x.com/intent/post?text=${encodeURIComponent(text.slice(0, 240))}&url=${encodeURIComponent(content.url)}`, "_blank", "noopener");
          onToast("Image saved. Attach it to the post that just opened.");
        } else onToast(d === "story" ? "Image saved. Add it to your Instagram story from your gallery." : "Image saved. Post it on Instagram from your gallery.");
      }
    } catch {
      /* the share sheet was dismissed */
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="share"
        className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onPointerDown={(e) => e.target === e.currentTarget && onClose()}
      >
        <motion.div
          role="dialog"
          aria-label={`Share ${content.ref}`}
          className="theme-dialog relative flex max-h-[92vh] w-full max-w-[880px] flex-col overflow-hidden border-[3px] border-[#06080c] bg-[#0a0f18] text-[#efe9dd] shadow-[0_40px_120px_-30px_rgba(0,0,0,0.8)] md:flex-row"
          initial={{ y: 20, opacity: 0, scale: 0.98 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, ease: EASE_OUT }}
        >
          <div className="grain-local" />
          {/* preview */}
          <div className="relative flex min-h-[240px] flex-1 items-center justify-center bg-black/30 p-5 md:p-8">
            {url ? (
              <motion.img
                key={url}
                src={url}
                alt={`${content.surahName} ${content.ref} as an image`}
                className="max-h-[52vh] max-w-full object-contain shadow-[0_20px_60px_-20px_rgba(0,0,0,0.9)] md:max-h-[70vh]"
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.35, ease: EASE_OUT }}
              />
            ) : (
              <span className="label text-white/40">Drawing the image…</span>
            )}
          </div>
          {/* controls */}
          <div className="relative flex w-full flex-col gap-6 border-t border-white/10 p-5 md:w-[320px] md:border-l md:border-t-0 md:p-7">
            <div className="flex items-start justify-between">
              <div>
                <div className="label text-white/45">Share</div>
                <div className="mt-1 font-serif text-[22px] italic">
                  {content.surahName} <span className="font-mono text-[14px] not-italic text-white/60">{content.ref}</span>
                </div>
              </div>
              <button type="button" onClick={onClose} aria-label="Close" className="flex h-8 w-8 items-center justify-center text-white/60 hover:bg-white/10 hover:text-white">
                <Close size={16} />
              </button>
            </div>

            <div>
              <div className="label mb-2 text-white/45">Shape</div>
              <div className="flex border border-white/15 p-0.5">
                {(["square", "landscape", "story"] as ShareFormat[]).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFormat(f)}
                    aria-pressed={format === f}
                    className={cn("label relative flex-1 py-2 transition-colors", format === f ? "text-[#0a0f18]" : "text-white/60 hover:text-white")}
                  >
                    {format === f && <motion.span layoutId="share-shape" className="absolute inset-0 bg-[#efe9dd]" transition={{ duration: 0.3, ease: EASE_OUT }} />}
                    <span className="relative">{f === "square" ? "Square" : f === "landscape" ? "Landscape" : "Story"}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="label mb-2 text-white/45">Send to</div>
              <div className="grid grid-cols-3 gap-1.5">
                <Dest onClick={() => shareTo("story")} busy={busy} label="Story" sub="Instagram" glyph={<IgGlyph />} />
                <Dest onClick={() => shareTo("post")} busy={busy} label="Post" sub="Instagram" glyph={<IgGlyph />} />
                <Dest onClick={() => shareTo("x")} busy={busy} label="Post" sub="X" glyph={<span className="text-[17px] font-semibold leading-none">𝕏</span>} />
              </div>
            </div>

            <div className="flex flex-col">
              <Row icon={<Download size={14} />} label="Save image" onClick={async () => download(await get(format), format)} />
              <Row
                icon={<ImageIcon size={14} />}
                label="Copy image"
                onClick={async () => {
                  try {
                    // the clipboard takes PNG only
                    const bmp = await createImageBitmap(await get(format));
                    const cv = document.createElement("canvas");
                    cv.width = bmp.width;
                    cv.height = bmp.height;
                    cv.getContext("2d")!.drawImage(bmp, 0, 0);
                    const png = await new Promise<Blob>((r) => cv.toBlob((b) => r(b!), "image/png"));
                    await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
                    onToast("Image copied");
                  } catch {
                    onToast("This browser can't copy images — use Save image");
                  }
                }}
              />
              <Row
                icon={<Copy size={14} />}
                label="Copy text"
                onClick={async () => {
                  (await copyText(`${content.arabic}\n\n${content.translation}\n\n— ${content.surahName} ${content.ref}`)) && onToast(`Copied ${content.ref}`);
                }}
              />
              <Row icon={<Link2 size={14} />} label="Copy link" onClick={async () => (await copyText(content.url)) && onToast("Link copied")} />
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}

function Dest({ onClick, label, sub, glyph, busy }: { onClick: () => void; label: string; sub: string; glyph: React.ReactNode; busy: boolean }) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onClick}
      className="group flex flex-col items-start gap-3 border border-white/15 p-3 text-left transition-colors hover:border-white/50 hover:bg-white/5 disabled:opacity-50"
    >
      <span className="text-white/80 transition-transform duration-300 group-hover:-translate-y-0.5">{glyph}</span>
      <span>
        <span className="block text-[13px]">{label}</span>
        <span className="label-sm text-white/45">{sub}</span>
      </span>
    </button>
  );
}

function Row({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex items-center gap-3 border-t border-white/10 py-2.5 text-left text-white/75 transition-colors hover:text-white">
      {icon}
      <span className="text-[13px]">{label}</span>
    </button>
  );
}

function IgGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.3" cy="6.7" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}
