"""The 'Glossary of Terms and Names' of Quraan Made Easy (pages 42-57 of
Quraan-Made-Easy-Complete.pdf, which is typeset text there, not a scan), as
public/data/glossary.json: {lower-case word: {term, text}}.

Every entry keeps the book's own definition. Plurals given in an entry
('Kaafir (plural Kaafiroon or Kuffaar)') point to it; 'see X' entries take
X's definition. Only words that are not ordinary English are glossed in the
text (so 'Manna' is, 'Battle' is not).
"""
import collections, json, os, re
import pymupdf

HERE = os.path.dirname(os.path.abspath(__file__))
PDF = os.path.join(HERE, "..", "..", "Quraan-Made-Easy-Complete.pdf")
OUT = os.path.join(HERE, "..", "public", "data", "glossary.json")
CACHE = os.path.join(HERE, ".cache")

# the few slips in that text, checked against the printed page
FIXES = [("A1laah", "Allaah"), ("lnjeel", "Injeel"), ("Sahabah(RA)", "Sahabah (RA)"), ("Alahyis", "Alayhis"),
         ("reorganisedthemselves", "reorganised themselves"), ("dose to Madinah", "close to Madinah"),
         ("Kuffaar r:", "Kuffaar:"), ("Uthmaaniby", "Uthmaani by"), ("lmaan", "Imaan")]


def page_text():
    doc = pymupdf.open(PDF)
    lines = []
    started = False
    for pn in range(40, 57):
        for ln in doc[pn].get_text().split("\n"):
            s = ln.strip()
            if not started:
                if s.startswith("Glossary of Terms and Names"):
                    started = True
                continue
            if s.startswith("Quraan Made Easy (Complete)"):
                return lines
            lines.append(s)
    return lines


ENTRY = re.compile(r"^([A-Z][A-Za-z'’.\-]*(?: [A-Za-z'’.\-]+){0,4}?)\s*((?:\([^)]*\)\s*)*):\s*(.*)$")


def main():
    lines = [l for l in page_text() if l and not re.fullmatch(r"[A-Z]", l) and not l.startswith("NOTE:") and "Refer to the Ulema" not in l and "understanding of the Qur'aanic verses" not in l]
    # justified lines broken into one word per line ('Kaafir', '(plural', 'Kaafiroon', 'or', 'Kuffaar): Commonly')
    merged = []
    for l in lines:
        prev = merged[-1] if merged else ""
        before = merged[-2] if len(merged) > 1 else "."
        # a heading still being assembled (after a finished definition): short, no colon yet, or a bracket left open
        heading = re.search(r"[.)'’”]\s*$", before) and prev[:1].isupper()
        if merged and heading and ":" not in prev and not prev.endswith(".") and (len(prev.split()) <= 6 or prev.count("(") > prev.count(")")):
            merged[-1] += " " + l
        else:
            merged.append(l)
    entries = []
    for l in merged:
        for a, b in FIXES:
            l = l.replace(a, b)
        m = ENTRY.match(l)
        # a new entry: 'Term (…): Definition' — the definition starts with a capital, 'see', a bracket or a quote
        starts = m and re.match(r"^(?:[A-Z(\"'‘]|see |feminine |synonym )", m.group(3).strip() or "X")
        if starts:
            entries.append({"head": m.group(1).strip(), "paren": m.group(2).strip(), "text": m.group(3).strip()})
        elif entries:
            entries[-1]["text"] += " " + l
    for e in entries:
        e["text"] = re.sub(r"\s+", " ", e["text"]).strip()
        e["text"] = re.sub(r"\s+([.,;:)])", r"\1", e["text"])
    by = {}
    for e in entries:
        by[e["head"].lower()] = e
    # a first word shared by several terms ('Dhul' Hijjah / Qa'dah / Kifl / Qarnayn) cannot stand for one of them
    firsts = collections.Counter(e["head"].split()[0].lower() for e in entries if len(e["head"].split()) > 1)
    single = {e["head"].lower() for e in entries if len(e["head"].split()) == 1}
    out = {}
    for e in entries:
        text = e["text"]
        see = re.match(r"^(?:synonym of \w+, )?see ([A-Z][^.]*?)\.?$", text)
        if see:
            tgt = by.get(see.group(1).strip().lower())
            if not tgt:
                continue
            term, text = tgt["head"], tgt["text"]
            if re.match(r"^see ", text):
                continue
        else:
            term = e["head"]
        names = [e["head"]]
        pl = re.search(r"plural ([^)]*)", e["paren"])
        if pl:
            names += [p.strip() for p in re.split(r",| or ", pl.group(1)) if p.strip()]
        also = re.search(r"also referred to as ([^)]*)", e["paren"])
        if also:
            names.append(also.group(1).strip())
        for nm in names:
            words = nm.split()
            key = words[0] if len(words) > 1 else nm
            # multi-word terms: glossed on their distinctive first word when it is not English ('Ahlul', 'Laylatul')
            if len(words) > 1 and (key.lower() in ENGLISH or firsts[key.lower()] > 1 or key.lower() in single):
                continue
            k = key.lower().strip(".")
            if not k or k in ENGLISH or k in out:
                continue
            out[k] = {"term": term if len(words) == 1 or nm == term else nm, "text": text}
    # the honorifics have their own marks in the text; abbreviations are not words of the text
    for k in ("alayhis", "sallallaahu", "ra", "a.h", "ra."):
        out.pop(k, None)
    # first words of a name that other names share ('Abu' Bakr / Jahl, 'Bani' Israa'eel / Qurayzah,
    # 'Masjidul' Haraam / Aqsa): never glossed alone
    for k in ("abu", "bani", "valley", "abdullaah", "jannatul", "masjidul", "maqaam", "uthmaan"):
        out.pop(k, None)
    # words on nearly every line keep their meaning on hover but without the dotted underline
    for k in ("allaah", "surah", "rasulullaah"):
        if k in out:
            out[k] = dict(out[k], quiet=1)
    # the glossary's spelling may differ from the translation's ('Yoosuf' / 'Yusuf', 'Sahaabah' / 'Sahabah')
    vocab = collections.Counter()
    final = json.load(open(os.path.join(CACHE, "qme_final.json"), encoding="utf-8"))
    for segs in final.values():
        for _, t in segs:
            for w in re.findall(r"[A-Za-z][A-Za-z'’]*", t):
                vocab[w.lower().replace("’", "'")] += 1
    for k in list(out):
        if vocab[k] >= 1:
            continue
        for v in {k.replace("oo", "u"), k.replace("aa", "a", 1), k.replace("ee", "i"), k.replace("au", "ow"),
                  k.replace("aa", "a"), k.replace("oo", "u").replace("ee", "i")}:
            if v != k and vocab[v] >= 2 and v not in out:
                out[v] = out[k]
    # the translation spells a term more than one way ('Aaliha' / 'Aalihah', 'Kabah' / "Ka'bah",
    # 'Qiyaamat' / 'Qiyaamah', 'Ibrahim' / 'Ibraheem'): the same entry, found by a loose spelling
    def loose(w):
        w = w.lower().replace("'", "").replace("’", "")
        w = re.sub(r"(?<=a)t$", "h", w)
        w = re.sub(r"h$", "", w)
        w = w.replace("ee", "i").replace("oo", "u").replace("aa", "a").replace("ow", "au").replace("ii", "i")
        return w
    by_loose = collections.defaultdict(set)
    for k in out:
        by_loose[loose(k)].add(k)
    mapped = {}
    for w, n in vocab.items():
        if w in out or w in ENGLISH or len(w) < 4:
            continue
        ks = by_loose.get(loose(w), set())
        if len(ks) == 1:
            mapped[w] = next(iter(ks))
    for w, k in mapped.items():
        out[w] = out[k]
    print("spellings mapped to an entry:", sorted(mapped.items()))
    json.dump(out, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
    missing = sorted(k for k in out if vocab[k] == 0)
    print("glossed words that never occur in the translation:", missing)
    json.dump(entries, open(os.path.join(CACHE, "glossary_entries.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("entries:", len(entries), "| glossed words:", len(out))


# ordinary English words never glossed even when the glossary has them
ENGLISH = set("""a battle bridge children conquest day days hypocrite manna night people period plain pledge sacred
treaty trench virgin muslim muslims prophet book god the of""".split())

if __name__ == "__main__":
    main()
