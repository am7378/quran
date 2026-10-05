import { useLayoutEffect, useRef, type ReactNode } from "react";

/**
 * A surah's name, set well in every face. The names' typewriter tick for the ʿayn (Āli `Imrān,
 * Ash-Shu`arā) is drawn as the ʿayn's own mark, ʿ, upright and close to its letter; and a lowercase
 * ĥ (Al-Fātiĥah, Ash-Sharĥ) has its circumflex set over the middle of the letter, just clear of its
 * stem, as a capital's sits (a face's own ĥ perches the mark on the stem's top, where in italics it
 * leans off to one side, crooked). The letters are the names' own; only their marks are drawn so.
 */
export const ayn = (t: string | undefined) => (t ?? "").replace(/`/g, "ʿ");

export function nameMarks(t: string | undefined): ReactNode {
  const s = ayn(t);
  if (!s.includes("ĥ")) return s;
  const parts = s.split("ĥ");
  return (
    <>
      {parts.map((p, i) => (
        <span key={i}>
          {i > 0 && <Hat />}
          {p}
        </span>
      ))}
    </>
  );
}

/* where the mark goes, from the face itself: how far its h (or H, in capitals) rises above its x,
   and the ink of the h and of the mark, all in ems (so it holds at any size the name is set) */
type Fit = { lift: number; hMid: number; gMid: number; lean: number };
const fits = new Map<string, Fit>();
let pen: CanvasRenderingContext2D | null = null;
function fitFor(font: string, stretch: string, caps: boolean, italic: boolean): Fit | null {
  const key = `${font}|${stretch}|${caps}`;
  const known = fits.get(key);
  if (known) return known;
  pen ??= document.createElement("canvas").getContext("2d");
  if (!pen) return null;
  pen.font = font;
  // (a narrowed or widened face: the canvas knows widths by their names)
  const pct = parseFloat(stretch) || 100;
  const widths = [[56, "ultra-condensed"], [69, "extra-condensed"], [81, "condensed"], [94, "semi-condensed"], [106, "normal"], [119, "semi-expanded"], [137, "expanded"], [175, "extra-expanded"]] as const;
  const named = widths.find(([lim]) => pct < lim)?.[1] ?? "ultra-expanded";
  if ("fontStretch" in pen) (pen as CanvasRenderingContext2D & { fontStretch: string }).fontStretch = named;
  const size = parseFloat(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? "16");
  const h = pen.measureText(caps ? "H" : "h"), x = pen.measureText("x"), g = pen.measureText("ˆ");
  if (!h.actualBoundingBoxAscent || !x.actualBoundingBoxAscent) return null;
  const fit = {
    // upright, a little less than the whole rise (seated close, as an accent on a capital is: it sits
    // beside the stem, over the letter); in italics the stem leans under the mark, which keeps the
    // whole rise and a little more to clear it
    lift: ((italic ? 1.06 : 0.8) * (h.actualBoundingBoxAscent - x.actualBoundingBoxAscent)) / size,
    hMid: (h.actualBoundingBoxRight - h.actualBoundingBoxLeft) / 2 / size,
    gMid: (g.actualBoundingBoxRight - g.actualBoundingBoxLeft) / 2 / size,
    // an italic letter leans: its top, where the mark is, stands to the right of its middle
    lean: italic ? 0.1 * ((h.actualBoundingBoxAscent - x.actualBoundingBoxAscent) / size + 0.2) : 0,
  };
  fits.set(key, fit);
  return fit;
}

/**
 * The same on a canvas (the share pictures): while `draw` runs, a line with a lowercase ĥ is drawn
 * with a plain h and the mark set over it as on the page.
 */
export function drawingHats(g: CanvasRenderingContext2D, draw: () => void) {
  const fill = g.fillText;
  g.fillText = function (text: string, x: number, y: number, maxWidth?: number) {
    if (!text.includes("ĥ")) return fill.call(g, text, x, y, maxWidth);
    const plain = text.replace(/ĥ/g, "h");
    fill.call(g, plain, x, y, maxWidth);
    const total = g.measureText(plain).width;
    const align = g.textAlign;
    const start = align === "center" ? x - total / 2 : align === "right" || align === "end" ? x - total : x;
    const size = parseFloat(/(\d+(?:\.\d+)?)px/.exec(g.font)?.[1] ?? "16");
    const h = g.measureText("h"), xm = g.measureText("x"), mark = g.measureText("ˆ");
    const lift = (/italic|oblique/.test(g.font) ? 1.06 : 0.8) * (h.actualBoundingBoxAscent - xm.actualBoundingBoxAscent);
    const lean = /italic|oblique/.test(g.font) ? 0.1 * (lift + 0.2 * size) : 0;
    const dx = (h.actualBoundingBoxRight - h.actualBoundingBoxLeft) / 2 - (mark.actualBoundingBoxRight - mark.actualBoundingBoxLeft) / 2 + lean;
    g.textAlign = "left";
    for (let i = text.indexOf("ĥ"); i >= 0; i = text.indexOf("ĥ", i + 1)) fill.call(g, "ˆ", start + g.measureText(plain.slice(0, i)).width + dx, y - lift);
    g.textAlign = align;
  };
  try {
    draw();
  } finally {
    g.fillText = fill;
  }
}

function Hat() {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let alive = true;
    const place = () => {
      if (!alive || !el.isConnected) return;
      const cs = getComputedStyle(el);
      const size = parseFloat(cs.fontSize);
      if (!size) return;
      const italic = cs.fontStyle !== "normal";
      // measured in the name's own face (the first of its list), once that face has come
      const face = cs.fontFamily.split(",")[0].trim();
      const font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${face}`;
      if (document.fonts && !document.fonts.check(font, "hx")) {
        document.fonts.load(font, "hxˆ").then(() => document.fonts.check(font, "hx") && place(), () => {});
        return;
      }
      const fit = fitFor(font, cs.fontStretch, cs.textTransform === "uppercase", italic);
      if (!fit) return;
      // the h's own advance, as set (with any spacing the face is given): the mark, after it, steps
      // back over it to its middle
      const adv = el.getBoundingClientRect().width / size;
      el.style.setProperty("--hat-lift", fit.lift.toFixed(3));
      el.style.setProperty("--hat-dx", (-adv + fit.hMid - fit.gMid + fit.lean).toFixed(3));
    };
    place();
    document.fonts?.addEventListener("loadingdone", place);
    return () => {
      alive = false;
      document.fonts?.removeEventListener("loadingdone", place);
    };
  }, []);
  return (
    <span ref={ref} className="hat">
      h
    </span>
  );
}
