# The Qur'an — an immersive reader

**Open it:** https://am7378.github.io/quran/

A calm, framed reader for the Qur'an: the Arabic with Quraan Made Easy, Saheeh International and The Clear Quran, word meanings, highlights, notes and reflections. It runs entirely in the browser — no account, no server. Everything a reader saves stays on their own device.

## What it does

- **The Arabic** in the Madani mushaf (King Fahd Complex) or the Indo-Pak script. Point at (or tap) a word for its meaning; click it to hear it.
- **Translations**: Quraan Made Easy (its bracketed explanations can be hidden), Saheeh International and The Clear Quran — up to three, one under another.
- **Ways to read**: one ayah at a time, several ayahs scrolling, or a surah read on like a book; Arabic and translation together, or either alone.
- **Themes of the ayahs** (The Clear Quran's headings) above the frame, and each surah's introduction (Quraan Made Easy) on the back of the frame.
- **The index, many ways**: surahs, juz, Makkan and Madinan, themes, topics (The Clear Quran's thematic index), supplications, the places of prostration, and the summaries.
- **Search**: a number (`18`), a reference (`2:255`), a name in any spelling (`yaseen`, `al kahf`, `الكهف`), an English name (`the cave`), a juz (`juz 30`), or any word in the translations or the Arabic.
- **Your own**: highlights in five colours, sticky notes (an ayah written in a note, like `2:255` or `Surah Rum 2`, opens beside it), voice notes, bookmarks with folders, a reflection at the end of each surah, and reading progress with a goal.
- **Six looks**: Classic, Monochrome, Atlas, Folio, Paper and Lunar.

**On a phone:** swipe sideways across the frame to turn it over to the surah's summary (and back). To highlight, press and hold a word, drag the handles over the words you want, and lift your finger.

**Keyboard:** `/` search · `↑` `↓` previous / next ayah · `F` focus · `Esc` closes panels.

## Run it on your computer

Needs [Node.js](https://nodejs.org) 22 or newer.

```bash
npm install
npm run dev        # then open http://localhost:5173
npm run build      # the finished site, in dist/
```

The site is static: `dist/` can be hosted anywhere. A link like `…/#/2/255` opens straight onto an ayah.

## Publishing

Every push to the `main` branch is built and published on GitHub Pages by `.github/workflows/deploy.yml`. (Once, in the repository's **Settings → Pages**, the source must be set to **GitHub Actions**.)

## The data

`public/data/` was generated from the printed books by the Python scripts in `scripts/` (Python 3 with `pymupdf` and `requests`). The books themselves (PDFs) and the scripts' working files are not part of this repository, so the scripts can only be re-run with copies of them.

```bash
py scripts/fetch_quran.py     # Uthmani text, word-by-word meanings (quran.com) → scripts/.cache
py scripts/fetch_indopak.py   # Indo-Pak words (quran.com)
py scripts/extract_saheeh.py  # Saheeh International from its PDF
py scripts/extract_clear.py   # The Clear Quran text and its thematic headings
py scripts/ocr_big.py         # Quraan Made Easy: every page of the clean print read (slow; cached)
py scripts/parse_big.py       # lines → verses and surah introductions
py scripts/glyphs.py          # honorific marks (ﷺ and others) from the calligraphy
py scripts/mark_punct.py      # punctuation printed against a mark
py scripts/merge_qme.py       # merged with the scan copy; qme_overrides.json / qme_fixes.json hold print-checked decisions
py scripts/verify_indopak.py  # Indo-Pak words checked against the Madani words
py scripts/build_glossary.py  # the book's glossary → word explanations
py scripts/build_summaries.py # surah introductions → summaries.json
py scripts/build_index_views.py # topics, supplications, prostrations, juz openings, themes
py scripts/build_data.py      # everything → public/data
```

Notes on the sources:

- **Quraan Made Easy** is read from the clean print and checked word by word against an older scan copy; doubtful words were decided from the printed page. 32:13–18 are lost in every copy of the book (a damaged page), so those show Saheeh International and say so.
- **Saheeh International** is the quranproject.org edition; its wording is kept, with only typing slips mended.
- **The Clear Quran** gets spacing repairs only.
- **Indo-Pak** words are quran.com's `text_indopak`, checked position by position against the Madani words.

The printed books are the authority: where this site and a printed mushaf or one of these books disagree, trust the print.

## Feedback

A mistake, something that doesn't work, or a feature you'd like: **user.am7378@gmail.com**
