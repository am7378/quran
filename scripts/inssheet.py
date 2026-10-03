"""Crops of the print where words only the scan had were inserted: inssheet.py out.png start count"""
import json, sys
import crops
D = json.load(open('.cache/qme_decisions.json', encoding='utf-8'))
S = json.load(open('.cache/qme_final.json', encoding='utf-8'))
names = set("Yusuf Jibra'eel Ambiyaa Rasulullaah Muhammad Loot Moosa Ibraheem Zakariyya Ya'qoob Is'haaq Isa Dawood Nooh Yunus Ayyoob".split())
rows = []
for k, ds in D.items():
    for d in ds:
        if d['op'] == 'insert' and d.get('pick') == 'review-B' and d.get('boxes'):
            if all(w.strip("(),.") in names or w in ('the', 'of', 'all', 'Our') for w in d['b'].split()):
                continue
            b = d['boxes'][-1]
            t = ' '.join(x for _, x in S[k]); i = t.find(d['b'])
            ctx = t[max(0, i - 50): i + len(d['b']) + 30] if i >= 0 else ''
            rows.append((b['page'], (b['x'] - 900, b['y'] - 60, b['w'] + 1800, b['h'] + 120), f"{k} +[{d['b']}]  … {ctx}"))
start, count = int(sys.argv[2]), int(sys.argv[3])
print(len(rows))
crops.sheet(rows[start:start + count], sys.argv[1])
