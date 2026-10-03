import merge_qme as M, json, re, collections, sys
M.load_corpus()
S = json.load(open('.cache/qme_final.json', encoding='utf-8'))
odd = collections.defaultdict(list)
for k, segs in S.items():
    t = ' '.join(x for _, x in segs)
    for tok in t.split():
        core = re.sub(r"^[^A-Za-z0-9]+|[^A-Za-z0-9]+$", "", tok)
        if not core: continue
        n = M.norm(core); b = M.bare(core)
        if re.search(r"[a-z][A-Z]", core):
            odd['camel'].append((k, tok)); continue
        if re.search(r"[A-Za-z]\d|\d[A-Za-z]", core) and not re.fullmatch(r"\d+(st|nd|rd|th|s|km)", core):
            odd['digitglue'].append((k, tok)); continue
        if re.search(r"[^A-Za-z0-9'’\-.,]", core) and not re.fullmatch(r"[A-Za-z]+(/[A-Za-z]+)+", core):
            odd['symbols'].append((k, tok)); continue
        if b in M.GLOSSARY or b in M.textfix.REFV or M.english(b) or b in M.GLUE_WORDS or b in M.TWO_LETTER or b.isdigit():
            continue
        if '-' in core and all(M.english(M.bare(p)) or M.bare(p) in M.textfix.REFV or M.bare(p) in M.GLOSSARY for p in core.split('-') if p):
            continue
        if core[:1].isupper() and M.ACORPUS[b] >= 3:
            continue
        if b in M.textfix.DICT:
            odd['rare-english'].append((k, tok)); continue
        odd['unknown'].append((k, tok))
out = open(sys.argv[1], 'w', encoding='utf-8')
for cat, xs in odd.items():
    c = collections.Counter(t for _, t in xs)
    first = {}
    for k, t in xs: first.setdefault(t, k)
    out.write(f'== {cat} {len(xs)} {len(c)}\n')
    for t, n in sorted(c.items(), key=lambda z: (-z[1], z[0])):
        out.write(f"  {first[t]} {n} {t}\n")
    print(cat, len(xs), len(c))
