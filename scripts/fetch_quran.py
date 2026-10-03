"""Download Uthmani Arabic, word-by-word meanings and reference translations
from the quran.com v4 API into scripts/.cache (raw JSON, one file per chapter)."""
import json, os, time
import requests

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, ".cache")
os.makedirs(CACHE, exist_ok=True)
API = "https://api.quran.com/api/v4"
S = requests.Session()


def get(url, params=None):
    for attempt in range(5):
        try:
            r = S.get(url, params=params, timeout=40)
            if r.status_code == 200:
                return r.json()
            print("  status", r.status_code, url)
        except Exception as e:  # noqa
            print("  error", e)
        time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(url)


def cached(name, fn):
    path = os.path.join(CACHE, name)
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    data = fn()
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)
    return data


chapters = cached("chapters.json", lambda: get(f"{API}/chapters", {"language": "en"})["chapters"])
print("chapters:", len(chapters))

for ch in chapters:
    n = ch["id"]

    def fetch(n=n):
        verses, page = [], 1
        while True:
            d = get(
                f"{API}/verses/by_chapter/{n}",
                {
                    "language": "en",
                    "words": "true",
                    "word_fields": "text_uthmani",
                    "fields": "text_uthmani,text_imlaei_simple,juz_number",
                    "per_page": 50,
                    "page": page,
                },
            )
            verses += d["verses"]
            if not d["pagination"]["next_page"]:
                break
            page += 1
        return verses

    v = cached(f"ch_{n:03d}.json", fetch)
    assert len(v) == ch["verses_count"], (n, len(v))
    print(n, ch["name_simple"], len(v))

# reference translations: 20 = Saheeh International, 131 = The Clear Quran (Khattab)
for tid in (20, 131):
    t = cached(f"tr_{tid}.json", lambda tid=tid: get(f"{API}/quran/translations/{tid}")["translations"])
    print("translation", tid, len(t))

# chapter info (short summaries used as fallback copy on the reflection panel)
print("done")
