import { Fragment, memo } from "react";
import type { SurahData, Verse } from "@/lib/data";
import { toArabicDigits } from "@/lib/data";
import type { Highlight, Settings } from "@/lib/store";
import { renderArabic, renderPieces } from "./Ayah";
import { arabicWords, translationPieces } from "./text";
import { cn } from "@/lib/utils";

/**
 * The surah read as a book: in the multiple-ayah view, with the Arabic alone or a translation
 * alone, the ayahs run on as continuous text, each marked by its number. The Arabic runs on
 * unbroken, as a mushaf's page does; the translation breaks into paragraphs where The Clear Quran
 * starts a new theme, headed by it (both can be turned off: then it too runs on). Every ayah is
 * still its own element (data-n, data-key, data-field), so meanings, highlights, notes and the
 * slider work as they do ayah by ayah; its number opens the ayah's own tools.
 */
export const BookText = memo(function BookText({
  surah,
  data,
  settings,
  mobile,
  hlByKey,
  bookmarks,
}: {
  surah: number;
  data: SurahData;
  settings: Settings;
  mobile: boolean;
  hlByKey: Map<string, Highlight[]>;
  bookmarks: Record<string, number>;
}) {
  const arabic = settings.readingMode === "arabic";
  const headed = !arabic && settings.bookThemes;
  // paragraphs: a new one wherever a theme begins (the translation, with its headings), or one
  const paras: { theme: string | null; verses: Verse[] }[] = [];
  data.v.forEach((v, i) => {
    if (!paras.length || (headed && v.h)) paras.push({ theme: headed ? data.themes[i] : null, verses: [] });
    paras[paras.length - 1].verses.push(v);
  });
  const arPx = Math.round((mobile ? 27 : 34) * settings.arabicScale * 1.12);
  const trPx = Math.round((mobile ? 17 : 19.5) * settings.transScale * 10) / 10;

  return (
    <section className="book px-[max(6%,34px)] pb-20 pt-10 md:px-[9%] md:pt-14" aria-label="The surah as continuous text">
      <div className={cn("mx-auto", arabic ? "max-w-[860px]" : "max-w-[680px]")}>
        {paras.map((p, pi) => (
          <div key={pi} className={pi ? "mt-10" : ""}>
            {p.theme && <div className="label mb-4 text-[var(--box-faint)]">{p.theme}</div>}
            {arabic ? (
              <p className="quran book-ar text-start text-[var(--box-fg)] md:text-justify" dir="rtl" lang="ar" style={{ fontSize: arPx, lineHeight: 2.15 }}>
                {p.verses.map((v) => {
                  const key = `${surah}:${v.n}`;
                  const { words } = arabicWords(v, settings.script);
                  const hls = (hlByKey.get(key) ?? []).filter((h) => h.field === "ar");
                  const ip = settings.script === "indopak";
                  return (
                    <span key={key}>
                      <span data-n={v.n} data-key={key} data-field="ar" className={cn(ip && "indopak", settings.wordHover && "word-hover")}>
                        {renderArabic(words, hls, ip ? undefined : v.g, v.sj || v.sw !== undefined ? (v.sw ?? words.length - 1) : undefined)}
                      </span>{" "}
                      <AyahEnd n={v.n} marked={!!bookmarks[key]} arabic />{" "}
                    </span>
                  );
                })}
              </p>
            ) : (
              <p className="book-tr text-start font-serif text-[var(--box-fg)] md:text-justify" dir="ltr" lang="en" style={{ fontSize: trPx, lineHeight: 1.8 }}>
                {p.verses.map((v, vi) => {
                  const key = `${surah}:${v.n}`;
                  const tr = translationPieces(v, settings.translation);
                  const hls = (hlByKey.get(key) ?? []).filter((h) => h.field === tr.source);
                  return (
                    <Fragment key={key}>
                      {vi > 0 && " "}
                      <AyahEnd n={v.n} marked={!!bookmarks[key]} />
                      <span data-n={v.n} data-key={key} data-field={tr.source}>
                        {renderPieces(tr, hls, settings.showContext)}
                      </span>
                    </Fragment>
                  );
                })}
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
});

/**
 * An ayah's number: closing it in the Arabic, inside the mushaf's own ornament (the Hafs font
 * draws it round the digits); opening it in the English, set in a small ring at the line's own
 * height, so where one ayah ends and the next begins is plain at a glance. A tap on it opens the
 * ayah's tools; a bookmarked ayah's number is lit.
 */
function AyahEnd({ n, marked, arabic }: { n: number; marked: boolean; arabic?: boolean }) {
  return (
    <button
      type="button"
      data-ayah-end={n}
      title={`Ayah ${n}: bookmark, note, copy or share`}
      aria-label={`Ayah ${n}: bookmark, note, copy or share`}
      className={cn(
        "ayah-end cursor-pointer transition-colors hover:text-[var(--box-accent)]",
        arabic ? "inline rounded-none px-0.5 align-baseline font-quran" : "ayah-no",
        marked ? "is-marked text-[var(--box-accent)]" : "text-[var(--box-muted)]",
      )}
    >
      {arabic ? toArabicDigits(n) : n}
    </button>
  );
}
