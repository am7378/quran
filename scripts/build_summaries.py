"""Turn the surah introductions captured from the Quraan Made Easy scan
(the 'link with the previous surah' and 'summary' pages) into structured
sections for the back of the reading frame -> public/data/summaries.json"""
import json, os, re
import textfix

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, ".cache")
OUT = os.path.join(HERE, "..", "public", "data", "summaries.json")

raw = json.load(open(os.path.join(CACHE, "intros_raw.json"), encoding="utf-8"))
qme = json.load(open(os.path.join(CACHE, "qme_raw.json"), encoding="utf-8"))


def from_print():
    """The introductions as read from the clean print (parse_big.py), in the scan's line format
    (page, x, y, size, text) and its units (points): numbers kept, and a name's honorific mark set
    where the calligraphy stands ('Rasulullaah ﷺ')."""
    import glyphs
    marks = {"saw": "ﷺ", "as": "﵊", "ra": "﵁"}
    out = {}
    for k, lines in json.load(open(os.path.join(CACHE, "big_intros.json"), encoding="utf-8")).items():
        rows = []
        for line in lines:
            words = []
            for i, w in enumerate(line):
                if w.get("g"):
                    prior = glyphs.name_prior(words[-1]) if words else None
                    if prior:
                        mark = marks[prior]
                        if prior == "ra" and "sahab" in words[-1].lower():
                            mark = "﵃"
                        words.append(mark)
                    continue
                words.append(w["t"])
            text = " ".join(words).strip()
            if not text:
                continue
            f = 72 / 400
            rows.append([line[0]["page"], line[0]["x"] * f, line[0]["y"] * f, max(w["h"] for w in line) * f, text])
        out[k] = rows
    return out


FROM_PRINT = os.path.exists(os.path.join(CACHE, "big_intros.json"))
if FROM_PRINT:
    raw_scan = raw
    raw = from_print()
textfix.prime([s for v in qme.values() for _, s in v] + [l[4] for lines in raw.values() for l in lines])
textfix.add_corpus(s for v in qme.values() for _, s in v)
textfix.add_corpus(l[4] for lines in raw.values() for l in lines)

KEYWORDS = ("LINK", "SUMMARY", "ESSENCE", "TOPIC", "CONTENT", "THEME", "BACKGROUND", "INTRODUCTION", "VIRTUE", "MERIT", "LESSON", "NAME")
KIND = [("LINK", "Connection"), ("ESSENCE", "Essence"), ("TOPIC", "Topics"), ("SUMMARY", "Summary"), ("THEME", "Theme"), ("VIRTUE", "Virtues"), ("MERIT", "Virtues")]
CAPS_WORDS = {"allaah", "qur'aan", "quraan", "towheed", "tauheed", "rasulullaah", "risaalah", "jihaad", "madinah", "makkah",
              "islaam", "imaan", "kuffaar", "mushrikeen", "munaafiqeen", "jannah", "jahannam", "qiyaamah", "aakhirah",
              "bani", "israa'eel", "ahlul", "kitaab", "shari'ah", "kalimah", "nabi", "ambiyaa", "mu'mineen", "hajj", "sabr"}
FIXES = [(r"AUaah", "Allaah"), (r"\bTouiheed\b", "Towheed"), (r"\bTowheed\b", "Towheed"), (r"\bRasulultaah\b", "Rasulullaah"),
         (r"\bbehef\b", "belief"), (r"\bmultipUed\b", "multiplied"), (r"\boringinally\b", "originally"),
         (r"\bM ?UNAAFIQ ?OO ?N\b", "MUNAAFIQOON"), (r"\ba dear,", "a clear,"), (r"\bdear\b(?= (?:proof|declaration|message|signs?|evidence))", "clear")]


def is_heading(text):
    letters = [c for c in text if c.isalpha()]
    if len(letters) < 5:
        return False
    upper = sum(c.isupper() for c in letters) / len(letters)
    return upper >= 0.8


def heading_case(text):
    words = re.sub(r"\s+", " ", text).strip().split(" ")
    out = []
    naming = False  # inside a surah's name: 'Surah Aal Imraan', 'Surahs Furqaan and Shu'araa'
    for i, w in enumerate(words):
        lw = w.lower()
        if i and lw in ("and", "the", "of", "in", "with", "that", "which", "precede", "preceding", "previous", "other"):
            naming = naming and lw == "and" and i + 1 < len(words) and words[i - 1].lower() != "surah"
            out.append(lw)
            continue
        if i == 0 or naming or lw in ("surah", "surahs") or lw.strip(".,:;") in CAPS_WORDS:
            out.append(lw[:1].upper() + lw[1:])
        else:
            out.append(lw)
        naming = lw in ("surah", "surahs") or (naming and lw not in ("surah", "surahs"))
    return " ".join(out)


_JOINS = None


def scan_joins():
    """Two or three words of the scan copy, run together: where the print's OCR glued them."""
    global _JOINS
    if _JOINS is None:
        import merge_qme as M
        _JOINS = {}
        for lines in raw_scan.values():
            words = [w for l in lines for w in re.findall(r"[A-Za-z][A-Za-z'’]*", l[4])]
            for i in range(len(words)):
                for n in (2, 3):
                    ws = words[i:i + n]
                    if len(ws) == n and all(M.known(w) for w in ws):
                        _JOINS.setdefault(M.norm("".join(ws)), ws)
    return _JOINS


def clean_print(text):
    """Text read from the clean print: its slips repaired the way the translation's are (merge_qme.polish:
    words run together, an honorific read as letters, l for I), and nothing else touched — numbers
    and short words stay (the scan's repair dropped them)."""
    import merge_qme as M
    if not M.ACORPUS:
        M.load_corpus()
    t = text
    for a, b in FIXES:
        t = re.sub(a, b, t)
    t = re.sub(r"(\w)-\s+([a-z])", r"\1\2", t)  # line-break hyphens
    t = re.sub(r"[^\x20-\x7E‘’“”–—…ﷺ﵊﵁﵂﵃]", "", t)
    out = []
    for tok in t.split():
        if tok in "ﷺ﵊﵁﵂﵃":
            if out:
                out[-1]["hon"] = tok
            continue
        pre, core, post = M.split_token(tok)
        if not core:
            if out:
                out[-1]["post"] += pre + post
            continue
        # an honorific read as capitals after a name ('Rasulullaah EE)')
        if out and re.fullmatch(r"[A-Z]{1,3}", core) and core not in ("I", "A", "O") and not out[-1].get("hon") \
                and M.name_hon_of(out[-1]["w"]):
            out[-1]["hon"] = M.name_hon_of(out[-1]["w"])
            out[-1]["post"] += post
            continue
        # words run together, parted where the scan copy parts them ('Kahafbegins' / 'Kahaf begins')
        n = M.norm(core)
        if not M.known(core) and n in scan_joins():
            parts = scan_joins()[n]
            for j, p in enumerate(parts):
                out.append({"w": p, "pre": pre if j == 0 else "", "post": post if j == len(parts) - 1 else "",
                            "src": "B", "pink": False, "hon": None, "box": None})
            continue
        x = {"w": core, "pre": pre, "post": post, "src": "A", "pink": False, "hon": None, "box": None}
        out.extend(M.polish(x, [], M.name_hon))
    words = [x["pre"] + x["w"] + (" " + x["hon"] if x.get("hon") else "") + x["post"] for x in out]
    return re.sub(r"\s{2,}", " ", " ".join(words)).strip()


def clean(text):
    if FROM_PRINT:
        return clean_print(text)
    t = text
    for a, b in FIXES:
        t = re.sub(a, b, t)
    t = re.sub(r"(\w)-\s+([a-z])", r"\1\2", t)  # line-break hyphens
    t = re.sub(r"[^\x20-\x7E‘’“”–—…ﷺ﵊﵁﵂﵃]", "", t)  # OCR debris from calligraphy (the marks stay)
    t = re.sub(r"\s{2,}", " ", t)
    return textfix.fix(t).strip()


def build(lines):
    sections = []
    cur = None
    block = None
    last = None  # (page, y) of the previous line
    title_skipped = False

    def new_section(title):
        nonlocal cur, block
        for a, b in FIXES:
            title = re.sub(a, b, title)
        up = title.upper()
        kind = "Overview" if ("LINK" in up and "SUMMARY" in up) else next((k for key, k in KIND if key in up), "Notes")
        cur = {"kind": kind, "title": heading_case(title), "blocks": []}
        sections.append(cur)
        block = None

    for (pn, x, y, size, text) in lines:
        text = text.strip()
        if not text or re.fullmatch(r"[\W\d_]+", text):
            continue
        gap = (y - last[1]) if last and last[0] == pn else 99
        if not sections and size >= 10:
            last = (pn, y)
            continue  # the surah's title, set large above its introduction
        if is_heading(text):
            joined_heading = cur and not cur["blocks"] and gap < 18 and last is not None
            if any(k in text.upper() for k in KEYWORDS) or joined_heading or title_skipped or sections:
                if joined_heading and cur:
                    cur["title"] = heading_case(cur["title"] + " " + text)
                else:
                    new_section(text)
                last = (pn, y)
                continue
            title_skipped = True  # the surah's English name printed under its title
            last = (pn, y)
            continue
        if cur is None:
            new_section("A SUMMARY OF THE SURAH")
        bullet = re.match(r"^[•*·●▪■◦-]\s*(.+)$", text)
        number = re.match(r"^(\d{1,2})[.)]\s*(.+)$", text)
        if bullet or number:
            kind = "ul" if bullet else "ol"
            item = (bullet or number).group(1 if bullet else 2)
            if not block or block["type"] != kind:
                block = {"type": kind, "items": []}
                cur["blocks"].append(block)
            block["items"].append(item)
        elif x >= 155 and len(text.split()) <= 6 and not re.search(r"[.!?]$", text):
            # short centred lines under a heading (a grid of topics) become list items
            if not block or block["type"] != "ul":
                block = {"type": "ul", "items": []}
                cur["blocks"].append(block)
            block["items"].append(text)
        elif block and block["type"] in ("ul", "ol") and gap < 15 and x >= 140:
            block["items"][-1] += " " + text  # continuation of a list item
        elif block and block["type"] == "p" and (gap < 15 or (gap == 99 and not re.search(r"[.!?”]$", block["text"]))):
            block["text"] += " " + text
        else:
            block = {"type": "p", "text": text}
            cur["blocks"].append(block)
        last = (pn, y)

    # clean and drop empties
    for s in sections:
        for b in s["blocks"]:
            if b["type"] == "p":
                b["text"] = clean(b["text"])
            else:
                b["items"] = [clean(i) for i in b["items"] if clean(i)]
        s["blocks"] = [b for b in s["blocks"] if (b.get("text") or b.get("items"))]
    return [s for s in sections if s["blocks"]]


out = {}
for k, lines in raw.items():
    secs = build(lines)
    if secs:
        out[k] = secs
# slips left after the repairs, each checked against the print (surah, as read, as printed)
SUMMARY_FIXES = [
    ("*", "A'Ia", "A'la"), ("*", "Has har", "Hashar"), ("*", "Qa Iam", "Qalam"), ("*", "DUH A", "Duha"),
    ("*", "Ba Iad", "Balad"), ("*", "Surah Nism", "Surah Nisaa"), ("*", "Awnmawofihewrah", "A summary of the Surah"), ("1", "Ali JC@9", "Ali ﵁"), ("1", "Ali JC", "Ali ﵁"), ("34", "Sulaymaan Oi*E", "Sulaymaan ﵊"),
    ("34", "Sulaymaan Oi", "Sulaymaan ﵊"), ("10", "Yunus gjYE", "Yunus ﵊"), ("1", "lyyaka", "Iyyaka"),
    ("1", "Iyyaka nas Ta'een", "Iyyaka Nasta'een"), ("2", "eThey", "They"), ("3", "UWhile", "While"),
    ("17", "Qu/aan", "Qur'aan"), ("34", "proped", "propped"), ("40", "Du' a", "Du'a"), ("103", " oyaJb", ""),
    ("113", "rpagic", "magic"), ("55", "Ar rahmaan", "Ar Rahmaan"), ("24", "propogating", "propagating"),
    ("27", "narratiions", "narrations"), ("38", "refering", "referring"), ("33", "bintJahash", "bint Jahash"),
    # the source ends this passage mid-word in every copy
    ("1", "the Only One Who is respo", "the Only One Who is …"),
]
fixed = 0
for k, a, b in SUMMARY_FIXES:
    for s in [x for kk in (out if k == "*" else [k]) for x in out.get(kk, [])]:
        for blk in s["blocks"]:
            if blk["type"] == "p" and a in blk["text"]:
                blk["text"] = blk["text"].replace(a, b)
                fixed += 1
            elif blk["type"] != "p":
                blk["items"] = [i.replace(a, b) for i in blk["items"]]
        s["title"] = s["title"].replace(a, b)

# what the print's reading lost (names' marks, words swallowed by them), put back where the scan
# copy shows it at that very place; every change is logged for checking against the print
if FROM_PRINT:
    import summary_restore
    restored = summary_restore.restore(out, raw_scan)
    restored += summary_restore.letters_for_marks(out)
    json.dump(restored, open(os.path.join(CACHE, "summary_restored.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("restored from the scan copy:", len(restored))

# read off the print itself (summary_crops.py), where neither reading has it right
PRINT_FIXES = [
    ("1", "'\"Al Hamdu", "\"Al Hamdu"),  # the bullet before it
    ("1", "An'amta a lay him", "An'amta alayhim"), ("1", "Vo I.l Pg.3", "Vol.1 Pg.3"),
    ("6", "An 'aam", "An'aam"), ("7", "A'raafdiscusses", "A'raaf discusses"), ("17", "hear and leam", "hear and learn"),
    # words the print's reader lost (a name swallowed by its mark, a line's first words)
    ("7", "the incident of while only", "the incident of Ibraheem ﵊ while only"),
    ("7", "\"We sent (as a messenger and)", "\"We sent Loot ﵊ (as a messenger and)"),
    ("14", "all prayers.\" [verses", "all prayers.\" [verses 35 to 39]"), ("19", "and that openly declared", "and that Isa ﵊ openly declared"),
    ("38", "expressed in verses 65", "expressed in verses 65 to 68."), ("42", "fabricated a lie against", "fabricated a lie against Allaah?...\""),
    # words the print reads right that the clean-up (merge_qme.polish) took apart
    ("1", "Li Ilaah", "Lillaah"), ("18", "Li Ilaah", "Lillaah"),
    ("2", "Laa ilaah a Illallaah Muhammad ﷺ Rasulullaah", "Laa ilaaha Illallaah Muhammadur Rasulullaah"),
    ("49", "Laa ilaah a Illallah", "Laa ilaaha Illallah"), ("24", "Surah No or", "Surah Noor"), ("25", "Surah No or", "Surah Noor"),
    ("23", "plough ing fields", "ploughing fields"), ("29", "hard hips", "hardships"),  # the book misprints it 'hardhips'
    # the headings' apostrophes, which the print's reader dropped
    ("26", "Surah Shuaraa", "Surah Shu'araa"), ("63", "Surah Jumuah", "Surah Jumu'ah"), ("79", "Surah Naaziaat", "Surah Naazi'aat"),
    ("18", "Kahafbegins", "Kahaf begins"), ("42", "who frust", "who trust"),
    ("58", "Aws bin When", "Aws bin Saamit ﵁. When"), ("93", "Surah Al Ia.", "Surah A'la."),
]
for k, a, b in PRINT_FIXES:
    hits = 0
    for s in out.get(k, []):
        hits += a in s["title"]
        s["title"] = s["title"].replace(a, b)
        for blk in s["blocks"]:
            if blk["type"] == "p":
                hits += a in blk["text"]
                blk["text"] = blk["text"].replace(a, b)
            else:
                hits += sum(a in i for i in blk["items"])
                blk["items"] = [i.replace(a, b) for i in blk["items"]]
    if not hits:
        print("  print fix not found:", k, a)
ELLIPSIS = [(r"\be g\.", "e.g."), (r"\.\. \.(?=\S)", "..."), (r"(?<=\s)\.(?=[a-z])", "..."), (r"(?<=words)\" (?=[A-Z])", " \"")]
STRAY = re.compile(r"^(?:[A-Za-z]{1,2}|oyaJb)$")  # a bullet or the first ayah's calligraphy read as letters
for k, secs in out.items():
    for s in secs:
        for blk in s["blocks"]:
            if blk["type"] == "p":
                for a, b in ELLIPSIS:
                    blk["text"] = re.sub(a, b, blk["text"])
                # bullets read as 'e' at the start of each point ('e Observe what … e Abolish …')
                blk["text"] = re.sub(r"(^|(?<=[.:] ))e (?=[A-Z])", "", blk["text"])
                # a possessive set apart from its name ('Rasulullaah ﷺ 's', 'Allaah 's')
                blk["text"] = re.sub(r"(?<=[A-Za-zﷺ﵊﵁﵂﵃]) ['’]s\b", "'s", blk["text"])
            else:
                blk["items"] = [re.sub(r"^e (?=[A-Z])", "", i) for i in blk["items"] if not STRAY.match(i.strip())]
                for a, b in ELLIPSIS:
                    blk["items"] = [re.sub(a, b, i) for i in blk["items"]]
                blk["items"] = [re.sub(r"(?<=[A-Za-zﷺ﵊﵁﵂﵃]) ['’]s\b", "'s", i) for i in blk["items"]]
        # the last words of a quotation that wrapped onto a short centred line ('…they are not becoming /
        # Mu'mineen."') read as a one-point list: they finish the paragraph before them
        joined = []
        for blk in s["blocks"]:
            prev = joined[-1] if joined else None
            if blk["type"] in ("ul", "ol") and len(blk["items"]) == 1 and prev and prev["type"] == "p" \
                    and not re.search(r"[.!?:”\"]\)?$", prev["text"]) and re.search(r"[.!?]\W*$", blk["items"][0]):
                prev["text"] += " " + blk["items"][0]
                continue
            joined.append(blk)
        s["blocks"] = [b for b in joined if b.get("text") or b.get("items")]
    # the surah's English name set under its title (too short to be read as one: 'TIME')
    out[k] = [s for s in secs if s["blocks"] and not (s["title"] == "A summary of the Surah" and len(s["blocks"]) == 1
              and s["blocks"][0]["type"] == "ul" and len(s["blocks"][0]["items"]) == 1 and re.fullmatch(r"[A-Z ]{2,12}", s["blocks"][0]["items"][0]))]

missing = [n for n in range(1, 115) if str(n) not in out]
print("summaries:", len(out), "missing:", missing, "| fixes applied in paragraphs:", fixed)
json.dump(out, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
for k in ["2", "36", "61", "64", "112"]:
    if k in out:
        print("==", k, json.dumps(out[k], ensure_ascii=False)[:900])
