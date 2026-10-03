"""Every change between the Quraan Made Easy text the site had (the scan copy) and the text now checked
against the print, word by word, sorted into kinds, for the review page."""
import json, os, re, difflib, collections
import merge_qme as M

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, ".cache")


def words(segs):
    return " ".join(t for _, t in segs).split()


def letters(ws):
    return re.sub(r"[^a-z0-9]", "", " ".join(ws).lower().replace("’", "'").replace("'", ""))


def kind(a, b):
    A, B = " ".join(a), " ".join(b)
    if not a:
        return "added"
    if not b:
        return "removed"
    strip_marks = lambda s: re.sub(r"[ﷺ﵊﵁﵂﵃]", "", s)
    if letters(a) == letters(b):
        if re.sub(r"[^ﷺ﵊﵁﵂﵃]", "", A) != re.sub(r"[^ﷺ﵊﵁﵂﵃]", "", B):
            return "honorific"
        if A.replace(" ", "") == B.replace(" ", ""):
            return "spacing"
        if strip_marks(A).lower() == strip_marks(B).lower():
            return "case"
        if re.sub(r"[^A-Za-z0-9 ]", "", A).split() == re.sub(r"[^A-Za-z0-9 ]", "", B).split():
            return "punctuation"
        return "spacing"
    if re.sub(r"[^ﷺ﵊﵁﵂﵃]", "", A) != re.sub(r"[^ﷺ﵊﵁﵂﵃]", "", B) and letters([strip_marks(x) for x in a]) == letters([strip_marks(x) for x in b]):
        return "honorific"
    return "word"


def main():
    B = json.load(open(os.path.join(CACHE, "qme_scan_b.json"), encoding="utf-8"))
    old = {k: B.pop(k) for k in [f"1:{i}" for i in range(1, 8)] if k in B}
    for i in range(1, 6):
        if f"1:{i}" in old:
            B[f"1:{i + 1}"] = old[f"1:{i}"]
    B["1:7"] = old.get("1:6", []) + old.get("1:7", [])
    S = json.load(open(os.path.join(CACHE, "qme_final.json"), encoding="utf-8"))
    fixes = json.load(open(os.path.join(CACHE, "qme_fix_log.json"), encoding="utf-8"))
    recut = json.load(open(os.path.join(CACHE, "qme_recut.json"), encoding="utf-8"))
    D = json.load(open(os.path.join(CACHE, "qme_decisions.json"), encoding="utf-8"))
    changes = []
    counts = collections.Counter()
    gap = {"32:13", "32:14", "32:15", "32:16", "32:17", "32:18"}
    keys = sorted(set(S) | set(B) | gap, key=lambda k: tuple(map(int, k.split(":"))))
    for k in keys:
        if k in gap:
            changes.append({"k": k, "t": "missing", "a": " ".join(words(B.get(k, [])))[:400], "b": "", "c": "The page is damaged in every copy of the book (its black text is lost); Saheeh International is shown."})
            counts["missing"] += 1
            continue
        a, b = words(B.get(k, [])), words(S.get(k, []))
        for op, i1, i2, j1, j2 in difflib.SequenceMatcher(None, a, b, autojunk=False).get_opcodes():
            if op == "equal":
                continue
            t = kind(a[i1:i2], b[j1:j2])
            if t in ("added", "removed") and re.fullmatch(r"[ﷺ﵊﵁﵂﵃][)\]\.,;:!?”\"]*", " ".join(a[i1:i2] or b[j1:j2])):
                t = "honorific"
            ctx_before = " ".join(b[max(0, j1 - 5):j1])
            ctx_after = " ".join(b[j2:j2 + 5])
            changes.append({"k": k, "t": t, "a": " ".join(a[i1:i2]), "b": " ".join(b[j1:j2]), "x": [ctx_before, ctx_after]})
            counts[t] += 1
    # the notes that go with the changes decided by looking at the print
    notes = []
    for f in fixes:
        if not f.get("unapplied"):
            notes.append({"k": f["key"], "from": f["from"], "to": f["to"], "why": f["note"]})
    for k, ds in D.items():
        for d in ds:
            box = (d.get("boxes") or [None])[0]
            if d["op"] == "misprint":
                notes.append({"k": k, "from": d["a"], "to": d["to"], "why": d["why"], "box": box})
            elif d.get("why") == "a misprint in the book, corrected":
                notes.append({"k": k, "from": d["a"], "to": d["b"], "why": "the book prints '" + d["a"] + "'; the Complete edition prints it correctly", "box": box})
            elif d.get("why") == "decided by looking at the print" and isinstance(d.get("pick"), str):
                notes.append({"k": k, "from": d["a"], "to": d["pick"] if d["pick"] not in ("A", "B") else (d["a"] if d["pick"] == "A" else d["b"]), "why": "decided by looking at the print", "box": box})
    punct = json.load(open(os.path.join(CACHE, "mark_punct.json"), encoding="utf-8"))
    punct_added = sum(1 for r in punct if r.get("now"))
    out = {"counts": counts, "changes": changes, "notes": notes, "recut": recut, "punct_added": punct_added,
           "verses": len(S)}
    json.dump(out, open(os.path.join(CACHE, "change_report.json"), "w", encoding="utf-8"), ensure_ascii=False)
    print(dict(counts), len(changes), "notes", len(notes), "recut", len(recut))


if __name__ == "__main__":
    main()
