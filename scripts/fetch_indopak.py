"""Fetch the Indo-Pak script of the Qur'an from quran.com (API v4,
`text_indopak`, the text quran.com renders with its IndoPak Nastaleeq font),
word by word, into .cache/indopak_XXX.json."""
import json, os, time
import requests

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, ".cache")
API = "https://api.quran.com/api/v4/verses/by_chapter/{}"

for ch in range(1, 115):
    out = os.path.join(CACHE, f"indopak_{ch:03d}.json")
    if os.path.exists(out):
        continue
    verses, page = [], 1
    while True:
        r = requests.get(API.format(ch), params={
            "words": "true", "word_fields": "text_indopak,text_qpc_hafs",
            "fields": "text_indopak", "per_page": 50, "page": page}, timeout=60)
        r.raise_for_status()
        d = r.json()
        for v in d["verses"]:
            verses.append({
                "key": v["verse_key"],
                "text": v.get("text_indopak"),
                "words": [{"ip": w.get("text_indopak"), "qpc": w.get("text_qpc_hafs"), "type": w.get("char_type_name"),
                           "pos": w.get("position")} for w in v["words"]],
            })
        if not d["pagination"].get("next_page"):
            break
        page += 1
        time.sleep(0.2)
    json.dump(verses, open(out, "w", encoding="utf-8"), ensure_ascii=False)
    print(ch, len(verses), flush=True)
