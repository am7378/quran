"""Fetch the King Fahd Complex (QPC) Hafs text, verse- and word-level, with
word meanings, from the quran.com API -> scripts/.cache/qpc_XXX.json.
This is the digital text of the printed Madani mushaf, paired with the
KFGQPC Uthmanic Script HAFS font."""
import json, os, time
import requests

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, ".cache")
API = "https://api.quran.com/api/v4"
S = requests.Session()


def get(url, params):
    for attempt in range(6):
        try:
            r = S.get(url, params=params, timeout=40)
            if r.status_code == 200:
                return r.json()
        except Exception as e:  # noqa
            print("  error", e)
        time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(url)


chapters = json.load(open(os.path.join(CACHE, "chapters.json"), encoding="utf-8"))
for ch in chapters:
    n = ch["id"]
    path = os.path.join(CACHE, f"qpc_{n:03d}.json")
    if os.path.exists(path):
        continue
    verses, page = [], 1
    while True:
        d = get(f"{API}/verses/by_chapter/{n}", {
            "language": "en", "words": "true", "word_fields": "text_qpc_hafs,text_uthmani",
            "fields": "text_qpc_hafs,text_uthmani", "per_page": 50, "page": page,
        })
        verses += d["verses"]
        if not d["pagination"]["next_page"]:
            break
        page += 1
    assert len(verses) == ch["verses_count"], n
    json.dump(verses, open(path, "w", encoding="utf-8"), ensure_ascii=False)
    print(n, len(verses))
print("done")
