"""Extract Saheeh International from the provided PDF (quranproject.org
edition, two-column layout). Verse text is set at 11pt; introductions,
footnotes and superscript markers are smaller and get dropped by size."""
import json, os, re, difflib, collections
import pymupdf

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, ".cache")
PDF = os.path.join(HERE, "..", "..", "Quran - Saheeh International Translation.pdf")

chapters = json.load(open(os.path.join(CACHE, "chapters.json"), encoding="utf-8"))
COUNT = {c["id"]: c["verses_count"] for c in chapters}
ORDER = [f"{c['id']}:{v}" for c in chapters for v in range(1, c["verses_count"] + 1)]
REF = {k: re.sub(r"<sup[^>]*>.*?</sup>|<[^>]+>", "", t["text"]).strip()
       for k, t in zip(ORDER, json.load(open(os.path.join(CACHE, "tr_20.json"), encoding="utf-8")))}

doc = pymupdf.open(PDF)
W = doc[40].rect.width
NUM = re.compile(r"^(\d{1,3})\.(?:\s+(.*))?$")

verses = collections.OrderedDict()
cur, surah, expect = None, 1, 1
started = False
stopped = False

for pn in range(doc.page_count):
    page = doc[pn]
    rows = []
    hdr = None
    for b in page.get_text("dict")["blocks"]:
        for l in b.get("lines", []):
            spans = [s for s in l["spans"] if 10.6 <= s["size"] <= 11.4 and s["text"].strip()]
            if not spans:
                continue
            x0, y0 = spans[0]["bbox"][0], spans[0]["bbox"][1]
            if y0 < 65:  # running header: 'Sūrah 2: al-Baqarah ... 2: The Cow'
                mh = re.search(r"rah\s+(\d{1,3}):", "".join(s["text"] for s in l["spans"]))
                if mh:
                    hdr = int(mh.group(1))
                continue
            text = "".join(s["text"] for s in spans)
            rows.append((0 if x0 < W / 2 else 1, y0, x0, text))
    rows.sort(key=lambda r: (r[0], r[1], r[2]))
    for col, y, x, text in rows:
        t = text.strip()
        m = NUM.match(t)
        if m:
            n = int(m.group(1))
            if started and expect <= COUNT[surah] and expect <= n <= min(expect + 3, COUNT[surah]):
                cur = (surah, n)
            elif n == 1 and surah < 114 and (not started or expect > COUNT[surah] - 1 or (hdr and hdr > surah)):
                if started:
                    surah = hdr if hdr and hdr > surah else surah + 1
                started = True
                cur = (surah, 1)
            else:
                m = None
            if m:
                verses[cur] = [m.group(2)] if m.group(2) else []
                expect = cur[1] + 1
                stopped = False
                continue
        if re.match(r"^S\S?\s?rah\s+\d{1,3}:", t):
            stopped = True  # title of the next surah: its introduction follows
            continue
        if re.match(r"^In the Name of God", t, re.I) and expect > COUNT[surah]:
            continue  # Bismillah heading of the next surah
        if cur and not stopped and not (cur[0] == 114 and expect > COUNT[114] and hdr != 114):
            verses[cur].append(t)


def join_lines(lines, ref):
    out = ""
    for ln in lines:
        ln = ln.strip()
        if not out:
            out = ln
            continue
        if re.search(r"[A-Za-z]-$", out):
            head = re.findall(r"([A-Za-z]+)-$", out)[0]
            tail = re.match(r"^([A-Za-z]+)", ln)
            tail = tail.group(1) if tail else ""
            ref_low = ref.lower()
            if f"{head}-{tail}".lower() in ref_low and f"{head}{tail}".lower() not in ref_low:
                out = out + ln          # genuine compound, keep the hyphen
            else:
                out = out[:-1] + ln     # soft line-break hyphen
        else:
            out = out + " " + ln
    out = re.sub(r"\s+", " ", out)
    out = re.sub(r"\s+([,.;:!?’”])", r"\1", out)
    return out.strip()


def godify(s):
    return s.replace("Allāh", "God").replace("Allah", "God")


def norm(s):
    return re.sub(r"[^a-z ]", "", godify(s).lower())


# vocabulary of the reference text, to repair words the PDF glued together
VOC = collections.Counter(w.lower() for t in REF.values() for w in re.findall(r"[A-Za-zāīūḥṣḍṭẓʿ']+", godify(t)))


def unglue(text):
    def fix(m):
        w = m.group(0)
        if VOC.get(w.lower()) or len(w) < 5:
            return w
        for i in range(2, len(w) - 1):
            a, b = w[:i], w[i:]
            if VOC.get(a.lower(), 0) > 20 and VOC.get(b.lower(), 0) > 2:
                return a + " " + b
        return w
    return re.sub(r"[A-Za-z]+", fix, text)


# split verses whose following number was glued into the text ('101.Say')
for s in range(1, 115):
    for v in range(1, COUNT[s]):
        if (s, v) in verses and (s, v + 1) not in verses:
            joined = " ".join(verses[(s, v)])
            mm = re.search(rf"(?:^|\s){v + 1}\.?\s?(?=[A-Z“\[‘])", joined)
            if mm:
                verses[(s, v)] = [joined[:mm.start()]]
                rest = joined[mm.end():]
                verses[(s, v + 1)] = [rest]

out, low = {}, []
for k in ORDER:
    s, v = map(int, k.split(":"))
    lines = verses.get((s, v))
    if not lines:
        low.append((0.0, k))
        continue
    text = unglue(join_lines(lines, godify(REF[k])))
    text = re.sub(r"\s*S\S?rah\s+\d{1,3}\b.*$", "", text)
    if text.endswith("the Most Merciful") and not godify(REF[k]).rstrip(".”\"").endswith("Merciful"):
        text = text[: -len("the Most Merciful")].rstrip()
    out[k] = text
    r = difflib.SequenceMatcher(None, norm(text), norm(REF[k]), autojunk=False).ratio()
    if r < 0.9:
        low.append((round(r, 2), k))

print("extracted", len(out), "of", len(ORDER))
low.sort()
print("low similarity:", len(low), low[:40])
json.dump(out, open(os.path.join(CACHE, "saheeh_pdf.json"), "w", encoding="utf-8"), ensure_ascii=False)
