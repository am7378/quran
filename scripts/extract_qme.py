"""Extract the 'Quraan Made Easy' translation from the scanned PDF.

The book prints the smooth-reading translation in large bold type and the
explanatory context in small italic type inside parentheses. The PDF's text
layer is OCR, so the bold/italic distinction survives as glyph *size*
(~9pt vs ~6.5pt in the first section, 8pt vs 6pt in the second) plus the
parentheses themselves. Each verse becomes a list of segments:

    [[0, "main text"], [1, "context text"], ...]
"""
import json, os, re, collections
import pymupdf

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, ".cache")
PDF = os.path.join(HERE, "..", "..", "Quraan-Made-Easy-Complete.pdf")

chapters = json.load(open(os.path.join(CACHE, "chapters.json"), encoding="utf-8"))
COUNT = {c["id"]: c["verses_count"] for c in chapters}

doc = pymupdf.open(PDF)
FIRST, LAST = 58, doc.page_count - 1

INTRO_MARKERS = ("A SUMMARY OF THE", "THE LINK BETWEEN", "A BRIEF SUMMARY")
NUM_RE = re.compile(r"^([0-9lIO]{1,3})([.,:;]?)$")
NUM_GLUED = re.compile(r"^([0-9]{1,3})[.,](\S+)$")
OK_PUNCT = set("‘’“”–—…")


def to_int(s):
    return int(s.replace("l", "1").replace("I", "1").replace("O", "0"))


CONF = {frozenset(p) for p in ["17", "38", "56", "68", "08", "89", "14", "27", "06", "09", "35", "49", "12"]}


def confusable(a, b):
    """True when OCR digits `a` could be a misreading of number `b`."""
    a, b = str(a), str(b)
    if len(a) != len(b) or a == b:
        return False
    return all(x == y or frozenset(x + y) in CONF for x, y in zip(a, b))


def page_lines(p):
    """Lines as lists of (x0, y0, size, word, font), without the running
    header, page number, watermark and the OCR noise of the Arabic lines."""
    lines, header = [], []
    for b in p.get_text("dict")["blocks"]:
        for l in b.get("lines", []):
            toks = []
            for s in l["spans"]:
                t = s["text"]
                if not t.strip():
                    continue
                x0, y0, x1, y1 = s["bbox"]
                if y0 < 112:
                    header.append(t)
                    continue
                if y0 > 668:
                    continue
                for w in t.split():
                    toks.append((x0, y0, s["size"], w, s["font"]))
            if len(toks) > 1 and re.fullmatch(r"\d{1,2}", toks[0][3]) and re.fullmatch(r"\d{1,2}\.", toks[1][3]):
                toks = [(toks[0][0], toks[0][1], toks[1][2], toks[0][3] + toks[1][3], toks[1][4])] + toks[2:]
            if not toks:
                continue
            avg = sum(t[2] for t in toks) / len(toks)
            if avg > 11.5:
                continue
            lines.append(toks)
    lines.sort(key=lambda L: (round(L[0][1] / 3), L[0][0]))
    return lines, " ".join(header)


def is_garbage(w):
    letters = sum(ch.isalpha() and ch.isascii() for ch in w)
    bad = sum((not ch.isascii()) and ch not in OK_PUNCT for ch in w)
    weird = sum(ch in "~^|{}<>@#$%*_=\\/" for ch in w) + (1 if re.search(r"\[;|;\]|&[A-Za-z]", w) else 0)
    if bad or weird:
        return True
    if letters == 0 and not re.search(r"[0-9]", w):
        return w.strip("()[].,;:!?'\"-&" + "".join(OK_PUNCT)) != ""
    return False


verses = collections.OrderedDict()
cur = None           # (surah, verse) currently receiving text
surah, expect = 1, 1
# 'verse'  : text feeds the current verse
# 'intro'  : inside a surah introduction (link / summary pages) - ignored
# 'await1' : the English Bismillah was printed, verse 1 comes next
mode = "await1"
log = []
intros = collections.defaultdict(list)  # surah -> introduction lines (link / summary pages)
intro_target = None
MARKER_RE = re.compile(r"ASUMMARYOF|SUMMARYOFTOPICS|SUMMARYOFTHESURAH|THELINKBETWEEN|LINKANDSUMMARY|ABRIEFSUMMARY|BRIEFSUMMARYOF")
BISMILLAH_RE = re.compile(r"^[IlT1|][nr]\s*the\s*na\s*me\s*o\s*f\s*A", re.I)

_ord = [f"{c['id']}:{v}" for c in chapters for v in range(1, c["verses_count"] + 1)]
SAHEEH = {k: re.sub(r"<[^>]+>", "", t["text"]) for k, t in
          zip(_ord, json.load(open(os.path.join(CACHE, "tr_20.json"), encoding="utf-8")))}
STOP = set("the and that who which with from have they them their this those what will your you shall for not are was were".split())


def looks_like(line_tokens, key):
    """Does the start of a candidate verse share content words with the
    Saheeh rendering of that verse? Used where no Bismillah marks the start."""
    cand = {w.lower() for t in line_tokens for w in re.findall(r"[A-Za-z]{4,}", t[3])} - STOP
    ref = {w.lower() for w in re.findall(r"[A-Za-z]{4,}", SAHEEH.get(key, ""))} - STOP
    if len(ref) <= 2:  # disjointed letters etc.: the candidate must be short too
        return len(cand & ref) >= 1 and len(line_tokens) <= 10
    return len(cand & ref) >= 2

for pn in range(FIRST, LAST + 1):
    lines, header = page_lines(doc[pn])
    mh = re.search(r"(\d{1,3})\s*\)", header)
    hdr = int(mh.group(1)) if mh else None
    if hdr is not None and not (1 <= hdr <= 114):
        hdr = None
    for li, L in enumerate(lines):
        first = L[0][3]
        joined = " ".join(t[3] for t in L)
        if re.match(r"^(Juz|JUZ)\b", joined) or "nmusba" in joined:
            continue
        done = expect > COUNT[surah]
        near_done = expect > COUNT[surah] - 2  # tolerate a lost final verse
        singles = sum(1 for t in L if re.fullmatch(r"[A-Z]{1,2}", t[3]))
        spaced_title = len(L) >= 4 and singles >= 0.6 * len(L)  # 'T H E M O R N IN G'
        title_line = re.search(r"Surah\s+\d{1,3}\s+Surah", joined)
        if spaced_title or MARKER_RE.search(joined.replace(" ", "")) or title_line:
            if mode != "intro":
                # the introduction belongs to the surah that comes next
                intro_target = (hdr if hdr and hdr > surah else surah + 1) if (near_done or cur is None) else None
            mode = "intro"
            if intro_target and not spaced_title and not title_line:
                intros[intro_target].append((pn, L[0][0], L[0][1], L[0][2], joined))
            continue
        if BISMILLAH_RE.match(joined) and (near_done or cur is None):
            mode = "await1"
            continue
        m = NUM_RE.match(first)
        g = NUM_GLUED.match(first) if not m else None
        start = None
        if m and not m.group(2):
            if len(L) > 1 and L[1][3] in ('.', ',', ':'):
                L = [L[0]] + L[2:]
            elif L[0][0] > 150 or not m.group(1).isdigit():
                m = None  # bare digits away from the margin: ornament/Arabic OCR noise
        if m or g:
            n = to_int(m.group(1)) if m else int(g.group(1))
            if mode == "verse" and not done and confusable(n, expect) and not (expect <= n <= expect + 6):
                n = expect
            if not done and expect <= n <= expect + 6 and n <= COUNT[surah] and (mode == "verse" or n == expect):
                start = (surah, n)
            elif surah < 114 and 1 <= n <= 3 and (near_done or cur is None):
                nxt = surah + 1 if cur is not None else 1
                if hdr is not None and nxt < hdr <= nxt + 3 and mode == "await1":
                    log.append(f"resync {nxt}->{hdr} p{pn}")
                    nxt = hdr
                header_ok = hdr == nxt
                verified = looks_like(L[1:] + (lines[li + 1] if li + 1 < len(lines) else []), f"{nxt}:{n}")
                if (mode == "await1" or (nxt == 9 and header_ok and mode == "intro")
                        or (mode == "verse" and header_ok and n == 1)
                        or (header_ok and verified)):
                    surah, expect = nxt, 1
                    start = (surah, n)
            if start and start[1] != expect:
                log.append(f"skip {surah}:{expect}->{start[1]} p{pn}")
        if start:
            cur = start
            verses[cur] = []
            expect = start[1] + 1
            mode = "verse"
            rest = L[1:] if m else [(L[0][0], L[0][1], L[0][2], g.group(2), L[0][4])] + L[1:]
            verses[cur].extend(rest)
            continue
        if cur and mode == "verse":
            verses[cur].extend(L)
        elif mode == "intro" and intro_target:
            intros[intro_target].append((pn, L[0][0], L[0][1], L[0][2], joined))


json.dump({str(k): v for k, v in intros.items()}, open(os.path.join(CACHE, "intros_raw.json"), "w", encoding="utf-8"), ensure_ascii=False)
print("intros captured:", len(intros))

# ── recovery: a misread verse number leaves that verse glued to the previous
# one. Look for an OCR-mangled form of the number inside the previous verse
# and split there.
OCR_DIGIT = str.maketrans({"l": "1", "I": "1", "i": "1", "O": "0", "o": "0", "S": "5", "s": "5",
                           "Z": "2", "z": "2", "B": "8", "g": "9", "q": "9", "G": "6", "b": "6", "T": "7"})


def num_like(w, k):
    core = w.strip(".,:;")
    if not core or len(core) > 4 or not w.endswith((".", ",")) and not core.isdigit():
        return False
    core = core.translate(OCR_DIGIT)
    return core == str(k) or (core.isdigit() and confusable(core, k))


recovered = 0
for s in range(1, 115):
    for k in range(2, COUNT[s] + 1):
        if (s, k) in verses:
            continue
        j = k - 1
        while j >= 1 and (s, j) not in verses:
            j -= 1
        if j < 1:
            continue
        toks = verses[(s, j)]
        for idx in range(1, len(toks)):
            if num_like(toks[idx][3], k):
                verses[(s, k)] = toks[idx + 1:]
                verses[(s, j)] = toks[:idx]
                recovered += 1
                break
print("recovered by split:", recovered)

GLUE = re.compile(r"\b(of|the|to|and|in|for|by|from|with|on|is|was|his|their|them|upon|that)([A-Z][a-z])")


def clean(s):
    s = s.replace("AUaah", "Allaah").replace("AIlaah", "Allaah")
    s = re.sub(r"\bo f\b", "of", s)
    s = re.sub(r"\bfo r\b", "for", s)
    s = re.sub(r"\bt o\b", "to", s)
    s = GLUE.sub(r"\1 \2", s)
    if "join_dropcaps" in globals():
        s = join_dropcaps(s)
        # italic '(' and ')' are often read as 'f'/'j': '(fpossessj)' -> '(possess)'
        s = re.sub(r"\((\s*)([A-Za-z']+)", lambda m: "(" + fix_edge(m.group(2), True), s)
        s = re.sub(r"([A-Za-z']+)(\s*)\)", lambda m: fix_edge(m.group(1), False) + ")", s)
        # '( fby the Persians' -> '(by the Persians'
        s = re.sub(r"\(\s?[fjl]([a-z]{2,})\b",
                   lambda m: "(" + m.group(1) if known(m.group(1)) and not CLEAN.get(m.group(0)[1:].strip().lower()) else m.group(0), s)
    s = re.sub(r"\s+([,.;:!?])", r"\1", s)
    s = re.sub(r"\(\s+", "(", s)
    s = re.sub(r"\s+\)", ")", s)
    s = re.sub(r"\s{2,}", " ", s)
    return s.strip()


# ── OCR word repair driven by corpus frequencies ─────────────────────────────
import math

VOCAB = collections.Counter()   # combined frequencies, for scoring splits
CLEAN = collections.Counter()   # Saheeh only: a trustworthy dictionary
for t in json.load(open(os.path.join(CACHE, "tr_20.json"), encoding="utf-8")):
    for w in re.findall(r"[A-Za-z']+", re.sub(r"<[^>]+>", "", t["text"])):
        VOCAB[w.lower()] += 3
        CLEAN[w.lower()] += 1
for toks in verses.values():
    for t in toks:
        for w in re.findall(r"[A-Za-z']+", t[3]):
            VOCAB[w.lower()] += 1
for w in "a i".split():
    VOCAB[w] += 50
TOTAL = sum(VOCAB.values())


def known(w, floor=3):
    """Saheeh vocabulary, or a QME word common enough not to be an OCR slip
    (Allaah, Rasool, Kuffaar ... appear hundreds of times)."""
    lw = w.lower()
    return CLEAN.get(lw, 0) > 0 or VOCAB.get(lw, 0) >= max(floor, 12)


def fix_edge(w, lead):
    if not w or CLEAN.get(w.lower()):
        return w
    cands = []
    if lead and w[0] in "fjlI":
        cands.append(w[1:])
    if not lead and w[-1] in "jflI":
        cands.append(w[:-1])
    if len(w) > 3 and w[0] in "fjl" and w[-1] in "jfl":
        cands.append(w[1:-1])
    for c in cands:
        if len(c) >= 2 and (CLEAN.get(c.lower()) or VOCAB.get(c.lower(), 0) >= 40):
            return c
    return w


def join_dropcaps(s):
    """'M oosa' -> 'Moosa', 'D o not' -> 'Do not' (OCR splits drop capitals)."""
    def fix(m):
        a, b = m.group(1), m.group(2)
        if a in ("A", "I", "O") and known(b):
            return m.group(0)
        if known(a + b) and (not known(b) or len(b) <= 2):
            return a + b
        return m.group(0)
    return re.sub(r"\b([A-Z]) ([a-z]+)\b", fix, s)


def split_glued(word):
    """Segment an unknown run of letters into known words (DP on log-freq)."""
    low = word.lower()
    n = len(low)
    best = [(0.0, [])] + [(-1e9, None)] * n
    for i in range(1, n + 1):
        for j in range(max(0, i - 18), i):
            if j == 0 and i == n:
                continue  # the whole word is what we are trying to split
            piece = low[j:i]
            f = VOCAB.get(piece, 0)
            if not (CLEAN.get(piece) or f >= 40) or (len(piece) == 1 and piece not in ("a", "i")):
                continue
            score = best[j][0] + math.log(f / TOTAL) - 4.0
            if score > best[i][0]:
                best[i] = (score, best[j][1] + [piece])
    parts = best[n][1]
    if not parts or len(parts) < 2:
        return word
    out, k = [], 0
    for p in parts:  # restore original casing
        out.append(word[k:k + len(p)])
        k += len(p)
    return " ".join(out)


def strong(p):
    return CLEAN.get(p.lower(), 0) >= 3 or VOCAB.get(p.lower(), 0) >= 40


def good(c):
    return bool(c) and (CLEAN.get(c.lower()) or VOCAB.get(c.lower(), 0) >= 40)


def repair(w):
    if re.fullmatch(r"\([fjl]", w):
        return "("  # italic '(' misread as '(f'
    # a whole bracketed word read with its brackets as letters: 'fpossessj' -> '(possess)'
    mb = re.fullmatch(r"[fjt]([a-z]{2,})[jfl]([.,;:]?)", w)
    if mb and not CLEAN.get(w.lower()) and good(mb.group(1)):
        return "(" + mb.group(1) + ")" + mb.group(2)
    core0 = re.sub(r"[^A-Za-z]", "", w)
    if len(core0) >= 6 and core0.isalpha() and not CLEAN.get(core0.lower()) and VOCAB.get(core0.lower(), 0) < 40:
        parts = split_glued(core0).split()
        if len(parts) > 1 and all(strong(p) for p in parts):
            return w.replace(core0, " ".join(parts))
    m = re.match(r"^([(\[\"'‘“]*)([A-Za-z']+)([)\].,;:!?\"'’”]*)$", w)
    if not m:
        return w
    pre, core, post = m.groups()
    if known(core) or len(core) < 3:
        return w
    # '(fa' -> '(a', '(fand' -> '(and' : OCR reads the italic '(' as '(f'
    if pre.startswith("(") and core[0] in "fjl" and known(core[1:], 5):
        core = core[1:]
    # 'possessj)' -> 'possess)' : and ')' as 'j)'
    elif post.startswith(")") and core[-1] in "jfl" and known(core[:-1], 5):
        core = core[:-1]
    elif core.isalpha() and len(core) >= 7:
        core = split_glued(core)
    return pre + core + post


PUNCT_ONLY = re.compile(r"^[^\w]+$")


def segment(tokens):
    """Main (0) / context (1). Glyph size decides first (bold ~9pt vs italic
    ~6.5pt); parentheses settle sizes in between and lone punctuation joins
    its neighbour."""
    digital = any("Bookman" in t[4] for t in tokens)
    MAIN, CTX = (7.6, 6.6) if digital else (8.2, 7.5)
    out, depth = [], 0
    for (_, _, size, w, font) in tokens:
        # honorific glyphs OCR'd onto a name: 'Muhammad&M' -> 'Muhammad'
        mg = re.match(r"^([(\[]?[A-Za-z']{3,}[)\].,;:!?]?)[&@#%*^~|{}<>_=\\/!].*$", w)
        if mg and is_garbage(w):
            w = mg.group(1)
        if is_garbage(w):
            continue
        opens, closes = w.count("("), w.count(")")
        if PUNCT_ONLY.match(w):
            kind = None
        elif size >= MAIN and not opens and not (depth and closes):
            kind, depth = 0, 0
        elif size <= CTX or opens or depth:
            kind = 1
        else:
            kind = 0
        depth = max(0, min(3, depth + opens - closes))
        out.append([kind, repair(w)])
    # lone punctuation: ')' closes context, '(' opens it, others follow the left
    for i, (kind, w) in enumerate(out):
        if kind is None:
            if ")" in w:
                out[i][0] = 1
            elif "(" in w:
                out[i][0] = next((k for k, _ in out[i + 1:] if k is not None), 1)
            else:
                out[i][0] = next((out[j][0] for j in range(i - 1, -1, -1) if out[j][0] is not None), 0)
    segs = []
    for kind, w in out:
        if segs and segs[-1][0] == kind:
            segs[-1][1] += " " + w
        else:
            segs.append([kind, w])
    # trailing punctuation after a closing ')' belongs to the sentence, so it
    # survives when context is hidden: '(the Jews),' -> '(the Jews)' + ','
    fixed = []
    for kind, text in segs:
        t = clean(text)
        if not t:
            continue
        if kind == 1:
            mt = re.match(r"^(.*\))([,.;:!?’”'\"\s.]+)$", t, re.S)
            if mt:
                fixed.append([1, mt.group(1).strip()])
                fixed.append([0, mt.group(2).strip()])
                continue
        fixed.append([kind, t])
    res = []
    for kind, t in fixed:
        if res and res[-1][0] == kind:
            res[-1][1] = clean(res[-1][1] + " " + t)
        else:
            res.append([kind, t])
    # context that lost its '(' to a letter: 'taboueHis creation)' -> '(above His creation)'
    for r in res:
        if r[0] == 1 and not r[1].startswith("(") and r[1].endswith(")"):
            t2 = re.sub(r"([a-z])([A-Z])", r"\1 \2", r[1])
            head, _, rest = t2.partition(" ")
            if head[:1] in "ftj":
                inner = head[1:]
                for c in (inner, inner[:-2] + "ve" if inner.endswith("ue") else ""):
                    if good(c):
                        r[1] = "(" + c + (" " + rest if rest else "")
                        break
    # 'In it is fa' + 'means of)' -> 'In it is' + '(a means of)': the '(' was read as 'f'
    for i in range(len(res) - 1):
        if res[i][0] == 0 and res[i + 1][0] == 1 and not res[i + 1][1].startswith("("):
            mf = re.search(r"(?:^|\s)[fj](a|an|the|to|of|in|by|as|is)?$", res[i][1])
            if mf:
                head = res[i][1][: mf.start()].rstrip()
                lead = (mf.group(1) + " ") if mf.group(1) else ""
                if head:
                    res[i][1] = head
                    res[i + 1][1] = "(" + lead + res[i + 1][1]
    return [r for r in res if r[1]]


out, missing = {}, []
for s in range(1, 115):
    for v in range(1, COUNT[s] + 1):
        toks = verses.get((s, v))
        if not toks:
            missing.append(f"{s}:{v}")
            continue
        out[f"{s}:{v}"] = segment(toks)

print("verses:", len(out), "missing:", len(missing))
print("missing by surah:", dict(collections.Counter(k.split(":")[0] for k in missing)))
print("missing:", missing[:120])
print("\n".join(log[:60]))
json.dump(out, open(os.path.join(CACHE, "qme_raw.json"), "w", encoding="utf-8"), ensure_ascii=False)
