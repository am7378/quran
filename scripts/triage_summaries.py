"""The print-against-scan differences of the summaries (diff_summaries.py), with the scan's own
misreadings set aside: what is left is where the print's reading may be wrong (or the scan saw
something the print reading lost)."""
import json, os, re, sys
import textfix
import merge_qme as M

HERE = os.path.dirname(os.path.abspath(__file__))
qme = json.load(open(os.path.join(HERE, ".cache", "qme_raw.json"), encoding="utf-8"))
textfix.prime([s for v in qme.values() for _, s in v])
textfix.add_corpus(s for v in qme.values() for _, s in v)
M.load_corpus()
diffs = json.load(open(os.path.join(HERE, ".cache", "summary_diff.json"), encoding="utf-8"))

HON = re.compile(r"^(?:[A-Z]{1,3}|Di|Oi|Z\)?'?iE|\d{2,3}[A-Z]?|[a-z]{1,2})$")


def good(w):
    return M.known(w) or M.in_dictionary(w)


keep = []
for d in diffs:
    p, s = d["print"].split(), d["scan"].split()
    if d["op"] == "insert" and all(re.fullmatch(r"\d+|\d+ to \d+", x) for x in s):
        continue  # list numbers the print reading made into an ordered list
    if d["op"] == "replace" and len(p) == len(s) and all(good(a) and not good(b) for a, b in zip(p, s)):
        continue  # the scan misread a word the print has right ('fhose')
    if d["spacing"] and all(good(a) for a in p):
        continue  # the scan ran words together, the print parts them
    if d["op"] == "delete" and all(good(a) for a in p) and len(p) >= 4:
        continue  # the scan lost a line the print has
    if d["op"] == "replace" and all(good(a) for a in p) and re.fullmatch(r"[\W\d_lI|]*", " ".join(s)):
        continue
    kind = "honorific?" if all(HON.match(x) for x in p) and p else "lost?" if d["op"] == "insert" else "word?"
    keep.append({**d, "kind": kind})

json.dump(keep, open(os.path.join(HERE, ".cache", "summary_triage.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(len(keep), "to look at")
for d in keep[: int(sys.argv[1]) if len(sys.argv) > 1 else 500]:
    print(f"{d['s']:>3} {d['kind']:<10} P:{d['print'][:36]!r:<38} S:{d['scan'][:30]!r:<32} | {d['ctx'][:120]}")
