"""Read the typeset 'Quraan Made Easy' PDF (Quraan-Made-Easy.pdf) with the
Windows OCR engine, as a second, independent reading of the translation.

That PDF has no text layer (its letters are vector outlines) but it is crisp,
and it prints the explanatory context in pink and the translation in black.
Each page is rendered at 400 dpi; the OCR sees an ink image (pink turned
black, for contrast); every recognised word is then classified by the colour
under its box. Output: .cache/big/<page>.json with lines of words
{t, x, y, w, h, pink} in 400-dpi pixels.

    py scripts/ocr_big.py 0 1196        # pages [start, end)
"""
import json, os, subprocess, sys
import numpy as np
import pymupdf
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
PDF = os.path.join(HERE, "..", "..", "Quraan-Made-Easy.pdf")
OUT = os.path.join(HERE, ".cache", "big")
TMP = os.path.join(HERE, ".cache", "big_tmp")
PS1 = os.path.join(HERE, "ocr_windows.ps1")
DPI = 400
os.makedirs(OUT, exist_ok=True)
os.makedirs(TMP, exist_ok=True)


def add_glyphs(words, pink, dark):
    """Marks the OCR skipped inside a line (the calligraphic ﷺ after a name,
    ornaments) become pseudo-words {"g": true} with their box, so the text
    can say where the book prints them."""
    y0 = min(w["y"] for w in words)
    y1 = max(w["y"] + w["h"] for w in words)
    h = int(np.median([w["h"] for w in words]))
    band = (pink[y0:y1] | dark[y0:y1])
    cols = band.sum(axis=0) > 0
    covered = np.zeros_like(cols)
    for w in words:
        covered[max(0, w["x"] - 6): w["x"] + w["w"] + 6] = True
    x_lo = max(0, words[0]["x"] - 3 * h)
    x_hi = min(len(cols), words[-1]["x"] + words[-1]["w"] + 3 * h)
    free = cols & ~covered
    free[:x_lo] = False
    free[x_hi:] = False
    out = list(words)
    x = x_lo
    while x < x_hi:
        if free[x]:
            s = x
            gap = 0
            while x < x_hi and gap < h // 2:
                gap = 0 if free[x] else gap + 1
                x += 1
            e = x - gap
            if e - s >= h // 2:   # a mark at least half a letter-height wide
                sub_p = int(pink[y0:y1, s:e].sum())
                sub_d = int(dark[y0:y1, s:e].sum())
                out.append({"t": "", "g": True, "x": int(s), "y": int(y0), "w": int(e - s), "h": int(y1 - y0),
                            "pink": round(sub_p / max(sub_p + sub_d, 1), 2)})
        x += 1
    out.sort(key=lambda w: w["x"])
    return out


def main(start, end, batch=12):
    global TMP
    TMP = os.path.join(HERE, ".cache", f"big_tmp_{start}")  # one per worker
    os.makedirs(TMP, exist_ok=True)
    doc = pymupdf.open(PDF)
    end = min(end, doc.page_count)
    todo = [i for i in range(start, end) if not os.path.exists(os.path.join(OUT, f"{i:04d}.json"))]
    for b in range(0, len(todo), batch):
        pages = todo[b:b + batch]
        masks = {}
        paths = []
        for i in pages:
            pix = doc[i].get_pixmap(dpi=DPI, colorspace=pymupdf.csRGB, alpha=False)
            a = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, 3).astype(np.int16)
            r, g, bl = a[..., 0], a[..., 1], a[..., 2]
            ink = np.minimum(np.minimum(r, g), bl).astype(np.uint8)          # pink and black both become dark
            pink = (r - g > 70) & (r > 120)                                    # the context colour
            dark = (np.maximum(np.maximum(r, g), bl) < 110)                    # black type
            masks[i] = (pink, dark)
            p = os.path.join(TMP, f"{i:04d}.png")
            Image.fromarray(ink, "L").save(p)
            paths.append(p)
        lst = os.path.join(TMP, "list.txt")
        open(lst, "w", encoding="ascii").write("\n".join(os.path.abspath(p) for p in paths))
        subprocess.run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", PS1, "-List", lst,
                        "-OutDir", os.path.abspath(TMP)], check=True, capture_output=True)
        for i in pages:
            raw = json.load(open(os.path.join(TMP, f"{i:04d}.json"), encoding="utf-8-sig"))
            pink, dark = masks[i]
            lines = []
            for ln in raw["lines"] or []:
                words = ln["words"]
                if isinstance(words, dict):
                    words = [words]
                out = []
                for w in words:
                    x, y, ww, hh = w["x"], w["y"], w["w"], w["h"]
                    pk = int(pink[y:y + hh, x:x + ww].sum())
                    dk = int(dark[y:y + hh, x:x + ww].sum())
                    out.append({"t": w["t"], "x": x, "y": y, "w": ww, "h": hh, "pink": round(pk / max(pk + dk, 1), 2)})
                if out:
                    out = add_glyphs(out, pink, dark)
                lines.append(out)
            json.dump({"page": i, "size": [pink.shape[1], pink.shape[0]], "lines": lines},
                      open(os.path.join(OUT, f"{i:04d}.json"), "w", encoding="utf-8"), ensure_ascii=False)
            os.remove(os.path.join(TMP, f"{i:04d}.png"))
            os.remove(os.path.join(TMP, f"{i:04d}.json"))
        print("done", pages[0], "-", pages[-1], flush=True)


if __name__ == "__main__":
    main(int(sys.argv[1]), int(sys.argv[2]))
