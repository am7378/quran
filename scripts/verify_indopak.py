"""Check the Indo-Pak words against the King Fahd (QPC) Hafs words the site shows, position by position:
same count, each Indo-Pak word non-empty, the Indo-Pak verse text rebuilt from its words, and the
consonantal skeleton of each word the same once script conventions are set aside."""
import json, os, re, unicodedata, collections, sys

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, ".cache")

# letters the two scripts write differently for the same sound (Urdu-style forms in Indo-Pak)
SAME = {"ی": "ي", "ے": "ي", "ى": "ي", "ک": "ك", "ہ": "ه", "ھ": "ه",
        "ە": "ه", "ٱ": "ا", "أ": "ا", "إ": "ا", "آ": "ا", "ئ": "ي",
        "ؤ": "و", "ء": "", "ة": "ه", "ۃ": "ه", "ٮ": "ي"}


def skeleton(s):
    out = []
    for ch in unicodedata.normalize("NFC", s or ""):
        cat = unicodedata.category(ch)
        if cat in ("Mn", "Me", "Cf", "Lm", "Sk", "Co") or ch == "ـ" or ch.isspace() or "ۖ" <= ch <= "ۭ":
            continue
        out.append(SAME.get(ch, ch))
    return "".join(out)


def bare(s):
    """The skeleton without alif: the Uthmani spelling writes many long 'aa' as a small (dagger) alif,
    which Indo-Pak text encodes as a full alif ('الانسن' / 'الانسان')."""
    return skeleton(s).replace("ا", "")


def main():
    report = collections.Counter()
    diffs = []
    data = {}
    for n in range(1, 115):
        ip = {v["key"]: v for v in json.load(open(os.path.join(CACHE, f"indopak_{n:03d}.json"), encoding="utf-8"))}
        qpc = {v["verse_key"]: v for v in json.load(open(os.path.join(CACHE, f"qpc_{n:03d}.json"), encoding="utf-8"))}
        for k, q in qpc.items():
            qw = [w for w in q["words"] if w["char_type_name"] == "word"]
            v = ip.get(k)
            if not v:
                report["verse missing"] += 1
                continue
            iw = [w for w in v["words"] if w["type"] == "word"]
            if len(iw) != len(qw):
                report["word count differs"] += 1
                diffs.append((k, "count", len(iw), len(qw)))
                continue
            ok = True
            for i, (a, b) in enumerate(zip(iw, qw)):
                qtext = re.sub(r"\s+", " ", b["text_qpc_hafs"].replace("۞", "").replace("۩", "")).strip()
                if not a["ip"]:
                    report["empty word"] += 1; ok = False
                if re.sub(r"\s+", " ", (a["qpc"] or "").replace("۞", "").replace("۩", "")).strip() != qtext:
                    report["position mismatch"] += 1; ok = False
                    diffs.append((k, i + 1, "qpc", a["qpc"], qtext))
                if skeleton(a["ip"]) != skeleton(qtext):
                    report["alif spelling only"] += 1
                if bare(a["ip"]) != bare(qtext):
                    report["skeleton differs"] += 1
                    diffs.append((k, i + 1, "skel", a["ip"], qtext, skeleton(a["ip"]), skeleton(qtext)))
            # the verse text is the words in order (plus the end marker)
            joined = " ".join(w["ip"] for w in v["words"] if w["type"] == "word")
            text = re.sub(r"\s*[٠-٩۰-۹]+\s*$", "", v["text"] or "").strip()
            if skeleton(joined) != skeleton(text):
                report["verse text differs from words"] += 1
                diffs.append((k, "text", joined, text))
            report["verses"] += 1
            if ok:
                data[k] = [w["ip"].strip() for w in iw]
    json.dump(diffs, open(os.path.join(CACHE, "indopak_diffs.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=0)
    json.dump(data, open(os.path.join(CACHE, "indopak_words.json"), "w", encoding="utf-8"), ensure_ascii=False)
    print(dict(report))


if __name__ == "__main__":
    main()


def loose(s):
    """Consonants only: hamza seats and long vowels are where the two scripts differ most."""
    s = unicodedata.normalize("NFKC", s or "").replace("ڪ", "ك").replace("ٴ", "")
    return re.sub("[ايو]", "", skeleton(s))


def regroup(text, qwords):
    """The Indo-Pak verse text cut into the QPC words (quran.com's word list splits a few verses
    inside words: 'ذٰ | لِكَ', 'وَ | لَاۤ')."""
    toks = [t for t in re.split(r"[\s​ ‏‎]+", text) if t]
    merged = []
    for t in toks:
        if not skeleton(t) and merged:
            merged[-1] += " " + t   # a pause mark belongs to the word before it
        else:
            merged.append(t)
    out, j = [], 0
    for q in qwords:
        if j >= len(merged):
            return None
        acc = merged[j]
        j += 1
        while loose(acc) != loose(q) and j < len(merged) and len(loose(acc)) < len(loose(q)):
            acc += merged[j]
            j += 1
        if loose(acc) != loose(q):
            return None
        out.append(acc)
    return out if j == len(merged) else None


def bare2(s):
    return bare(unicodedata.normalize("NFKC", s or "").replace("ڪ", "ك").replace("ٴ", ""))


def repair():
    """Verses where quran.com's word list splits inside words ('ذٰ | لِكَ') or moves a 'وَ' onto the
    word before: cut the verse text again at the QPC word boundaries, if that matches better."""
    data = json.load(open(os.path.join(CACHE, "indopak_words.json"), encoding="utf-8"))
    used, left = [], []
    for n in range(1, 115):
        ip = {v["key"]: v for v in json.load(open(os.path.join(CACHE, f"indopak_{n:03d}.json"), encoding="utf-8"))}
        qpc = {v["verse_key"]: v for v in json.load(open(os.path.join(CACHE, f"qpc_{n:03d}.json"), encoding="utf-8"))}
        for k, q in qpc.items():
            qw = [re.sub(r"\s+", " ", w["text_qpc_hafs"].replace("۞", "").replace("۩", "")).strip()
                  for w in q["words"] if w["char_type_name"] == "word"]
            cur = data.get(k) or [w["ip"] for w in ip[k]["words"] if w["type"] == "word"]
            score = sum(bare2(a) == bare2(b) for a, b in zip(cur, qw))
            lscore = sum(loose(a) == loose(b) for a, b in zip(cur, qw))
            if score < len(qw):
                text = re.sub(r"\s*[٠-٩۰-۹]+\s*$", "", ip[k]["text"] or "").strip()
                rg = regroup(text, qw)
                if rg and rg != cur:
                    s2 = sum(bare2(a) == bare2(b) for a, b in zip(rg, qw))
                    if s2 > score or (s2 == score and sum(loose(a) == loose(b) for a, b in zip(rg, qw)) > lscore):
                        data[k] = rg
                        used.append(k)
                        continue
                if lscore < len(qw):
                    left.append(k)
            data[k] = cur
    json.dump(data, open(os.path.join(CACHE, "indopak_words.json"), "w", encoding="utf-8"), ensure_ascii=False)
    print("re-cut at the QPC word boundaries:", used, "| spelled differently (script conventions):", left)


if __name__ == "__main__":
    repair()


def tidy_words():
    """Invisible direction marks and zero-width spaces out; a space inside a word ('وَ لَوۡ') closed up,
    while a pause mark keeps its space."""
    data = json.load(open(os.path.join(CACHE, "indopak_words.json"), encoding="utf-8"))
    for k, ws in data.items():
        out = []
        for w in ws:
            # the hizb and sajdah signs are not words (the reader marks sajdah verses itself, as for QPC)
            w = re.sub("[​‎‏ ۞۩]", " ", w)
            w = re.sub(r"\s+", " ", w).strip()
            # a lone letter set apart ('وَ لَوۡ', 'ذٰ لِكَ') joins its word; 'وَّاَنۡ لَّوِ' is written apart
            parts = w.split(" ")
            joined = [parts[0]]
            for part in parts[1:]:
                if part and unicodedata.category(part[0]) == "Lo" and len(skeleton(joined[-1])) == 1:
                    joined[-1] += part
                else:
                    joined.append(part)
            w = " ".join(joined)
            out.append(w)
        data[k] = out
    json.dump(data, open(os.path.join(CACHE, "indopak_words.json"), "w", encoding="utf-8"), ensure_ascii=False)


if __name__ == "__main__":
    tidy_words()
