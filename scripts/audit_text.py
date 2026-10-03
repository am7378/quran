"""Audit translation text for OCR slips: unknown words, split words
('A llaah'), glued words, spacing around punctuation. Prints a report."""
import json, os, re, collections, sys

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, ".cache")

chapters = json.load(open(os.path.join(CACHE, "chapters.json"), encoding="utf-8"))
ORDER = [f"{c['id']}:{v}" for c in chapters for v in range(1, c["verses_count"] + 1)]
REF = [re.sub(r"<[^>]+>", "", t["text"]) for t in json.load(open(os.path.join(CACHE, "tr_20.json"), encoding="utf-8"))]

CLEAN = collections.Counter()
for t in REF:
    for w in re.findall(r"[A-Za-zāīūḥṣḍṭẓ']+", t):
        CLEAN[w.lower().strip("'")] += 1

which = sys.argv[1] if len(sys.argv) > 1 else "qme"
if which.startswith("built-"):
    field = {"built-qme": "q", "built-saheeh": "s", "built-clear": "c"}[which]
    texts = {}
    for n in range(1, 115):
        d = json.load(open(os.path.join(HERE, "..", "public", "data", "s", f"{n}.json"), encoding="utf-8"))
        for v in d["v"]:
            val = v.get(field)
            if val:
                texts[f"{n}:{v['n']}"] = " ".join(s for _, s in val) if field == "q" else val
elif which == "qme":
    data = json.load(open(os.path.join(CACHE, "qme_raw.json"), encoding="utf-8"))
    texts = {k: " ".join(s for _, s in v) for k, v in data.items()}
elif which == "saheeh":
    texts = json.load(open(os.path.join(CACHE, "saheeh_pdf.json"), encoding="utf-8"))
else:
    texts = json.load(open(os.path.join(CACHE, "clear.json"), encoding="utf-8"))

freq = collections.Counter()
where = collections.defaultdict(list)
for k, t in texts.items():
    for w in re.findall(r"[A-Za-z']+", t):
        lw = w.lower().strip("'")
        freq[lw] += 1
        if len(where[lw]) < 3:
            where[lw].append(k)

unknown = [(w, n) for w, n in freq.items() if not CLEAN.get(w) and n <= 2 and len(w) >= 3]
print(f"{which}: {len(freq)} distinct words, {len(unknown)} rare unknown")
print("sample rare unknown:", ", ".join(f"{w}({','.join(where[w][:1])})" for w, _ in sorted(unknown)[:400:4]))

# split words: single letter + fragment that joins into a frequent word
splits = collections.Counter()
for k, t in texts.items():
    for m in re.finditer(r"\b([A-Za-z]) ([a-z]{2,})\b", t):
        a, b = m.groups()
        if a.lower() in ("a", "i", "o") and CLEAN.get(b.lower()):
            continue
        joined = (a + b).lower()
        if CLEAN.get(joined) or freq[joined] >= 5:
            splits[f"{a} {b}"] += 1
print("split words:", splits.most_common(40))

spacing = collections.Counter()
for k, t in texts.items():
    for pat, name in [(r"\s[,.;:!?]", "space-before-punct"), (r"[a-z][,.;:!?][A-Za-z]", "no-space-after-punct"),
                      (r"\s{2,}", "double-space"), (r"\(\s", "space-after-("), (r"\s\)", "space-before-)"),
                      (r"[a-z][A-Z][a-z]", "camel-glue"), (r"\b(of|the|to|and|in)(?=[A-Z])", "glued-function-word")]:
        for m in re.finditer(pat, t):
            spacing[name] += 1
            if spacing[name] <= 3:
                print(f"  {name} @ {k}: …{t[max(0, m.start() - 25):m.end() + 25]}…")
print("spacing:", dict(spacing))
