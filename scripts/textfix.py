"""Shared repairs for translation text extracted from PDFs.

- rejoin words split by a stray space   'A llaah' -> 'Allaah', 'responsi bility' -> 'responsibility'
- split words glued together            'caveand' -> 'cave and', 'endedforthem' -> 'ended for them'
- fix OCR letter confusions             'AUaah' -> 'Allaah', 'multipUed' -> 'multiplied', 'Touiheed' -> 'Towheed'
- normalise spacing around punctuation

A word is 'known' if it is in an English dictionary, in the Saheeh
International vocabulary, or used often enough in the Quraan Made Easy text
itself (so transliterations like Rasulullaah and Qiyaamah are protected).
Corrections are only accepted when the result is a well-attested word.
"""
import json, os, re, collections, math

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, ".cache")

DICT = set(open(os.path.join(CACHE, "words_alpha.txt"), encoding="utf-8").read().split())
FREQ = collections.Counter()
for line in open(os.path.join(CACHE, "en_50k.txt"), encoding="utf-8"):
    w, n = line.split()
    FREQ[w] = int(n)

chapters = json.load(open(os.path.join(CACHE, "chapters.json"), encoding="utf-8"))
REF = [re.sub(r"<[^>]+>", "", t["text"]) for t in json.load(open(os.path.join(CACHE, "tr_20.json"), encoding="utf-8"))]
CORPUS = collections.Counter()   # words of the Qur'an translations, lowercased
PROPER = collections.Counter()   # capitalised forms seen in the translations
REFV = set()                     # Saheeh vocabulary (clean, digital source)
for t in REF:
    for w in re.findall(r"[A-Za-z']+", t):
        CORPUS[w.lower().strip("'")] += 5
        REFV.add(w.lower().strip("'"))


for c in chapters:  # surah names in their common spellings
    for w in re.findall(r"[A-Za-z']+", c["name_simple"] + " " + c["translated_name"]["name"]):
        CORPUS[w.lower()] += 5
        PROPER[w] += 5
for w in ("Saff", "Mumtahina", "Munaafiqoon", "Munafiqoon", "Taghaabun", "Yaaseen", "Baqara", "Faatiha", "Imraan",
          "Towheed", "Tauheed", "Risaalah", "Aakhirah", "Qiyaamah", "Jannah", "Jahannam"):
    CORPUS[w.lower()] += 5
    PROPER[w] += 5


def known_strict(w):
    """Known without trusting the OCR'd corpus (whose fragments like 'llaah' recur)."""
    lw = w.lower().strip("'")
    return lw in REFV or (lw in DICT and (len(lw) > 2 or FREQ.get(lw, 0) > 500)) or FREQ.get(lw, 0) >= 300


LOWER = collections.Counter()    # lower-case uses, to tell names from ordinary words


def add_corpus(texts):
    for t in texts:
        if RAWLONG:
            t = respace(strip_debris(t))  # count words, not the fragments of letter-spaced runs
        for i, w in enumerate(re.findall(r"[A-Za-z']+", t)):
            lw = w.lower().strip("'")
            CORPUS[lw] += 1
            if w[:1].isupper():
                if i:  # sentence-initial capitals say nothing about names
                    PROPER[w.strip("'")] += 1
            else:
                LOWER[lw] += 1


def proper_case(w):
    """'allaah' -> 'Allaah' when the word is written capitalised elsewhere."""
    cap = w[:1].upper() + w[1:]
    return cap if w[:1].islower() and PROPER.get(cap, 0) > 3 * LOWER.get(w, 0) + 2 else w


def known(w):
    lw = w.lower().strip("'")
    if not lw:
        return True
    if lw in DICT and (len(lw) > 3 or FREQ.get(lw, 0) > 50 or CORPUS.get(lw, 0) >= 3):
        return True
    return CORPUS.get(lw, 0) >= 3 or FREQ.get(lw, 0) >= 200


def strong(w):
    """A word common enough to be the result of a correction."""
    lw = w.lower()
    return CORPUS.get(lw, 0) >= 4 or FREQ.get(lw, 0) >= 800 or (lw in ("a", "i"))


def score(w):
    lw = w.lower()
    return math.log(1 + CORPUS.get(lw, 0) * 40 + FREQ.get(lw, 0))


def keep_case(src, dst):
    if src.isupper() and len(src) > 1:
        return dst.upper()
    if src[:1].isupper():
        return dst[:1].upper() + dst[1:]
    return dst


OCR_SUBS = [("U", "ll"), ("U", "li"), ("ui", "w"), ("h", "li"), ("rn", "m"), ("m", "rn"), ("cl", "d"), ("ii", "u"),
            ("li", "h"), ("fl", "fi"), ("0", "o"), ("1", "l"), ("I", "l"), ("l", "I"), ("vv", "w"), ("c", "e"),
            ("e", "c"), ("t", "f"), ("f", "t"), ("tl", "d"), ("u", "v"), ("v", "u"), ("S", "s"), ("J", "j"),
            ("lu", "w"), ("iu", "w"), ("iv", "w"), ("m", "ra"), ("m", "ri"), ("in", "m"), ("ni", "m"), ("ri", "n"),
            ("h", "b"), ("b", "h"), ("n", "u"), ("u", "n"), ("y", "v"), ("vm", "om"), ("iv", "ro"), ("fi", "f"),
            ("j", ""), ("f", ""), ("l", "i"), ("i", "l"), ("oa", "aa"), ("ah", "aa"), ("hah", "laah"),
            ("o", "a"), ("h", "ll"), ("b", "h"), ("ll", "U"), ("t", "l"), ("It", "ll"), ("lt", "ll")]


def ocr_candidates(w):
    out = set()
    for a, b in OCR_SUBS:
        i = w.find(a)
        while i >= 0:
            out.add(w[:i] + b + w[i + len(a):])
            i = w.find(a, i + 1)
    return out


def edits1(w):
    letters = "abcdefghijklmnopqrstuvwxyz"
    splits = [(w[:i], w[i:]) for i in range(len(w) + 1)]
    deletes = [L + R[1:] for L, R in splits if R]
    transposes = [L + R[1] + R[0] + R[2:] for L, R in splits if len(R) > 1]
    replaces = [L + c + R[1:] for L, R in splits if R for c in letters]
    inserts = [L + c + R for L, R in splits for c in letters]
    return set(deletes + transposes + replaces + inserts)


def correct(w):
    """Best replacement for an unknown word, or None."""
    core = w.strip("'")
    if len(core) < 4 or (known_strict(core.lower()) and core[1:] == core[1:].lower()):
        return None
    first = ocr_candidates(core) | {core[:-1], core[1:]}
    if known(core):
        # a recurring OCR slip ('Allaab') looks 'known'; replace it only by a far commoner word
        cnt = CORPUS.get(core.lower(), 0)
        better = [c for c in first if len(c) >= 3 and CORPUS.get(c.lower(), 0) >= max(20, 15 * cnt)]
        return keep_case(core, max(better, key=score)) if better else None
    cands = [c for c in first if strong(c) and len(c) >= 3]
    if not cands and len(core) >= 5:
        # two OCR slips in one word: 'aakhimh' -> 'aakhirah'
        cands = [c2 for c in first for c2 in ocr_candidates(c) if strong(c2) and score(c2) > 6]
    if not cands and core[:1].islower() and len(core) >= 5 and CORPUS.get(core.lower(), 0) <= 3:
        cands = [c for c in edits1(core.lower()) if strong(c) and score(c) > 7]
    if not cands:
        return None
    best = max(cands, key=score)
    if core[:1].isupper() and best[:1].islower():
        # a capitalised word may be a name: only accept a capitalised, attested form
        cap = best[:1].upper() + best[1:]
        if PROPER.get(cap, 0) < 3 and best.lower() not in DICT:
            return None
        best = cap
    return keep_case(core, best) if not core[:1].isupper() else best


def split_word(w):
    """'caveand' -> 'cave and' when every part is a common word."""
    core = w
    lw = core.lower()
    if len(lw) < 6 or known(core):
        return None
    best = None
    n = len(lw)
    for i in range(2, n - 1):
        a, b = lw[:i], lw[i:]
        parts = None
        if strong(a) and strong(b) and len(a) + len(b) == n:
            parts = [a, b]
        elif strong(a):
            for j in range(2, len(b) - 1):
                if strong(b[:j]) and strong(b[j:]):
                    parts = [a, b[:j], b[j:]]
                    break
        if parts and all(len(p) > 1 or p in ("a",) for p in parts):
            s = min(score(p) for p in parts) - 0.8 * (len(parts) - 2)
            if best is None or s > best[0]:
                best = (s, parts)
    if not best or best[0] < 6:
        return None
    out, k = [], 0
    for p in best[1]:
        out.append(core[k:k + len(p)])
        k += len(p)
    return " ".join(out)


WORD = re.compile(r"[A-Za-z]+(?:'[A-Za-z]+)?")

# ── segmentation of long glued runs ('allaahrepliestothisassumption') ─────
_TOTAL_F = None
_TOTAL_C = None


def _cost(w):
    global _TOTAL_F, _TOTAL_C
    if _TOTAL_F is None:
        _TOTAL_F = sum(FREQ.values())
        _TOTAL_C = sum(CORPUS.values()) or 1
    f, c = FREQ.get(w, 0), CORPUS.get(w, 0)
    if c < 3:
        c = 0  # a one-off in the OCR'd text is more likely a slip than a word
    if not f and not c and not (w in DICT and len(w) > 3):
        return None
    p = 0.5 * f / _TOTAL_F + 0.5 * c / _TOTAL_C + (1e-9 if w in DICT else 0)
    return -math.log(p) if p > 0 else None


def segment(run):
    """Best split of a run of letters into words (unknown chunks allowed at a high cost)."""
    s = run.lower()
    n = len(s)
    best = [(0.0, [])] + [(float("inf"), None)] * n
    for i in range(1, n + 1):
        for j in range(max(0, i - 20), i):
            if best[j][1] is None:
                continue
            piece = s[j:i]
            c = _cost(piece)
            if c is None:
                c = 30 + 4 * len(piece)  # unknown chunk (often an OCR slip)
            elif len(piece) == 1 and piece not in ("a", "i"):
                c += 25
            tot = best[j][0] + c
            if tot < best[i][0]:
                best[i] = (tot, best[j][1] + [piece])
    parts = best[n][1] or [s]
    out, k = [], 0
    for p in parts:
        out.append(run[k:k + len(p)])
        k += len(p)
    return out


HONORIFIC_NAMES = r"(?:Rasulullaah|Muhammad|Nabi|Moosa|Eesa|Ibraheem|Nooh|Yusuf|Sulaymaan|Dawood|Haaroon|Aadam|Maryam|Yahya|Zakariyya|Loot|Hood|Saalih|Shu'ayb|Ismaa'eel|Is'haaq|Ya'qoob|Idrees|Yunus|Ayyub|Ilyaas|Jibra'eel|Allaah)"


def strip_debris(text):
    """Remove what the OCR made of honorific calligraphy and ornaments."""
    t = text
    t = re.sub(r"\b([A-Z][a-z]{2,})['’]? s\b(?=\s)", r"\1's", t)   # 'Allaah s way' -> 'Allaah's way'
    t = re.sub(r"\b([A-Za-z]{3,})&\S*", r"\1", t)                   # 'Rasulullaah&'M' -> 'Rasulullaah'
    # 'InshaA llaah' -> 'Insha Allaah'; 'mA llaah's' -> 'Allaah's'
    t = re.sub(r"\b([A-Za-z]*?)A llaah", lambda m: (m.group(1) + " " if len(m.group(1)) > 1 else "") + "Allaah", t)
    # 'Rasulullaah iPir', 'Rasulullaah SS )', 'Muhammad&M', 'Moosa rt.~'
    def after_name(m):
        name, junk = m.group(1), m.group(2)
        w = re.sub(r"[^A-Za-z]", "", junk)
        if re.fullmatch(r"[a-z]", junk):
            return m.group(0)  # likely the first letter of a split word ('w ill'); rejoined later
        real = w and known(w) and not re.search(r"[a-z][A-Z]|[A-Z]{2}|[^A-Za-z'’]", junk) and (len(w) > 1 or w in ("I", "a"))
        if not real and RAWLONG and re.fullmatch(r"[A-Za-z][a-z]{2,3}", junk):
            # an OCR slip of a real word, not debris ('Rasulullaah ivas born')
            real = any(_wcost(_norm(v)) is not None and len(_norm(v)) >= 3 for v in _variants(junk, False))
        return m.group(0) if real else name
    t = re.sub(rf"\b({HONORIFIC_NAMES})((?:\s+[A-Z](?![\w'’])){{2,3}})(?=\s+[a-z])", r"\1", t)  # 'the Nabi I S and'
    for _ in range(2):
        t = re.sub(rf"\b({HONORIFIC_NAMES})(?:\s+|(?=[&@#%*^~|]))([&@#%*^~|]?[A-Za-z0-9!][^\s,.;:)\]]{{0,3}})(?=[\s,.;:)\]]|$)", after_name, t)
    t = re.sub(r"\b([A-Z][a-z']{2,}) s\b(?=\s)", r"\1's", t)   # 'Allaah s way' -> 'Allaah's way'
    # 'Sa/f' -> 'Saff': an italic f read as a slash
    def slash(m):
        for ch in ("f", "l", "t", "i"):
            cand = m.group(1) + ch + m.group(2)
            if strong(cand) or known_strict(cand):
                return cand
        return m.group(0)
    t = re.sub(r"\b([A-Za-z]+)/([A-Za-z]*)\b", slash, t)
    t = re.sub(r"\b([A-Z][a-z]+u)I\b", r"\1l", t)      # 'BaytuI', 'LaylatuI' -> 'Baytul', 'Laylatul'
    t = re.sub(r"\bBa[yg]tui\b", "Baytul", t)
    t = re.sub(r"\b0\b(?=\s*[A-Z])", "O", t)          # '0 Muhammad' -> 'O Muhammad'
    t = re.sub(r"\blf(?=\s|[A-Z])", "If ", t).replace("If  ", "If ")   # OCR 'lf' -> 'If'
    t = re.sub(r"\(\s*0\s*\)", "(O)", t)
    t = re.sub(r"\bo\((?=\s*[a-z])", "of", t)          # 'o( their' -> 'of their'
    t = re.sub(r"[~^|{}<>@#%*_=\\]+", "", t)
    # a token of mixed digits, letters and marks is ornament noise: '9-t'isS’S:', 'V'''
    t = re.sub(r"(?<!\S)(?=\S*\d)(?=\S*[A-Za-z])(?=\S*[^\w\s])\S+", "", t)
    t = re.sub(r"(?<!\S)[A-Za-z]''+(?!\S)", "", t)
    t = re.sub(r"(?<!\S)\(?[^\w\s(]+\d+[^\w\s)]*(?!\S)", "", t)        # '(.-12'
    t = re.sub(r"(?<!\S)\(?\d+[^\w\s)]+(?!\S)", "", t)                 # '12-.'
    return re.sub(r"\s{2,}", " ", t).strip()


def tidy_end(text):
    """After words are rejoined: drop stray single letters and empty brackets."""
    t = re.sub(r"(?<![\S])(?![aAIO](?![\w']))[A-Za-z](?=\s|$)", "", text)
    t = re.sub(r"\(\s*[^A-Za-z()]*\)", "", t)
    t = re.sub(r"\(\s*[^A-Za-z()]*$", "", t)
    return re.sub(r"\s{2,}", " ", t).strip()


def fix_words(text):
    tokens = re.split(r"(\s+)", text)
    # 1) rejoin split words: 'A llaah', 'T hey', 'responsi bility'
    i = 0
    while i < len(tokens) - 2:
        a, sp, b = tokens[i], tokens[i + 1], tokens[i + 2]
        ma = re.fullmatch(r"([(\[\"'‘“]*)([A-Za-z]+)", a)
        mb = re.fullmatch(r"([a-z]+)((?:['’]s)?[)\].,;:!?\"'’”]*)", b)
        if sp == " " and ma and mb:
            wa, wb = ma.group(2), mb.group(1)
            joined = wa + wb
            possessive = wa in ("s", "S")
            # 'All aahs orders' -> "Allaah's orders"
            if not possessive and not strong(joined) and joined.endswith("s") and strong(joined[:-1]) and not known_strict(wb):
                tokens[i:i + 3] = [ma.group(1) + joined[:-1] + "'s" + mb.group(2)]
                continue
            if not possessive and (not known_strict(wa) or not known_strict(wb) or len(wa) == 1) and known(joined) and strong(joined) \
                    and not (wa.lower() in ("a", "i", "o") and known_strict(wb) and len(wb) >= 2):
                tokens[i:i + 3] = [ma.group(1) + joined + mb.group(2)]
                continue
        i += 1
    # 2) camel glue, glued runs and OCR confusions
    out = []
    for t in tokens:
        if t.isspace() or not t:
            out.append(t)
            continue
        if re.search(r"[À-ɏḀ-ỿ]", t):
            out.append(t)  # transliteration with diacritics (Qur’ān, Ṭuwā): never touch
            continue

        def repl(m):
            w = m.group(0)
            # 'havingImaan' -> 'having Imaan'; 'toO' -> 'too'
            cm = re.fullmatch(r"([a-z]{2,})([A-Z][a-z]{2,}.*)", w)
            if cm and known(cm.group(1)):
                return cm.group(1) + " " + repl(re.match(r".+", cm.group(2)))
            # glued runs: 'akorejectedthemessageofShu'ayb', 'abouethe' -> 'above the'
            core = w.replace("'", "")
            compound = re.search(r"[a-z][A-Z]", w) and w[:1].isupper()  # 'InshaAllaah', 'SubhaanAllaah'
            if "'" not in w and len(core) < 11 and not known(w):
                c = correct(w)  # an OCR slip is likelier than a glued pair in a short word
                if c:
                    return c
            few_caps = sum(ch.isupper() for ch in w) <= 1
            if not compound and few_caps and len(core) >= (11 if w[:1].isupper() else 7) and not known(w) and not known_strict(w):
                parts = segment(w)
                if len(parts) > 1 and all(len(p) > 1 or p == "a" for p in parts):
                    fixed = [proper_case(correct(p) or p) for p in parts]
                    good = sum(bool(strong(p)) for p in fixed)
                    if good == len(fixed) or (len(core) >= 14 and good >= len(fixed) - 1):
                        return " ".join(fixed)
            if compound:
                halves = re.split(r"(?<=[a-z])(?=[A-Z])", w)
                if all(known(h) or known_strict(h) for h in halves):
                    return w  # a transliterated compound written as one word
            if re.search(r"[a-z][A-Z]", w):
                if known_strict(w.lower()) or strong(w.lower()):
                    return w[0] + w[1:].lower()  # 'toO' -> 'too'
                return correct(w) or w  # 'multipUed' -> 'multiplied'; otherwise leave it, never split it
            # possessives: 'Allaab's' -> 'Allaah's', 'Allaahs' -> 'Allaah's'
            pm = re.fullmatch(r"(.+)'s", w)
            if pm:
                base = pm.group(1)
                return (correct(base) or base) + "'s"
            if w.endswith("s") and not known(w) and len(w) > 4 and PROPER.get(w[:-1], 0) >= 20:
                return w[:-1] + "'s"
            if "'" in w:
                return w
            s = split_word(w)
            if s:
                return s
            c = correct(w)
            return c or w
        out.append(WORD.sub(repl, t))
    return "".join(out)


def junk_ratio(text):
    words = re.findall(r"[A-Za-z']+", text)
    if not words:
        return 1.0
    return 1 - sum(known(w) for w in words) / len(words)


def fix_spacing(text):
    t = text
    t = re.sub(r"(?<=[a-z\)\]’”])([,;:!?])(?=[A-Za-z])", r"\1 ", t)              # 'another,as' -> 'another, as'
    t = re.sub(r"(?<=[a-z]{2})\.(?=[A-Z][a-z])", ". ", t)                          # 'Sabbath.During' -> 'Sabbath. During'
    t = re.sub(r"(?<=[\)\]’”])\.(?=[A-Z][a-z])", ". ", t)
    t = re.sub(r"(?<=[a-z]{2})\.(?=I\s)", ". ", t)                                # 'promise.I too'
    t = re.sub(r"\s+([,.;:!?\)\]’”](?!\w))", r"\1", t)                          # space before punctuation
    t = re.sub(r"([\(\[‘“])\s+", r"\1", t)
    t = re.sub(r"\b(of|the|to|and|in|for|by|from|with|on|is|was|his|their|them|upon|that)(?=[A-Z][a-z])", r"\1 ", t)
    t = re.sub(r"\b(a|an|the|of|to|and|in|is|for)\s+\1\b", r"\1", t, flags=re.I)  # 'a a short'
    t = re.sub(r"\s{2,}", " ", t)
    return t.strip()



# ── re-spacing: letter-spaced and glued runs ──────────────────────────────
# Some pages of the scanned book carry an OCR layer that spaces italic text
# letter by letter ('e v e ry o th e r fa cu lty'), others glue whole phrases
# ('OnlyAllaahknowsthecorrectmeaning'). Around every suspicious token the
# letters are re-segmented with a unigram model: original spaces are kept
# unless dropping them yields real words, and new spaces cost a little too.
# The model deliberately ignores short OCR'd tokens ('th', 'yo', 'ee'), which
# recur in the scanned text often enough to look like words, and scanned-only
# words that are really a slip, a fragment or a glued pair of commoner words.

RAWLONG = collections.Counter()   # words of 4+ letters in the scanned texts
FRAGMAX = {}                      # 'llaah' -> count of the word it was cut from
_TRUST = {}
SHORT_OK = {"a", "i", "o", "am", "an", "as", "at", "be", "by", "do", "go", "he", "if", "in", "is", "it", "me", "my",
            "no", "of", "oh", "on", "or", "so", "to", "up", "us", "we", "ye", "ah", "lo", "ox",
            "isa", "aad", "abu", "bin", "ibn", "etc", "yes"}
SHORT_OK |= {w for w in DICT if len(w) == 3 and ((w in REFV and FREQ.get(w, 0) >= 300) or FREQ.get(w, 0) >= 1500)}
SHORT_OK |= {"oft", "aus", "ar", "wal", "umm", "en"}
SHORT_OK -= {"aah", "aha", "ahh", "hmm", "huh", "ugh", "oof", "ooh", "shh", "tsk", "hah", "heh", "hee", "hup",
             "yah", "yea", "yep", "yup", "wah", "asap"}
# first names the frequency list knows: never the target of a correction ('vie' is not 'vic')
NAMES = set('''vic gwen nora denver avery hyde alma lori thad strom dean dana gina tina mona lana rita sara lisa john
paul luke eric erin ryan sean todd troy kyle dave mike pete jim tim tom ron don ben dan sam kim amy ann ian kay lou meg
pam ted ada ivy jack jake jane jean jill joan josh judy karl kate kent lynn matt nick noah owen rick ross ruth seth tony
walt wade zack jose juan carl cole dale drew earl ella emma evan gary glen greg hank hugh ivan jeff jess jody joel kurt
lars leon liam lucy luis neil nina otto rene rudy stan tara vera bud cain cains abel'''.split())
SHORT_OK -= {"tha", "wha", "ain", "hae", "que", "cha", "der", "des", "les", "san", "yer", "ere", "tis", "iii", "doo",
             "hoo", "ole", "ana", "del", "las", "nam", "shi", "che", "chi", "cho", "lan", "mam", "hal", "hon"}
_ALT = [("U", "ll"), ("U", "li"), ("rn", "m"), ("cl", "d"), ("ii", "u"), ("vv", "w"), ("VJ", "W"), ("IV", "W"),
        ("l", "I"), ("I", "l"), ("c", "e"), ("e", "c"), ("t", "f"), ("f", "t"), ("f", "l"), ("h", "b"),
        ("b", "h"), ("m", "in"), ("in", "m"), ("n", "rr"), ("h", "la"), ("hah", "laah"), ("t", "l"), ("i", "l"),
        ("jf", "ff"), ("fj", "ff"), ("0", "o"), ("1", "l"), ("u", "n"), ("n", "u"), ("ui", "w"), ("iu", "w"),
        ("u", "v"), ("v", "u"), ("ii", "ll"), ("li", "h"), ("lt", "ll"), ("It", "ll"), ("cc", "ee"), ("ii", "y"),
        ("fi", "h"), ("r", "n"), ("d", "cl"), ("H", "li"), ("H", "ll"), ("Vi", "W"), ("c", "d"), ("p", "y"), ("g", "y"), ("i", "y"), ("iv", "w"), ("lu", "w"), ("II", "ll"),
        ("vi", "w"), ("Lu", "h")]
# confusions certain enough to apply to a capitalised word, which may otherwise be a name
_STRONG = {("U", "ll"), ("U", "li"), ("rn", "m"), ("cl", "d"), ("ii", "u"), ("vv", "w"), ("VJ", "W"), ("IV", "W"),
           ("l", "I"), ("I", "l"), ("jf", "ff"), ("fj", "ff"), ("0", "o"), ("1", "l"), ("Vi", "W"), ("i", "l"),
           ("c", "e"), ("H", "ll"), ("H", "li"), ("II", "ll"), ("p", "y")}
_CHEAP = {("p", "y"), ("U", "ll"), ("II", "ll"), ("rn", "m"), ("jf", "ff"), ("fj", "ff")}  # this scan's usual slips
# names the scan nearly always breaks ('Imr aan', 'Mary am'), so the model can rebuild them
SEEDS = ["Imraan", "Maryam", "Aa'isha", "Hafsa", "Teeh", "Hinta", "Hitta", "Aus", "Yaaseen", "Baytul", "Saff",
         "Mumtahina", "Munaafiqoon", "Taghaabun", "Baqarah", "Faatiha", "Towheed", "Risaalah", "Aakhirah", "Qiyaamah",
         "Fajr", "Zuhr", "Asr", "Maghrib", "Esha", "Yusuf", "Kabah", "Waseelah", "Baheerah", "Saa'ibah", "Lahm"]
REFCNT = collections.Counter()
for _t in REF:
    for _w in re.findall(r"[A-Za-z']+", _t):
        REFCNT[_w.lower().strip("'")] += 1
_R_TOTAL = [sum(FREQ.values()), 5 * sum(REFCNT.values())]


RAWCAP = collections.Counter()    # capitalised uses inside a sentence ("the Qur'aan"), to restore case
RAWLOW = collections.Counter()


def _recap(w):
    lw = _norm(w)
    if w[:1].islower() and RAWCAP.get(lw, 0) > 3 * RAWLOW.get(lw, 0) + 2:
        return w[:1].upper() + w[1:]
    return w


def prime(texts):
    """Count the long words of the scanned texts (for the re-spacing model)."""
    for t in texts:
        for i, w in enumerate(re.findall(r"[A-Za-z'’]+", t)):
            lw = w.lower().replace("’", "'").strip("'")
            if len(lw) >= 4:
                RAWLONG[lw] += 1
                if w[:1].isupper() and w[1:2].islower():
                    if i:
                        RAWCAP[lw] += 1
                elif w.islower():
                    RAWLOW[lw] += 1
    for w in SEEDS:
        RAWLONG[w.lower()] += 10
    FRAGMAX.clear()
    _TRUST.clear()
    for w, n in RAWLONG.items():
        if n >= 20:
            for k in (1, 2, 3):
                for sub in (w[k:], w[:-k]):
                    if len(sub) >= 3 and n > FRAGMAX.get(sub, 0):
                        FRAGMAX[sub] = n
    _R_TOTAL[1] = sum(RAWLONG.values()) + 5 * sum(REFCNT.values())


DICT_ONLY = 22.0


def _count(w):
    if len(w) <= 3:
        return 10 ** 6 if w in SHORT_OK else 0
    return RAWLONG.get(w, 0) + 5 * REFCNT.get(w, 0) + FREQ.get(w, 0) // 200


def _count_v(w):
    """Count of a word, or of its likeliest OCR reading ('lslaam' -> 'islaam')."""
    return max([_count(w)] + [_count(_norm(v)) for v in _variants(w, False)])


def _trusted_raw(lw):
    """A word seen only in the scanned texts: is it a real word?"""
    if lw in _TRUST:
        return _TRUST[lw]
    raw = RAWLONG.get(lw, 0)
    ok = raw >= 3 and FRAGMAX.get(lw, 0) < 10 * raw
    if ok and raw < 40:
        # a recurring slip of a far commoner word ('kujfaar' for 'kuffaar', "qur'aanj" for "qur'aan")
        vs = _variants(lw, False) | ({lw[:-1]} if lw[-1] in "jf" else set())
        ok = not any(_count(_norm(v)) >= 10 * raw for v in vs if _norm(v) != lw)
    if ok and len(lw) >= 8:
        # a recurring glued pair ("allaah'spunishment")
        for i in range(1, len(lw) - 2):
            a, b = lw[:i].strip("'"), lw[i:].strip("'")
            if i == 1 and a not in ("a", "o", "i"):
                continue
            if _count(a) >= 5 * raw and _count_v(b) >= 5 * raw:
                ok = False
                break
    _TRUST[lw] = ok
    return ok


def _wcost(lw):
    """-log p of a lower-case word, or None when it is not a trustworthy word."""
    c = _wcost0(lw)
    if c == DICT_ONLY:
        c = None
        for suf in ("s", "es", "ed", "d", "ing"):
            if c is None and lw.endswith(suf) and len(lw) - len(suf) >= 4:
                b = _wcost0(lw[:-len(suf)])
                if b is not None and b != DICT_ONLY:
                    c = b + 2.5  # 'abstains'
        return c if c is not None else DICT_ONLY
    if c is None and lw.endswith("'s") and _wcost0(lw[:-2]) is not None:
        c = _wcost0(lw[:-2]) + 1  # "day's", "anyone's"
    if c is None and len(lw) >= 5:
        # inflections and British spellings the word lists lack: 'disrespects', 'solemnising'
        brit = re.sub(r"is(e|es|ed|ing|ation|ations)$", r"iz\1", lw)
        if brit != lw:
            c = _wcost0(brit)
        for suf in ("s", "es", "ed", "d", "ing"):
            if c is None and lw.endswith(suf) and len(lw) - len(suf) >= 4:
                b = _wcost0(lw[:-len(suf)])
                if b is not None:
                    c = b + 2.5
    return c


BANNED = {"asap", "aah", "ahh", "hmm", "ugh", "ooh", "huh"}  # never a word to build a reading from


def _wcost0(lw):
    if not lw or lw in BANNED:
        return None
    if len(lw) <= 3:
        if lw not in SHORT_OK:
            return None
        f, c = FREQ.get(lw, 0), 5 * REFCNT.get(lw, 0)
    else:
        f = FREQ.get(lw, 0) if (FREQ.get(lw, 0) >= 800 or lw in DICT) else 0
        c = 5 * REFCNT.get(lw, 0)
        if RAWLONG.get(lw, 0) >= 3 and (f or c or _trusted_raw(lw)):
            c += RAWLONG[lw]
    if not f and not c:
        return DICT_ONLY if lw in DICT and len(lw) > 4 else None
    p = 0.5 * f / _R_TOTAL[0] + 0.5 * c / max(_R_TOTAL[1], 1)
    return -math.log(p)


def _attested(lw):
    """A target for a correction: a dictionary word or one the texts use (not a bare name like 'lori')."""
    b = lw[:-2] if lw.endswith("'s") else lw
    if b in NAMES:
        return False
    return b in DICT or RAWLONG.get(b, 0) >= 3 or REFCNT.get(b, 0) > 0 or b in SHORT_OK


def _norm(w):
    return w.lower().replace("’", "'").strip("'")


_TOK = re.compile(r"^([(\[“‘\"]*)([A-Za-z'’]*[A-Za-z][A-Za-z'’]*)([)\].,;:!?”\"]*)$")


def _sub_all(w, a, b):
    i = w.find(a)
    while i >= 0:
        yield w[:i] + b + w[i + len(a):]
        i = w.find(a, i + 1)


def _variants(piece, deep):
    out = {v for a, b in _ALT for v in _sub_all(piece, a, b)}
    if deep:
        out |= {v2 for v in list(out) for a, b in _ALT for v2 in _sub_all(v, a, b)}
    return out


def _inserts(piece):
    letters = "abcdefghijklmnopqrstuvwxyz"
    return {piece[:i] + c + piece[i:] for i in range(1, len(piece) + 1) for c in letters}


def _resegment(cores, joins, sus):
    """Best words for the letters of `cores`; joins[k] is the cost of dropping
    the space after cores[k], sus[k] whether cores[k] is a broken token.
    Returns the words."""
    s = "".join(cores)
    n = len(s)
    bounds, k = {}, 0
    solid = set()   # positions inside good tokens, short fragments and names: cutting there is expensive
    for idx, c in enumerate(cores):
        if not sus[idx] or (c[:1].isupper() and c[1:].islower() and 3 <= len(c) <= 8):
            solid |= set(range(k + 1, k + len(c)))
        k += len(c)
        if idx < len(cores) - 1:
            bounds[k] = joins[idx]
    k = 0
    short_side = set()  # boundaries inside a letter-spaced run ('Wa see lah', 'Ha la al')
    for idx, c in enumerate(cores[:-1]):
        k += len(c)
        d = cores[idx + 1]
        if len(c) <= 3 and len(d) <= 3 and sus[idx] and sus[idx + 1] and c not in ("O", "I", "A") and d[:1].islower():
            short_side.add(k)
    starts = {0} | set(bounds)
    natural = starts | {i for i in range(1, n) if s[i - 1].islower() and s[i].isupper()}
    ends = set(bounds) | {n}
    INF = float("inf")
    best = [(0.0, None)] + [(INF, None)] * n
    for i in range(1, n + 1):
        for j in range(max(0, i - 24), i):
            if best[j][0] == INF:
                continue
            piece = s[j:i]
            inside = [b for b in bounds if j < b < i]
            aligned = j in natural and (i in ends or (i < n and i in natural))
            lw = _norm(piece)
            out = piece
            c = _wcost(lw)
            whole = j in starts and i in ends and not inside
            if c == DICT_ONLY and not (j in starts and i in ends):
                c = None  # 'ising' is in the word list, but not a word to cut 'solemnising' into
            if c is not None and re.search(r"[a-z][A-Z]", piece) and not whole:
                c = None  # 'RasoolS': a word does not change case in its middle
            # a lone 'i' or 'l' is the pronoun I, whether a token of its own or stuck to a
            # longer word ('thati may'); never at the end of a run, where it is usually debris
            if i < n and ((whole and piece in ("i", "l")) or (piece == "i" and i in ends and j - max(x for x in starts if x <= j) >= 4)):
                c, out = _wcost("i") + (2 if piece == "l" else 8), "I"
            elif c is not None and len(lw) == 1 and not (lw == "a" or piece in ("I", "O")):
                c += 20
            if c is None and len(inside) == 1 and "'" not in piece and len(lw) >= 5 and piece[inside[0] - j:].islower():
                b = inside[0] - j
                ca = _wcost(lw[:b] + "'" + lw[b:])   # 'Qur aan' -> "Qur'aan"
                if ca is not None:
                    c, out = ca + 1, piece[:b] + "'" + piece[b:]
            if c is None and (len(piece) >= 3 or (aligned and len(piece) == 2)):
                deep = j in natural and len(piece) >= 5
                name = aligned and not inside and piece[:1].isupper() and len(piece) >= 4
                cands = []
                strong_set = {v for a, b in _STRONG for v in _sub_all(piece, a, b)}
                cheap_set = {v for a, b in _CHEAP for v in _sub_all(piece, a, b)}
                for v in _variants(piece, deep):
                    if v == piece or (not whole and re.search(r"[a-z][A-Z]", v)):
                        continue
                    lv = _norm(v)
                    cv = _wcost(lv)
                    if cv is None or cv == DICT_ONLY or not (len(v) >= 4 or cv < 14.5) or not _attested(lv):
                        continue
                    if name and not (FREQ.get(lv.split("'")[0], 0) >= 2000 or RAWLONG.get(lv, 0) >= 200
                                     or (v in strong_set and (RAWLONG.get(lv, 0) >= 10 or PROPER.get(v, 0) >= 5))):
                        continue  # a capitalised word may be a name: only a certain slip, or a common word
                    cands.append((cv + (3 if v in cheap_set else 6), v))
                if cands:
                    cv, v = min(cands)
                    c, out = cv, v
            if (c is None or out != piece) and whole and len(lw) >= 6 and piece[1:].islower() and "'" not in piece:
                cands = [(cv, v) for x in range(1, len(piece)) for ch in "abcdefghijklmnopqrstuvwxyz"
                         for v in [piece[:x] + ch + piece[x + 1:]] if v != piece
                         for cv in [_wcost(v.lower())] if cv is not None and cv < 14 and cv != DICT_ONLY and _attested(v.lower())]
                if cands and (c is None or min(cands)[0] + 9 < c):
                    cv, v = min(cands)
                    c, out = cv + 9, v
            if (c is None or out != piece) and whole and len(lw) >= 7 and piece[1:].islower() and "'" not in piece:
                cands = [(cv, v) for v in {piece[:x] + piece[x + 1:] for x in range(1, len(piece))}
                         for cv in [_wcost(v.lower())] if cv is not None and cv < 15 and cv != DICT_ONLY and _attested(v.lower())]
                if cands and (c is None or min(cands)[0] + 8 < c):
                    cv, v = min(cands)
                    c, out = cv + 8, v
            if (c is None or out != piece) and aligned and len(lw) >= 3 and (len(lw) >= 4 or not inside) and piece[1:].islower() and "'" not in piece:
                # a letter lost in the scan ('repentace' -> 'repentance'); names stay names
                cands = [(cv, v) for v in _inserts(piece) for cv in [_wcost(v.lower())] if cv is not None
                         and cv < (13 if len(lw) >= 4 else 9) and cv != DICT_ONLY and _attested(v.lower())
                         and (piece[:1].islower() or (RAWLONG.get(v.lower(), 0) >= 10 and v[:-1] == piece))]
                if cands and (c is None or min(cands)[0] + 8 < c):
                    cv, v = min(cands)
                    c, out = cv + 8, v
            if c is None and len(piece) == 1 and not whole:
                if i in ends and piece in "jJfl" and j > 0:
                    c, out = 5.0, ""
                elif j in starts and piece in "ftj" and i < n:
                    c, out = 6.0, ""
            if c is None:
                if len(piece) == 1:
                    c = 18.0
                elif aligned:
                    # an unknown word (often a name): cheap to keep, and letter-spaced
                    # fragments may merge into one, but whole words may not
                    c = 10 + 2.5 * len(piece) + 4 * max(0, len(piece) - 9)
                    if re.search(r"[a-z][A-Z]", piece):
                        c += 6  # 'fYusu', 'SendingBin': a case change inside a word marks a lost space
                    c += sum(2.0 if b in short_side else 14 for b in inside)
                    inside = []
                else:
                    c = 30 + 5 * len(piece)
            c += sum(bounds[b] for b in inside)
            if j not in starts and j not in natural:
                c += 20 if j in solid else 5
            tot = best[j][0] + c
            if tot < best[i][0]:
                best[i] = (tot, (j, out))
    words, i = [], n
    while i > 0:
        j, out = best[i][1]
        words.append(out)
        i = j
    return words[::-1]


_SEEDSPLIT = None


def respace(text):
    global _SEEDSPLIT
    if _SEEDSPLIT is None:
        # 'Mary am' -> 'Maryam': a seeded name the scan split into two real words
        alts = []
        for w in SEEDS:
            for i in range(2, len(w) - 1):
                alts.append(re.escape(w[:i]) + " " + re.escape(w[i:]))
        _SEEDSPLIT = re.compile(r"\b(" + "|".join(alts) + r")\b")
    text = _SEEDSPLIT.sub(lambda m: m.group(0).replace(" ", ""), text)
    toks = text.split(" ")
    info = [_TOK.match(t) for t in toks]
    sus = [bool(m) and (_wcost(_norm(m.group(2))) is None or (len(m.group(2)) == 1 and m.group(2) not in "aAIO")) for m in info]
    if not any(sus):
        return text
    n = len(toks)

    def link(k):  # may the space between token k and k+1 be dropped?
        return bool(info[k] and info[k + 1] and not info[k].group(3) and not info[k + 1].group(1))

    lone = [bool(m) and len(m.group(2)) == 1 and m.group(2) not in "aAIO" for m in info]
    inc = list(sus)
    for k in range(n):  # take in neighbours each side, for joins across them ('in fluent i al', 'he sit at i on')
        if sus[k]:
            r = 3 if lone[k] else 2
            x = k
            while x > 0 and k - x < r and link(x - 1):
                x -= 1
                inc[x] = True
            x = k
            while x + 1 < n and x - k < r and link(x):
                x += 1
                inc[x] = True
    out, k = [], 0
    while k < n:
        if not inc[k]:
            out.append(toks[k])
            k += 1
            continue
        b = k
        while b + 1 < n and inc[b + 1] and link(b):
            b += 1
        cores = [info[x].group(2) for x in range(k, b + 1)]
        spaced = any(lone[k:b + 1])  # a letter-spaced stretch: short words there may be fragments too
        joins = []
        for x in range(k, b):
            l, r = cores[x - k], cores[x + 1 - k]
            if (sus[x] and len(l) <= 3) or (sus[x + 1] and len(r) <= 3) or len(l) == 1 or len(r) == 1:
                joins.append(2.0)
            elif sus[x] or sus[x + 1]:
                joins.append(6.0)
            elif spaced and len(l) <= 3 and len(r) <= 3:
                joins.append(4.0)
            else:
                joins.append(11.0)
        words = [_recap(w) for w in _resegment(cores, joins, sus[k:b + 1])]
        out.append(info[k].group(1) + " ".join(w for w in words if w) + info[b].group(3))
        k = b + 1
    return " ".join(out)


def fix(text):
    return fix_spacing(tidy_end(fix_words(fix_spacing(respace(strip_debris(text))))))
