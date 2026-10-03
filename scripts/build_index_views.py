"""Data for the index's other views, all from the books and the site's own verified data.

- topics.json: The Clear Quran's THEMATIC INDEX (pages 574-587 of the 'Allah' edition), as
  sections, groups and topics, each topic with its entries and their ayah references.
- collections.json: the supplications, as the same index lists them (by who made them), and the
  fifteen prostration verses it lists; with the ayat themselves, copied from public/data/s.
- themes.json: every surah's theme headings (The Clear Quran), numbered lists completed the way
  the reader shows them (src/lib/data.ts fullHeadings).
"""
import json, os, re
import pymupdf

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")
PDF = os.path.join(ROOT, "..", "The_Clear_Quran_A_Thematic_English_Translation_Allah_edition_--_Dr._Mustafa_Khattab_2017_BC2C0DDB.pdf")
DATA = os.path.join(ROOT, "public", "data")

surahs = json.load(open(os.path.join(DATA, "surahs.json"), encoding="utf-8"))["surahs"]
COUNT = {s["n"]: s["count"] for s in surahs}

# ── the thematic index's text, its lines in reading order ───────────────────
doc = pymupdf.open(PDF)
start = next(p for _, t, p in [(0, *e[1:3]) for e in doc.get_toc()] if t.startswith("THEMATIC INDEX"))
end = next(p for _, t, p in [(0, *e[1:3]) for e in doc.get_toc()] if t.startswith("COMMON QUESTIONS"))
pages = []
for pn in range(start - 1, end - 1):
    ls = []
    for raw in doc[pn].get_text().split("\n"):
        t = raw.replace("\xa0", " ").rstrip()
        if t.strip() in ("ﷺ", "***") or t.startswith("THEMATIC INDEX"):
            continue  # stray marks the page layout leaves, the title
        ls.append(t.strip())
    while ls and not ls[0]:
        ls.pop(0)
    while ls and not ls[-1]:
        ls.pop()
    pages.append(ls)

REF = re.compile(r"(\d{1,3})\s?:\s?(\d{1,3})(?:\s?[-:]\s?(\d{1,3}))?")
# a heading line: a section (۩ ◙ ☼), 'A)', 'a.', '1)', '- ', or a lead-in ending in ':'
HEAD = re.compile(r"^(?:[۩◙☼]|[A-Z]\)\s|[a-z]\.\s|\d\)\s|-\s)")

# paragraphs: a blank line ends one; a heading without references stands alone; a paragraph
# carries on over a page break unless it had ended (a full stop); a line ending in '-' joins the next
paras, cur = [], ""


def flush():
    global cur
    if cur:
        paras.append(cur)
    cur = ""


def join(s):
    global cur
    cur = cur + s if cur.endswith("-") else (cur + " " + s).strip()


for ls in pages:
    if cur and cur.rstrip().endswith("."):
        flush()
    for s in ls:
        if not s:
            flush()
            continue
        head = HEAD.match(s) or (s.endswith(":") and not REF.search(s) and len(s) < 60)
        if head:
            flush()
            if REF.search(s):
                cur = s
            else:
                paras.append(s)
            continue
        join(s)
flush()


def refs_in(text):
    out = []
    for m in REF.finditer(text):
        s, a, b = int(m.group(1)), int(m.group(2)), m.group(3) and int(m.group(3))
        if not (1 <= s <= 114 and 1 <= a <= COUNT[s]):
            continue
        b = min(b, COUNT[s]) if b and b > a else None  # '16:27:33', '28:76:82': ranges printed with a colon
        out.append((m.start(), m.end(), [s, a, b] if b else [s, a]))
    return out


def parts_of(seg):
    """'example in the story of Ezra 2:259, Abraham (ﷺ) 2:260' -> text and references, in order"""
    out, i = [], 0
    for a, b, r in refs_in(seg):
        t = seg[i:a]
        if t.strip(" ,.;"):
            out.append(t.strip(" ;").rstrip(",").lstrip(". "))
        out.append(r)
        i = b
    t = seg[i:].strip(" ,.;")
    if t:
        out.append(t)
    return out


def split_head(lead):
    """the head before its first comma or colon outside brackets; None when there is none"""
    depth = 0
    for i, ch in enumerate(lead):
        depth += ch == "("
        depth -= ch == ")"
        if depth == 0 and ch in ",:":
            return lead[:i], lead[i + 1 :]
    return None


# The index's levels, kept with the book's own markers: a section (۩ DOCTRINE), a group ('A)'),
# a sub-group ('a.' or '-'), a numbered item ('1)'), and the topics under them.
nodes = []  # in order: {kind: section | group | sub | item | topic, title, mark?, entries?}
for p in paras:
    p = re.sub(r"\s+", " ", p).strip()
    if p[0] in "۩◙☼":
        nodes.append({"kind": "section", "title": p.strip("۩◙☼ ").title()})
        continue
    m = re.match(r"^([A-Z])\)\s+(.*)$", p)
    if m and not REF.search(p):
        nodes.append({"kind": "group", "mark": m.group(1) + ")", "title": m.group(2)})
        continue
    mk = re.match(r"^(?:([a-z])\.|(\d)\)|-)\s+", p)
    mark = None if not mk else mk.group(1) + "." if mk.group(1) else mk.group(2) + ")" if mk.group(2) else None
    numbered = bool(mk and mk.group(2))
    p = p[mk.end():] if mk else p
    if not REF.search(p):
        if numbered:
            # a numbered heading heads the topics after it, even one that also points elsewhere
            # ('1) Devotion to the One True Allah, see Allah under Doctrine')
            nodes.append({"kind": "item", "mark": mark, "title": p.rstrip(":")})
            continue
        if ", see " in p or p.lower().endswith("see doctrine"):
            continue  # 'Angels, see Doctrine': a pointer to a topic given already
        nodes.append({"kind": "sub", **({"mark": mark} if mark else {}), "title": p.rstrip(":")})
        continue
    # a topic: 'Head, part refs; part refs' (several parts) or 'Head refs' (one)
    segs = [s for s in re.split(r";\s*", p) if s.strip()]
    first = segs[0]
    lead = first[: REF.search(first).start()] if REF.search(first) else first
    sp = split_head(lead) if len(segs) > 1 or not REF.search(first) else None
    if sp:
        head, rest = sp
        entries = [parts_of(rest + first[len(lead):])] + [parts_of(s) for s in segs[1:]]
    else:
        head = lead
        entries = [parts_of(first[len(lead):])] + [parts_of(s) for s in segs[1:]]
    # "Other stories", "Parables": a list of separate items, none of them the others' head
    if nodes and nodes[-1]["kind"] == "sub" and nodes[-1]["title"] in ("Other stories", "Parables"):
        entries = [parts_of(s) for s in segs]
        head = ""
    # a part that is references alone ('28:7-13') belongs with the part before it
    merged = []
    for e in entries:
        if not e:
            continue
        if merged and all(isinstance(x, list) for x in e):
            merged[-1] += e
        else:
            merged.append(e)
    nodes.append({"kind": "topic", **({"mark": mark} if numbered else {}), "title": head.strip(" ,.:"), "entries": merged})

topics = [n for n in nodes if n["kind"] == "topic"]
print("index paragraphs:", len(paras), "| sections:", sum(n["kind"] == "section" for n in nodes), "| topics:", len(topics),
      "| refs:", sum(isinstance(x, list) for t in topics for e in t["entries"] for x in e))
json.dump({"source": "The Clear Quran, Thematic Index", "nodes": nodes}, open(os.path.join(DATA, "topics.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))

# ── supplications and prostrations, as the index lists them ────────────────
sup = next(t for t in topics if t["title"].startswith("Supplications"))
duas = []
for e in sup["entries"]:
    text = " ".join(x for x in e if isinstance(x, str))
    who = re.sub(r"^of\s+", "", text).replace("(ﷺ)", "").strip()
    duas.append({"who": who, "refs": [x for x in e if isinstance(x, list)]})
print("supplications:", len(duas), "groups;", sum(len(d["refs"]) for d in duas), "references")

# the ayat themselves, from the site's verified data
cache = {}


def verse(s, a):
    if s not in cache:
        cache[s] = {v["n"]: v for v in json.load(open(os.path.join(DATA, "s", f"{s}.json"), encoding="utf-8"))["v"]}
    v = cache[s][a]
    return {k: v[k] for k in ("n", "a", "q", "s", "c", "g", "ip", "sw", "sj", "qg") if k in v}


# the prostrations: where the mushaf the reader shows sets the sign ۩ (the index names the verses
# that speak of prostration, 16:49 and 41:37 among them; the sign closes the passage, 16:50, 41:38)
sajdah = []
for s in range(1, 115):
    for v in json.load(open(os.path.join(DATA, "s", f"{s}.json"), encoding="utf-8"))["v"]:
        if "sw" in v or v.get("sj"):
            sajdah.append([s, v["n"], 0 if v.get("sj") else 1])  # 1: the Madani mushaf only (22:77)
print("prostrations:", len(sajdah), [f"{s}:{a}" for s, a, _ in sajdah])

verses = {}
for r in [r for d in duas for r in d["refs"]]:
    for n in range(r[1], (r[2] if len(r) > 2 else r[1]) + 1):
        verses[f"{r[0]}:{n}"] = verse(r[0], n)
for s, a, _ in sajdah:
    verses[f"{s}:{a}"] = verse(s, a)
# each juz is known by its opening words: the first three of the ayah it begins at
juz_open = {}
for j, ref in json.load(open(os.path.join(DATA, "surahs.json"), encoding="utf-8"))["juz"].items():
    s, a = map(int, ref.split(":"))
    verse(s, a)
    juz_open[j] = " ".join(cache[s][a]["a"][:3])
json.dump({"duas": duas, "sajdah": sajdah, "verses": verses, "juzOpen": juz_open}, open(os.path.join(DATA, "collections.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print("collection verses:", len(verses))


# ── every surah's themes ─────────────────────────────────────────────────────
def full_headings(vs):
    lead, prev, out = None, None, []
    named = lambda s: s if s.endswith(":") else s + ":"
    for v in vs:
        h = v.get("h")
        if not h:
            out.append(None)
            continue
        if re.match(r"^\d+\)", h):
            if re.match(r"^1\)", h) and prev and not re.search(r"\d+\)", prev):
                lead = named(prev)
            out.append(f"{lead} {h}" if lead else h)
            continue
        prev = h
        m = re.match(r"^(.*?\S)\s*\d+\)", h)
        if m:
            lead = named(m.group(1))
        out.append(h)
    return out


themes = {}
for s in range(1, 115):
    vs = json.load(open(os.path.join(DATA, "s", f"{s}.json"), encoding="utf-8"))["v"]
    themes[s] = [[v["n"], h] for v, h in zip(vs, full_headings(vs)) if h]
json.dump(themes, open(os.path.join(DATA, "themes.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print("themes:", sum(len(t) for t in themes.values()))
for f in ("topics.json", "collections.json", "themes.json"):
    print(f, round(os.path.getsize(os.path.join(DATA, f)) / 1024), "KB")
