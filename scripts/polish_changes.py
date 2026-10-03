"""Every word the summaries' clean-up (build_summaries.clean_print -> merge_qme.polish) changed from
the print's own reading: the print read 'Muhammadur', the clean-up made it 'Muhammad ﷺ'. Lists them
for checking (summary_crops.py)."""
import difflib, json, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
big = json.load(open(os.path.join(HERE, ".cache", "big_intros.json"), encoding="utf-8"))
built = json.load(open(os.path.join(HERE, "..", "public", "data", "summaries.json"), encoding="utf-8"))
MARKS = "ﷺ﵊﵁﵂﵃"


def toks(t):
    return [w for w in re.findall(r"[A-Za-z0-9'’]+", t.replace("’", "'"))]


seen = {}
for k, lines in big.items():
    if k not in built:
        continue
    a = toks(" ".join(w["t"] for line in lines for w in line if not w.get("g")))
    texts = []
    for s in built[k]:
        texts.append(s["title"])
        for b in s["blocks"]:
            texts += [b["text"]] if b["type"] == "p" else b["items"]
    b = toks(" ".join(texts))
    sm = difflib.SequenceMatcher(a=[x.lower() for x in a], b=[x.lower() for x in b], autojunk=False)
    for op, i1, i2, j1, j2 in sm.get_opcodes():
        if op != "replace":
            continue
        pa, pb = " ".join(a[i1:i2]), " ".join(b[j1:j2])
        if re.sub(r"\W", "", pa.lower()) == re.sub(r"\W", "", pb.lower()):
            kind = "split/joined"
        else:
            kind = "changed"
        key = (pa, pb)
        if key in seen:
            seen[key]["n"] += 1
            continue
        seen[key] = {"s": k, "kind": kind, "print": pa, "built": pb, "n": 1}

rows = sorted(seen.values(), key=lambda r: (r["kind"], int(r["s"])))
json.dump(rows, open(os.path.join(HERE, ".cache", "polish_changes.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(len(rows), "distinct changes")
for r in rows:
    print(f"{r['s']:>3} {r['kind']:<13} x{r['n']:<2} {r['print'][:40]!r:<44} -> {r['built'][:40]!r}")
