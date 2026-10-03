import json, collections, sys
D = json.load(open('.cache/qme_decisions.json', encoding='utf-8'))
agg = collections.Counter(); ex = {}
for k, ds in D.items():
    for d in ds:
        w = d.get('why', '')
        if w.startswith('same letters, spacing differs'):
            t = (d['a'], d['b'], d['pick'], 'kept' if 'kept' in w else ('asB' if d['pick'] == d['b'] else 'mixed'))
            agg[t] += 1; ex.setdefault(t, k)
rows = sorted(agg.items(), key=lambda z: (z[0][3], -z[1], z[0]))
out = open(sys.argv[1], 'w', encoding='utf-8')
for t, c in rows:
    out.write(f"{ex[t]} {c} {' | '.join(t)}\n")
print(collections.Counter(t[3] for t in agg))
