"""Crops of the print's introduction lines holding given phrases, on one contact sheet.

    summary_crops.py out.png "surah|first words of the phrase" ...
"""
import json, os, re, sys
import crops

HERE = os.path.dirname(os.path.abspath(__file__))
big = json.load(open(os.path.join(HERE, ".cache", "big_intros.json"), encoding="utf-8"))


def norm(w):
    return re.sub(r"[^a-z0-9]", "", w.lower())


def find(k, phrase):
    want = [norm(w) for w in phrase.split() if norm(w)]
    lines = big.get(k, [])
    flat = [(li, w) for li, line in enumerate(lines) for w in line]
    toks = [norm(w["t"]) for _, w in flat]
    for i in range(len(toks)):
        if toks[i : i + len(want)] == want:
            li = flat[i][0]
            # the line, with the one after it (a phrase can run on)
            ws = lines[li] + (lines[li + 1] if li + 1 < len(lines) and lines[li + 1][0]["page"] == lines[li][0]["page"] else [])
            x0 = min(w["x"] for w in ws)
            y0 = min(w["y"] for w in ws)
            x1 = max(w["x"] + w["w"] for w in ws)
            y1 = max(w["y"] + w["h"] for w in ws)
            return ws[0]["page"], (x0, y0, x1 - x0, y1 - y0)
    return None


items = []
for arg in sys.argv[2:]:
    k, phrase = arg.split("|", 1)
    hit = find(k, phrase)
    if hit:
        items.append((hit[0], hit[1], f"{k}: {phrase}"))
    else:
        print("not found:", arg)
crops.sheet(items, sys.argv[1])
print(len(items), "crops ->", sys.argv[1])
