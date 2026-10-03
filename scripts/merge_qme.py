"""Merge the two readings of the Quraan Made Easy translation:

  A  the typeset PDF (Quraan-Made-Easy.pdf) read by the Windows OCR engine,
     colours intact: black = translation, pink = context; honorifics found
     by shape (parse_big.py, glyphs.py). Crisp, but the engine sometimes
     misreads case ('SO', 'Will'), glues italic words ('ofQiyaamah'), drops a
     word, and a few pages of that PDF are damaged.
  B  the scanned PDF's text layer (Quraan-Made-Easy-Complete.pdf), as
     repaired by the build (public/data): complete, but from a scan.

Word by word: where both agree the word is confirmed; where they differ,
a real word beats a garbled one; where both are real words the clean print
(A) is taken and the place is listed for review against the printed page.
Every decision is kept in .cache/qme_decisions.json; the merged text goes to
.cache/qme_final.json. Overrides decided by looking at the print are read
from qme_overrides.json.
"""
import collections, difflib, json, math, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, ".cache")
OUT_DATA = os.path.join(HERE, "..", "public", "data", "s")

import textfix  # dictionaries

HON = {"saw": "ﷺ", "as": "﵊", "anhu": "﵁", "anhaa": "﵂", "anhum": "﵃"}
FEMALE = {"aa'isha", "hafsa", "khadeejah", "maryam", "faatimah", "zaynab", "asiya", "aasiya"}

WORD = re.compile(r"[A-Za-z][A-Za-z'’\-]*")


def norm(w):
    return re.sub(r"[^a-z0-9']", "", w.lower().replace("’", "'")).strip("'")


def split_token(t):
    """'(the' -> ('(', 'the', ''); 'hypocrites),' -> ('', 'hypocrites', '),'); numbers are words too"""
    m = re.match(r"^([^A-Za-z0-9]*)(.*?)([^A-Za-z0-9]*)$", t)
    pre, core, post = m.group(1), m.group(2), m.group(3)
    return pre, core, post


def clean_trail(t):
    """Punctuation read out of calligraphy ('.;,' after a mark): brackets and the last stop only."""
    if len(t) <= 1:
        return t
    closing = "".join(ch for ch in t if ch in ")]")
    stops = [ch for ch in t if ch not in ")]"]
    return closing + (stops[-1] if stops else "")


def unglue_brackets(tok):
    """'price(referring' -> 'price' '(referring'; 'Imaan)in' -> 'Imaan)' 'in' (the OCR closed the gap)."""
    t = tok["t"]
    m = re.match(r"^(.*[A-Za-z0-9,.;:!?])(\(.*)$", t) or re.match(r"^(.*\))([A-Za-z].*)$", t)
    if not m:
        return [tok]
    a, b = m.group(1), m.group(2)
    opening = b.startswith("(")
    return [dict(tok, t=a, pink=tok["pink"] if opening else 1.0), dict(tok, t=b, pink=1.0 if opening else 0.0)]


# ── A: tokens of the typeset print ───────────────────────────────────────
def a_items(toks):
    items = []
    toks = [p for w in toks for p in (unglue_brackets(w) if not w.get("g") else [w])]
    for i, w in enumerate(toks):
        if w.get("g"):
            if not w.get("hon") and items and w["w"] > 1.5 * w["h"]:
                # a mark the OCR could not read: where the scan has a name here, it is the name and its honorific
                items[-1]["mark_after"] = True
            if w.get("hon") and items:
                prev = norm(items[-1]["w"]) if items[-1]["w"] else ""
                kind = w["hon"]
                if kind == "ra":
                    kind = "anhum" if "sahabah" in prev else "anhaa" if prev.split("'")[-1] in FEMALE or prev in FEMALE else "anhu"
                items[-1]["hon"] = HON[kind]
                # punctuation read from the print beside the mark (mark_punct.py) stands as read
                items[-1]["post"] += w["post"] if w.get("post_read") else clean_trail(w.get("post", ""))
            continue
        pre, core, post = split_token(w["t"])
        box = {"page": w["page"], "x": w["x"], "y": w["y"], "w": w["w"], "h": w["h"]}
        pink = w["pink"] > 0.5
        if not core:
            # punctuation alone: attach to the previous word
            if items:
                items[-1]["post"] += pre + post
            else:
                items.append({"w": "", "pre": pre + post, "post": "", "pink": pink, "box": box, "src": "A"})
            continue
        # a superscript ordinal read apart from its number: '10 th' -> '10th'
        if core in ("th", "st", "nd", "rd") and items and re.fullmatch(r"\d+", items[-1]["w"]) and not items[-1]["post"] and not pre:
            items[-1]["w"] += core
            items[-1]["post"] = post
            continue
        items.append({"w": core, "pre": pre, "post": post, "pink": pink, "box": box, "src": "A"})
    # an honorific read as capitals on its own after a name ('Rasool EE!'): the mark goes to the name
    keep = []
    for k, it in enumerate(items):
        prev = keep[-1] if keep else None
        if prev and re.fullmatch(r"[A-Z]{1,3}|[A-Z]{1,2}\d", it["w"]) and it["w"] not in ("I", "A", "O") and not prev.get("hon") \
                and name_hon_of(prev["w"]) and not it["pre"]:
            prev["hon"] = name_hon_of(prev["w"])
            prev["post"] += clean_trail(it["post"])
            continue
        keep.append(it)
    items = keep
    # an honorific read as symbols and run onto the next word ('Rasulullaah EEfor'): the mark goes to the name
    for k in range(1, len(items)):
        m = JUNK_WORD.match(items[k]["w"])
        prev = items[k - 1]
        if m and not prev.get("hon") and not prev["post"] and in_dictionary(re.sub(r"[^A-Za-z'’].*$", "", m.group(2))):
            h = name_hon_of(prev["w"])
            if h:
                prev["hon"] = h
                items[k]["w"] = m.group(2)
    return items


# ── B: words of the repaired scan text ──────────────────────────────────
def b_items(segs):
    items = []
    for kind, text in segs:
        for t in text.split():
            pre, core, post = split_token(t)
            if not core:
                if items:
                    items[-1]["post"] += pre + post
                continue
            items.append({"w": core, "pre": pre, "post": post, "pink": kind == 1, "src": "B"})
    return items


ACORPUS = collections.Counter()


def known(w):
    n = norm(w)
    if not n or re.fullmatch(r"\d+(?:st|nd|rd|th)?", n):
        return True  # numbers and ordinals ('7', '10th')
    md = re.fullmatch(r"(\d+)([a-z]+)", n)
    if md:
        return len(md.group(2)) >= 3 and known(md.group(2))  # '22years' (the book sets some numbers close); not '100k'
    if "-" in w or "/" in w:
        return all(known(p) for p in re.split(r"[-/]", w) if p)
    if re.search(r"['’]s$", w) and len(n) > 3:
        return known(w[:-2])
    return (n in textfix.REFV or n in textfix.DICT and (len(n) > 3 or textfix.FREQ.get(n, 0) > 500)
            or textfix.FREQ.get(n, 0) >= 300 or ACORPUS[n] >= 3 or n in GLOSSARY)


GLOSSARY = set(json.load(open(os.path.join(HERE, "..", "public", "data", "glossary.json"), encoding="utf-8"))) \
    if os.path.exists(os.path.join(HERE, "..", "public", "data", "glossary.json")) else set()


def normal_case(w):
    core = w.replace("'", "").replace("’", "").replace("-", "")
    return core.islower() or (core[:1].isupper() and core[1:].islower()) or len(core) == 1


def choose_case(a, b, sentence_start):
    """Same word, different case: the natural casing wins (OCR of bold type gives 'SO', 'uS', 'Will')."""
    if a == b:
        return a
    na, nb = normal_case(a), normal_case(b)
    if na and not nb:
        return a
    if nb and not na:
        return b
    # both natural: a capital mid-sentence is an OCR habit unless the word is a name
    if a[:1].isupper() and b[:1].islower() and not sentence_start:
        return b
    if b[:1].isupper() and a[:1].islower() and textfix.FREQ.get(a.lower(), 0) < 5000:
        return b  # names keep their capital (a common word does not: 'sent', not 'Sent')
    return a


def known_strict(w):
    """Known without the OCR's own recurring glue ('ofMakkah' is common in the scan too)."""
    n = norm(w)
    if "-" in w:
        return all(known_strict(p) for p in w.split("-") if p)
    return bool(n) and (n in textfix.REFV or (n in textfix.DICT and (len(n) > 3 or textfix.FREQ.get(n, 0) > 500))
                        or textfix.FREQ.get(n, 0) >= 300 or (ACORPUS[n] >= 3 and not splits(n)))


def glue_like(n):
    """The frequency list holds web typos ('ofthe', 'yourfather'): a word that divides into two
    very common words and is far rarer than both is two words run together."""
    f = textfix.FREQ.get(n, 0)
    for i in range(1, len(n)):
        a, b = n[:i], n[i:]
        fa, fb = textfix.FREQ.get(a, 0), textfix.FREQ.get(b, 0)
        if (len(a) > 1 or a == "a") and len(b) > 1 and fa >= 20000 and fb >= 20000 and f < 0.02 * min(fa, fb):
            return True
    return False


def in_dictionary(w):
    """A word of English (or of the clean Saheeh text) — not merely frequent in the OCR."""
    n = norm(w)
    if "-" in w:
        return all(in_dictionary(p) for p in w.split("-") if p)
    if n in PROTECTED:
        return True
    if n in ("lf",) or (n not in textfix.REFV and glue_like(n)):
        return False
    return bool(n) and (n in textfix.REFV or textfix.FREQ.get(n, 0) >= 200 or (n in textfix.DICT and len(n) >= 6)) and not (
        len(n) >= 6 and not n in textfix.REFV and textfix.FREQ.get(n, 0) < 200 and splits(n) and w[1:] != w[1:].lower())


# transliterations never taken apart ('Insha' of InshaAllaah, Mount 'Toor')
PROTECTED = {"insha", "inshaa", "toor", "mashaa", "subhaan", "jazaak", "haameem", "taahaa", "yaaseen", "saad"}


def splits(n):
    """Does a word divide into two real words? ('ofmakkah' -> of + makkah)"""
    for i in range(1, len(n)):
        a, b = n[:i], n[i:]
        if (a in ("a", "i") or (len(a) > 1 and (a in textfix.REFV or textfix.FREQ.get(a, 0) >= 2000))) and \
                len(b) > 1 and (b in textfix.REFV or textfix.FREQ.get(b, 0) >= 2000 or ACORPUS[b] >= 10):
            return True
    return False


HON_NAMES = ["Rasulullaah", "Muhammad", "Rasool", "Moosa", "Ibraheem", "Nooh", "Isa", "Ambiyaa", "Aadam", "Sulaymaan",
             "Loot", "Ya'qoob", "Dawood", "Haaroon", "Yusuf", "Jibra'eel", "Saalih", "Shu'ayb", "Is'haaq", "Ismaa'eel",
             "Zakariyya", "Hood", "Yahya", "Yunus", "Ayyoob", "Ilyaas", "Idrees", "Sahabah", "Bakr", "Umar", "Imraan"]
_NAMES_RE = "|".join(re.escape(n) for n in sorted(HON_NAMES, key=len, reverse=True))
NAME_JUNK = re.compile(r"^(" + _NAMES_RE + r")([a-z]{0,2}(?:['’][^a-z\s]|[^a-z'’\s]).*)$")
# an honorific read as symbols, run onto the word after the name ('EEfor', 'ZY5Zfurther')
JUNK_WORD = re.compile(r"^([A-Z0-9*&%•][A-Z0-9*&%•]{0,4})([a-z]{2,}.*)$")
# a name, its honorific read as symbols, and the next word run on ("Yusuf'LjY5*from")
NAME_JUNK_WORD = re.compile(r"^(" + _NAMES_RE + r")((?:['’][^a-z\s]|[^a-z'’\s])[^\s]{0,8}?)([a-z]{2,})$")


GLUE_WORDS = set("""of the to and in is for from with that his her their it a an as on at by be not or who which this was were
are have has had them they he she we you your our its my me him us if so do no any all one when then than but into
upon over""".split())


def frequency(w):
    if "-" in w.strip("-"):
        return min(frequency(p) for p in w.split("-") if p)
    n = norm(w)
    return textfix.FREQ.get(n, 0) // 50 + 20 * ACORPUS[n] + 50 * (n in textfix.REFV)


# misspellings printed in the book (each seen in the print), and the word meant
MISPRINTS = {"commited": "committed", "coutious": "cautious", "definetly": "definitely", "definitly": "definitely",
             "mercilesly": "mercilessly", "repeatly": "repeatedly", "arrivved": "arrival", "deligent": "diligent",
             "imperfectios": "imperfections", "intructions": "instructions", "knowlageble": "knowledgeable",
             "suffiecient": "sufficient", "havest": "harvest", "ttrumpet": "trumpet", "qiyamaah": "qiyaamah",
             "mahmpod": "mahmood", "jahannum": "jahannam", "laughted": "laughed", "followered": "followed",
             "undersanding": "understanding", "kindlty": "kindly", "hinself": "himself", "faslse": "false",
             "infinate": "infinite", "shinning": "shining", "vienity": "vicinity"}


def polish(x, dec, prior_hon):
    """Slips of the clean reading that follow a pattern:
       a name with its honorific read as letters stuck to it ('RasulullaahEE', "Jibra'ee19')tÆZ"),
       l read for I ('lmaan', 'lblees'), and words run together ('theJews', 'IfAllaah', 'ofcreation').
    Returns a list of tokens (a split gives two)."""
    w = x["w"]
    if x["src"] != "A" or not w:
        return [x]
    # the book's own spelling slips, each checked against the print ('suffiecient', 'Mahmpod')
    if norm(w) in MISPRINTS:
        z = MISPRINTS[norm(w)]
        z = z[:1].upper() + z[1:] if w[:1].isupper() else z
        dec.append({"op": "misprint", "a": w, "to": z, "why": f"the book prints '{w}'", "boxes": [x["box"]]})
        return [dict(x, w=z)]
    # an honorific read as symbols after a name ('Rasulullaah%}'): the mark, and the real punctuation
    if re.search(r"[%{}^*~|@#&<>\[\]]", x["post"]) and name_hon_of(w):
        clean_post = "".join(ch for ch in x["post"] if ch in ").,;:!?”\"")
        y = dict(x, post=clean_post, hon=x.get("hon") or name_hon_of(w))
        dec.append({"op": "polish", "a": w + x["post"], "to": w + " " + y["hon"] + clean_post, "why": "honorific read as letters", "boxes": [x["box"]]})
        return [y]
    # words either side of a slash ('Imaan/lslaam')
    if "/" in w.strip("/"):
        parts = w.split("/")
        fixed = [polish(dict(x, w=p, pre="", post="", hon=None), [], prior_hon) for p in parts]
        if all(len(f) == 1 for f in fixed[:-1]):
            # the last part may carry the next word run on ('himself/herselfin' -> 'himself/herself in')
            z = "/".join([f[0]["w"] for f in fixed[:-1]] + [fixed[-1][0]["w"]])
            rest = fixed[-1][1:]
            if z != w or rest:
                dec.append({"op": "polish", "a": w, "to": " ".join([z] + [r["w"] for r in rest]), "why": "words run together", "boxes": [x["box"]]})
            if not rest:
                return [dict(x, w=z)]
            return [dict(x, w=z, post="")] + [dict(r, post=x["post"] if k == len(rest) - 1 else r["post"]) for k, r in enumerate(rest)]
        return [x]
    # a number set close to its word ('22years')
    mn = re.fullmatch(r"(\d+)([a-z]{3,})", w)
    if mn and in_dictionary(mn.group(2)):
        dec.append({"op": "polish", "a": w, "to": f"{mn.group(1)} {mn.group(2)}", "why": "words run together", "boxes": [x["box"]]})
        return [dict(x, w=mn.group(1), post=""), dict(x, w=mn.group(2), pre="")]
    # rn read for m ('Arnbiyaa'), in a name inside a longer run too
    for nm in HON_NAMES:
        if "m" in nm and nm.replace("m", "rn") in w:
            z = w.replace(nm.replace("m", "rn"), nm)
            dec.append({"op": "polish", "a": w, "to": z, "why": "rn read for m", "boxes": [x["box"]]})
            return polish(dict(x, w=z), dec, prior_hon)
    if "rn" in w and not known(w) and known(w.replace("rn", "m")):
        z = w.replace("rn", "m")
        dec.append({"op": "polish", "a": w, "to": z, "why": "rn read for m", "boxes": [x["box"]]})
        return polish(dict(x, w=z), dec, prior_hon)
    m4 = NAME_JUNK_WORD.match(w)
    if m4 and in_dictionary(m4.group(3)):
        name = m4.group(1)
        y = dict(x, w=name, post="", hon=x.get("hon") or prior_hon(name))
        dec.append({"op": "polish", "a": w, "to": f"{name} {y['hon'] or ''} {m4.group(3)}", "why": "honorific read as letters", "boxes": [x["box"]]})
        return [y] + polish(dict(x, w=m4.group(3), pre="", hon=None), dec, prior_hon)
    m = NAME_JUNK.match(w)
    name, junk = (m.group(1), m.group(2)) if m else (None, None)
    if not m:
        # a name with letters stuck on that make no English ending ('Muhammadz')
        m2 = re.match(r"^(" + "|".join(re.escape(n) for n in sorted(HON_NAMES, key=len, reverse=True)) + r")([a-z]{1,3})$", w)
        if m2 and m2.group(2) not in ("s", "an", "ic") and not known(w):
            name, junk = m2.group(1), m2.group(2)
    if not m:
        # the name's last letter lost into the mark ("Jibra'ee19')tÆZ")
        for nm in HON_NAMES:
            if len(nm) > 4 and w.startswith(nm[:-1]) and len(w) > len(nm) - 1 and not w[len(nm) - 1].islower() and w != nm:
                name, junk = nm, w[len(nm) - 1:]
                break
    if not name:
        # the name and its mark inside a longer run ('ofMuhammadE8', 'OMuhammadEE')
        m3 = re.search(r"(" + _NAMES_RE + r")([a-z]{0,2}[^a-z'’\s][^\s]{0,8})$", w)
        if m3 and (re.fullmatch(r"[a-z'’]+", m3.group(2)) or re.fullmatch(r"['’]s", m3.group(2))):
            m3 = None  # an ordinary ending ('Nooh's'), not a mark
        if m3 and m3.start() > 0:
            trail = re.search(r"[)\].,;:!?”\"]*$", m3.group(2).rstrip("'’")).group(0)
            y = dict(x, w=w[:m3.end(1)], post=clean_trail(trail) + x["post"], hon=x.get("hon") or prior_hon(m3.group(1)))
            dec.append({"op": "polish", "a": w, "to": y["w"] + " " + (y["hon"] or ""), "why": "honorific read as letters", "boxes": [x["box"]]})
            return polish(y, dec, prior_hon)
    if name and len(junk) <= 8:
        trail = re.search(r"[)\].,;:!?”\"]*$", junk.rstrip("'’")).group(0)
        y = dict(x, w=name, post=trail + x["post"], hon=x.get("hon") or prior_hon(name))
        dec.append({"op": "polish", "a": w, "to": name + (" " + y["hon"] if y.get("hon") else ""), "why": "honorific read as letters", "boxes": [x["box"]]})
        return [y]
    # capitals scattered by the OCR in a common short word ('iS', 'uS', 'yOU')
    if 2 <= len(w) <= 5 and w[1:] != w[1:].lower() and not w.isupper() and textfix.FREQ.get(w.lower(), 0) >= 20000:
        z = w[0] + w[1:].lower()
        z = z if w[0].isupper() else z.lower()
        dec.append({"op": "polish", "a": w, "to": z, "why": "capitals read into a word", "boxes": [x["box"]]})
        return polish(dict(x, w=z), dec, prior_hon)
    # l read for I at the start of a word ('lmaan', and 'lf' for 'If')
    if w == "lf" or w[:1] == "l" and not in_dictionary(w) and (in_dictionary("I" + w[1:]) or ACORPUS[norm("I" + w[1:])] >= 10) \
            and frequency("I" + w[1:]) > 3 * frequency(w):
        dec.append({"op": "polish", "a": w, "to": "I" + w[1:], "why": "l read for I", "boxes": [x["box"]]})
        return polish(dict(x, w="I" + w[1:]), dec, prior_hon)
    # words run together: a capital inside the word ('theJews', 'IfAllaah'), or a short common
    # word stuck to another ('ofcreation') — never a word the book itself uses often ('Allaah')
    base = re.sub(r"['’]s$", "", w)
    nb = norm(base)
    in_dict = in_dictionary(base) or nb in textfix.DICT
    # I read as l and run onto the word before ('orl', 'forl', 'thatl')
    mi = re.fullmatch(r"([a-z]+)l", w)
    if mi and (not in_dict or textfix.FREQ.get(w, 0) < 3000) and \
            (norm(mi.group(1)) in GLUE_WORDS or (norm(mi.group(1)) in textfix.REFV and len(mi.group(1)) >= 3 and not in_dict)):
        dec.append({"op": "polish", "a": w, "to": mi.group(1) + " I", "why": "l read for I", "boxes": [x["box"]]})
        return [dict(x, w=mi.group(1), post="", hon=None), dict(x, w="I", pre="")]
    # the vocative O run into the name ('OMuhammad', 'OAllaah')
    mo = re.fullmatch(r"O([A-Z][a-z'’]+)", w)
    if mo and not in_dict and (ACORPUS[norm(mo.group(1))] >= 3 or in_dictionary(mo.group(1))):
        dec.append({"op": "polish", "a": w, "to": "O " + mo.group(1), "why": "words run together", "boxes": [x["box"]]})
        return [dict(x, w="O", post="", hon=None)] + polish(dict(x, w=mo.group(1), pre=""), dec, prior_hon)
    # 'Iswear' -> 'I swear'
    if not in_dict and re.fullmatch(r"I[a-z]{3,}", w) and in_dictionary(w[1:]) and textfix.FREQ.get(w[1:], 0) >= 2000:
        dec.append({"op": "polish", "a": w, "to": "I " + w[1:], "why": "words run together", "boxes": [x["box"]]})
        return [dict(x, w="I", post=""), dict(x, w=w[1:], pre="")]
    if not in_dict and len(w) >= 4 and "/" not in w:
        best = None
        whole = ACORPUS[nb]
        name_like = w[:1].isupper() and w[1:] == w[1:].lower() and whole >= 5 and not re.search(r"['’]s[a-z]", w)  # 'Toor'
        for i in range(1, len(w)):
            a, b = w[:i], w[i:]
            for bb in (b, "I" + b[1:] if b[:1] == "l" else None):
                if not bb or len(bb) < 2:
                    continue
                camel = a[-1:].islower() and bb[:1].isupper()
                bcore = re.sub(r"['’]s$", "", bb)
                if x.get("agreed") and norm(a) not in GLUE_WORDS and norm(bcore) not in GLUE_WORDS:
                    continue  # both readings print it joined ('HaaMeem', 'InshaAllaah')
                if name_like and not camel:
                    continue
                if bcore == "a" and norm(a) in GLUE_WORDS:
                    score = (False, True, frequency(a))  # 'ofa' -> 'of a'
                    if best is None or score > best[0]:
                        best = (score, a, bb)
                    continue
                a_ok = (norm(a) in GLUE_WORDS and (camel or norm(a) not in ("a", "an", "i"))) or \
                       (camel and (in_dictionary(a) or ACORPUS[norm(a)] >= 10) and len(a) > 1) or \
                       (len(a) >= 3 and norm(a) in textfix.REFV and norm(bcore) in GLUE_WORDS and len(bcore) >= 2)  # 'anyonefor'
                glue_a = norm(a) in GLUE_WORDS
                b_div = not in_dictionary(bcore) and divides(bcore)  # 'Hedesires' -> He + desires
                b_known = in_dictionary(bcore) or (camel and ACORPUS[norm(bcore)] >= (2 if glue_a else 10)) or b_div
                b_ok = b_known and (camel or len(bcore) >= 2 and (len(bcore) >= 3 or norm(bcore) in GLUE_WORDS))
                rare_whole = b_div or whole < 0.2 * max(1, min(frequency(a), frequency(bcore)))
                if a_ok and b_ok and rare_whole:
                    score = (camel, in_dictionary(bcore), min(frequency(a), frequency(bb)))
                    if best is None or score > best[0]:
                        best = (score, a, bb)
        if best:
            _, a, bb = best
            dec.append({"op": "polish", "a": w, "to": f"{a} {bb}", "why": "words run together", "boxes": [x["box"]]})
            first = dict(x, w=a, post="", hon=None)  # an honorific stays with the last word
            second = dict(x, w=bb, pre="")
            return polish(first, dec, prior_hon) + polish(second, dec, prior_hon)
        # longer runs ('strivingforAllaah's', 'TheJewscould'): the best division into known words
        # 'Haaroot', 'Faatiha': one word, never divided ("Allaah'spunishment" is two)
        plain_name = w[:1].isupper() and w[1:] == w[1:].lower() and not re.search(r"['’]s[a-z]", w)
        possessive_glue = bool(re.search(r"['’]s[a-z]", w))
        if not name_like and not plain_name and "-" not in w and (possessive_glue or not (x.get("agreed") and ACORPUS[nb] >= 3)):
            parts = segment_known(w)
            if parts and len(parts) > 1:
                dec.append({"op": "polish", "a": w, "to": " ".join(parts), "why": "words run together", "boxes": [x["box"]]})
                out = []
                for k, p in enumerate(parts):
                    last = k == len(parts) - 1
                    out.extend(polish(dict(x, w=p, pre=x["pre"] if k == 0 else "", post=x["post"] if last else "",
                                           hon=x.get("hon") if last else None), dec, prior_hon))
                return out
    return [x]


def piece_cost(p):
    """-log frequency of a piece for dividing a run of letters; None if not a word.
    Short pieces must be common short words ('of', 'a'), so names are never cut into syllables."""
    n = norm(p)
    if not n or (len(n) <= 2 and n not in GLUE_WORDS and n not in ("o",)) or re.search(r"['’]s[a-z]", p):
        return None
    if re.search(r"['’]s$", p) and len(n) > 3:
        base = piece_cost(p[:-2])
        return None if base is None else base + 0.5
    f = textfix.FREQ.get(n, 0)
    if n in textfix.REFV or f >= 2000:
        return 20 - math.log(max(f, 50))
    if ACORPUS[n] >= 10 and p[:1].isupper() and p[1:] == p[1:].lower():  # a name the book uses ('Allaah', 'Deen')
        return 20 - math.log(ACORPUS[n] * 5)
    if n in GLOSSARY:
        return 14
    if len(n) >= 5 and in_dictionary(p):  # a rarer English word ('prerequisite')
        return 16
    return None


def segment_known(w):
    """Divide a run of letters into known words (at most 6), fewest and commonest first;
    a piece may start with I read as l. None if it cannot be done."""
    if len(w) < 6 or len(w) > 60:
        return None
    best = [None] * (len(w) + 1)
    best[0] = (0.0, [])
    for i in range(1, len(w) + 1):
        for j in range(max(0, i - 20), i):
            if best[j] is None:
                continue
            p = w[j:i]
            for q in (p, "I" + p[1:] if p[:1] == "l" and len(p) > 2 else None):
                if not q:
                    continue
                c = piece_cost(q)
                if c is None:
                    continue
                tot = best[j][0] + c + 3  # every extra word costs a little
                if best[i] is None or tot < best[i][0]:
                    best[i] = (tot, best[j][1] + [q])
    if best[-1] is None or len(best[-1][1]) > 6:
        return None
    parts = best[-1][1]
    # it must be glue: a common short word among the pieces, a capital inside the run, or
    # common English words throughout ('takeplace', 'largefollowing')
    common = all(norm(p) in textfix.REFV or textfix.FREQ.get(norm(p), 0) >= 3000 for p in parts)
    if not any(norm(p) in GLUE_WORDS for p in parts) and not re.search(r"[a-z][A-Z]|['’]s[a-z]", w) and not common:
        return None
    # 'A' before a word that is not English is a name cut in two ('A hadeeth'), not glue
    if any(norm(p) == "a" and k + 1 < len(parts) and not in_dictionary(parts[k + 1]) for k, p in enumerate(parts)):
        return None
    if any(re.search(r"[A-Z]", p[1:]) for p in parts):
        return None
    if any(len(norm(p)) <= 2 and norm(p) not in GLUE_WORDS and p != "O" for p in parts):
        return None
    return parts


def join_spaced(toks, dec):
    """A name the OCR cut at wide letter gaps ('Ka a bah', 'Hun ayn', 'Ma za a him', 'Di na ar'):
    a capitalised piece followed by short lower-case pieces, one of them no English word."""
    out = []
    i = 0
    while i < len(toks):
        x = toks[i]
        j = i + 1
        if x["src"] == "A" and x["w"][:1].isupper() and len(x["w"]) <= 4 and x["w"].isalpha() and not x["post"] and not x.get("hon"):
            while j < len(toks) and j - i <= 4:
                y = toks[j]
                if not (y["src"] == "A" and re.fullmatch(r"[a-z']{1,3}", y["w"]) and not y["pre"]):
                    break
                j += 1
                if y["post"] or y.get("hon"):
                    break
        run = toks[i:j]
        if len(run) >= 2:
            rare = [y for y in run[1:] if textfix.FREQ.get(norm(y["w"]), 0) < 20000]
            first_rare = textfix.FREQ.get(norm(x["w"]), 0) < 3000
            if rare or first_rare:
                w = "".join(y["w"] for y in run)
                z = dict(run[-1], w=w, pre=x["pre"], box=x["box"])
                dec.append({"op": "polish", "a": " ".join(y["w"] for y in run), "to": w, "why": "a word the OCR spaced apart", "boxes": [y["box"] for y in run]})
                out.append(z)
                i = j
                continue
        out.append(x)
        i += 1
    return out


def close(a, b):
    """Two readings a letter or two apart ('Hinta' / 'Hint', 'poeple' / 'people')."""
    return difflib.SequenceMatcher(None, norm(a), norm(b)).ratio() >= 0.7


def divides(w, depth=0):
    """Can a run of letters be read as two or three real words, each break at a capital
    or after a common short word? ('Hedesires' -> He + desires)"""
    if depth > 2 or len(w) < 4:
        return False
    for i in range(1, len(w)):
        a, b = w[:i], w[i:]
        camel = a[-1:].islower() and b[:1].isupper()
        if not (norm(a) in GLUE_WORDS or (camel and in_dictionary(a))) or len(b) < 2:
            continue
        if in_dictionary(b) or divides(b, depth + 1):
            return True
    return False


def sentence_start(out, x):
    return not out or bool(re.search(r"[.!?:]['\"”’)]*$", out[-1]["post"])) or "“" in x["pre"] or '"' in x["pre"]


def uncap(w, start):
    """Bold type read as capitals by both engines ('with US', '“DO not'): common words in
    capitals go back to lower case (a capital first letter at the start of a sentence)."""
    core = w.replace("'", "")
    if len(core) >= 2 and core.isupper() and textfix.FREQ.get(core.lower(), 0) >= 3000 and core not in ("AD", "BC"):
        return w[:1] + w[1:].lower() if start else w.lower()
    return w


TWO_LETTER = set("a i o am an as at be by do go he if in is it me my no of oh on or ox so to up us we ye".split())


def bare(w):
    """The word without a possessive ('Allaah's' -> 'allaah')."""
    n = norm(w)
    return n[:-2] if n.endswith("'s") and len(n) > 3 else n


def english(n):
    """In the English word list (not the web-frequency list, which holds typos like 'ofthe'), British
    spellings included ('solemnising', 'favourable')."""
    if n in SUFFIX_BITS or n in NOT_WORDS:
        return False
    if n in textfix.DICT:
        return len(n) >= 5 or textfix.FREQ.get(n, 0) >= 300
    if len(n) >= 6:
        us = re.sub(r"is(e|ed|es|ing|ation|ations)$", r"iz\1", n)
        us = re.sub(r"our(s|ed|ing|able|ably|ite|ites)?$", r"or\1", us)
        us = re.sub(r"ll(ed|ing|er|ers)$", r"l\1", us)
        return us != n and us in textfix.DICT
    return False


# endings that are never words of their own ('solemn is ing')
SUFFIX_BITS = {"ing", "ed", "es", "ies", "ly", "ise", "ised", "ises", "ising", "tion", "ment", "ness", "ity", "ous"}


def good_piece(w, whole=""):
    """A word that can stand alone after a break: 'the', 'from', 'Allaah' — not 'le', 'aj', 'Suh'.
    A name-like piece must be a word of the book in its own right, more often than the whole it
    comes from ('Kaafir' of 'Kaafirfrom' yes, 'Abba' of 'Abbaas' no)."""
    n = bare(w)
    if not n:
        return False
    if n.isdigit() or re.fullmatch(r"\d+(?:st|nd|rd|th)", n):
        return True
    if "-" in w:
        return all(good_piece(q) for q in w.split("-") if q)
    if len(n) <= 2:
        return n in TWO_LETTER
    if n in GLUE_WORDS or n in GLOSSARY or n in PROTECTED or n in textfix.REFV:
        return True
    if w[:1].isupper():
        return ACORPUS[n] >= 3 and ACORPUS[n] > ACORPUS[norm(whole)]
    return english(n) or (ACORPUS[n] >= 3 and not glue_like(n) and not splits(n))


def whole_word(w):
    """A word of the print that is one word however the scan spaces it ('regardless', 'Toor')."""
    if re.search(r"[a-z][A-Z]", w):
        return False  # 'yourfatherAadam'
    if "-" in w:
        return all(whole_word(q) for q in w.split("-") if q)
    n = bare(w)
    if n in NOT_WORDS:
        return False
    return n in MISPRINTS or n in PROTECTED or n in GLOSSARY or n in textfix.REFV or         (n in textfix.DICT and (len(n) >= 5 or textfix.FREQ.get(n, 0) >= 20000)) or (len(n) >= 6 and english(n))


# in the word list, but two words in the book's English
NOT_WORDS = {"aswell", "incase", "hes", "ona", "tome", "infact", "alot", "atleast", "inspite", "eachother", "ofa", "isa"}


def spaced_letters(ps, joined):
    """Pieces of the print that are one word's letters spaced apart ('Di na ar', 'Abba as', 'Isl a a mic')."""
    ns = [norm(q["w"]) for q in ps]
    if any(q.get("hon") for q in ps[:-1]) or "s" in ns:
        return False  # 'He s not': an apostrophe lost, not a word spaced out
    j = norm(joined)
    book = j in GLOSSARY or j in PROTECTED or (ACORPUS[j] >= 2 and not glue_like(j)) or whole_word(joined)
    if not book:
        return False
    short = all(len(n) <= 4 for n in ns) and sum(len(n) <= 3 for n in ns) >= len(ns) - 1
    if short and not all(good_piece(q["w"]) for q in ps):
        return True
    if all(q["w"][:1].islower() for q in ps) and whole_word(joined) and ns[-1] in SUFFIXES:
        return True  # 'account ability', 'fruit less', 'solemn is ing'
    # a name parted at a wide gap ('Abba as' / 'Abbaas'): capital then lower case, the whole a name of the book
    return ps[0]["w"][:1].isupper() and all(q["w"][:1].islower() for q in ps[1:]) and ACORPUS[j] >= 2 and \
        all(ACORPUS[n] < ACORPUS[j] for n in ns)


SUFFIXES = set("""less ness ful fully able ably ability hood ship ment ly ally rely ing ed ise ised ising ises ity ous
ward wards coming lasting light town time one body thing where self selves ever standing""".split())


def letter_spans(items):
    """Per item: its norm letters, each with the printed characters that carry it."""
    spans = []
    for x in items:
        n = norm(x["w"])
        chars = [""] * len(n)
        p = 0
        for c in x["w"]:
            if p < len(n) and c.lower().replace("’", "'") == n[p]:
                chars[p] += c
                p += 1
            elif chars:
                chars[max(p - 1, 0)] += c
        spans.append(chars)
    return spans


def respace(As, Bs, before=()):
    """Same letters, different word breaks: the print's words, with a break of the scan taken where it
    parts glue into real words ('yourfatherAadam' -> 'your father Aadam') and a break of the print dropped
    where it has spaced one word's letters apart ('Di na ar' -> 'Dinaar'). Punctuation, colour and
    honorifics stay the print's."""
    if any(not norm(x["w"]) for x in As) or any(not norm(y["w"]) for y in Bs):
        return None
    spans = letter_spans(As)
    ends_a, t = [], 0
    for sp in spans:
        t += len(sp)
        ends_a.append(t)
    total = t
    ends_b, t = [], 0
    for y in Bs:
        t += len(norm(y["w"]))
        ends_b.append(t)
    if t != total:
        return None
    starts_a = [0] + ends_a[:-1]
    bounds = set(ends_a)
    # joins: a word of the scan that is several short pieces of the print, one of them no word
    s0 = 0
    for e in ends_b:
        inner = [b for b in ends_a if s0 < b < e]
        if inner and (s0 == 0 or s0 in bounds) and e in bounds:
            idx = [i for i in range(len(As)) if starts_a[i] >= s0 and ends_a[i] <= e]
            ps = [As[i] for i in idx]
            if spaced_letters(ps, "".join(q["w"] for q in ps)):
                bounds -= set(inner)
        s0 = e
    # splits: a word of the print that is glue, parted where the scan parts it into real words
    letters = "".join("".join(sp) for sp in spans)
    flat = [c for sp in spans for c in sp]
    cuts = sorted(bounds)
    s0 = 0
    for e in cuts:
        inner = [b for b in ends_b if s0 < b < e and not (flat[b - 1][-1:].isdigit() and flat[b][:1].isdigit())]
        word = "".join(flat[s0:e])
        if inner and not whole_word(word):
            pts = [s0] + inner + [e]
            # as many of the scan's breaks as leave every piece a real word; a piece between
            # breaks where lower case meets a capital ('the|Day|of', 'Khateebul|Ambiyaa') is one
            camel = {k for k in range(s0 + 1, e) if flat[k - 1][-1:].islower() and flat[k][:1].isupper()}
            def fine(i, j):
                p = "".join(flat[pts[i]:pts[j]])
                if good_piece(p, word):
                    return True
                return len(norm(p)) >= 3 and (pts[i] in camel or pts[j] in camel) and                     (pts[i] in camel or pts[i] == s0) and (pts[j] in camel or pts[j] == e)
            best = {0: (0, [])}
            for j in range(1, len(pts)):
                for i in range(j):
                    if i in best and fine(i, j):
                        c = best[i][0] + 1
                        if j not in best or c > best[j][0]:
                            best[j] = (c, best[i][1] + [pts[j]])
            if len(pts) - 1 in best and best[len(pts) - 1][0] > 1:
                cut = best[len(pts) - 1][1][:-1]
                # the scan's break one letter late after a small word ('top reach' for 'to preach',
                # 'thew hole' for 'the whole'): the small word and a real word win
                for ci, c in enumerate(cut):
                    lo = cut[ci - 1] if ci else s0
                    hi = cut[ci + 1] if ci + 1 < len(cut) else e
                    left, right = norm("".join(flat[lo:c])), norm("".join(flat[c:hi]))
                    if left[:-1] in GLUE_WORDS and left not in GLUE_WORDS and english(left[-1] + right) and c - 1 > lo:
                        cut[ci] = c - 1
                edges = [s0] + cut + [e]
                sizes = [len("".join(flat[edges[k]:edges[k + 1]])) for k in range(len(edges) - 1)]
                pieces = ["".join(flat[edges[k]:edges[k + 1]]) for k in range(len(edges) - 1)]
                # short words that are not function words ('in fin ate', 'breast fed'): a word cut up, not glue
                crumbs = [q for q in pieces if len(norm(q)) <= 3 and norm(q) not in GLUE_WORDS and norm(q) not in TWO_LETTER
                          and not norm(q).isdigit() and not q[:1].isupper() and textfix.FREQ.get(norm(q), 0) < 30000]
                # a name broken into a word and crumbs ('Man a at', 'Luqm a an') stays whole
                if not (word[:1].isupper() and len(sizes) >= 3 and all(z <= 2 for z in sizes[1:])) and \
                        not (not camel and (len(crumbs) >= 2 or (crumbs and not any(
                            norm(q) in GLUE_WORDS or norm(q) in TWO_LETTER for q in pieces)))):
                    bounds |= set(cut)
        s0 = e
    # the words
    def item_at(off):
        for i in range(len(As)):
            if starts_a[i] <= off < ends_a[i]:
                return i
    by_end = dict(zip(ends_b, Bs))
    by_start = dict(zip([0] + ends_b[:-1], Bs))
    out = []
    s0 = 0
    for e in sorted(bounds):
        i, j = item_at(s0), item_at(e - 1)
        base = As[i]
        z = dict(base, w="".join(flat[s0:e]), pre=base["pre"] if s0 == starts_a[i] else "")
        if e == ends_a[j]:
            z["post"] = As[j]["post"]
            z["hon"] = As[j].get("hon")
            if As[j].get("mark_after"):
                z["mark_after"] = True
            else:
                z.pop("mark_after", None)
        else:
            z["post"], z["hon"] = "", None
            z.pop("mark_after", None)
        # punctuation the print's OCR did not read, where the scan's word has the same edges
        yb = by_end.get(e)
        if yb is not None:
            z["post"] = richer_post(z["post"], yb["post"])
        ya = by_start.get(s0)
        if ya is not None and ya["pre"] != z["pre"] and len(ya["pre"]) > len(z["pre"]) and set(z["pre"]) <= set(ya["pre"]):
            z["pre"] = ya["pre"]
        if ya is not None and ya is yb:
            # the same word in both readings: its natural case ('iS' -> 'is', 'QIyaamah' -> 'Qiyaamah')
            z["w"] = choose_case(z["w"], ya["w"], sentence_start(list(before) + out, z))
        out.append(z)
        s0 = e
    return out


# the last verse of each surah: words after it in the scan are the next surah's heading
LAST_VERSES = {f"{c['id']}:{c['verses_count']}" for c in textfix.chapters}


def plausible_insert(w):
    """A word only the scan has, that may be a word the clean print's OCR dropped — not a running
    head in capitals ('THE WINDS THAT DISPERSE'), a page or verse number, or crumbs of the Arabic
    line ('ft', 'Id', 'i-Si')."""
    n = norm(w)
    core = re.sub(r"[^A-Za-z0-9]", "", w)
    if not n or re.fullmatch(r"[\d.,-]+", w):
        return False
    if len(core) >= 2 and core.isupper():
        return False
    if "-" in w and min(len(p) for p in w.split("-")) <= 2:
        return False
    if len(n) <= 2:
        return n in TWO_LETTER
    if len(n) == 3:
        return n in GLUE_WORDS or n in GLOSSARY or textfix.FREQ.get(n, 0) >= 100000 or w[:1].isupper() and ACORPUS[n] >= 3
    return True


def richer_post(a, b):
    """The punctuation after a word both readings have: the clean print's, unless the scan's has what the
    OCR of bold stops tends to miss ('.' for '...', a closing quote, a '?' or '!' read as '.')."""
    if b == a or not b:
        return a
    if len(b) > len(a) and set(a) <= set(b):
        return b
    if set(a) <= set(".,);:”\""):
        quote = re.search(r"[”\"]+$", a)
        out, tail = (a[:quote.start()], quote.group(0)) if quote else (a, "")
        # a question or exclamation mark read as a full stop
        for q in "?!":
            if q in b and q not in out:
                out = out.replace(".", q, 1) if "." in out else out + q
        if ("..." in b or "…" in b) and "..." not in out:
            out = out.replace(".", "...", 1) if "." in out else out + "..."
        # a closing quote the print's OCR left out
        if not re.search(r"[”\"]", a) and ("”" in b or '"' in b):
            tail = "”"
        return out + tail
    return a


def same_word(x, y, out, dec, stats):
    """One word both readings agree on: its case and punctuation from whichever reads naturally."""
    start = sentence_start(out, x)
    c = uncap(choose_case(x["w"], y["w"], bool(start)), start)
    z = dict(x, w=c, agreed=norm(x["w"]) == norm(y["w"]))
    # punctuation the OCR did not read, or read short ('.' for '...')
    z["post"] = richer_post(x["post"], y["post"])
    if y["pre"] != x["pre"] and len(y["pre"]) > len(x["pre"]) and set(x["pre"]) <= set(y["pre"]):
        z["pre"] = y["pre"]
    if c != x["w"]:
        dec.append({"op": "case", "a": x["w"], "b": y["w"], "to": c, "boxes": [x["box"]]})
        stats["case"] += 1
    return z


def name_hon_of(w):
    try:
        return name_hon(w)
    except Exception:
        return None


def name_hon(name):
    """The honorific a name carries in this book when its mark was read as letters."""
    from glyphs import name_prior
    p = name_prior(name)
    if p == "ra":
        n = norm(name)
        return HON["anhum"] if n == "sahabah" else HON["anhaa"] if n in FEMALE else HON["anhu"]
    return HON.get(p) if p else None


def load_corpus(V=None):
    """How often each word stands alone in the clean print."""
    if V is None:
        V = json.load(open(os.path.join(CACHE, "big_verses.json"), encoding="utf-8"))
    ACORPUS.clear()
    for toks in V.values():
        for w in toks:
            if not w.get("g"):
                for c in WORD.findall(w["t"]):
                    ACORPUS[norm(c)] += 1


def scan_text():
    """The scan's words per verse, as first built (kept apart, since public/data is rebuilt from this merge)."""
    snap = os.path.join(CACHE, "qme_scan_b.json")
    if os.path.exists(snap):
        return json.load(open(snap, encoding="utf-8"))
    B = {}
    for n in range(1, 115):
        d = json.load(open(os.path.join(OUT_DATA, f"{n}.json"), encoding="utf-8"))
        for v in d["v"]:
            if v.get("q"):
                B[f"{n}:{v['n']}"] = v["q"]
    json.dump(B, open(snap, "w", encoding="utf-8"), ensure_ascii=False)
    return B


def recut(V, B):
    """Verse boundaries decided for a whole surah at once. Each reading has its own slips: the print's
    OCR can miss a verse number (37:144 left inside 37:143), and the scan copy often ran two verses into
    one (23:2 holding 23:3, with 23:3 left empty). The two texts are aligned word by word across the
    surah; the print's own verse starts stand, a start only the scan has is carried over, and both
    readings are then cut at the same places."""
    V2, B2, notes = {}, {}, {}
    surahs = sorted({int(k.split(":")[0]) for k in list(V) + list(B)})
    for sn in surahs:
        n_max = max(int(k.split(":")[1]) for k in list(V) + list(B) if int(k.split(":")[0]) == sn)
        vs = range(1, n_max + 1)
        at, a_start = [], {}
        for v in vs:
            toks = V.get(f"{sn}:{v}", [])
            if toks:
                a_start[v] = len(at)
            at.extend(toks)
        bw, b_start = [], {}
        for v in vs:
            words = [(kind, t) for kind, text in B.get(f"{sn}:{v}", []) for t in text.split()]
            if words:
                b_start[v] = len(bw)
            bw.extend(words)
        an = [norm(t["t"]) if not t.get("g") else "" for t in at]
        bn = [norm(t) for _, t in bw]
        sm = difflib.SequenceMatcher(None, an, bn, autojunk=False)
        b2a, a2b = {}, {}
        for i, j, size in sm.get_matching_blocks():
            for d in range(size):
                b2a[j + d] = i + d
                a2b[i + d] = j + d

        def map_to(m, idx, limit):
            # the matched position at or after idx (a boundary falls just before a word)
            for q in range(idx, min(idx + 12, limit)):
                if q in m:
                    return m[q] - (q - idx)
            for q in range(idx - 1, max(idx - 12, -1), -1):
                if q in m:
                    return m[q] + (idx - q)
            return None

        starts = {}
        for v in vs:
            if v in a_start:
                starts[v] = a_start[v]
            elif v in b_start:
                pos = map_to(b2a, b_start[v], len(bw))
                if pos is not None:
                    starts[v] = max(0, min(len(at), pos))
                    notes[f"{sn}:{v}"] = "verse start taken from the scan (the print's verse number was not read)"
        # starts must rise
        last = -1
        for v in vs:
            if v in starts:
                if starts[v] <= last:
                    del starts[v]
                    continue
                last = starts[v]
        # B cut at the same places: its own start where it has one close by, else the mapped place
        bstarts = {}

        def opening(ns, i, n=30):
            s = ""
            while i < len(ns) and len(s) < n:
                s += re.sub(r"[^a-z0-9]", "", ns[i])
                i += 1
            return s

        def shared(a, b):
            k = 0
            while k < min(len(a), len(b)) and a[k] == b[k]:
                k += 1
            return k

        for v, apos in starts.items():
            mp = map_to(a2b, apos, len(at)) if apos < len(at) else len(bw)
            own = b_start.get(v)
            if own is not None and (mp is None or abs(own - mp) <= 3):
                bstarts[v] = own
            elif mp is not None:
                # the place in the scan whose words open the way the print's verse opens (a run-together
                # word of the print, 'AbrahaathegovernorofYemen', throws the word alignment off)
                a_open = opening(an, apos)
                cands = [c for c in range(max(0, mp - 8), min(len(bw), mp + 3))] + ([own] if own is not None else [])
                like = lambda c: difflib.SequenceMatcher(None, a_open, opening(bn, c)).ratio()
                best = max(cands, key=lambda c: (round(like(c), 2), c == own, -abs(c - mp))) if cands else mp
                if like(best) < 0.75 or like(best) < like(mp) + 0.1:
                    best = mp
                bstarts[v] = max(0, min(len(bw), best))
                if own is None or bstarts[v] != own:
                    notes.setdefault(f"{sn}:{v}", "the scan's verse boundary moved to the print's")
        order = sorted(starts)
        for i, v in enumerate(order):
            end = starts[order[i + 1]] if i + 1 < len(order) else len(at)
            V2[f"{sn}:{v}"] = at[starts[v]:end]
        border = sorted(bstarts)
        blast = -1
        for i, v in enumerate(border):
            b0 = max(bstarts[v], blast)
            end = bstarts[border[i + 1]] if i + 1 < len(border) else len(bw)
            end = max(end, b0)
            blast = end
            segs = []
            for kind, t in bw[b0:end]:
                if segs and segs[-1][0] == kind:
                    segs[-1][1] += " " + t
                else:
                    segs.append([kind, t])
            B2[f"{sn}:{v}"] = segs
        # verses with no start in either reading: whatever the scan has for them
        for v in vs:
            k = f"{sn}:{v}"
            if k not in V2 and k not in B2 and B.get(k):
                B2[k] = B[k]
    return V2, B2, notes



RA_FEMALE = {"Aa'isha", "Aaisha", "Khadeeja", "Hafsa", "Safiyya", "Juwayriyya", "Zaynab", "Faatima", "Sawda", "Asmaa", "Aasiya", "Maymoona"}
RA_PLURAL = {"Sahabah", "Sahaabah", "Sahaaba", "Sahaba", "Companions", "Ansaar", "Muhaajireen"}
HON_CAP = {n.lower(): n for n in HON_NAMES + ["Isa", "Ibraheem", "Jibra'eel", "Ismaa'eel", "Is'haaq", "Ilyaas", "Idrees"]}


def tidy(key, segs, fixes, log):
    """Last touches on a verse's text: fixes decided by looking at the print, then a few safe
    typographic repairs (numbers run into words, function words run into names)."""
    for seg in segs:
        t = seg[1]
        # the calligraphy of a mark read as symbols beside it ('Yusuf ﵊*', 'Moosa ﵊&)', 'Muhammadæ;')
        t = re.sub(r"\b(Muhammad|Rasulullaah)æ;", r"\1 ﷺ", t)
        t = re.sub(r"([ﷺ﵊﵁﵂﵃])[*&éæö•\]]+", r"\1", t)
        t = re.sub(r"\s*&+", "", t)
        seg[1] = t.replace("••", "").replace("..•.", "...")
    for k, find, repl, note in fixes:
        if k != key:
            continue
        # ' | ' marks where the colour changes (black print / pink commentary): one part per segment
        fparts, rparts = find.split(" | "), repl.split(" | ")
        done = False
        for i in range(len(segs) - len(fparts) + 1):
            window = [segs[i + j][1] for j in range(len(fparts))]
            if len(fparts) == 1:
                ok = fparts[0] in window[0]
            else:
                ok = window[0].endswith(fparts[0]) and window[-1].startswith(fparts[-1]) and \
                    all(window[j] == fparts[j] for j in range(1, len(fparts) - 1))
            if ok:
                for j in range(len(fparts)):
                    segs[i + j][1] = segs[i + j][1].replace(fparts[j], rparts[j] if j < len(rparts) else "", 1).strip()
                done = True
                break
        log.append(dict({"key": key, "from": find.replace(" | ", " ").strip(), "to": repl.replace(" | ", " ").strip(), "note": note},
                        **({} if done else {"unapplied": True})))
    # '{p:...}' / '{b:...}' in a fix: words of the other colour (pink commentary / black print)
    split = []
    for kind, t in segs:
        for part in re.split(r"(\{[pb]:[^}]*\})", t):
            m = re.fullmatch(r"\{([pb]):([^}]*)\}", part)
            k2, t2 = ((1 if m.group(1) == "p" else 0), m.group(2)) if m else (kind, part)
            t2 = t2.strip()
            if not t2:
                continue
            if split and split[-1][0] == k2:
                split[-1][1] += " " + t2
            else:
                split.append([k2, t2])
    segs[:] = split
    # an opening quote read twice, once each side of a colour change ('said,"' + '"Did')
    for i in range(len(segs) - 1):
        if re.search(r"[“\"]$", segs[i][1]) and re.match(r"[“\"'‘]", segs[i + 1][1]):
            segs[i][1] = segs[i][1][:-1].rstrip()
            if segs[i + 1][1][:1] in "'‘":
                segs[i + 1][1] = "“" + segs[i + 1][1][1:]
    if segs:
        # a verse that continues the one before opens with the print's ellipsis ('.who', '".and' read short)
        segs[0][1] = re.sub(r"^([“\"‘'(]*)\.{1,4}(?=[^.])", r"\1...", segs[0][1])
    for seg in segs:
        t = seg[1]
        # straight double quotes as the print's curly ones: opening after a space or bracket, else closing
        t = re.sub(r"^'(?=\")", "‘", t)
        # opening when a word follows and none comes before ('..."Or', 'said "We'), else closing
        t = re.sub(r'(?<![A-Za-z0-9,;:!?)’ﷺ﵊﵁﵂﵃])"(?=[A-Za-z0-9(‘\'.…])', "“", t)
        t = t.replace('"', "”")
        t = re.sub(r"(?<=\s)”(?=[A-Za-z(])", "“", t)
        t = re.sub(r"(\S?)“\s+“", lambda m: (m.group(1) + " " if m.group(1) else "") + "“", t)
        # a lone 'l' is the pronoun read short ('“l shall inform you')
        t = re.sub(r"(^|(?<=[\s“\"‘(]))l(?=[\s,])", "I", t)
        # 'anabi' -> 'a Nabi', 'Asrsalaah' -> 'Asr salaah' (the print spaces them; the OCR ran them together)
        t = re.sub(r"\banabi\b", "a Nabi", t)
        # the pronoun read as a figure ('1 am with you')
        t = re.sub(r"(?<![\d,.])\b1 (am|was|will|shall|have|had|do|did|swear|seek|know|fear)\b", r"I \1", t)
        t = re.sub(r"(?<=[(\"“])1 (?=(?!of\b|km\b|kg\b)[a-z]{3,})", "I ", t)
        t = re.sub(r"\b(Asr|Zuhr|Fajr|Maghrib|Esha|Isha)(salaah|salaat)", r"\1 \2", t)
        # a possessive set apart from its word or mark ('Ibraheem ﵊ 's', 'Allaah 's')
        t = re.sub(r"(\w|[ﷺ﵊﵁﵂﵃])\)?['’]?\s+['’]s\b", r"\1's", t)
        # 'over80' -> 'over 80', 'verse27' -> 'verse 27' (not '10th', '88km')
        t = re.sub(r"\b([A-Za-z]{2,})(\d{2,})\b", r"\1 \2", t)
        # 'ofMuhammad', "lfAllaah" -> 'of Muhammad', 'If Allaah'
        t = re.sub(r"\b(of|the|to|in|and|for|from|with|by|at|on|as|is|lf|If)([A-Z][a-z'’]{2,})",
                   lambda m: ("If" if m.group(1) == "lf" else m.group(1)) + " " + m.group(2), t)
        # a name before its honorific, lower-cased by the OCR ('ibraheem ﵊')
        t = re.sub(r"\b([a-z][a-z'’]+)(?= [ﷺ﵊﵁﵂﵃])", lambda m: HON_CAP.get(m.group(1), m.group(1)), t)
        # 'May Allaah be pleased with her / them': the Arabic of the mark follows the person
        t = re.sub(r"\b(\S+?)(['’]s)? ﵁", lambda m: m.group(0).replace("﵁", "﵂") if m.group(1) in RA_FEMALE
                   else m.group(0).replace("﵁", "﵃") if m.group(1) in RA_PLURAL else m.group(0), t)
        seg[1] = t
    return segs



def main():
    V = json.load(open(os.path.join(CACHE, "big_verses.json"), encoding="utf-8"))
    raw = json.load(open(os.path.join(CACHE, "qme_raw.json"), encoding="utf-8"))
    overrides = json.load(open(os.path.join(HERE, "qme_overrides.json"), encoding="utf-8")) if os.path.exists(os.path.join(HERE, "qme_overrides.json")) else {}
    B = scan_text()
    # the scan's Faatiha was stored in the book's numbering (1-7 without the Bismillah): shift it to Hafs
    old = {k: B.pop(k) for k in [f"1:{i}" for i in range(1, 8)] if k in B}
    for i in range(1, 6):
        if f"1:{i}" in old:
            B[f"1:{i + 1}"] = old[f"1:{i}"]
    B["1:7"] = old.get("1:6", []) + old.get("1:7", [])
    load_corpus(V)
    V, B, cut_notes = recut(V, B)
    json.dump(cut_notes, open(os.path.join(CACHE, "qme_recut.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=0)

    final, decisions = {}, {}
    stats = collections.Counter()
    keys = sorted(set(V) | set(B), key=lambda k: tuple(map(int, k.split(":"))))
    for key in keys:
        A = a_items(V.get(key, []))
        Bi = b_items(B.get(key, []))
        aw = [x for x in A if x["w"]]
        # punctuation opening the verse ('...(which will be)'): it goes before the first word
        if A and not A[0]["w"] and aw and A[0]["pre"].strip():
            raw_lead = A[0]["pre"]
            # quotes first, and dots as the ellipsis the print sets ('".' is '"...' read short)
            lead = re.sub(r"[^“\"‘'(]", "", raw_lead) + ("..." if re.search(r"[.…]", raw_lead) else "")
            aw[0] = dict(aw[0], pre=lead + (aw[0]["pre"].lstrip(".…") if "..." in lead else aw[0]["pre"]))
        dec = []
        # a damaged page or a missing verse: the scan's text stands, flagged
        letters = lambda xs: sum(len(re.sub(r"[^a-z]", "", norm(x["w"]))) for x in xs)
        if not aw or letters(aw) < 0.6 * letters(Bi):
            out = Bi
            dec.append({"op": "fallback", "a": " ".join(x["w"] for x in aw), "b": " ".join(x["w"] for x in Bi), "why": "clean print missing or damaged here"})
            stats["fallback"] += 1
        else:
            out = []
            an = [norm(x["w"]) for x in aw]
            bn = [norm(x["w"]) for x in Bi]
            sm = difflib.SequenceMatcher(None, an, bn, autojunk=False)
            for op, i1, i2, j1, j2 in sm.get_opcodes():
                As, Bs = aw[i1:i2], Bi[j1:j2]
                a_letters = "".join(an[i1:i2])
                b_letters = "".join(bn[j1:j2])
                if op == "equal" or (a_letters == b_letters and len(As) == len(Bs) and As):
                    for x, y in zip(As, Bs):
                        out.append(same_word(x, y, out, dec, stats))
                    continue
                a_txt = " ".join(x["w"] for x in As)
                b_txt = " ".join(y["w"] for y in Bs)
                boxes = [x["box"] for x in As]
                ov = overrides.get(f"{key}|{a_txt}|{b_txt}")
                if ov is not None:
                    pick = ov
                    why = "decided by looking at the print"
                elif a_letters == b_letters and a_letters and respace(As, Bs, out) is not None:
                    # same letters, different spacing ('ofQiyaamah' / 'of Qiyaamah'): decided break by break
                    spaced = respace(As, Bs, out)
                    pick = {"items": spaced}
                    if [x["w"] for x in spaced] == [x["w"] for x in As]:
                        why = "same letters, spacing differs: the print's spacing kept"
                    else:
                        why = "same letters, spacing differs: respaced"
                    stats["spacing"] += 1
                elif not As:
                    # the clean reading has nothing here: a word the OCR dropped, or debris in the scan
                    after_mark = out and out[-1].get("hon")
                    # words the print has close by: the alignment's slip, not words the OCR dropped
                    near = {norm(x["w"]) for x in aw[max(0, i1 - 4): i1 + 4]}
                    echoed = Bs and all(norm(y["w"]) in near for y in Bs) and not (out and out[-1].get("mark_after"))
                    # crumbs of the Arabic line after the words the OCR dropped ('... messenger Jibra ee &')
                    while len(Bs) >= 3 and not plausible_insert(Bs[-1]["w"]) and all(plausible_insert(y["w"]) for y in Bs[:-1]):
                        Bs = Bs[:-1]
                    # a name's honorific read as letters inside the run ('Moosa Sl in Allaah's sight'): the mark
                    if len(Bs) >= 2:
                        kept_b = []
                        for y in Bs:
                            if not plausible_insert(y["w"]) and kept_b and name_hon_of(kept_b[-1]["w"]) \
                                    and not kept_b[-1].get("hon") and len(norm(y["w"])) <= 3:
                                kept_b[-1] = dict(kept_b[-1], hon=name_hon_of(kept_b[-1]["w"]), post=kept_b[-1]["post"] + y["post"])
                            else:
                                kept_b.append(y)
                        Bs = kept_b
                    if echoed:
                        pick = "none"
                    elif Bs and all(known(y["w"]) and plausible_insert(y["w"]) for y in Bs) \
                            and not (after_mark and all(len(norm(y["w"])) <= 2 for y in Bs)) \
                            and not (after_mark and len(Bs) == 1 and len(norm(Bs[0]["w"])) <= 4 and norm(Bs[0]["w"]) not in GLUE_WORDS
                                     and not name_hon_of(Bs[0]["w"])) \
                            and not (i1 == len(an) and key in LAST_VERSES and any(
                                len(re.sub(r"[^A-Za-z]", "", y["w"])) >= 2 and re.sub(r"[^A-Za-z]", "", y["w"]).isupper() for y in Bi[j1:])) \
                            and not (i1 == len(an) and any(norm(y["w"]) == "surah" for y in Bs)) \
                            and not (len(Bs) == 1 and len(norm(Bs[0]["w"])) == 1) \
                            and not (len(Bs) <= 2 and all(len(norm(y["w"])) <= 3 and not name_hon_of(y["w"]) for y in Bs) and (
                                Bs[0]["w"][:1].isupper() or (out and re.search(r"[.!?)]$", out[-1]["post"])))):
                        pick = "review-B"
                    else:
                        pick = "none"
                        # the scan read the honorific as letters with the punctuation after it ('Isa i, Ayyoob'):
                        # the punctuation belongs after the mark, which swallowed it in the print's OCR
                        tail = "".join(y["pre"] + y["post"] for y in Bs)
                        stops = "".join(ch for ch in tail if ch in ".,;:!?)")
                        if out and out[-1].get("hon") and not out[-1]["post"] and stops and len(Bs) <= 2 \
                                and all(len(norm(y["w"])) <= 3 for y in Bs):
                            out[-1] = dict(out[-1], post=stops[:2])
                    why = "only in the scan"
                    stats["insert-" + pick] += 1
                elif not Bs:
                    pick = "A" if all(known(x["w"]) for x in As) else "review-A"
                    why = "only in the clean print"
                    stats["delete-" + pick] += 1
                else:
                    ka, kb = all(known(x["w"]) for x in As), all(known(y["w"]) for y in Bs)
                    # after its usual slips are corrected, does the clean print say what the scan says?
                    fixed = [p for x in As for p in polish(dict(x), [], name_hon)]
                    agree = [norm(p["w"]) for p in fixed if p["w"]] == [norm(y["w"]) for y in Bs]
                    kfix = all(known(p["w"]) for p in fixed if p["w"])
                    names = [x for x in As if x["w"][:1].isupper() and x["w"][1:] == x["w"][1:].lower() and len(x["w"]) > 2]
                    if agree:
                        pick, why = "A", "the same once the OCR slips are corrected"
                    elif len(Bs) - len(fixed) >= 3:
                        # the scan has words the print does not have here: often a verse boundary it misplaced
                        pick, why = "review-A", "the scan has extra words here (a misplaced verse boundary)"
                    elif kfix and not ka:
                        pick, why = "A", "the clean print, its OCR slips corrected"
                    elif names and len(names) == len(As) and not ka and (close(a_txt, b_txt) or all(
                            norm(x["w"]) in GLOSSARY or ACORPUS[norm(x["w"])] >= 2 for x in names)):
                        pick, why = "review-A", "a name as printed (not in the word lists)"
                    elif ka and not kb:
                        pick, why = "A", "clean print reads real words, the scan does not"
                    elif kb and not ka:
                        pick = "B"
                        misprint = len(As) == len(Bs) == 1 and As[0]["w"].islower() and close(a_txt, b_txt)
                        why = "a misprint in the book, corrected" if misprint else "the scan reads real words, the clean print does not"
                    elif ka and kb:
                        pick, why = "review-A", "both read real words"
                    else:
                        pick, why = "review-A", "neither reads cleanly"
                    stats["replace-" + pick] += 1
                if isinstance(pick, dict) and "items" in pick:
                    out.extend(pick["items"])
                    pick = " ".join(x["w"] for x in pick["items"])
                elif isinstance(pick, dict):
                    # decided by looking at the print: its words, in the colour of the place
                    ref = (As or Bs)[0]
                    words = pick["text"].split()
                    for k2, t2 in enumerate(words):
                        pre2, core2, post2 = split_token(t2)
                        out.append(dict(ref, w=core2, pre=(ref["pre"] if k2 == 0 else "") + pre2,
                                        post=post2 + ((As or Bs)[-1]["post"] if k2 == len(words) - 1 else ""), src="O", hon=None))
                    pick = "print"
                elif pick in ("A", "review-A"):
                    out.extend(As)
                elif pick in ("B", "review-B"):
                    # the scan's words, in the clean print's colour where it has one
                    pending = not As and out and out[-1].pop("mark_after", False)
                    named = False
                    if not As and len(Bs) >= 2 and Bs[-1]["w"] == "I" and name_hon_of(Bs[-2]["w"]):
                        Bs = Bs[:-1]  # 'all Ambiyaa I': the name's honorific read as a letter
                    for y in Bs:
                        z = dict(y, pink=As[0]["pink"] if As else y["pink"])
                        if pending and named and len(norm(z["w"])) <= 2 and not z["w"] in ("a", "an", "of", "to", "in"):
                            continue  # what the scan made of the honorific ('Ambiyaa I')
                        if pending and not named and name_hon_of(z["w"]):
                            z["hon"] = name_hon_of(z["w"])  # the unread mark was this name and its honorific
                            named = True
                        # 'a Rasool (Moosa ﵊) came': the mark read after the title belongs to the name in brackets
                        if not As and len(Bs) == 1 and z["pre"].startswith("(") and name_hon_of(z["w"]) and out \
                                and out[-1].get("hon") and norm(out[-1]["w"]) in ("rasool", "nabi", "rasul", "he", "him", "his"):
                            out[-1] = dict(out[-1], hon=None, post=out[-1]["post"].replace(")", ""))
                            z["hon"] = name_hon_of(z["w"])
                        out.append(z)
                # where the gap is, for looking at the print
                ctx = boxes or [x["box"] for x in (aw[max(0, i1 - 1): i1 + 1])]
                dec.append({"op": op, "a": a_txt, "b": b_txt, "pick": pick, "why": why, "boxes": ctx})
        polished = []
        for x in out:
            polished.extend(polish(x, dec, name_hon))
        final[key] = polished
        decisions[key] = dec
    # to segments
    segs = {}
    for key, out in final.items():
        s = []
        depth = 0
        for j, x in enumerate(out):
            kind = 1 if x["pink"] else 0
            x["w"] = uncap(x["w"], sentence_start(out[:j], x))
            depth += x["pre"].count("(")
            # a bracket closing right after an honorific can be swallowed with the mark
            nxt = out[j + 1] if j + 1 < len(out) else None
            if x.get("hon") and depth > 0 and ")" not in x["post"] and kind == 1 and (
                    not nxt or nxt["pre"].startswith("(") or not nxt["pink"]):
                x["post"] = ")" + x["post"]
            depth = max(0, depth - x["post"].count(")"))
            text = x["pre"] + x["w"] + (" " + x["hon"] if x.get("hon") else "") + x["post"]
            if s and s[-1][0] == kind:
                s[-1][1] += " " + text
            else:
                s.append([kind, text])
        segs[key] = [[k, re.sub(r"\s+", " ", t).strip()] for k, t in s]
        # a bracket closed twice after an honorific (the mark's own and the print's)
        total = " ".join(t for _, t in segs[key])
        while total.count(")") > total.count("("):
            fixed = False
            for seg in segs[key]:
                new = re.sub(r"([ﷺ﵊﵁﵂﵃])\)\)", r"\1)", seg[1], count=1)
                if new != seg[1]:
                    seg[1], fixed = new, True
                    break
            if not fixed:
                break
            total = " ".join(t for _, t in segs[key])
    fixes = json.load(open(os.path.join(HERE, "qme_fixes.json"), encoding="utf-8"))
    fix_log = []
    for key in segs:
        segs[key] = tidy(key, segs[key], fixes, fix_log)
    json.dump(fix_log, open(os.path.join(CACHE, "qme_fix_log.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=0)
    unapplied = [f for f in fix_log if f.get("unapplied")]
    if unapplied:
        print("fixes not applied:", unapplied)
    # where each word sits in the print, for checking by eye
    where = {key: [[x["pre"] + x["w"] + x["post"], x.get("hon"), (x.get("box") or {}).get("page"),
                    [(x.get("box") or {}).get(c) for c in "xywh"], x.get("src", "A")] for x in out]
             for key, out in final.items()}
    json.dump(where, open(os.path.join(CACHE, "qme_where.json"), "w", encoding="utf-8"), ensure_ascii=False)
    json.dump(segs, open(os.path.join(CACHE, "qme_final.json"), "w", encoding="utf-8"), ensure_ascii=False)
    json.dump(decisions, open(os.path.join(CACHE, "qme_decisions.json"), "w", encoding="utf-8"), ensure_ascii=False)
    print(dict(stats))


if __name__ == "__main__":
    main()
