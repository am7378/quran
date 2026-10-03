"""Contact sheets of merge decisions against the printed page, for checking
by eye: each row is the printed words (cropped from the typeset PDF) with
what each reading said and what was chosen.

    review_sheets.py <category> <start> <count> <out.png>
category: a 'pick' value (review-A, B, review-B, A, none), 'fallback', or 'case'.
"""
import json, os, sys
from PIL import Image, ImageDraw, ImageFont
import crops

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, ".cache")


def items_of(cat):
    D = json.load(open(os.path.join(CACHE, "qme_decisions.json"), encoding="utf-8"))
    out = []
    for key, decs in D.items():
        for d in decs:
            if cat == "fallback" and d["op"] == "fallback":
                out.append((key, d))
            elif cat == "case" and d["op"] == "case":
                out.append((key, d))
            elif cat == "replace-B" and d.get("pick") == "B" and d["op"] == "replace" and not d.get("why", "").startswith("same letters"):
                out.append((key, d))
            elif cat == "polish" and d["op"] == "polish":
                out.append((key, d))
            elif d.get("pick") == cat and d["op"] not in ("fallback", "case"):
                out.append((key, d))
    return out


def union(boxes):
    pages = [b["page"] for b in boxes]
    page = max(set(pages), key=pages.count)
    bs = [b for b in boxes if b["page"] == page]
    x0 = min(b["x"] for b in bs); y0 = min(b["y"] for b in bs)
    x1 = max(b["x"] + b["w"] for b in bs); y1 = max(b["y"] + b["h"] for b in bs)
    return page, (x0, y0, x1 - x0, y1 - y0)


def sheet(cat, start, count, out, width=1500):
    its = items_of(cat)[start:start + count]
    try:
        font = ImageFont.truetype("arial.ttf", 17)
    except OSError:
        font = ImageFont.load_default()
    rows = []
    for n, (key, d) in enumerate(its, start=start):
        label = f"#{n} {key}  A: {d.get('a', d.get('to', ''))!r}   B: {d.get('b', '')!r}   → {d.get('pick', d.get('to', ''))}"
        boxes = d.get("boxes") or []
        if boxes:
            page, (x, y, w, h) = union(boxes)
            im = crops.crop(page, (x - 420, y - 8, w + 840, h + 16), pad=4, dpi=150)
        else:
            im = Image.new("RGB", (400, 30), "white")
        if im.width > width - 20:
            im = im.resize((width - 20, int(im.height * (width - 20) / im.width)))
        rows.append((im, label))
    H = sum(im.height + 30 for im, _ in rows) + 10
    canvas = Image.new("RGB", (width, H), "white")
    dr = ImageDraw.Draw(canvas)
    y = 6
    for im, label in rows:
        dr.text((10, y), label[:160], fill=(20, 60, 160), font=font)
        y += 22
        canvas.paste(im, (10, y))
        y += im.height + 8
    canvas.save(out)
    return len(items_of(cat))


if __name__ == "__main__":
    print(sheet(sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), sys.argv[4]))
