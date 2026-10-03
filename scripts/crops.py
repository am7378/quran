"""Crop regions of the typeset PDF (400-dpi OCR coordinates) into a labelled
contact sheet, to look at what the book actually prints.

    crops.py out.png  page:x:y:w:h:label  page:x:y:w:h:label ...
or, from Python: sheet(items, out) with items = [(page, (x, y, w, h), label)].
"""
import os, sys
import pymupdf
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
PDF = os.path.join(HERE, "..", "..", "Quraan-Made-Easy.pdf")
_doc = None


def crop(page, box, pad=24, dpi=200):
    """box is in 400-dpi pixels; returns a PIL image at `dpi`."""
    global _doc
    if _doc is None:
        _doc = pymupdf.open(PDF)
    x, y, w, h = box
    k = 72 / 400
    r = pymupdf.Rect((x - pad) * k, (y - pad) * k, (x + w + pad) * k, (y + h + pad) * k)
    pix = _doc[page].get_pixmap(dpi=dpi, clip=r, colorspace=pymupdf.csRGB, alpha=False)
    return Image.frombytes("RGB", (pix.width, pix.height), pix.samples)


def sheet(items, out, width=1400):
    try:
        font = ImageFont.truetype("arial.ttf", 18)
    except OSError:
        font = ImageFont.load_default()
    rows = []
    for page, box, label in items:
        im = crop(page, box)
        if im.width > width - 20:
            im = im.resize((width - 20, int(im.height * (width - 20) / im.width)))
        rows.append((im, label))
    H = sum(im.height + 34 for im, _ in rows) + 10
    canvas = Image.new("RGB", (width, H), "white")
    d = ImageDraw.Draw(canvas)
    y = 8
    for im, label in rows:
        d.text((10, y), label, fill=(20, 60, 160), font=font)
        y += 24
        canvas.paste(im, (10, y))
        y += im.height + 10
    canvas.save(out)
    return out


if __name__ == "__main__":
    out = sys.argv[1]
    items = []
    for a in sys.argv[2:]:
        p, x, y, w, h, *lab = a.split(":")
        items.append((int(p), (int(x), int(y), int(w), int(h)), ":".join(lab) or a))
    sheet(items, out)
