"""Identify the honorific calligraphy the book prints after names, by
comparing each unread mark (from parse_big.py) with clean samples of the
three honorifics it uses:

    saw  ﷺ  (U+FDFA)  sallallaahu ʿalayhi wa sallam
    as   ﵊  (U+FD4A)  ʿalayhis salaatu was salaam
    ra   ﵃  (U+FD43)  radhiyallaahu ʿanhum (the book prints '… taʿaalaa ʿanhum')

Each mark is rendered from the PDF; brackets, quotes and full stops beside
it are removed (as connected shapes); what is left is compared with each
sample scaled to exactly its size, together with its width measured against
the height of the text around it. Marks that match none well (unread
punctuation, Arabic fragments) are left out. Writes 'hon' onto the marks in
.cache/big_verses.json and every decision to .cache/glyph_report.json.
"""
import json, os, re, collections
import numpy as np
import pymupdf
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, ".cache")
PDF = os.path.join(HERE, "..", "..", "Quraan-Made-Easy.pdf")
DPI = 300
doc = pymupdf.open(PDF)


def render(page, box, pad=6):
    x, y, w, h = box
    r = pymupdf.Rect((x - pad) * 72 / 400, (y - pad) * 72 / 400, (x + w + pad) * 72 / 400, (y + h + pad) * 72 / 400)
    pix = doc[page].get_pixmap(dpi=DPI, clip=r, colorspace=pymupdf.csRGB, alpha=False)
    a = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, 3)
    return a.min(axis=2) < 150


def clean(m, text_h):
    """Drop brackets, quotes, stops and commas (tall-thin or tiny shapes at the
    edges); keep the calligraphy. Returns the tight mask or None."""
    lab, n = ndimage.label(m, structure=np.ones((3, 3)))
    if n == 0:
        return None
    objs = ndimage.find_objects(lab)
    keep = np.zeros(n + 1, dtype=bool)
    H, W = m.shape
    for i, sl in enumerate(objs, start=1):
        h = sl[0].stop - sl[0].start
        w = sl[1].stop - sl[1].start
        area = (lab[sl] == i).sum()
        bracket = h > 0.9 * text_h and w < 0.32 * h
        tiny = area < 0.004 * text_h * text_h * 25 and (sl[1].start < 0.15 * W or sl[1].stop > 0.85 * W)
        keep[i] = not bracket and not tiny
    mm = keep[lab]
    ys, xs = np.nonzero(mm)
    if not len(ys):
        return None
    return mm[ys.min(): ys.max() + 1, xs.min(): xs.max() + 1]


def fit(m, h, w):
    H, W = m.shape
    yi = np.minimum((np.arange(h) * H / h).astype(int), H - 1)
    xi = np.minimum((np.arange(w) * W / w).astype(int), W - 1)
    return m[yi][:, xi]


def similarity(c, t):
    """Overlap of c and t scaled to c's size, allowing a small shift (blurred masks)."""
    h, w = c.shape
    tt = fit(t, h, w).astype(float)
    cc = c.astype(float)
    tt = ndimage.uniform_filter(tt, 3)
    cc = ndimage.uniform_filter(cc, 3)
    num = (tt * cc).sum()
    return float(num / (np.sqrt((tt * tt).sum() * (cc * cc).sum()) + 1e-9))


SAW_NAMES = {"rasulullaah", "muhammad", "rasool", "rasul"}
# a word of one or two letters after a name is a word only if English has it ('e),' and 'Sl' are marks)
SHORT_WORDS = set("a i o am an as at be by do go he if in is it me my no of oh on or so to up us we".split())
AS_NAMES = {"moosa", "ibraheem", "nooh", "isa", "ambiyaa", "aadam", "sulaymaan", "loot", "ya'qoob", "dawood", "haaroon",
            "haroon", "yusuf", "jibra'eel", "saalih", "shu'ayb", "is'haaq", "ismaa'eel", "isma'eel", "zakariyya", "hood",
            "yahya", "yunus", "ayyoob", "ayyub", "ilyaas", "idrees", "khidr", "luqmaan", "uzayr", "yusha", "imraan",
            "dhulkifl", "alyasa", "mikaa'eel", "israafeel"}
RA_NAMES = {"sahabah", "bakr", "umar", "uthmaan", "affaan", "ali", "aa'isha", "zaid", "maalik", "salaam", "abbaas",
            "mas'ood", "hafsa", "khadeejah", "balta'ah", "jabal", "thaabit"}


def _glossary_names():
    """Every name the book's glossary writes with (Alayhis Salaam) or (RA)."""
    p = os.path.join(CACHE, "glossary_entries.json")
    if not os.path.exists(p):
        return
    for e in json.load(open(p, encoding="utf-8")):
        first = e["head"].split()[0].lower().replace("’", "'")
        last = e["head"].split()[-1].lower().replace("’", "'")
        if "Alayhis" in e["paren"] or "Alahyis" in e["paren"]:
            AS_NAMES.update({first, last} if len(e["head"].split()) <= 2 else {first})
        elif "(RA)" in e["paren"]:
            RA_NAMES.update({first, last})


def name_prior(prev):
    """The honorific the book gives the word before the mark, if it is a name
    ('ofMuhammad' and 'theAmbiyaa' are OCR glue)."""
    p = prev.lower().replace("’", "'")
    p = "".join(ch for ch in p if ch.isalpha() or ch == "'")
    for pre in ("of", "the", "to", "as", "and", "by", "with", "from", "comingof"):
        if p.startswith(pre) and p[len(pre):] in SAW_NAMES | AS_NAMES | RA_NAMES:
            p = p[len(pre):]
    if p in SAW_NAMES:
        return "saw"
    if p in AS_NAMES:
        return "as"
    if p in RA_NAMES:
        return "ra"
    return None


def main():
    V = json.load(open(os.path.join(CACHE, "big_verses.json"), encoding="utf-8"))

    def find(key, after):
        toks = V[key]
        for i, w in enumerate(toks):
            if w.get("g") and i and after in toks[i - 1]["t"]:
                return w, toks[i - 1]
        raise KeyError((key, after))

    samples = {"saw": ("2:27", "Rasulullaah"), "as": ("2:51", "Moosa"), "ra": ("3:152", "Sahabah")}
    T, R = {}, {}
    for name, (key, after) in samples.items():
        g, prev = find(key, after)
        c = clean(render(g["page"], (g["x"], g["y"], g["w"], g["h"])), prev["h"] * 300 / 400)
        T[name] = c
        R[name] = c.shape[1] / (prev["h"] * 300 / 400)   # width over text height
    print("samples:", {n: (t.shape, round(R[n], 2)) for n, t in T.items()})

    report = []
    stats = collections.Counter()
    for key, toks in V.items():
        for i, w in enumerate(toks):
            if not w.get("g"):
                continue
            nb = [t for t in toks[max(0, i - 3): i + 4] if not t.get("g")]
            text_h = (np.median([t["h"] for t in nb]) if nb else w["h"]) * 300 / 400
            ck = f"g|{w['page']}|{w['x']}|{w['y']}|{w['w']}|{w['h']}"
            if ck not in CACHE_SIMS:
                c = clean(render(w["page"], (w["x"], w["y"], w["w"], w["h"])), text_h)
                CACHE_SIMS[ck] = None if c is None or c.shape[0] < 0.25 * text_h else \
                    {"ratio": round(c.shape[1] / text_h, 2), **{n: round(similarity(c, t), 3) for n, t in T.items()}}
            got = CACHE_SIMS[ck]
            if got is None:
                w["hon"] = None
                stats["empty"] += 1
                continue
            ratio = got["ratio"]
            sims = {n: v for n, v in got.items() if n != "ratio"}
            ranked = sorted(sims.items(), key=lambda kv: -kv[1])
            (vis, best), (_, second) = ranked[0], ranked[1]
            prev = toks[i - 1]["t"] if i else ""
            prior = name_prior(prev)
            if best >= 0.72 and best - second >= 0.08 and (prior or ratio >= 1.5):
                hon, rule = vis, "shape"          # the shape decides (a mark is wide: a quote or '!' is not)
            elif prior and best >= 0.45:
                hon, rule = prior, "name"         # a mark after a name the book always honours
            else:
                hon, rule = None, "none"
            w["hon"] = hon
            stats[(hon or "none", rule)] += 1
            report.append({"key": key, "i": i, "prev": prev, "sims": sims, "ratio": round(ratio, 2), "hon": hon, "rule": rule,
                           "prior": prior, "page": w["page"], "box": [w["x"], w["y"], w["w"], w["h"]]})
    # honorifics the OCR "read" as letters ('Rasulullaah FEE)', 'Abu Bakr SüåU'): a word
    # right after a name whose image is the calligraphy becomes a mark
    for key, toks in V.items():
        for i, w in enumerate(toks):
            if w.get("g") or not i or toks[i - 1].get("g"):
                continue
            prior = name_prior(toks[i - 1]["t"])
            # 'O Nabi EE!': the title takes the mark when letters no word has follow it ('Nabi Isa' does not)
            if not prior and re.sub(r"[^a-z]", "", toks[i - 1]["t"].lower()) == "nabi" and re.fullmatch(r"[A-Z]{1,3}[.,!;:)]*", w["t"]):
                prior = "saw"
            # a digit or two and symbols right after a name: its honorific, read as figures ('Aadam 7')
            if prior and re.fullmatch(r"[\d*°•#&%]{1,3}[)\].,;:!?”\"]*", w["t"]):
                trail = re.search(r"[)\].,;:!?”\"]*$", w["t"]).group(0)
                w.update({"g": True, "hon": prior, "ocr_text": w["t"], "t": "", "post": trail})
                stats[(prior, "read-as-figures")] += 1
                continue
            # a possessive ('Sulaymaan 's instruction') is not a mark
            if re.fullmatch(r"['’`]s[.,;:!?)]*", w["t"]):
                continue
            # punctuation the OCR read as such ('!', ',', '”') is punctuation; a mark is wide
            if not re.search(r"[A-Za-z0-9]", w["t"]) and not re.search(r"[^\x00-\x7f]", w["t"]):
                continue
            if not prior and w["w"] < 1.3 * w["h"]:
                continue  # away from a name only a wide shape can be a mark
            # not an English word at all ('SüåU', 'æ;', 'Bllfåd')
            letters = "".join(ch for ch in w["t"] if ch.isalpha())
            junk = bool(re.search(r"[^\x00-\x7f]", w["t"])) or (prior and 0 < len(letters) <= 2 and letters.lower() not in SHORT_WORDS) or not re.fullmatch(r"[(\[“\"'‘]*[A-Za-z0-9][A-Za-z0-9'’-]*[)\].,;:!?”\"'’]*", w["t"])
            if not prior and not junk:
                continue
            core = "".join(ch for ch in w["t"] if ch.isalpha())
            if core.lower() in COMMON_AFTER_NAMES:
                continue
            ck = f"t|{w['page']}|{w['x']}|{w['y']}|{w['w']}|{w['h']}"
            if ck not in CACHE_SIMS:
                c = clean(render(w["page"], (w["x"], w["y"], w["w"], w["h"])), w["h"] * 300 / 400)
                CACHE_SIMS[ck] = None if c is None else {n: round(similarity(c, t), 3) for n, t in T.items()}
            sims = CACHE_SIMS[ck]
            if sims is None and prior and junk:
                sims = {n: (1.0 if n == prior else 0.0) for n in T}  # too faint to compare: the name decides
            if sims is None:
                continue
            ranked = sorted(sims.items(), key=lambda kv: -kv[1])
            (vis, best), (_, second) = ranked[0], ranked[1]
            if junk and not (best >= 0.74 and best - second >= 0.06):
                # after a name: the mark the name always carries; elsewhere only a clear likeness counts
                if prior:
                    vis = vis if best >= 0.62 else prior
                    best, second = 1.0, 0.0
                elif toks[i - 1]["t"][:1].isupper() and (
                        (best >= 0.62 and best - second >= 0.04) or (re.search(r"[^\x00-\x7f]", w["t"]) and best >= 0.5)):
                    best, second = 1.0, 0.0  # letters no English word has ('Bllfåd') after a name: its honorific
            if best >= 0.74 and best - second >= 0.06:
                # the punctuation printed after the mark stays with it (not an apostrophe: that is OCR noise)
                trail = re.search(r"[)\].,;:!?”\"]*$", w["t"].rstrip("'’")).group(0)
                w.update({"g": True, "hon": vis, "ocr_text": w["t"], "t": "", "post": trail})
                stats[(vis, "read-as-text")] += 1
                report.append({"key": key, "i": i, "prev": toks[i - 1]["t"], "sims": sims, "hon": vis, "rule": "read-as-text",
                               "ocr": w["ocr_text"], "page": w["page"], "box": [w["x"], w["y"], w["w"], w["h"]]})
    json.dump(V, open(os.path.join(CACHE, "big_verses.json"), "w", encoding="utf-8"), ensure_ascii=False)
    json.dump(report, open(os.path.join(CACHE, "glyph_report.json"), "w", encoding="utf-8"), ensure_ascii=False)
    json.dump(CACHE_SIMS, open(SIMS_FILE, "w", encoding="utf-8"))
    print(dict(stats))


_glossary_names()
RA_NAMES.discard("bin")
SIMS_FILE = os.path.join(CACHE, "glyph_sims.json")
CACHE_SIMS = json.load(open(SIMS_FILE, encoding="utf-8")) if os.path.exists(SIMS_FILE) else {}

COMMON_AFTER_NAMES = {"and", "said", "was", "is", "the", "to", "who", "when", "had", "has", "with", "that", "of", "in", "as",
                      "for", "he", "his", "him", "said", "says", "asked", "replied", "then", "also", "a", "an", "were", "are",
                      "will", "would", "did", "not", "from", "by", "on", "at", "so", "or", "but", "bin", "ibn", "abu", "o"}


if __name__ == "__main__":
    main()
