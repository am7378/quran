"""Merge the extracted translations, word-by-word data and theme headings
into the static JSON the site loads (public/data)."""
import json, os, re, collections

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, ".cache")
OUT = os.path.join(HERE, "..", "public", "data")
os.makedirs(os.path.join(OUT, "s"), exist_ok=True)


def load(name):
    return json.load(open(os.path.join(CACHE, name), encoding="utf-8"))


import textfix

chapters = load("chapters.json")
qme = load("qme_raw.json")
# the Quraan Made Easy text as merged and checked against the print (scripts/merge_qme.py);
# the older scan text stays only for the word lists below
qme_final = load("qme_final.json") if os.path.exists(os.path.join(CACHE, "qme_final.json")) else None
# 32:13 (from 'I will s...') to 32:18: the book's page has lost its black text in every copy
QME_GAP = {"32:13", "32:14", "32:15", "32:16", "32:17", "32:18"}
indopak = load("indopak_words.json") if os.path.exists(os.path.join(CACHE, "indopak_words.json")) else {}
saheeh = load("saheeh_pdf.json")
clear = load("clear.json")
# The Clear Quran's section headings, without its footnote numbers ('Law of Retaliation[55]')
themes = {k: re.sub(r"\s*\[\d+\]", "", v).strip() for k, v in load("themes.json").items()}
# The Clear Quran's own translations of the surah names (its table of contents)
clear_names = load("clear_names.json") if os.path.exists(os.path.join(CACHE, "clear_names.json")) else {}

# ── text repair ────────────────────────────────────────────────────────────
textfix.prime([s for v in qme.values() for _, s in v] + list(saheeh.values()) + list(clear.values()))
textfix.add_corpus(s for v in qme.values() for _, s in v)
textfix.add_corpus(saheeh.values())
textfix.add_corpus(clear.values())

ORDER = [f"{c['id']}:{v}" for c in chapters for v in range(1, c["verses_count"] + 1)]
REF = {k: re.sub(r"<sup[^>]*>.*?</sup>|<[^>]+>", "", t["text"]).strip() for k, t in zip(ORDER, load("tr_20.json"))}


def godify(s):
    return s.replace("Allāh", "God").replace("Allah", "God")


def letters(s):
    return re.sub(r"[^a-z]", "", s.lower())


repaired = collections.Counter()
import difflib, unicodedata


def plain(s):
    """The reference without its transliteration marks ('Ḥunayn' -> 'Hunayn'), as the PDF edition prints."""
    return "".join(ch for ch in unicodedata.normalize("NFKD", s) if not unicodedata.combining(ch))


def typos_from_reference(pdf, ref):
    """The PDF edition's own wording kept ('honour', 'Acquainted'); only its slips mended from the
    reference: a word no dictionary has that the reference spells nearly the same ('martydom' ->
    'martyrdom', 'relegion' -> 'religion'), and words run together ('isHe' -> 'is He')."""
    a, b = pdf.split(" "), ref.split(" ")
    out = []
    for op, i1, i2, j1, j2 in difflib.SequenceMatcher(None, a, b, autojunk=False).get_opcodes():
        if op == "equal":
            out += a[i1:i2]
            continue
        A, B = a[i1:i2], b[j1:j2]
        if A and B and letters("".join(A)) == letters("".join(B)) and len(B) > len(A):
            out += B  # the same letters, spaced as the reference spaces them
            continue
        if len(A) == 1 and len(B) == 1:
            wa, wb = re.sub(r"[^A-Za-z]", "", A[0]).lower(), re.sub(r"[^A-Za-z]", "", B[0]).lower()
            if wa and wa not in textfix.DICT and wb in textfix.DICT and difflib.SequenceMatcher(None, wa, wb).ratio() >= 0.8:
                out.append(re.sub(re.escape(re.sub(r"[^A-Za-z]", "", A[0])), re.sub(r"[^A-Za-z]", "", B[0]), A[0]))
                continue
        out += A
    return " ".join(out)


for k in list(saheeh):
    # the PDF edition is the same translation; the reference (quran.com's digital Saheeh) gives the clean
    # spacing and hyphenation, and corrects the PDF's typing slips ('martydom', 'relegion') — the words are
    # never guessed ('fitrah' must not become 'fitnah')
    ref = godify(REF.get(k, ""))
    if ref and letters(saheeh[k]) == letters(ref):
        if saheeh[k] != ref:
            repaired["saheeh-spacing"] += 1
        saheeh[k] = ref
    elif ref:
        fixed = typos_from_reference(saheeh[k], plain(ref))
        repaired["saheeh-typos" if fixed != saheeh[k] else "saheeh-kept"] += 1
        saheeh[k] = fixed


def safe_spacing(t):
    """Only spacing the PDF extraction lost: a space after a stop before the next sentence, and a
    function word run onto the word before it ('caveand', 'onefor'). No word is changed."""
    t = re.sub(r"([a-z][.,;:!?])([A-Z])", r"\1 \2", t)
    def split(m):
        w = m.group(0)
        if w.lower() in textfix.DICT or len(w) < 5:
            return w
        for f in ("and", "for", "the", "of", "to", "in", "with", "from"):
            if w.lower().endswith(f) and w[:-len(f)].lower() in textfix.DICT and len(w) - len(f) >= 3:
                return w[:-len(f)] + " " + w[-len(f):]
        return w
    return re.sub(r"[A-Za-z]{5,}", split, t)


for k in list(clear):
    fixed = safe_spacing(clear[k])
    if fixed != clear[k]:
        repaired["clear-spacing"] += 1
    clear[k] = fixed
for k, segs in (qme.items() if qme_final is None else []):
    out = []
    for kind, text in segs:
        fixed = textfix.fix(text)
        if fixed != text:
            repaired["qme"] += 1
        words = re.findall(r"[A-Za-z']+", fixed)
        if kind == 1 and len(words) >= 3 and textfix.junk_ratio(fixed) > 0.5:
            repaired["qme-junk-dropped"] += 1
            continue  # context that is only OCR debris
        if fixed:
            out.append([kind, fixed])
    qme[k] = out or segs
print("text repairs:", dict(repaired))

# ── tone: warning (-) / glad tidings (+) / statement (0) ───────────────────
WARN = {
    r"\bhell\b": 3, r"\bhellfire\b": 3, r"\bthe fire\b": 3, r"\bblaze\b": 2, r"\bpunish\w*": 2.5,
    r"\btorment\w*": 2.5, r"\bwoe\b": 3, r"\bwrath\b": 2, r"\bcurse[ds]?\b": 2, r"\bdestr\w+": 1.5,
    r"\bdoom\w*": 2, r"\bpainful\b": 2, r"\bhumiliating\b": 2, r"\bsevere in penalty\b": 2,
    r"\bretribution\b": 2, r"\bperish\w*": 1.5, r"\bboiling\b": 2, r"\bscald\w*": 2,
    r"\bchains?\b": 1.5, r"\bshackles\b": 1.5, r"\bzaqq\w+": 2, r"\bloser[s]?\b": 1.5,
    r"\bwretched\b": 2, r"\bmiserable\b": 2, r"\bevil is\b": 1.5, r"\bbeware\b": 1.5,
    r"\bwarn\w*": 1, r"\bseized\b": 1.5, r"\bdrowned\b": 1.5, r"\bblast\b": 1.5,
    r"\bshriek\b": 1.5, r"\bdisgrace\w*": 1.5, r"\bvengeance\b": 2, r"\bsinners?\b": 1,
    r"\bwrongdoers\b": 1, r"\bdefiantly\b": 1, r"\bdeny\b": 0.6, r"\bdisbeliev\w*": 0.7,
    r"\bhypocrit\w*": 1, r"\bgrievous\b": 2, r"\bterrible\b": 1.5, r"\bsmoke\b": 0.7,
}
GLAD = {
    r"\bparadise\b": 3, r"\bgardens?\b": 2, r"\brivers? flow\w*": 2.5, r"\breward\w*": 1.8,
    r"\bforgiv\w*": 1.3, r"\bgood tidings\b": 3, r"\bglad tidings\b": 3, r"\bgood news\b": 2.5,
    r"\bsucce\w+": 1.8, r"\bpleased\b": 1.5, r"\bpleasure\b": 1.5, r"\bbliss\w*": 2.5,
    r"\bdelight\w*": 2, r"\bno fear\b": 2.5, r"\bnor will they grieve\b": 2.5, r"\bhonou?r\w*": 1,
    r"\bbless\w*": 1, r"\bbount\w*": 1.2, r"\bfavou?r\w*": 1, r"\brighteous\w*": 0.8,
    r"\bgreat attainment\b": 3, r"\bspouses\b": 1, r"\bfruits?\b": 1, r"\bsilk\b": 1.5,
    r"\bcouches\b": 2, r"\bthrones\b": 1, r"\beternal\w*": 0.5, r"\bmercy\b": 1.2,
    r"\bpeace\b": 1, r"\blight\b": 0.8, r"\bguid\w+": 0.6, r"\bprovision\b": 0.8,
    r"\brelie\w+": 1, r"\bease\b": 1.2, r"\bhope\b": 1, r"\bsalvation\b": 2, r"\bsaved?\b": 0.8,
}
# the names at verse endings ('Forgiving and Merciful') are frequent refrains, not tidings
REFRAIN = re.compile(r"(God|Allah|He|your Lord) is (ever )?(Forgiving|Merciful|All-Forgiving|Most Merciful)[^.]*\.?$", re.I)


def score(text, lex):
    t = text.lower()
    return sum(w * len(re.findall(p, t)) for p, w in lex.items())


def tone(key):
    text = saheeh.get(key, "") + " " + clear.get(key, "")
    body = REFRAIN.sub("", saheeh.get(key, "")) + " " + REFRAIN.sub("", clear.get(key, ""))
    w = score(text, WARN) / 2
    g = score(body, GLAD) / 2
    if w >= 1.5 and w > g * 1.4:
        return -2 if w >= 3 else -1
    if g >= 1.5 and g > w * 1.4:
        return 2 if g >= 3 else 1
    return 0


# ── surah list ─────────────────────────────────────────────────────────────
# names as Arabic writes them: hamza where the word has one (إبراهيم, الإنسان), none on a connecting
# alif (الانفطار, الانشقاق), and سبأ, النبأ as written outside the mushaf's own spelling (سبإ, النبإ read
# as slips there). Transliterations without the source's stray marks ('Ash-Shūraá').
NAME_AR = {14: "إبراهيم", 34: "سبأ", 76: "الإنسان", 78: "النبأ", 82: "الانفطار", 84: "الانشقاق"}
NAME_TC = {21: "Al-'Anbiyā", 42: "Ash-Shūrā", 58: "Al-Mujādilah", 87: "Al-'A`lā", 93: "Ađ-Đuĥā"}
surahs = []
for c in chapters:
    surahs.append({
        "n": c["id"],
        "ar": NAME_AR.get(c["id"], c["name_arabic"]),
        "tr": c["name_simple"],
        "tc": NAME_TC.get(c["id"], c["name_complex"]),
        "en": c["translated_name"]["name"],
        "ct": re.sub(r"\s+", " ", clear_names.get(str(c["id"]), "")).strip(),
        "place": c["revelation_place"],
        "count": c["verses_count"],
        "order": c["revelation_order"],
        "bism": c["bismillah_pre"],
    })

tone_count = collections.Counter()
arabic_mismatch = []
arabic_tajweed_only = 0
search = []
juz_start = {}
fallback = 0
import unicodedata

END_NUM = re.compile("\\s*[\u0660-\u0669\u06F0-\u06F9]+\\s*$")


def skeleton(s):
    """The consonantal letters only: no vowels, signs, small letters or spaces."""
    out = []
    for ch in unicodedata.normalize("NFC", s):
        if unicodedata.category(ch) in ("Mn", "Me", "Cf", "Lm") or ch == "\u0640" or ch.isspace():
            continue
        if "\u06D6" <= ch <= "\u06ED":  # Quranic annotation signs (pause marks etc.)
            continue
        out.append(ch)
    s = "".join(out)
    # encoding conventions that differ between sources but spell the same letters:
    # hamza on a carrier vs a separate mark, and final dotless yaa written as yaa
    for a, b in (("\u0671", "\u0627"), ("\u0623", "\u0627"), ("\u0625", "\u0627"), ("\u0622", "\u0627"),
                 ("\u0649", "\u064a"), ("\u0626", "\u064a"), ("\u0624", "\u0648"), ("\u0621", "")):
        s = s.replace(a, b)
    return s


def clean_verse(t):
    """Verse text without the ayah number, hizb marker and sajdah sign."""
    t = END_NUM.sub("", t).replace("\u06DE", "").replace("\u06E9", "")
    return re.sub(r"\s+", " ", t).strip()


skeleton_diff = []
for c in chapters:
    n = c["id"]
    raw = load(f"ch_{n:03d}.json")
    qpc = {v["verse_key"]: v for v in load(f"qpc_{n:03d}.json")}
    verses = []
    for v in raw:
        k = v["verse_key"]
        q = qpc[k]
        # Arabic: the King Fahd Complex (QPC) Hafs text, word by word
        words = [w for w in q["words"] if w["char_type_name"] == "word"]
        # the hizb marker (۞) and the sajdah sign (۩) are printed on words; keep the words only, and
        # note the word the mushaf sets the sajdah sign on (the reader draws the sign there)
        sajdah_word = next((i for i, w in enumerate(words) if "۩" in w["text_qpc_hafs"]), None)
        for w in words:
            w["text_qpc_hafs"] = re.sub(r"\s+", " ", w["text_qpc_hafs"].replace("۞", "").replace("۩", "")).strip()
        # where the mushaf writes two 'words' as one unit (15:7 لَّوۡمَا), no space follows
        glue, pos, vt = [], 0, clean_verse(q["text_qpc_hafs"])
        for i, w in enumerate(words):
            pos = vt.find(w["text_qpc_hafs"], pos) + len(w["text_qpc_hafs"])
            if i < len(words) - 1:
                if vt[pos:pos + 1] == " ":
                    pos += 1
                else:
                    glue.append(i)
        built = "".join(w["text_qpc_hafs"] + ("" if i in glue or i == len(words) - 1 else " ") for i, w in enumerate(words))
        # '۞' marks the start of a hizb quarter in the mushaf; it is not a word
        verse_text = clean_verse(q["text_qpc_hafs"])
        if built != verse_text:
            arabic_mismatch.append(k)  # words must rebuild the verse exactly
        # cross-check the letters against the second source (Tanzil-derived Uthmani)
        if skeleton(verse_text) != skeleton(END_NUM.sub("", v["text_uthmani"])):
            skeleton_diff.append(k)
        else:
            arabic_tajweed_only += 1
        t = tone(k)
        tone_count[t] += 1
        segs = qme.get(k) if qme_final is None else (None if k in QME_GAP else qme_final.get(k))
        if not segs:
            fallback += 1
        elif qme_final is not None:
            segs = [list(x) for x in segs]
        else:
            # drop OCR crumbs after the closing punctuation: 'plight.” ' a'
            segs = [list(s) for s in segs]
            for s in segs:
                # honorific calligraphy OCR'd as loose letters: 'Muhammad i i j)' -> 'Muhammad)'
                s[1] = re.sub(r"(?:\s+[A-Za-z](?=[\s)\].,;:]|$)){2,}", "", s[1])
                s[1] = re.sub(r"\s+([)\].,;:])", r"\1", s[1]).strip()
                if s[0] == 1 and s[1].count("(") > s[1].count(")"):
                    s[1] += ")"  # the closing bracket was among the OCR'd letters
            for _ in range(2):
                segs[-1][1] = re.sub(r"(?<=[.!?”\"’)])\s+['’‘\"]?\s*[A-Za-z]{0,2}\s*$", "", segs[-1][1]).strip()
                # drop crumbs like "' a" — but never plain punctuation such as the closing '.'
                kept = [s for s in segs if s[1] and not re.fullmatch(r"\(?['’‘\"\s.,]*[A-Za-z]\)?", s[1])]
                segs = kept or segs
        entry = {
            "n": v["verse_number"],
            "a": [w["text_qpc_hafs"] for w in words],
            "m": [(w.get("translation") or {}).get("text") or "" for w in words],
            "t": [(w.get("transliteration") or {}).get("text") or "" for w in words],
            "q": segs,
            "s": saheeh.get(k, ""),
            "c": clear.get(k, ""),
            "o": t,
            "j": v["juz_number"],
        }
        if glue:
            entry["g"] = glue
        if k in QME_GAP and qme_final is not None:
            entry["qg"] = 1
        ip = indopak.get(k)
        if ip and len(ip) == len(words):
            entry["ip"] = ip
        if k in themes:
            entry["h"] = themes[k]
        if v.get("sajdah_number"):
            entry["sj"] = 1
        if sajdah_word is not None:
            entry["sw"] = sajdah_word  # 15 places in the Madani mushaf (22:77 too); sj: the 14 of the Indo-Pak
        verses.append(entry)
        juz_start.setdefault(v["juz_number"], k)
        search.append([k, saheeh.get(k, ""), clear.get(k, ""), v.get("text_imlaei_simple", "")])
    with open(os.path.join(OUT, "s", f"{n}.json"), "w", encoding="utf-8") as f:
        json.dump({"n": n, "v": verses}, f, ensure_ascii=False, separators=(",", ":"))

with open(os.path.join(OUT, "surahs.json"), "w", encoding="utf-8") as f:
    json.dump({"surahs": surahs, "juz": juz_start}, f, ensure_ascii=False, separators=(",", ":"))
with open(os.path.join(OUT, "search.json"), "w", encoding="utf-8") as f:
    json.dump(search, f, ensure_ascii=False, separators=(",", ":"))

print("tones:", dict(tone_count))
print("arabic verses:", sum(c["verses_count"] for c in chapters),
      "| words rebuild the QPC verse:", sum(c["verses_count"] for c in chapters) - len(arabic_mismatch),
      "| letters agree with the second source:", arabic_tajweed_only, "| letter differences:", len(skeleton_diff), skeleton_diff[:20])
assert not arabic_mismatch, f"Arabic word text does not rebuild the verse text: {arabic_mismatch[:10]}"
json.dump(skeleton_diff, open(os.path.join(CACHE, "arabic_skeleton_diff.json"), "w"), indent=0)
print("QME fallbacks to Saheeh:", fallback)
total = sum(os.path.getsize(os.path.join(OUT, "s", x)) for x in os.listdir(os.path.join(OUT, "s")))
print("surah files MB:", round(total / 1e6, 2), "search MB:", round(os.path.getsize(os.path.join(OUT, "search.json")) / 1e6, 2))
