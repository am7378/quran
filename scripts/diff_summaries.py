"""The summaries as built (from the clean print) against the scan copy's reading of the same pages
(.cache/intros_raw.json, an independent OCR): every place the two disagree, word for word, with the
print's page and line position so it can be looked at (crops.py). Writes .cache/summary_diff.json."""
import difflib, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
built = json.load(open(os.path.join(HERE, "..", "public", "data", "summaries.json"), encoding="utf-8"))
scan = json.load(open(os.path.join(HERE, ".cache", "intros_raw.json"), encoding="utf-8"))
big = json.load(open(os.path.join(HERE, ".cache", "big_intros.json"), encoding="utf-8"))


def words(t):
    t = t.replace("’", "'").replace("‘", "'")
    return [w for w in re.findall(r"[A-Za-z0-9][A-Za-z0-9']*", t)]


def norm(w):
    return w.lower().strip("'")


def built_text(secs):
    out = []
    for s in secs:
        out.append(s["title"])
        for b in s["blocks"]:
            out += [b["text"]] if b["type"] == "p" else b["items"]
    return " ".join(out)


def locate(k, w):
    """where the print sets a word (its first line holding it)"""
    for line in big.get(k, []):
        for x in line:
            if norm(x["t"].strip(".,;:!?\"'()")) == norm(w):
                return [x["page"], x["x"], x["y"]]
    return None


diffs = []
for k in sorted(built, key=int):
    a = words(built_text(built[k]))
    b = words(" ".join(l[4] for l in scan.get(k, [])))
    if not b:
        continue
    sm = difflib.SequenceMatcher(a=[norm(w) for w in a], b=[norm(w) for w in b], autojunk=False)
    for op, i1, i2, j1, j2 in sm.get_opcodes():
        if op == "equal":
            continue
        pa, pb = " ".join(a[i1:i2]), " ".join(b[j1:j2])
        # the same letters, parted or joined differently ('Kahafbegins' / 'Kahaf begins')
        same_letters = re.sub(r"\W", "", pa.lower()) == re.sub(r"\W", "", pb.lower())
        diffs.append({
            "s": k, "op": op, "print": pa, "scan": pb, "spacing": same_letters,
            "ctx": " ".join(a[max(0, i1 - 6):i1]) + " [[" + pa + "]] " + " ".join(a[i2:i2 + 6]),
            "at": locate(k, a[i1]) if i1 < len(a) else None,
        })

json.dump(diffs, open(os.path.join(HERE, ".cache", "summary_diff.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(len(diffs), "differences in", len({d["s"] for d in diffs}), "surahs;", sum(d["spacing"] for d in diffs), "only spacing")
limit = int(sys.argv[1]) if len(sys.argv) > 1 else 60
for d in diffs[:limit]:
    print(f"{d['s']:>3} {d['op']:<7} P:{d['print'][:40]!r:<42} S:{d['scan'][:40]!r:<42} | {d['ctx'][:110]}")
