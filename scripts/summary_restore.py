"""What the clean print's reading of the introductions lost, put back from the scan copy's reading
of the same pages (an independent OCR), the way the translation was merged:

- a name's honorific mark: the print's reader sometimes dropped the calligraphy after a name, or
  read it as letters ('Moosa Di E', 'Nabi EE', 'Rasulullaah 005Z's'); where the scan has a mark's
  debris at that place, the name's mark is set (its kind from the name, as in the translation);
- words the print's reader dropped (a name swallowed by the mark beside it, the first words of a
  line): where the scan has real words at that place, they are put back.

Nothing is changed where the scan does not show something at that very place. restore() returns
the changes, for checking against the print (summary_crops.py)."""
import re
import merge_qme as M

MARKS = "ﷺ﵊﵁﵂﵃"


def core(t):
    return re.sub(r"[^A-Za-z0-9]", "", t).lower()


def good(w):
    c = core(w)
    return bool(c) and (c.isdigit() or M.in_dictionary(w.strip(".,;:!?\"'()[]")) or M.known(w.strip(".,;:!?\"'()[]")))


def junk(ws):
    """the debris a calligraphic mark leaves in an OCR ('Di E', 'iS', '005Z's', 'SE's'); a list's
    number alone ('1.') is not that"""
    return bool(ws) and all(not good(w) or len(core(w)) <= 2 for w in ws) and len(ws) <= 4 and not all(
        re.fullmatch(r"\(?\d{1,2}[.)]?", w) for w in ws)


def hon_for(token):
    w = token.strip(".,;:!?\"'()[]’")
    w = re.sub(r"['’]s$", "", w)
    if w in ("Nabi",):
        return "ﷺ"  # 'the Nabi', 'O Nabi': the book means Rasulullaah ﷺ
    return M.name_hon_of(w) if w else None


def mark_letters(t):
    """a name's mark as the print's reader spelt it ('Di*E,', 'EE's', 'Oi's', 'Diya,', '005",',
    'JC@.9'): a short run of letters, digits and stray signs that is no word"""
    c = core(t)
    if not c or len(c) > 4:
        return False
    if re.fullmatch(r"\(?[A-Z]\.[A-Z]\.?\)?\W*", t):
        return False  # the book's own abbreviation, '(R.A)', '(A.S)': kept as printed
    if re.fullmatch(r"\W*0\d{2}\W*%?\W*", t):  # '005",' '008%.'
        return True
    if re.sub(r"['’]s$", "", t.strip(".,;:!?\"'()[]’”")) in ("Di", "Oi", "EE", "E", "ZE", "Diya", "Lj", "Z"):
        return True  # how the mark's calligraphy reads, again and again
    if re.search(r"[*}{@%)]", t) and re.search(r"[A-Za-z0-9]", t):
        return True
    w = re.sub(r"['’]s$", "", t.strip(".,;:!?\"'()[]’”"))
    return bool(w) and not good(w) and re.fullmatch(r"[A-Za-z]{1,4}", w) is not None


def letters_for_marks(out):
    """Names' marks read as letters, wherever the scan can't speak to it: set as the mark."""
    changes = []
    for k, secs in out.items():
        for s in secs:
            for b in s["blocks"]:
                texts = [b["text"]] if b["type"] == "p" else b["items"]
                new = []
                for t in texts:
                    toks = t.split(" ")
                    for i in range(1, len(toks)):
                        hon = hon_for(toks[i - 1])
                        if not hon or any(m in toks[i - 1] for m in MARKS) or not mark_letters(toks[i]):
                            continue
                        tok = toks[i]
                        poss = "'s" if re.search(r"['’]s\W*$", tok) else ""
                        tail = re.search(r"([.,;:!?\"”)\]]*)$", re.sub(r"['’]s(?=\W*$)", "", tok)).group(1)
                        tail = re.sub(r"[)%]", "", tail) if not re.search(r"\(", " ".join(toks[max(0, i - 6) : i])) else tail
                        toks[i] = hon + poss + tail
                        changes.append({"s": k, "kind": "letters", "before": tok, "after": " ".join(toks[max(0, i - 4) : i + 3])})
                    t = " ".join(toks)
                    # debris left beside a mark ('ﷺ}.', '﵃@.')
                    t = re.sub(r"([ﷺ﵊﵁﵂﵃])[}@%]+", r"\1", t)
                    new.append(t)
                if b["type"] == "p":
                    b["text"] = new[0]
                else:
                    b["items"] = new
    return changes


def restore(out, scan):
    """out: {surah: sections} as built (changed in place); scan: {surah: [[page, x, y, size, text]]}."""
    import difflib

    changes = []
    for k, secs in out.items():
        lines = scan.get(k)
        if not lines:
            continue
        # every text of the surah as a list of tokens, kept by reference so they can be edited
        units = []
        part = lambda t: re.sub(r"([,;])(?=[A-Za-z])", r"\1 ", t).split(" ")  # 'EE,telling'
        for s in secs:
            for b in s["blocks"]:
                if b["type"] == "p":
                    units.append([b, "text", None, part(b["text"])])
                else:
                    for i, it in enumerate(b["items"]):
                        units.append([b, "items", i, part(it)])
        seq = [(ui, ti) for ui, u in enumerate(units) for ti, t in enumerate(u[3]) if core(t)]
        a = [core(units[ui][3][ti]) for ui, ti in seq]
        stoks = [t for l in lines for t in l[4].split() if core(t)]
        b = [core(t) for t in stoks]
        sm = difflib.SequenceMatcher(a=a, b=b, autojunk=False)
        edits = []  # (ui, ti, kind, payload): applied from the end so indexes hold
        for op, i1, i2, j1, j2 in sm.get_opcodes():
            if op == "equal" or i1 == 0 or i1 >= len(a):
                continue  # not at the very start or end (the scan runs on into the surah's first ayah)
            S = stoks[j1:j2]
            pu, pt = seq[i1 - 1]
            prev = units[pu][3][pt]
            hon = hon_for(prev)
            nxt = next((t for t in units[pu][3][pt + 1 :] if t), "")
            has_mark = any(m in prev for m in MARKS) or (nxt != "" and nxt[0] in MARKS)
            P = [units[u][3][t] for u, t in seq[i1:i2]]
            if op == "insert":
                if hon and not has_mark and junk(S):
                    poss = any(re.search(r"['’]s$", w) for w in S)
                    edits.append((pu, pt, "mark", (hon, poss)))
                # (words the print's reader lost are put back by hand, read off the print: the scan's
                # own misreadings make it no guide to the words themselves)
            elif op in ("replace", "delete") and hon and not has_mark and P and junk(P) and all(seq[i][0] == pu for i in range(i1, i2)):
                # the mark read as letters right after the name
                poss = any(re.search(r"['’]s\W*$", w) for w in P)
                tail = re.search(r"([.,;:!?\"”)\]]+)$", P[-1])
                edits.append((pu, pt, "mark-for", (hon, poss, [seq[i][1] for i in range(i1, i2)], tail.group(1) if tail else "")))
        for pu, pt, kind, payload in sorted(edits, key=lambda e: (e[0], e[1]), reverse=True):
            toks = units[pu][3]
            before = " ".join(toks[max(0, pt - 4) : pt + 4])
            name = toks[pt]
            if kind == "mark":
                hon, poss = payload
                m = re.match(r"^(.*?)([.,;:!?\"”)\]]*)$", name)
                nm, punct = m.group(1), m.group(2)
                if pt + 1 < len(toks) and toks[pt + 1] in ("s", "'s", "’s"):
                    toks[pt + 1] = hon + "'s"
                    toks[pt] = nm + punct
                else:
                    nm = re.sub(r"['’]s$", "", nm) if poss else nm
                    toks[pt] = nm + " " + hon + ("'s" if poss or re.search(r"['’]s$", m.group(1)) else "") + punct
            elif kind == "mark-for":
                hon, poss, idx, tail = payload
                for i in sorted(idx, reverse=True):
                    del toks[i]
                toks.insert(pt + 1, hon + ("'s" if poss else "") + tail)
            else:
                toks[pt + 1 : pt + 1] = payload
            after = " ".join(toks[max(0, pt - 4) : pt + 4 + len(payload) if kind == "words" else pt + 5])
            changes.append({"s": k, "kind": kind, "before": before, "after": after})
        for b_, field, i, toks in units:
            text = re.sub(r"\s{2,}", " ", " ".join(toks)).strip()
            if field == "text":
                b_["text"] = text
            else:
                b_["items"][i] = text
    return changes
