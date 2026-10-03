"""Crops of the print where an honorific mark follows a given word: honsheet.py out.png key:word ..."""
import json, sys
from PIL import Image, ImageDraw, ImageFont
import crops
W = json.load(open('.cache/qme_where.json', encoding='utf-8'))
items = []
for a in sys.argv[2:]:
    key, word = a.split('|', 1)
    for i, (t, hon, page, box, src) in enumerate(W.get(key, [])):
        if hon and word in t and page is not None:
            items.append((page, (box[0] - 500, box[1] - 10, box[2] + 1100, box[3] + 20), f"{key} {t} {hon}"))
            break
    else:
        print('not found', a)
crops.sheet(items, sys.argv[1])
