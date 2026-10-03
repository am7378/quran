"""Extract The Clear Quran (Dr. Mustafa Khattab, 'Allah' edition): the
thematic section headings and the translation text.

Layout: surah titles are bold and centred, introductions italic and
left-aligned, theme headings italic and centred, verse numbers bold inline
('80.'), footnote markers small ('[32]')."""
import json, os, re, collections
import pymupdf

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, ".cache")
PDF = os.path.join(HERE, "..", "..",
                   "The_Clear_Quran_A_Thematic_English_Translation_Allah_edition_--_Dr._Mustafa_Khattab_2017_BC2C0DDB.pdf")

chapters = json.load(open(os.path.join(CACHE, "chapters.json"), encoding="utf-8"))
COUNT = {c["id"]: c["verses_count"] for c in chapters}

doc = pymupdf.open(PDF)
verses = collections.OrderedDict()
themes = {}
surah, expect, cur = 0, 1, None
pending = None
TITLE = re.compile(r"^(\d{1,3})\.\s+\S")
NUM = re.compile(r"^\s*(\d{1,3})\.\s*$")

for pn in range(32, doc.page_count):
    page = doc[pn]
    for b in page.get_text("dict")["blocks"]:
        for l in b.get("lines", []):
            spans = [s for s in l["spans"] if s["text"].strip()]
            if not spans:
                continue
            x0 = spans[0]["bbox"][0]
            f0 = spans[0]["font"]
            text = "".join(s["text"] for s in l["spans"]).strip()
            bold0 = "Bold" in f0 and "Ital" not in f0
            italic_line = all("Italic" in s["font"] for s in spans if s["size"] > 12)
            # surah title: bold, centred '2. The Cow'
            if bold0 and x0 > 150 and TITLE.match(text):
                n = int(TITLE.match(text).group(1))
                if n == surah + 1 and n <= 114:
                    surah, expect, cur, pending = n, 1, None, None
                continue
            if surah == 0:
                continue
            if bold0 and x0 > 150 and text.startswith("("):
                continue  # '(Al-Baqarah)' under the title
            if italic_line:
                # a long heading, centred, starts a little further left (17:22 "Commandments: 1) …")
                x1 = spans[-1]["bbox"][2]
                centred = abs((x0 + x1) / 2 - page.rect.width / 2) < 12
                if (x0 > 110 or (x0 > 100 and centred)) and len(text) < 90:
                    pending = text  # theme heading
                continue  # introduction paragraph
            if text.startswith("In the Name of Allah") and x0 > 100 and "Bold" not in f0:
                continue  # Bismillah line above verse 1
            if text.strip("* ") == "":
                continue
            for s in l["spans"]:
                t = s["text"]
                if s["size"] < 12.5:
                    continue  # footnote markers
                if "Bold" in s["font"] and "Ital" not in s["font"]:
                    # may hold several numbers, e.g. '1. In the Name of Allah ... 2. All'
                    parts = re.split(r"(\b\d{1,3}\.)", t)
                    for part in parts:
                        mm = re.fullmatch(r"(\d{1,3})\.", part)
                        if mm and surah and expect <= int(mm.group(1)) <= expect + 3 and int(mm.group(1)) <= COUNT[surah]:
                            n = int(mm.group(1))
                            cur = (surah, n)
                            verses[cur] = []
                            expect = n + 1
                            if pending:
                                themes[f"{surah}:{n}"] = pending
                                pending = None
                        elif cur and part:
                            verses[cur].append(part)
                    continue
                if cur:
                    verses[cur].append(t)
            if cur and not text.endswith("-"):
                verses[cur].append(" ")

clear = {}
for (s, v), parts in verses.items():
    t = "".join(parts)
    t = re.sub(r"\[\d+\]", "", t)
    t = re.split(r"\s*THEMATIC INDEX", t)[0]
    t = re.sub(r"\s+", " ", t).strip()
    t = re.sub(r"\s+([,.;:!?])", r"\1", t)
    clear[f"{s}:{v}"] = t

missing = [f"{c}:{v}" for c in range(1, 115) for v in range(1, COUNT[c] + 1) if f"{c}:{v}" not in clear]
print("clear verses:", len(clear), "missing:", len(missing), missing[:30])
print("themes:", len(themes), "surahs with themes:", len({k.split(':')[0] for k in themes}))
no_theme = [c for c in range(1, 115) if f"{c}:1" not in themes]
print("surahs without a heading at verse 1:", no_theme[:40])
json.dump(clear, open(os.path.join(CACHE, "clear.json"), "w", encoding="utf-8"), ensure_ascii=False)
json.dump(themes, open(os.path.join(CACHE, "themes.json"), "w", encoding="utf-8"), ensure_ascii=False)
for k in ["1:1", "1:2", "2:1", "2:255", "112:1", "114:6"]:
    print(k, "|", clear.get(k, "")[:160], "|", themes.get(k))
