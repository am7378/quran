"""Crops of the print around given words of the merged text: oddsheet.py out.png key:token ..."""
import json, sys, re
from PIL import Image, ImageDraw, ImageFont
import crops

W = json.load(open('.cache/qme_where.json', encoding='utf-8'))


def find(key, tok):
    ws = W.get(key, [])
    core = re.sub(r"^[^A-Za-z0-9]+|[^A-Za-z0-9]+$", "", tok)
    for i, (t, hon, page, box, src) in enumerate(ws):
        if core and core in t:
            return i, ws
    return None, ws


def row(key, tok, font):
    i, ws = find(key, tok)
    if i is None or ws[i][2] is None:
        im = Image.new("RGB", (600, 30), "white")
        return im, f"{key} {tok!r}: not located"
    page, (x, y, w, h) = ws[i][2], ws[i][3]
    ctx = " ".join((t + (" " + hon if hon else "")) for t, hon, *_ in ws[max(0, i - 4): i + 5])
    im = crops.crop(page, (x - 700, y - 14, w + 1400, h + 28), pad=0, dpi=130)
    d = ImageDraw.Draw(im)
    k = 130 / 400
    d.rectangle([(700) * k - 2, 12 * k, (700 + w) * k + 2, (14 + h + 14) * k], outline=(230, 40, 40), width=2)
    return im, f"{key} [{tok}] … {ctx}"


def main(out, items, width=1500):
    try:
        font = ImageFont.truetype("arial.ttf", 17)
    except OSError:
        font = ImageFont.load_default()
    rows = []
    for it in items:
        key, tok = it.split("|", 1)
        rows.append(row(key, tok, font))
    H = sum(im.height + 28 for im, _ in rows) + 10
    canvas = Image.new("RGB", (width, H), "white")
    d = ImageDraw.Draw(canvas)
    y = 6
    for im, label in rows:
        d.text((8, y), label[:170], fill=(20, 60, 160), font=font)
        y += 22
        canvas.paste(im, (8, y))
        y += im.height + 6
    canvas.save(out)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2:])
