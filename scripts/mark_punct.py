"""Punctuation printed right after an honorific mark ('Isa ﵊, Ayyoob ﵊,', 'Rasool ﷺ.', 'O Rasulullaah ﷺ!)').
Both OCR readings lose it: it touches the calligraphy, so it is read as part of the mark. This looks at the
ink just right of each mark in the print and names the small shapes there by their size and where they sit
against the line: a full stop on the baseline, a comma dipping below it, a bracket as tall as the capitals,
quotes near the top, and '!' / '?' as a stroke over a dot.

    mark_punct.py            updates .cache/big_verses.json, report in .cache/mark_punct.json
"""
import json, os
import numpy as np
import pymupdf
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, ".cache")
PDF = os.path.join(HERE, "..", "..", "Quraan-Made-Easy.pdf")
doc = None


def ink(page, x0, y0, x1, y1):
    """Ink mask of a region, in the 400-dpi coordinates the OCR boxes use."""
    global doc
    if doc is None:
        doc = pymupdf.open(PDF)
    k = 72 / 400
    pix = doc[page].get_pixmap(dpi=400, clip=pymupdf.Rect(x0 * k, y0 * k, x1 * k, y1 * k), colorspace=pymupdf.csRGB, alpha=False)
    a = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, 3)
    return a.min(axis=2) < 160


def line_metrics(w):
    """Baseline and capital height of a word, from its ink: the median bottom of its columns is the baseline
    (descenders are few), the highest ink the tops of its capitals and ascenders."""
    m = ink(w["page"], w["x"], w["y"] - 6, w["x"] + w["w"], w["y"] + w["h"] + 6)
    cols = [np.nonzero(m[:, c])[0] for c in range(m.shape[1])]
    bottoms = [c.max() for c in cols if len(c)]
    tops = [c.min() for c in cols if len(c)]
    if not bottoms:
        return None
    base = float(np.median(bottoms)) + w["y"] - 6
    top = float(min(tops)) + w["y"] - 6
    return base, max(base - top, 12.0)


def classify(comps, base, cap):
    """comps: (x0, y0, x1, y1) of ink shapes after the mark, left to right (page coordinates)."""
    out = []
    used = set()
    # a stroke over a dot: '!' or '?' (paired first, so the dot is not read as a full stop)
    pairs = {}
    for i, (x0, y0, x1, y1) in enumerate(comps):
        h = y1 - y0
        if h > 0.45 * cap and y1 < base - 0.1 * cap:
            dot = next((j for j, c in enumerate(comps) if j != i and j not in used and c[1] > y1 - 2
                        and min(c[2], x1) - max(c[0], x0) > -0.1 * cap and (c[3] - c[1]) < 0.3 * cap and abs(c[3] - base) < 0.2 * cap), None)
            if dot is not None:
                pairs[min(i, dot)] = "!" if (x1 - x0) < 0.33 * cap else "?"
                used.update({i, dot})
    for i, (x0, y0, x1, y1) in enumerate(comps):
        if i in pairs:
            out.append(pairs[i])
            continue
        if i in used:
            continue
        w, h = x1 - x0, y1 - y0
        if h >= 0.85 * cap and w <= 0.4 * h and y1 > base - 0.05 * cap:
            out.append(")")
        elif h < 0.4 * cap and w < 0.34 * cap:
            if y1 < base - 0.3 * cap:
                out.append("”")  # a quote mark sits high (two strokes read as one quote below)
            elif y1 > base + 0.14 * cap:
                out.append(",")
            elif y1 > base - 0.15 * cap:
                out.append(".")
            else:
                return None  # something small in mid-line: not punctuation this knows
        elif h < 0.6 * cap and y1 > base + 0.14 * cap and w < 0.34 * cap:
            out.append(",")
        else:
            return None
    s = "".join(out)
    while "””" in s:
        s = s.replace("””", "”")
    if s == "”":
        return ""  # a quote alone is as likely the mark's own dots
    if ".." in s:
        s = s.replace("...", "..").replace("..", "...")
    return s


def after_mark(toks, i):
    g = toks[i]
    prev = toks[i - 1] if i else None
    nxt = toks[i + 1] if i + 1 < len(toks) else None
    if not prev or prev.get("g") or prev["page"] != g["page"]:
        return None, "no word before the mark"
    lm = line_metrics(prev)
    if not lm:
        return None, "no ink in the word before"
    base, cap = lm
    same_line = nxt and nxt["page"] == g["page"] and abs((nxt["y"] + nxt["h"]) - (g["y"] + g["h"])) < 0.8 * cap and nxt["x"] > g["x"]
    x_end = nxt["x"] - 2 if same_line else g["x"] + g["w"] + 1.4 * cap
    y0, y1 = int(base - 1.35 * cap), int(base + 0.55 * cap)
    x0 = int(g["x"] - 4)
    if x_end - x0 < 4:
        return "", "no room"
    m = ink(g["page"], x0, y0, int(x_end), y1)
    lab, n = ndimage.label(m, structure=np.ones((3, 3)))
    boxes = []
    for sl in ndimage.find_objects(lab):
        boxes.append((sl[1].start + x0, sl[0].start + y0, sl[1].stop + x0, sl[0].stop + y0))
    boxes.sort()
    if not boxes:
        return "", "nothing after the mark"
    # the calligraphy has a set width for its height (ﷺ about 1.95, ﵊ about 3.25): what lies beyond it is
    # punctuation; the height is taken from the mark's left part, where no punctuation can be
    left = [b for b in boxes if b[0] < g["x"] + 0.45 * g["w"]]
    if not left:
        return None, "no calligraphy found"
    cal_left = min(b[0] for b in left)
    cal_h = max(b[3] for b in left) - min(b[1] for b in left)
    ratio = {"saw": 1.95, "as": 3.25}.get(g["hon"])
    if ratio:
        cal_right = cal_left + ratio * cal_h * 1.04 + 2
        rest = [b for b in boxes if b[0] >= cal_right - 0.12 * cap]
    else:
        # the RA mark comes in several widths: only small shapes clear of it count
        cal_right = g["x"] + 0.3 * g["w"]
        for b in boxes:
            if b[0] <= cal_right + 0.05 * cap and (b[3] - b[1] > 0.34 * cap or b[2] - b[0] > 0.34 * cap or b[0] < g["x"] + 0.75 * g["w"]):
                cal_right = max(cal_right, b[2])
        rest = [b for b in boxes if b[0] > cal_right - 1]
    if not rest:
        return "", "nothing after the mark"
    s = classify(rest, base, cap)
    if s is None:
        return None, f"shapes not read: {[(b[2]-b[0], b[3]-b[1]) for b in rest]}"
    return s, "read"


def main():
    V = json.load(open(os.path.join(CACHE, "big_verses.json"), encoding="utf-8"))
    report = []
    added = 0
    memo_file = os.path.join(CACHE, "mark_punct_memo.json")
    memo = json.load(open(memo_file, encoding="utf-8")) if os.path.exists(memo_file) else {}
    for key, toks in V.items():
        for i, g in enumerate(toks):
            if not (g.get("g") and g.get("hon")):
                continue
            prev = toks[i - 1] if i else {}
            nxt = toks[i + 1] if i + 1 < len(toks) else {}
            mk = "|".join(str(v) for v in (g["page"], g["x"], g["y"], g["w"], g["h"], g["hon"], prev.get("x"), prev.get("y"),
                                            prev.get("w"), prev.get("h"), nxt.get("x"), nxt.get("y"), nxt.get("h")))
            if mk not in memo:
                memo[mk] = after_mark(toks, i)
            s, why = memo[mk]
            nxt = toks[i + 1] if i + 1 < len(toks) else None
            have = g.get("post", "")
            nxt_lead = (nxt or {}).get("t", "")[:1] if nxt and not nxt.get("g") else ""
            rec = {"key": key, "i": i, "read": s, "why": why, "had": have, "page": g["page"],
                   "box": [g["x"], g["y"], g["w"], g["h"]]}
            if s and not any(ch in have for ch in ".,;:!?") and nxt_lead not in list(".,;:!?)”\""):
                # a bracket the OCR already set after the mark stays; add what it did not read
                extra = "".join(ch for ch in s if ch not in have)
                if extra:
                    # what was read here covers the OCR's bracket or quote: it stands, in its order
                    if all(ch in s or (ch == '"' and "”" in s) for ch in have):
                        g["post"] = s
                    else:
                        g["post"] = have + extra if ")" in have and not extra.startswith(")") else (
                            extra + have if have and have[0] in "”\"" else have + extra)
                    g["post_read"] = True
                    rec["now"] = g["post"]
                    added += 1
            report.append(rec)
    json.dump(memo, open(memo_file, "w", encoding="utf-8"))
    json.dump(V, open(os.path.join(CACHE, "big_verses.json"), "w", encoding="utf-8"), ensure_ascii=False)
    json.dump(report, open(os.path.join(CACHE, "mark_punct.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=0)
    from collections import Counter
    print("marks:", len(report), "| punctuation added:", added, "|", Counter(r["why"].split(":")[0] for r in report))
    print(Counter(r.get("now") for r in report if r.get("now")).most_common(12))


if __name__ == "__main__":
    main()
