"""Turn the OCR of the typeset PDF (.cache/big/*.json, from ocr_big.py) into
verses: every word keeps its colour (black = translation, pink = context),
its page and its box, and the honorific marks the OCR skipped are classified
by their shape:

    saw  ﷺ                       after Rasulullaah, Rasool, Muhammad, Nabi
    as   عليه الصلاة والسلام       after the other Ambiyaa and Jibra'eel
    ra   رضي الله تعالى عنهم/عنه   after the Sahabah

The book numbers Surah Faatiha without the Bismillah and splits the last
ayah in two; those are mapped onto the Hafs numbering the site uses.

Output: .cache/big_verses.json {key: [token, ...]} and .cache/big_intros.json
"""
import glob, json, os, re, collections
import textfix  # word lists

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, ".cache")
chapters = json.load(open(os.path.join(CACHE, "chapters.json"), encoding="utf-8"))
COUNT = {c["id"]: c["verses_count"] for c in chapters}

HEADER_Y = 625      # running heads sit at y≈567, text starts at y≈650
FOOTER_Y = 3740     # page numbers at y≈3785
NUM = re.compile(r"^([0-9IlO]{1,3})\.(.*)$")
TITLE = re.compile(r"^Surah\s+([0-9IlO]{1,3})\b")
BISM = re.compile(r"^In the name of Allaah, the Most Compassionate, the Most Merciful\.?$")
HONORIFIC_BEFORE = {
    "saw": {"rasulullaah", "rasool", "muhammad", "nabi", "rasulullah"},
}


def to_int(s):
    return int(s.replace("I", "1").replace("l", "1").replace("O", "0"))


def glyph_kind(g, prev):
    """ﷺ is squarish, 'alayhis salaatu was salaam' long, 'radhiyallaahu anhum' longer."""
    ar = g["w"] / max(g["h"], 1)
    if ar < 2.15:
        return "saw"
    if ar < 3.05:
        return "as"
    return "ra"


def wordlike(t):
    return bool(re.fullmatch(r"[(\[“‘\"'.…]*[A-Za-z][A-Za-z'’\-]*[)\].,;:!?”’\"'…]*", t))


def is_residue(line):
    """What the OCR made of an Arabic line: a few symbols and fragments."""
    toks = [w["t"] for w in line if not w.get("g")]
    if toks and NUM.match(toks[0]):
        toks = toks[1:]  # a verse number
    toks = [t for t in toks if re.search(r"[A-Za-z0-9]", t)]  # quotes and marks alone say nothing
    if not toks:
        # only marks: Arabic; only quotes or stops: the end of a sentence, keep it
        return any(w.get("g") for w in line)
    # references keep their numbers ('[verses 21 and 22]', 'Surah 38)')
    refs = any(re.sub(r"[^a-z]", "", t.lower()) in ("verse", "verses", "surah") for t in toks)
    good = sum((wordlike(t) and (len(re.sub(r"[^A-Za-z]", "", t)) > 1 or t in ("a", "A", "I", "O")))
               or (refs and re.fullmatch(r"[\[(]?\d{1,3}[\]).,?]*", t) is not None) for t in toks)
    return good < max(1, 0.6 * len(toks))


def rows_of(d):
    """The OCR returns a printed line in pieces when it has a wide gap (after a
    verse number, or between black and pink type): regroup the words into rows
    by height on the page, left to right. Marks found while a piece was seen
    alone may sit on the other piece's words: those are dropped."""
    words = [w for ln in d["lines"] for w in ln]
    real = [w for w in words if not w.get("g")]
    marks = [w for w in words if w.get("g")]
    rows = []
    # quotes and stops alone sit high or low on their line: they join the line they overlap, later
    punct = [w for w in real if not re.search(r"[A-Za-z0-9]", w["t"])]
    real = [w for w in real if re.search(r"[A-Za-z0-9]", w["t"])]
    # each OCR line keeps its own centre; pieces of one printed line (a verse number, black
    # then pink type) share a centre within a third of a line — the next line is a whole line away
    for w in sorted(real, key=lambda w: w["y"] + w["h"] / 2):
        c = w["y"] + w["h"] / 2
        best = None
        for r in rows:
            d = abs(r["c"] - c)
            if d < 0.36 * max(r["h"], w["h"]) and (best is None or d < best[0]):
                best = (d, r)
        if best:
            r = best[1]
            r["w"].append(w)
            cs = sorted(x["y"] + x["h"] / 2 for x in r["w"])
            r["c"] = cs[len(cs) // 2]
            r["h"] = sorted(x["h"] for x in r["w"])[len(r["w"]) // 2]
        else:
            rows.append({"c": c, "h": w["h"], "w": [w]})
    for p in punct:
        def overlap(r):
            y0 = min(x["y"] for x in r["w"]); y1 = max(x["y"] + x["h"] for x in r["w"])
            return min(y1, p["y"] + p["h"]) - max(y0, p["y"])
        best = max(rows, key=overlap, default=None)
        if best and overlap(best) > 0:
            best["w"].append(p)
        else:
            rows.append({"c": p["y"] + p["h"] / 2, "h": p["h"], "w": [p]})
    for g in marks:
        c = g["y"] + g["h"] / 2
        best = min(rows, key=lambda r: abs(r["c"] - c), default=None)
        if not best or abs(best["c"] - c) > 0.6 * max(best["h"], g["h"]):
            continue
        overlap = any(min(g["x"] + g["w"], w["x"] + w["w"]) - max(g["x"], w["x"]) > 0.25 * min(g["w"], w["w"]) for w in best["w"])
        if not overlap and not any(o.get("g") and abs(o["x"] - g["x"]) < 10 for o in best["w"]):
            best["w"].append(g)
    out = []
    for r in sorted(rows, key=lambda r: r["c"]):
        out.append(sorted(r["w"], key=lambda w: w["x"]))
    return out


def join_number(line):
    """'2 IO. Are they' -> '2IO. Are they': a verse number read in two pieces."""
    if len(line) > 1 and re.fullmatch(r"[0-9IlO]{1,2}", line[0]["t"]) and re.fullmatch(r"[0-9IlO]{1,2}\.\S*", line[1]["t"]) \
            and line[1]["x"] - (line[0]["x"] + line[0]["w"]) < line[0]["h"]:
        w = dict(line[1], t=line[0]["t"] + line[1]["t"], x=line[0]["x"], w=line[1]["x"] + line[1]["w"] - line[0]["x"])
        return [w] + line[2:]
    return line


_Q91 = None


def starts_like_9_1(line):
    """Surah 9 has no Bismillah: its verse 1 is recognised by its opening words."""
    global _Q91
    # the book's own opening of 9:1 (the scan copy took the introduction's numbered list for verses 1-3)
    _Q91 = "(The declaration is hereby made that)".lower()
    t = " ".join(w["t"] for w in line[1:] if not w.get("g"))[:25].lower()
    a = re.sub(r"[^a-z]", "", _Q91)[:12]
    b = re.sub(r"[^a-z]", "", t)[:12]
    return line[0]["t"] in ("1.", "l.", "I.") and a and a == b


def arabic_residue(line):
    """A line of Arabic the OCR half-read: a couple of fragments beside unread marks
    (a real line with a mark has the mark after a name, like 'Rasulullaah ﷺ')."""
    real = [w for w in line if not w.get("g")]
    marks = [i for i, w in enumerate(line) if w.get("g")]
    if not marks or len(real) > 3:
        return False
    # the last words of a verse sharing a row with a mark of the Arabic line below ('always be
    # disputing.', 'Powerful)'): English words, not fragments
    words = [re.sub(r"[^A-Za-z']", "", w["t"]) for w in real]
    english = [x for x in words if len(x) >= 3 and (x.lower() in textfix.DICT or x.lower() in textfix.REFV)]
    if not re.search(r"Quraan|Made Easy|Complete|REVISED", " ".join(w["t"] for w in real)) and (
            len(english) >= 2 or any(len(x) >= 4 and re.search(r"[).?!]$|^\(", w["t"]) for x, w in zip(words, real) if x in english)):
        return False
    after_name = any(i > 0 and not line[i - 1].get("g") and re.sub(r"[^a-z']", "", line[i - 1]["t"].lower()) in NAMES for i in marks)
    return not after_name


NAMES = {"rasulullaah", "rasool", "muhammad", "nabi", "moosa", "ibraheem", "ambiyaa", "nooh", "isa", "sulaymaan", "loot",
         "aadam", "sahabah", "dawood", "ya'qoob", "yusuf", "haaroon", "saalih", "jibra'eel", "shu'ayb", "is'haaq",
         "zakariyya", "ismaa'eel", "hood", "imraan", "yahya", "idrees", "ilyaas", "yunus", "ayyub", "ayyoob", "luqmaan",
         "khidr", "maryam", "dhul", "uzayr", "ali", "abu", "umar", "uthmaan", "yusha", "zaid"}


def main():
    verses = collections.OrderedDict()
    intros = collections.defaultdict(list)
    surah, cur = 0, 0          # cur = 0: the introduction (or before verse 1)
    ready = False              # the English Bismillah has been read
    faatiha = {}               # the book's numbering of surah 1
    files = sorted(glob.glob(os.path.join(CACHE, "big", "*.json")))
    for f in files:
        d = json.load(open(f, encoding="utf-8"))
        page = d["page"]
        for line in rows_of(d):
            if not line:
                continue
            y = min(w["y"] for w in line)
            head = " ".join(w["t"] for w in line)
            # running heads and page numbers, known by their words (a text line can sit close to either)
            if y < 540 or (y < HEADER_Y and re.search(r"Quraan Made Easy|^Surah|\(Complete\)", head)) or                     (y > FOOTER_Y and (re.fullmatch(r"[\d\s.]+", head) or y > 3900)):
                continue
            if arabic_residue(line):
                continue
            text = " ".join(w["t"] for w in line if not w.get("g"))
            big = sum(w["h"] for w in line) / len(line) > 60
            m = TITLE.match(text)
            if m and big and all(w["pink"] > 0.5 for w in line if not w.get("g")):
                n = to_int(m.group(1))
                if n == surah + 1:
                    surah, cur, ready = n, 0, False
                continue
            if surah == 0:
                continue
            line = join_number(line)
            if is_residue(line):
                continue
            letters = re.sub(r"[^a-z]", "", text.lower())
            if re.match(r"[il1]nthenameofal+a+h", letters) and ("compassion" in letters or "merciful" in letters) and len(letters) < 70:
                ready = True   # verse 1 follows the English Bismillah
                if surah == 1 and cur == 0:
                    cur = -1   # the Bismillah of Faatiha is Hafs 1:1
                    verses["1:1"] = [dict(w, page=page) for w in line]
                continue
            first = line[0]["t"]
            mm = NUM.match(first)
            if not mm and re.fullmatch(r"\d{1,3}", first) and len(line) > 1 and int(first) == max(cur, 0) + 1 and cur > 0:
                mm = NUM.match(first + ".")  # the full stop went unread
            if mm and cur == 0 and not ready and not (surah == 9 and starts_like_9_1(line)):
                mm = None  # a numbered list in the introduction, not verse 1
            if mm and cur >= 0 or (mm and surah == 1):
                try:
                    n = to_int(mm.group(1))
                except ValueError:
                    n = -1
                expect = (max(cur, 0) + 1) if surah != 1 else None
                ok = (expect <= n <= expect + 6 and n <= COUNT[surah]) if surah != 1 else (1 <= n <= 7 and n == faatiha.get("last", 0) + 1)
                if ok:
                    if surah == 1:
                        faatiha["last"] = n
                        key = "1:%d" % min(n + 1, 7)   # book 1..5 -> Hafs 2..6; book 6 and 7 -> Hafs 7
                    else:
                        cur = n
                        key = f"{surah}:{n}"
                    rest = mm.group(2)
                    toks = [dict(w, page=page) for w in line[1:]]
                    if rest:
                        w0 = dict(line[0], page=page, t=rest)
                        toks = [w0] + toks
                    verses.setdefault(key, []).extend(toks)
                    continue
            if surah == 1:
                if faatiha.get("last"):
                    key = "1:%d" % min(faatiha["last"] + 1, 7)
                    verses[key].extend(dict(w, page=page) for w in line)
                else:
                    intros[1].append([dict(w, page=page) for w in line])
                continue
            if cur <= 0:
                intros[surah].append([dict(w, page=page) for w in line])
            else:
                verses[f"{surah}:{cur}"].extend(dict(w, page=page) for w in line)
    # classify the marks
    for key, toks in verses.items():
        for i, w in enumerate(toks):
            if w.get("g"):
                w["kind"] = glyph_kind(w, toks[i - 1]["t"] if i else "")
    json.dump(verses, open(os.path.join(CACHE, "big_verses.json"), "w", encoding="utf-8"), ensure_ascii=False)
    json.dump(intros, open(os.path.join(CACHE, "big_intros.json"), "w", encoding="utf-8"), ensure_ascii=False)
    # report: every surah should end on its last verse
    last = collections.defaultdict(int)
    for k in verses:
        s, v = map(int, k.split(":"))
        last[s] = max(last[s], v)
    short = {s: (last[s], COUNT[s]) for s in COUNT if last[s] != COUNT[s]}
    missing = [f"{s}:{v}" for s in COUNT for v in range(1, COUNT[s] + 1) if f"{s}:{v}" not in verses]
    print("verses:", len(verses), "of", sum(COUNT.values()), "| missing:", len(missing), missing[:40])
    print("surahs not ending on their last verse:", short)


if __name__ == "__main__":
    main()
