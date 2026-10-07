import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { MotifArt } from "@/components/Motif";
import { themeOf } from "@/lib/surahThemes";
import { AnimatePresence, motion } from "framer-motion";
import { Copy, Download, ImageIcon, Link2, X as Close } from "lucide-react";
import { EASE_OUT, cn, copyText } from "@/lib/utils";
import { ayn, drawingHats, nameMarks } from "@/lib/names";
import type { ThemeId } from "@/lib/themes";
import { loadIndex } from "@/lib/data";

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
  theme?: ThemeId; // drawn the way this theme is
  box?: "night" | "paper";
  sky?: "dark" | "light"; // Monochrome's page around the frame
  /** a part of the ayah (a highlight): `arabic` and `translation` are then the part and the other side whole */
  part?: SharePart;
};

/**
 * Sharing a part of an ayah: the side the reader highlighted, and the other side's words to choose
 * from, with a first guess at the ones that go with the part (align.ts).
 */
export type SharePart = {
  side: "ar" | "tr";
  other: string[];
  guess: [number, number] | null;
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

/* ── each theme's way of drawing it ─────────────────────────────────
   The same picture in every theme (the ayah, its translation, the reference and nothing else), set
   the way the theme sets the reader: its colours, lettering, rules and ground. */

type Area = { top: number; bottom: number; padX: number };
type Ctx = { W: number; H: number; S: number; m: number; fs: number; format: ShareFormat; art: HTMLCanvasElement | null; seed: number; title?: string };
type Look = {
  art?: "colour" | "grey"; // the surah card's art under it
  fonts: string[]; // loaded before drawing
  ar: string;
  tr: string;
  trFont: (px: number) => string;
  /** the ground, the frame and its marks; returns where the text may go */
  paint: (g: CanvasRenderingContext2D, k: Ctx) => Area;
  /** the mark between the Arabic and the translation */
  rule: (g: CanvasRenderingContext2D, x: number, y: number, k: Ctx) => void;
  reference: (g: CanvasRenderingContext2D, k: Ctx, name: string, ref: string) => void;
};

const spacing = (g: CanvasRenderingContext2D, px: number) => {
  if ("letterSpacing" in g) (g as unknown as { letterSpacing: string }).letterSpacing = `${Math.round(px)}px`;
};
const line = (g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number) => {
  g.beginPath();
  g.moveTo(x0, y0);
  g.lineTo(x1, y1);
  g.stroke();
};
function glowAt(g: CanvasRenderingContext2D, k: Ctx, x: number, y: number, r: number, col: string) {
  const rg = g.createRadialGradient(x, y, 0, x, y, r);
  rg.addColorStop(0, col);
  rg.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = rg;
  g.fillRect(0, 0, k.W, k.H);
}
function grainOn(g: CanvasRenderingContext2D, k: Ctx, alpha = 1) {
  g.save();
  g.globalAlpha = alpha;
  g.fillStyle = g.createPattern(grain(), "repeat")!;
  g.fillRect(0, 0, k.W, k.H);
  g.restore();
}
function rounded(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
/** the art in greys, as Monochrome shows the surahs' cards */
function grey(c: HTMLCanvasElement) {
  const g = c.getContext("2d")!;
  const img = g.getImageData(0, 0, c.width, c.height);
  const a = img.data;
  for (let i = 0; i < a.length; i += 4) a[i] = a[i + 1] = a[i + 2] = a[i] * 0.299 + a[i + 1] * 0.587 + a[i + 2] * 0.114;
  g.putImageData(img, 0, 0);
  return c;
}
/** a seeded random: a surah's sky comes out the same each time */
function seeded(seed: number) {
  let s = (Math.abs(seed) * 7919 + 104729) % 233280 || 1;
  return () => (s = (s * 9301 + 49297) % 233280) / 233280;
}

/* Classic: lapis night (or the surah card's art under a veil), a gold rule */
const classic: Look = {
  art: "colour",
  fonts: ['400 40px "Alegreya Variable"', '24px "Geist Mono Variable"'],
  ar: "#efe9dd",
  tr: "rgba(239,233,221,0.86)",
  trFont: (px) => `400 ${px}px "Alegreya Variable"`,
  paint(g, k) {
    const { W, H, S, m, fs, art } = k;
    if (art) {
      // the surah card's art, blurred by scaling, under a veil dark enough for the text
      const pal = themeOf(k.seed).p;
      g.drawImage(art, 0, 0, W, H);
      const veil = g.createLinearGradient(0, 0, 0, H);
      veil.addColorStop(0, "rgba(6,8,12,0.52)");
      veil.addColorStop(0.5, "rgba(6,8,12,0.44)");
      veil.addColorStop(1, "rgba(6,8,12,0.66)");
      g.fillStyle = veil;
      g.fillRect(0, 0, W, H);
      glowAt(g, k, W * 0.82, H * 0.08, Math.max(W, H) * 0.6, hexA(pal[0], 0.22));
      glowAt(g, k, W * 0.1, H * 0.95, Math.max(W, H) * 0.7, hexA(pal[1], 0.26));
    } else {
      // lapis night with two soft glows
      const bg = g.createLinearGradient(0, 0, W * 0.5, H);
      bg.addColorStop(0, "#15284a");
      bg.addColorStop(1, "#070b14");
      g.fillStyle = bg;
      g.fillRect(0, 0, W, H);
      glowAt(g, k, W * 0.82, H * 0.08, Math.max(W, H) * 0.6, "rgba(201,162,74,0.20)");
      glowAt(g, k, W * 0.1, H * 0.95, Math.max(W, H) * 0.7, "rgba(62,107,115,0.32)");
    }
    grainOn(g, k);
    g.strokeStyle = "rgba(239,233,221,0.16)";
    g.lineWidth = 2;
    g.strokeRect(m, m, W - 2 * m, H - 2 * m);
    return { top: m + S * 0.07, bottom: H - m - fs * 4.6, padX: W * (k.format === "landscape" ? 0.09 : 0.11) };
  },
  rule(g, x, y) {
    g.strokeStyle = "rgba(201,162,74,0.7)";
    g.lineWidth = 2;
    line(g, x - 24, y, x + 24, y);
  },
  reference(g, k, name, ref) {
    g.textAlign = "center";
    g.fillStyle = "rgba(239,233,221,0.58)";
    g.font = `${k.fs}px "Geist Mono Variable", monospace`;
    spacing(g, k.fs * 0.18);
    g.fillText(`${name}  ·  ${ref}`.toUpperCase(), k.W / 2, k.H - k.m - k.fs * 2.2);
  },
};

/* Monochrome: a charcoal sheet on stone, drawn square: viewfinder marks, a dashed foot with the
   reference set like a sheet's footer, a checkerboard strip beneath; the art in greys ("White":
   the sheet turned to paper) */
function mono(white: boolean, dark: boolean): Look {
  const ground = dark ? "#121212" : "#e6e2dc", ink = dark ? "#ece6dc" : "#161616";
  const fg = white ? "22,22,22" : "236,230,220";
  const geom = (k: Ctx) => {
    const q = Math.round(k.S * 0.012); // the checkerboard's squares
    const x0 = k.m, y0 = k.m, x1 = k.W - k.m, y1 = k.H - k.m - 2 * q;
    return { q, x0, y0, x1, y1, foot: y1 - k.fs * 4.6, pad: k.S * 0.045 };
  };
  return {
    art: "grey",
    fonts: ['400 40px "Space Grotesk Variable"', '24px "Space Mono"'],
    ar: `rgb(${fg})`,
    tr: `rgba(${fg},0.84)`,
    trFont: (px) => `400 ${Math.round(px * 0.96)}px "Space Grotesk Variable"`,
    paint(g, k) {
      const { W, H, S, art } = k;
      const { q, x0, y0, x1, y1, foot, pad } = geom(k);
      g.fillStyle = ground;
      g.fillRect(0, 0, W, H);
      grainOn(g, k, 0.7);
      g.fillStyle = white ? "#f3f0ea" : "#161616";
      g.fillRect(x0, y0, x1 - x0, y1 - y0);
      if (art) {
        g.save();
        g.beginPath();
        g.rect(x0, y0, x1 - x0, y1 - y0);
        g.clip();
        g.globalAlpha = white ? 0.1 : 0.22;
        g.drawImage(art, 0, 0, W, H);
        g.restore();
      }
      g.strokeStyle = dark && white ? "#f3f0ea" : dark ? "rgba(236,230,220,0.28)" : "#161616";
      g.lineWidth = 2;
      g.strokeRect(x0 + 1, y0 + 1, x1 - x0 - 2, y1 - y0 - 2);
      // the checkerboard strip
      g.fillStyle = ink; // the checkerboard: the page's ink
      for (let r = 0; r < 2; r++)
        for (let x = x0, i = 0; x < x1; x += q, i++) if ((i + r) % 2 === 0) g.fillRect(x, y1 + r * q, Math.min(q, x1 - x), q);
      // viewfinder marks around the text
      const arm = S * 0.04, vy1 = foot - pad * 0.7;
      g.strokeStyle = `rgba(${fg},0.42)`;
      g.lineWidth = 2;
      g.beginPath();
      for (const [cx, cy, dx, dy] of [
        [x0 + pad, y0 + pad, 1, 1],
        [x1 - pad, y0 + pad, -1, 1],
        [x0 + pad, vy1, 1, -1],
        [x1 - pad, vy1, -1, -1],
      ]) {
        g.moveTo(cx, cy + dy * arm);
        g.lineTo(cx, cy);
        g.lineTo(cx + dx * arm, cy);
      }
      g.stroke();
      // the dashed rule above the foot
      g.strokeStyle = `rgba(${fg},0.3)`;
      g.setLineDash([k.fs * 0.55, k.fs * 0.45]);
      line(g, x0, foot, x1, foot);
      g.setLineDash([]);
      return { top: y0 + pad + S * 0.06, bottom: vy1 - S * 0.05, padX: W * (k.format === "landscape" ? 0.1 : 0.13) };
    },
    rule(g, x, y) {
      g.strokeStyle = `rgba(${fg},0.5)`;
      g.lineWidth = 2;
      line(g, x - 46, y, x - 12, y);
      line(g, x + 12, y, x + 46, y);
      g.beginPath();
      g.arc(x, y, 6, 0, Math.PI * 2);
      g.stroke();
    },
    reference(g, k, name, ref) {
      const { x0, x1, y1, foot, pad } = geom(k);
      const y = (foot + y1) / 2;
      g.textBaseline = "middle";
      // the number large at the right, set apart by a rule, as on the sheet
      g.textAlign = "right";
      g.fillStyle = `rgb(${fg})`;
      g.font = `400 ${Math.round(k.fs * 1.6)}px "Space Mono", monospace`;
      spacing(g, 0);
      g.fillText(ref, x1 - pad, y);
      const rx = x1 - pad - g.measureText(ref).width - pad * 0.8;
      g.strokeStyle = `rgba(${fg},0.3)`;
      g.lineWidth = 2;
      line(g, rx, foot, rx, y1);
      g.textAlign = "left";
      g.fillStyle = `rgba(${fg},0.72)`;
      g.font = `${Math.round(k.fs * 0.95)}px "Space Mono", monospace`;
      spacing(g, k.fs * 0.06);
      g.fillText(name.toUpperCase(), x0 + pad, y);
    },
  };
}

/* Atlas: a bone sheet on black, ink type; the dark sheet meeting it at the foot, an ember line where
   they meet, an ember mark and the number in ember */
const atlas: Look = (() => {
  const band = (k: Ctx) => Math.round(k.fs * 5.4);
  return {
    fonts: ['400 40px "Commissioner Variable"', '400 24px "IBM Plex Mono"'],
    ar: "#0e0e0c",
    tr: "rgba(14,14,12,0.8)",
    trFont: (px: number) => `400 ${Math.round(px * 0.97)}px "Commissioner Variable"`,
    paint(g: CanvasRenderingContext2D, k: Ctx) {
      const { W, H, S, m } = k;
      const b = band(k);
      g.fillStyle = "#070707";
      g.fillRect(0, 0, W, H);
      g.fillStyle = "#ebe9dc";
      g.fillRect(m, m, W - 2 * m, H - 2 * m - b);
      g.fillStyle = "#0e0e0c";
      g.fillRect(m, H - m - b, W - 2 * m, b);
      g.fillStyle = "#ff5a2e";
      g.fillRect(m, H - m - b - 2, W - 2 * m, 4);
      grainOn(g, k, 0.8);
      // an ember mark and a hairline along the head
      const pad = S * 0.05, sq = Math.round(S * 0.02);
      g.fillStyle = "#ff5a2e";
      g.fillRect(m + pad, m + pad, sq, sq);
      g.strokeStyle = "rgba(14,14,12,0.22)";
      g.lineWidth = 2;
      line(g, m + pad + sq + S * 0.025, m + pad + sq / 2, W - m - pad, m + pad + sq / 2);
      return { top: m + pad + S * 0.08, bottom: H - m - b - S * 0.06, padX: W * (k.format === "landscape" ? 0.1 : 0.12) };
    },
    rule(g: CanvasRenderingContext2D, x: number, y: number) {
      g.fillStyle = "#ff5a2e";
      g.fillRect(x - 22, y - 3, 44, 6);
    },
    reference(g: CanvasRenderingContext2D, k: Ctx, name: string, ref: string) {
      const y = k.H - k.m - band(k) / 2;
      const pad = k.S * 0.05;
      g.textBaseline = "middle";
      g.font = `400 ${k.fs}px "IBM Plex Mono", monospace`;
      spacing(g, k.fs * 0.14);
      g.textAlign = "left";
      g.fillStyle = "rgba(235,233,220,0.82)";
      g.fillText(name.toUpperCase(), k.m + pad, y);
      g.textAlign = "right";
      g.fillStyle = "#ff5a2e";
      g.fillText(ref, k.W - k.m - pad, y);
    },
  };
})();

/* Folio: sand paper in afternoon light, an ink frame, an editorial page's double rules, spaced
   capitals */
const folio: Look = (() => {
  const rules = (k: Ctx) => ({ head: k.m + k.S * 0.07, foot: k.H - k.m - k.fs * 4.8, gap: k.S * 0.012, pad: k.S * 0.05 });
  return {
    fonts: ['400 40px "Brygada 1918 Variable"', '400 24px "Josefin Sans Variable"'],
    ar: "#141210",
    tr: "rgba(20,18,16,0.86)",
    trFont: (px: number) => `400 ${Math.round(px * 0.97)}px "Brygada 1918 Variable"`,
    paint(g: CanvasRenderingContext2D, k: Ctx) {
      const { W, H, S, m } = k;
      const { head, foot, gap, pad } = rules(k);
      g.fillStyle = "#d8c294";
      g.fillRect(0, 0, W, H);
      const light = g.createLinearGradient(0, 0, W, H);
      light.addColorStop(0, "rgba(255,244,214,0.42)");
      light.addColorStop(0.45, "rgba(255,244,214,0)");
      light.addColorStop(1, "rgba(70,48,12,0.2)");
      g.fillStyle = light;
      g.fillRect(0, 0, W, H);
      grainOn(g, k);
      grainOn(g, k);
      g.strokeStyle = "#141210";
      g.lineWidth = 3;
      g.strokeRect(m, m, W - 2 * m, H - 2 * m);
      const xa = m + pad, xb = W - m - pad;
      g.lineWidth = 5;
      line(g, xa, head, xb, head);
      g.lineWidth = 1.5;
      line(g, xa, head + gap, xb, head + gap);
      line(g, xa, foot, xb, foot);
      g.lineWidth = 5;
      line(g, xa, foot + gap, xb, foot + gap);
      return { top: head + gap + S * 0.06, bottom: foot - S * 0.05, padX: W * (k.format === "landscape" ? 0.1 : 0.12) };
    },
    rule(g: CanvasRenderingContext2D, x: number, y: number) {
      g.strokeStyle = "rgba(20,18,16,0.7)";
      g.lineWidth = 1.5;
      line(g, x - 44, y, x - 14, y);
      line(g, x + 14, y, x + 44, y);
      g.save();
      g.translate(x, y);
      g.rotate(Math.PI / 4);
      g.fillStyle = "#141210";
      g.fillRect(-5, -5, 10, 10);
      g.restore();
    },
    reference(g: CanvasRenderingContext2D, k: Ctx, name: string, ref: string) {
      const { foot, gap } = rules(k);
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillStyle = "rgba(20,18,16,0.78)";
      g.font = `400 ${Math.round(k.fs * 1.08)}px "Josefin Sans Variable", sans-serif`;
      spacing(g, k.fs * 0.3);
      g.fillText(`${name}  ·  ${ref}`.toUpperCase(), k.W / 2, (foot + gap + k.H - k.m) / 2 + k.fs * 0.1);
    },
  };
})();

/* Paper: a torn sheet held by a binder clip, lying a touch askew on the grey desk; typewriter
   reference, a red pencil stroke */
function binderClip(g: CanvasRenderingContext2D, cx: number, top: number, s: number) {
  g.save();
  g.translate(cx - 20 * s, top - 18 * s);
  g.scale(s, s);
  g.shadowColor = "rgba(0,0,0,0.35)";
  g.shadowBlur = 5 * s;
  g.shadowOffsetY = 2 * s;
  g.fillStyle = "#1b1b1b";
  g.beginPath();
  g.moveTo(6, 9);
  g.lineTo(34, 9);
  g.lineTo(37, 27);
  g.lineTo(3, 27);
  g.closePath();
  g.fill();
  g.shadowColor = "transparent";
  g.fillStyle = "#3a3a3a";
  g.beginPath();
  g.moveTo(6, 9);
  g.lineTo(34, 9);
  g.lineTo(35, 13);
  g.lineTo(5, 13);
  g.closePath();
  g.fill();
  g.lineCap = "round";
  g.strokeStyle = "#b8bcc0";
  g.lineWidth = 1.6;
  g.beginPath();
  g.moveTo(11, 10);
  g.bezierCurveTo(10, 3, 13, 1, 20, 1);
  g.bezierCurveTo(27, 1, 30, 3, 29, 10);
  g.stroke();
  g.strokeStyle = "#8d9196";
  g.lineWidth = 1.1;
  g.beginPath();
  g.moveTo(14, 10);
  g.bezierCurveTo(13.5, 5, 15.5, 3.5, 20, 3.5);
  g.bezierCurveTo(24.5, 3.5, 26.5, 5, 26, 10);
  g.stroke();
  g.restore();
}
const paper: Look = (() => {
  const sheet = (k: Ctx) => {
    const i = k.m * 1.3;
    return { x0: i, y0: i * 1.25, x1: k.W - i, y1: k.H - i };
  };
  return {
    fonts: ['380 40px "Fraunces Variable"', '400 24px "Courier Prime"'],
    ar: "#23211c",
    tr: "rgba(35,33,28,0.84)",
    trFont: (px: number) => `380 ${Math.round(px * 0.92)}px "Fraunces Variable"`,
    paint(g: CanvasRenderingContext2D, k: Ctx) {
      const { W, H, S } = k;
      const { x0, y0, x1, y1 } = sheet(k);
      g.fillStyle = "#8e8a82";
      g.fillRect(0, 0, W, H);
      glowAt(g, k, W * 0.45, H * 0.4, Math.max(W, H) * 0.7, "rgba(255,255,255,0.14)");
      grainOn(g, k);
      grainOn(g, k);
      // the sheet, its foot torn
      const rnd = seeded(k.seed + 3);
      const step = S * 0.012;
      g.save();
      g.translate(W / 2, H / 2);
      g.rotate(-0.006);
      g.translate(-W / 2, -H / 2);
      g.beginPath();
      g.moveTo(x0, y0);
      g.lineTo(x1, y0);
      g.lineTo(x1, y1);
      for (let x = x1; x > x0; x -= step) g.lineTo(x, y1 + (rnd() - 0.5) * S * 0.009);
      g.lineTo(x0, y1);
      g.closePath();
      g.shadowColor = "rgba(20,18,14,0.5)";
      g.shadowBlur = S * 0.04;
      g.shadowOffsetY = S * 0.016;
      const sh = g.createLinearGradient(x0, y0, x1, y1);
      sh.addColorStop(0, "#f1eee6");
      sh.addColorStop(0.55, "#ebe6da");
      sh.addColorStop(1, "#e2dccd");
      g.fillStyle = sh;
      g.fill();
      g.shadowColor = "transparent";
      g.clip();
      grainOn(g, k, 0.8);
      g.restore();
      binderClip(g, W / 2, y0, S * 0.0042);
      return { top: y0 + S * 0.1, bottom: y1 - k.fs * 4.6, padX: W * (k.format === "landscape" ? 0.12 : 0.15) };
    },
    rule(g: CanvasRenderingContext2D, x: number, y: number) {
      g.strokeStyle = "rgba(155,61,44,0.85)";
      g.lineWidth = 3.5;
      g.lineCap = "round";
      g.beginPath();
      g.moveTo(x - 34, y + 2);
      g.quadraticCurveTo(x, y - 3, x + 34, y - 1);
      g.stroke();
      g.lineCap = "butt";
    },
    reference(g: CanvasRenderingContext2D, k: Ctx, name: string, ref: string) {
      const { y1 } = sheet(k);
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillStyle = "rgba(35,33,28,0.74)";
      g.font = `400 ${Math.round(k.fs * 1.1)}px "Courier Prime", monospace`;
      spacing(g, k.fs * 0.06);
      g.fillText(`${name} ${ref}`, k.W / 2, y1 - k.fs * 2.4);
    },
  };
})();

/* Lunar: a moon over the night with its stars, the sheet of night glass over it with round corners,
   light lettering widely spaced */
const lunar: Look = (() => {
  const inset = (k: Ctx) => Math.round(k.m * 1.5);
  return {
    fonts: ['300 40px "Spectral"', '500 24px "Cormorant Garamond Variable"'],
    ar: "#e6edf5",
    tr: "rgba(230,237,245,0.82)",
    trFont: (px: number) => `300 ${Math.round(px * 1.04)}px "Spectral"`,
    paint(g: CanvasRenderingContext2D, k: Ctx) {
      const { W, H, S } = k;
      const p = inset(k);
      const sky = g.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, "#0c1d31");
      sky.addColorStop(0.55, "#07111d");
      sky.addColorStop(1, "#04080f");
      g.fillStyle = sky;
      g.fillRect(0, 0, W, H);
      const rnd = seeded(k.seed + 11);
      const stars = Math.round((140 * W * H) / (1080 * 1080));
      for (let i = 0; i < stars; i++) {
        g.fillStyle = `rgba(223,232,242,${0.15 + rnd() * 0.55})`;
        g.beginPath();
        g.arc(rnd() * W, rnd() * H, 0.8 + rnd() * 1.6, 0, Math.PI * 2);
        g.fill();
      }
      // the moon in the corner, above the words, its light falling on the glass
      const R = S * 0.075, mx = W - p * 0.7 - R * 0.35, my = p * 0.7 + R * 0.35;
      glowAt(g, k, mx, my, R * 6, "rgba(200,215,235,0.2)");
      const disc = g.createRadialGradient(mx - R * 0.3, my - R * 0.3, R * 0.1, mx, my, R);
      disc.addColorStop(0, "#f6f8fb");
      disc.addColorStop(1, "#c3d0dd");
      g.fillStyle = disc;
      g.beginPath();
      g.arc(mx, my, R, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "rgba(120,140,165,0.12)";
      for (const [dx, dy, r] of [[-0.3, -0.1, 0.28], [0.25, 0.3, 0.2], [0.1, -0.4, 0.14]]) {
        g.beginPath();
        g.arc(mx + dx * R, my + dy * R, r * R, 0, Math.PI * 2);
        g.fill();
      }
      // the glass, round-cornered, its dark rim
      const r = S * 0.05;
      rounded(g, p, p, W - 2 * p, H - 2 * p, r);
      g.fillStyle = "rgba(10,19,31,0.74)";
      g.fill();
      g.strokeStyle = "#03060b";
      g.lineWidth = 8;
      g.stroke();
      rounded(g, p + 10, p + 10, W - 2 * p - 20, H - 2 * p - 20, r - 10);
      g.strokeStyle = "rgba(230,237,245,0.1)";
      g.lineWidth = 2;
      g.stroke();
      grainOn(g, k, 0.7);
      return { top: p + S * 0.08, bottom: H - p - k.fs * 4.6, padX: W * (k.format === "landscape" ? 0.11 : 0.14) };
    },
    rule(g: CanvasRenderingContext2D, x: number, y: number) {
      for (const d of [-1, 1]) {
        const lg = g.createLinearGradient(x + d * 12, y, x + d * 56, y);
        lg.addColorStop(0, "rgba(217,228,239,0.5)");
        lg.addColorStop(1, "rgba(217,228,239,0)");
        g.strokeStyle = lg;
        g.lineWidth = 1.5;
        line(g, x + d * 12, y, x + d * 56, y);
      }
      g.fillStyle = "#d9e4ef";
      g.beginPath();
      g.arc(x, y, 5, 0, Math.PI * 2);
      g.fill();
    },
    reference(g: CanvasRenderingContext2D, k: Ctx, name: string, ref: string) {
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillStyle = "rgba(230,237,245,0.62)";
      g.font = `500 ${Math.round(k.fs * 1.15)}px "Cormorant Garamond Variable", serif`;
      spacing(g, k.fs * 0.3);
      g.fillText(`${name}  ·  ${ref}`.toUpperCase(), k.W / 2, k.H - inset(k) - k.fs * 2.3);
    },
  };
})();

/* Blue: the deep currents of the page behind (skies.tsx): the night's blues on black, folded, fine
   royal blue lines along the currents; the ayah over them in Lexend, the Arabic white, the
   translation a pale royal blue; the reference small along the foot, the surah's name in royal. */
const blue: Look = (() => {
  return {
    fonts: ['300 40px "Lexend Variable"', '400 24px "Lexend Variable"'],
    ar: "#eef1f8",
    tr: "#a9bbf6",
    trFont: (px: number) => `300 ${Math.round(px * 0.9)}px "Lexend Variable", "Marks Sans", sans-serif`,
    paint(g: CanvasRenderingContext2D, k: Ctx) {
      const { W, H, S } = k;
      g.fillStyle = "#010309";
      g.fillRect(0, 0, W, H);
      const rnd = seeded(k.seed + 31);
      // the currents: wide soft pools of the night's blues, one of royal blue
      const pool = (x: number, y: number, rad: number, col: string) => {
        const gr = g.createRadialGradient(x, y, 0, x, y, rad);
        gr.addColorStop(0, col);
        gr.addColorStop(1, "rgba(5,13,46,0)");
        g.fillStyle = gr;
        g.fillRect(0, 0, W, H);
      };
      for (let i = 0; i < 6; i++) pool(rnd() * W, rnd() * H, S * (0.35 + rnd() * 0.4), i % 2 ? "rgba(12,34,92,0.75)" : "rgba(5,13,46,0.9)");
      pool(W * (0.2 + rnd() * 0.6), H * (0.15 + rnd() * 0.3), S * 0.32, "rgba(65,105,225,0.32)");
      // their lines: long waves across, each a little unlike the one before
      g.lineWidth = Math.max(1.2, S * 0.0012);
      const ph = rnd() * 6.28, f1 = 1.5 + rnd(), f2 = 3 + rnd() * 2;
      for (let i = 0; i < 22; i++) {
        const y0 = (H * (i + 0.5)) / 22;
        g.strokeStyle = `rgba(65,105,225,${0.06 + 0.12 * Math.abs(Math.sin(i * 0.7 + ph))})`;
        g.beginPath();
        for (let x = 0; x <= W; x += S * 0.01) {
          const u = x / W;
          const y = y0 + S * (0.05 * Math.sin(u * f1 * 6.28 + ph + i * 0.35) + 0.025 * Math.sin(u * f2 * 6.28 - ph * 1.3 + i * 0.6));
          if (x === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.stroke();
      }
      // into black at the edges
      const v = g.createRadialGradient(W / 2, H / 2, S * 0.3, W / 2, H / 2, Math.hypot(W, H) * 0.62);
      v.addColorStop(0, "rgba(0,0,0,0)");
      v.addColorStop(1, "rgba(0,0,0,0.7)");
      g.fillStyle = v;
      g.fillRect(0, 0, W, H);
      grainOn(g, k, 0.3);
      return { top: S * 0.12, bottom: H - k.fs * 6, padX: W * (k.format === "landscape" ? 0.12 : 0.11) };
    },
    rule(g: CanvasRenderingContext2D, x: number, y: number) {
      g.fillStyle = "#4169e1";
      g.fillRect(x - 22, y - 1.5, 44, 3);
    },
    reference(g: CanvasRenderingContext2D, k: Ctx, name: string, ref: string) {
      const y = k.H - k.m - k.fs * 1.4;
      const pad = k.S * 0.07;
      g.textBaseline = "middle";
      g.font = `400 ${Math.round(k.fs * 1.15)}px "Lexend Variable", "Marks Sans", sans-serif`;
      spacing(g, 0);
      g.textAlign = "left";
      g.fillStyle = "#4169e1";
      g.fillText(name, pad, y);
      g.textAlign = "right";
      g.fillStyle = "rgba(233,236,245,0.7)";
      g.fillText(ref, k.W - pad, y);
    },
  };
})();

/* Crimson: a leaf of parchment laid on a carpet's red field (its gold lattice, a rug's edge of two
   gold rules and a row of beads): the surah's name in an illuminated band at the leaf's head, the
   Arabic in ink, the English in italic beneath, the reference at its foot */
const crimson: Look = (() => {
  const INK = "#22160c";
  // the lattice's tile: eight-pointed stars on a diamond grid, as the sky's (index.css)
  const tile = (s: number) => {
    const c = document.createElement("canvas");
    c.width = c.height = s;
    const g = c.getContext("2d")!;
    g.strokeStyle = "#c9a35f";
    g.lineWidth = s / 90;
    const star = (x: number, y: number) => {
      const r = s * 0.175;
      g.strokeRect(x - r, y - r, 2 * r, 2 * r);
      g.save();
      g.translate(x, y);
      g.rotate(Math.PI / 4);
      g.strokeRect(-r, -r, 2 * r, 2 * r);
      g.restore();
    };
    for (const [x, y] of [[s / 2, s / 2], [0, 0], [s, 0], [0, s], [s, s]]) star(x, y);
    g.beginPath();
    g.moveTo(0, s / 2);
    g.lineTo(s / 2, 0);
    g.lineTo(s, s / 2);
    g.lineTo(s / 2, s);
    g.closePath();
    g.stroke();
    return c;
  };
  // the leaf: inside the rug's edge
  const leaf = (k: Ctx) => {
    const p = k.m + k.S * 0.05;
    return { x: p, y: p, w: k.W - 2 * p, h: k.H - 2 * p };
  };
  // the band at the leaf's head: two ruled rectangles, a knot at each end
  const band = (g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => {
    g.strokeStyle = "rgba(34,22,12,0.78)";
    g.fillStyle = "rgba(34,22,12,0.7)";
    g.lineWidth = 2;
    g.strokeRect(x, y, w, h);
    g.lineWidth = 1;
    const i = h * 0.12;
    g.strokeRect(x + i, y + i, w - 2 * i, h - 2 * i);
    const r = h * 0.3;
    for (const cx of [x + h * 0.62, x + w - h * 0.62]) {
      const cy = y + h / 2;
      g.beginPath();
      g.arc(cx, cy, r, 0, Math.PI * 2);
      g.stroke();
      g.strokeRect(cx - r * 0.78, cy - r * 0.78, r * 1.56, r * 1.56);
      g.save();
      g.translate(cx, cy);
      g.rotate(Math.PI / 4);
      g.strokeRect(-r * 0.78, -r * 0.78, r * 1.56, r * 1.56);
      g.restore();
      g.beginPath();
      g.arc(cx, cy, r * 0.22, 0, Math.PI * 2);
      g.fill();
      // a rule from the knot out to the band's end
      const out = cx < x + w / 2 ? -1 : 1;
      g.beginPath();
      g.moveTo(cx + out * r, cy);
      g.lineTo(cx + out * (h * 0.62 - i), cy);
      g.stroke();
    }
  };
  return {
    fonts: ['italic 400 40px "Amiri"', '400 48px "KFGQPC HAFS"'],
    ar: INK,
    tr: "rgba(38,26,15,0.9)",
    trFont: (px) => `italic 400 ${px}px "Amiri"`,
    paint(g, k) {
      const { W, H, S, m, fs } = k;
      // the field and its lattice
      const bg = g.createRadialGradient(W / 2, H * 0.4, 0, W / 2, H * 0.4, Math.max(W, H) * 0.75);
      bg.addColorStop(0, "#74121a");
      bg.addColorStop(0.5, "#520b11");
      bg.addColorStop(1, "#2a0508");
      g.fillStyle = bg;
      g.fillRect(0, 0, W, H);
      g.save();
      g.globalAlpha = 0.14;
      g.fillStyle = g.createPattern(tile(Math.round(S * 0.09)), "repeat")!;
      g.fillRect(0, 0, W, H);
      g.restore();
      // a rug's edge: two gold rules, a row of beads between
      const e = S * 0.014;
      g.strokeStyle = "rgba(214,184,128,0.7)";
      g.lineWidth = 2;
      g.strokeRect(m, m, W - 2 * m, H - 2 * m);
      g.strokeRect(m + 2 * e, m + 2 * e, W - 2 * (m + 2 * e), H - 2 * (m + 2 * e));
      g.fillStyle = "rgba(214,184,128,0.65)";
      const bead = (x: number, y: number) => {
        g.beginPath();
        g.arc(x, y, S * 0.0028, 0, Math.PI * 2);
        g.fill();
      };
      const step = S * 0.022, o = m + e;
      for (let x = o + step; x < W - o - step / 2; x += step) (bead(x, o), bead(x, H - o));
      for (let y = o + step; y < H - o - step / 2; y += step) (bead(o, y), bead(W - o, y));
      // the leaf of parchment: lighter at its heart, browned at its edges, a little uneven
      const L = leaf(k);
      g.save();
      g.shadowColor = "rgba(12,0,2,0.55)";
      g.shadowBlur = S * 0.04;
      g.shadowOffsetY = S * 0.012;
      g.fillStyle = "#c9b694";
      g.fillRect(L.x, L.y, L.w, L.h);
      g.restore();
      const pg = g.createRadialGradient(L.x + L.w / 2, L.y + L.h * 0.45, 0, L.x + L.w / 2, L.y + L.h * 0.45, Math.max(L.w, L.h) * 0.72);
      pg.addColorStop(0, "#d9c9a9");
      pg.addColorStop(0.6, "#cdb895");
      pg.addColorStop(1, "#b39c78");
      g.fillStyle = pg;
      g.fillRect(L.x, L.y, L.w, L.h);
      const rnd = seeded(k.seed + 7);
      g.save();
      g.beginPath();
      g.rect(L.x, L.y, L.w, L.h);
      g.clip();
      for (let i = 0; i < 9; i++) glowAt(g, k, L.x + rnd() * L.w, L.y + rnd() * L.h, S * (0.12 + rnd() * 0.2), `rgba(120,90,50,${(0.05 + rnd() * 0.06).toFixed(3)})`);
      grainOn(g, k, 0.9);
      g.restore();
      // the band, and the surah's name in it
      const bw = L.w * 0.86, bh = Math.max(S * 0.075, fs * 3.4), bx = L.x + (L.w - bw) / 2, by = L.y + S * 0.045;
      band(g, bx, by, bw, bh);
      if (k.title) {
        g.fillStyle = "rgba(34,22,12,0.86)";
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.direction = "rtl";
        g.font = `${Math.round(bh * 0.58)}px "KFGQPC HAFS"`;
        g.fillText(`سُورَةُ ${k.title}`, bx + bw / 2, by + bh * 0.54);
        g.direction = "ltr";
      }
      return { top: by + bh + S * 0.05, bottom: L.y + L.h - fs * 4.4, padX: L.x + L.w * 0.08 };
    },
    rule(g, x, y) {
      // a small lozenge in ink between two short rules
      g.strokeStyle = "rgba(34,22,12,0.5)";
      g.fillStyle = "rgba(34,22,12,0.6)";
      g.lineWidth = 1.5;
      line(g, x - 34, y, x - 9, y);
      line(g, x + 9, y, x + 34, y);
      g.beginPath();
      g.moveTo(x, y - 4.5);
      g.lineTo(x + 4.5, y);
      g.lineTo(x, y + 4.5);
      g.lineTo(x - 4.5, y);
      g.closePath();
      g.fill();
    },
    reference(g, k, name, ref) {
      const L = leaf(k);
      g.textAlign = "center";
      g.fillStyle = "rgba(38,26,15,0.68)";
      g.font = `italic ${Math.round(k.fs * 1.25)}px "Amiri", serif`;
      g.fillText(`(${name} · ${ref})`, k.W / 2, L.y + L.h - k.fs * 2.2);
    },
  };
})();

function lookOf(theme: ThemeId | undefined, box: "night" | "paper" | undefined, sky?: "dark" | "light"): Look {
  switch (theme) {
    case "mono":
      return mono(box === "paper", sky === "dark");
    case "atlas":
      return atlas;
    case "folio":
      return folio;
    case "paper":
      return paper;
    case "lunar":
      return lunar;
    case "blue":
      return blue;
    case "crimson":
      return crimson;
    default:
      return classic;
  }
}

/** Draw the ayah and its translation — nothing else but the reference — the current theme's way. */
export async function renderAyahImage(o: ShareContent, format: ShareFormat): Promise<Blob> {
  const [W, H] = SIZES[format];
  const look = lookOf(o.theme, o.box, o.sky);
  const arFont = o.script === "indopak" ? '"IndoPak"' : '"KFGQPC HAFS"';
  await Promise.all([document.fonts.load(`64px ${arFont}`), ...look.fonts.map((f) => document.fonts.load(f))]).catch(() => {});
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = "high";

  let art = look.art && o.surah ? await cardBackdrop(o.surah, W, H) : null;
  if (art && look.art === "grey") art = grey(art);
  const S = Math.min(W, H);
  // (the surah's Arabic name, for a look that writes it: Crimson's band)
  const title = o.surah ? ((await loadIndex().catch(() => null)) as { surahs?: { ar: string }[] } | null)?.surahs?.[o.surah - 1]?.ar : undefined;
  const k: Ctx = { W, H, S, m: Math.round(S * 0.045), fs: Math.round(S * 0.021), format, art, seed: o.surah ?? 0, title };
  const { top, bottom, padX } = look.paint(g, k);
  g.globalAlpha = 1;
  g.setLineDash([]);
  g.shadowColor = "transparent";
  spacing(g, 0);

  // fit the text into the space inside the frame: as large as it will go (a short ayah fills the
  // picture, whatever its shape), smaller only as far as it must, and centred in that space
  const avail = bottom - top;
  const aw = W - 2 * padX;
  // a landscape line of translation stays a comfortable length to read
  const tw = format === "landscape" ? Math.min(aw, W * 0.7) : aw;
  let ar = S * (format === "landscape" ? 0.12 : format === "story" ? 0.095 : 0.09);
  let tr = ar * 0.56;
  let arLines: string[] = [], trLines: string[] = [];
  const gap = () => ar * 0.9;
  const height = () => arLines.length * ar * 1.95 + (trLines.length ? (arLines.length ? gap() : 0) + trLines.length * tr * 1.45 : 0);
  for (let i = 0; i < 60; i++) {
    g.font = `${ar}px ${arFont}`;
    g.direction = "rtl";
    arLines = o.arabic ? wrap(g, o.arabic, aw) : [];
    g.direction = "ltr";
    g.font = look.trFont(tr);
    trLines = o.translation ? wrap(g, o.translation, tw) : [];
    if (height() <= avail || ar < 22) break;
    ar *= 0.95;
    tr = Math.max(17, ar * 0.56);
  }
  const total = height();
  let y = top + (avail - total) / 2;

  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillStyle = look.ar;
  g.direction = "rtl";
  g.font = `${ar}px ${arFont}`;
  for (const l of arLines) {
    g.fillText(l, W / 2, y + ar * 0.975);
    y += ar * 1.95;
  }
  if (trLines.length) {
    if (arLines.length) {
      y += gap() / 2;
      look.rule(g, W / 2, y, k);
      y += gap() / 2;
    }
    g.direction = "ltr";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = look.tr;
    g.font = look.trFont(tr);
    for (const l of trLines) {
      g.fillText(l, W / 2, y + tr * 0.72);
      y += tr * 1.45;
    }
  }

  // the reference only
  g.direction = "ltr";
  g.textBaseline = "middle";
  drawingHats(g, () => look.reference(g, k, ayn(o.surahName), o.ref));

  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("render failed"))), "image/jpeg", 0.95));
}

/* ── the dialog ─────────────────────────────────────────────────── */

type Dest = "story" | "post" | "x";
const DEST_FORMAT: Record<Dest, ShareFormat> = { story: "story", post: "square", x: "landscape" };

type WithIt = "part" | "whole" | "none";

/** words taken from within a sentence: no quotation mark left open or closed at its edges, no comma left hanging */
function tidy(s: string) {
  let t = s.trim();
  const opens = (x: string) => (x.match(/[“‘"]/g) ?? []).length;
  const closes = (x: string) => (x.match(/[”’"]/g) ?? []).length;
  if (/^[“‘"]/.test(t) && opens(t) > closes(t)) t = t.slice(1);
  if (/[”’"][.,;:!?]*$/.test(t) && closes(t) > opens(t)) t = t.replace(/[”’"]([.,;:!?]*)$/, "$1");
  return t.replace(/[,;:]$/, "");
}

export function ShareDialog({ content: given, onClose, onToast }: { content: ShareContent | null; onClose: () => void; onToast: (m: string) => void }) {
  const [format, setFormat] = useState<ShareFormat>("square");
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const blobs = useRef(new Map<string, Blob>());

  // a part of an ayah: the other side goes with it in part (the words chosen), whole, or not at all
  const part = given?.part;
  const [withIt, setWithIt] = useState<WithIt>("part");
  const [range, setRange] = useState<[number, number]>([0, 0]);
  const [anchor, setAnchor] = useState<number | null>(null);
  // a part shared goes with a part: its words, marked (a first guess, the reader's to change)
  useEffect(() => {
    if (!part) return;
    setWithIt("part");
    setRange(part.guess ?? [0, part.other.length - 1]);
    setAnchor(null);
  }, [part]);
  // (while the first word is tapped and the last is not yet, the picture waits: drawn once, at the end)
  const marked: [number, number] = anchor != null ? [anchor, anchor] : range;
  const content = useMemo<ShareContent | null>(() => {
    if (!given || !part) return given;
    const other = withIt === "none" ? "" : withIt === "whole" ? (part.side === "ar" ? given.translation : given.arabic) : tidy(part.other.slice(range[0], range[1] + 1).join(" "));
    return part.side === "ar" ? { ...given, translation: other } : { ...given, arabic: other };
  }, [given, part, withIt, range]);
  // (a word tapped starts the choice, the next one ends it)
  const tapWord = (i: number) => {
    if (anchor == null) setAnchor(i);
    else {
      setRange([Math.min(anchor, i), Math.max(anchor, i)]);
      setAnchor(null);
    }
  };

  useEffect(() => {
    blobs.current.clear();
  }, [given]);

  const get = async (f: ShareFormat) => {
    if (!content) throw new Error("nothing to share");
    const id = `${f}\n${content.arabic}\n${content.translation}`;
    let b = blobs.current.get(id);
    if (!b) {
      b = await renderAyahImage(content, f);
      blobs.current.set(id, b);
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
    if (!given) return;
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [given, onClose]);

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
        await navigator.share({ files: [file], title: `${ayn(content.surahName)} ${content.ref}` });
      } else {
        download(b, f);
        if (d === "x") {
          const text = `${content.translation || content.arabic}\n— ${ayn(content.surahName)} ${content.ref}`;
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
          className="theme-dialog relative flex max-h-[92vh] w-full max-w-[880px] flex-col overflow-hidden border-[3px] border-[#06080c] bg-[#0a0f18] text-[#efe9dd] shadow-[0_40px_120px_-30px_rgba(0,0,0,0.8)] md:max-h-[88vh] md:flex-row"
          initial={{ y: 20, opacity: 0, scale: 0.98 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, ease: EASE_OUT }}
        >
          <div className="grain-local" />
          {/* preview */}
          <div className="relative flex min-h-[200px] shrink-0 items-center justify-center bg-black/30 p-4 md:min-h-[240px] md:flex-1 md:shrink md:p-8">
            {url ? (
              <motion.img
                key={url}
                src={url}
                alt={`${ayn(content.surahName)} ${content.ref} as an image`}
                className={cn("max-w-full object-contain shadow-[0_20px_60px_-20px_rgba(0,0,0,0.9)] md:max-h-[70vh]", part ? "max-h-[34vh]" : "max-h-[52vh]")}
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.35, ease: EASE_OUT }}
              />
            ) : (
              <span className="label text-white/40">Drawing the image…</span>
            )}
          </div>
          {/* controls */}
          <div className="thin-scroll relative flex min-h-0 w-full flex-col gap-6 overflow-y-auto border-t border-white/10 p-5 md:w-[340px] md:border-l md:border-t-0 md:p-7">
            <div className="flex items-start justify-between">
              <div>
                <div className="label text-white/45">{part ? "Share a part" : "Share"}</div>
                <div className="mt-1 font-serif text-[22px] italic">
                  {nameMarks(content.surahName)} <span className="font-mono text-[14px] not-italic text-white/60">{content.ref}</span>
                </div>
              </div>
              <button type="button" onClick={onClose} aria-label="Close" className="flex h-8 w-8 items-center justify-center text-white/60 hover:bg-white/10 hover:text-white">
                <Close size={16} />
              </button>
            </div>

            {part && (
              <div>
                <div className="label mb-2 text-white/45">{part.side === "ar" ? "With its translation" : "With its Arabic"}</div>
                <div className="flex border border-white/15 p-0.5">
                  {(["part", "whole", "none"] as WithIt[]).map((w) => (
                    <button
                      key={w}
                      type="button"
                      onClick={() => setWithIt(w)}
                      aria-pressed={withIt === w}
                      className={cn("label relative flex-1 py-2 transition-colors", withIt === w ? "text-[#0a0f18]" : "text-white/60 hover:text-white")}
                    >
                      {withIt === w && <motion.span layoutId="share-with" className="absolute inset-0 bg-[#efe9dd]" transition={{ duration: 0.3, ease: EASE_OUT }} />}
                      <span className="relative">{w === "part" ? "Its words" : w === "whole" ? "Whole ayah" : "None"}</span>
                    </button>
                  ))}
                </div>
                <AnimatePresence initial={false}>
                  {withIt === "part" && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3, ease: EASE_OUT }} className="overflow-hidden">
                      <div
                        dir={part.side === "ar" ? "ltr" : "rtl"}
                        className={cn("thin-scroll mt-2 max-h-[150px] overflow-y-auto border border-white/10 px-2.5 py-2", part.side === "ar" ? "font-serif text-[14.5px] leading-[1.75]" : "quran text-right text-[20px] leading-[2]")}
                      >
                        {part.other.map((w, i) => {
                          const inIt = i >= marked[0] && i <= marked[1];
                          return (
                            <span key={i}>
                              <button
                                type="button"
                                onClick={() => tapWord(i)}
                                className={cn("transition-colors", inIt ? "bg-[#efe9dd] text-[#0a0f18] shadow-[0_0_0_1px_#efe9dd]" : "text-white/55 hover:text-white", anchor === i && "outline outline-1 outline-[#c9a24a]")}
                              >
                                {w}
                              </button>
                              {/* (the space between two chosen words is chosen too: one strip) */}
                              <span className={i >= marked[0] && i < marked[1] ? "bg-[#efe9dd] shadow-[0_0_0_1px_#efe9dd]" : undefined}> </span>
                            </span>
                          );
                        })}
                      </div>
                      <div className="mt-1.5 text-[11.5px] leading-snug text-white/45">
                        {anchor == null ? "The words that go with it are marked. To change them, tap the first word, then the last." : "Now tap the last word."}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

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
                  (await copyText([content.arabic, content.translation, `— ${ayn(content.surahName)} ${content.ref}`].filter(Boolean).join("\n\n"))) && onToast(`Copied ${content.ref}`);
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
