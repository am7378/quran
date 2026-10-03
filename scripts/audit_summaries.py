"""Every word of the surah summaries (public/data/summaries.json) checked the way the translation's
are: a word the English dictionary, the Quraan Made Easy text and its glossary don't know, a case
the print wouldn't set ('oyaJb'), a list item with no word of English in it, or punctuation in a
place it can't be. Writes .cache/summary_suspects.json (surah, where, word, context) for checking
against the print."""
import json, os, re, sys
import textfix
import merge_qme as M

HERE = os.path.dirname(os.path.abspath(__file__))
data = json.load(open(os.path.join(HERE, "..", "public", "data", "summaries.json"), encoding="utf-8"))
qme = json.load(open(os.path.join(HERE, ".cache", "qme_raw.json"), encoding="utf-8"))
textfix.prime([s for v in qme.values() for _, s in v])
textfix.add_corpus(s for v in qme.values() for _, s in v)
M.load_corpus()

# names of the surahs (as the summaries spell them) and of the people they speak of
NAMES = set()
for s in json.load(open(os.path.join(HERE, "..", "public", "data", "surahs.json"), encoding="utf-8"))["surahs"]:
    for part in re.findall(r"[A-Za-z']+", s["tr"] + " " + s["tc"]):
        NAMES.add(M.norm(part))


# how often each word comes in all the summaries: the book spells its names and terms the same way
# each time, so a word that comes again and again is the book's own ('Baqara', 'Towheed')
SEEN = {}
for secs in data.values():
    for s in secs:
        for t in [s["title"]] + [b.get("text", "") for b in s["blocks"]] + [i for b in s["blocks"] for i in b.get("items", [])]:
            for w in re.findall(r"[A-Za-z][A-Za-z'’-]*", t):
                SEEN[M.norm(w)] = SEEN.get(M.norm(w), 0) + 1


def glued(w):
    """two known words run together ('A'raafdiscusses')"""
    n = M.norm(w)
    return len(n) >= 7 and not M.in_dictionary(w) and any(
        SEEN.get(n[:i], 0) >= 2 and (M.in_dictionary(n[i:]) or SEEN.get(n[i:], 0) >= 2) and len(n[i:]) >= 3 for i in range(3, len(n) - 2))


def ok(w):
    n = M.norm(w)
    if not n or n in NAMES:
        return True
    if glued(w):
        return False
    return M.known(w) or M.in_dictionary(w) or SEEN.get(n, 0) >= 2


def odd_case(w):
    core = re.sub(r"['’-]", "", w)
    if len(core) < 2 or core.isupper() or core.islower() or (core[0].isupper() and core[1:].islower()):
        return False
    return True  # 'oyaJb', 'tHe'


suspects = []
for k, secs in data.items():
    for si, s in enumerate(secs):
        texts = [("title", s["title"])]
        for bi, b in enumerate(s["blocks"]):
            if b["type"] == "p":
                texts.append((f"p{bi}", b["text"]))
            else:
                texts += [(f"{b['type']}{bi}.{ii}", it) for ii, it in enumerate(b["items"])]
        for where, t in texts:
            words = re.findall(r"[A-Za-z][A-Za-z'’-]*", t)
            if where != "title" and words and not any(M.in_dictionary(w) or M.norm(w) in NAMES for w in words):
                suspects.append({"s": k, "sec": si, "at": where, "word": t, "why": "no English in it", "ctx": t[:120]})
                continue
            for m in re.finditer(r"[A-Za-z][A-Za-z'’-]*", t):
                w = m.group(0).strip("'’-")
                why = "case" if odd_case(w) else "glued" if glued(w) else None if ok(w) else "unknown"
                if why:
                    a, b = max(0, m.start() - 50), min(len(t), m.end() + 50)
                    suspects.append({"s": k, "sec": si, "at": where, "word": w, "why": why, "ctx": t[a:b]})
            for m in re.finditer(r"\s[,.;:!?]|[,;:]{2,}|\(\s*\)|\s'\s", t):
                a, b = max(0, m.start() - 40), min(len(t), m.end() + 40)
                suspects.append({"s": k, "sec": si, "at": where, "word": m.group(0), "why": "punctuation", "ctx": t[a:b]})

json.dump(suspects, open(os.path.join(HERE, ".cache", "summary_suspects.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(len(suspects), "suspects in", len({x["s"] for x in suspects}), "surahs")
by = {}
for x in suspects:
    by.setdefault(x["why"], []).append(x)
for why, xs in by.items():
    print(f"== {why}: {len(xs)}")
    for x in xs[: int(sys.argv[1]) if len(sys.argv) > 1 else 400]:
        print(f"  {x['s']:>3} {x['at']:<8} {x['word'][:40]!r:<30} | {x['ctx']}")
