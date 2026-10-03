import type { ReactNode } from "react";

/**
 * A glossary entry as the pop-up shows it. The definitions are Quraan Made Easy's own, word for
 * word; two things are added so they explain without sending the reader to another Arabic word:
 *  - the honorifics written out in English letters ("(SallAllaahu Alayhi Wasallam)") are shown as
 *    the Arabic the translation itself prints (ﷺ, عليه السلام, رضي الله عنه);
 *  - another Arabic term the definition uses has its English beside it in brackets, the first
 *    time it appears ("Imaan (faith)"), in the words the glossary itself defines it with.
 * Words inside quotation marks (the Kalimah, a title) are left as they are.
 */

/** [the term as written, its English]: phrases before their single words */
const ENGLISH: [RegExp, string][] = [
  [/\bBani Israa'eel\b/, "the Children of Israel"],
  [/\bMasjidul Haraam\b/, "the Sacred Mosque"],
  [/\bMasjidul Aqsa\b/, "the Farthest Mosque"],
  [/\bDay of Qiyaamah\b/, "the Last Day"],
  [/\bLowhul Mahfoodh\b/, "the Protected Tablet"],
  [/\bRoohul Qudus\b/, "the Pure Spirit"],
  [/\bDhul Hijjah\b/, "the month of pilgrimage"],
  [/\bRasulullaah\b/, "the Messenger of Allaah"],
  [/\bAadam\b/, "Adam"],
  [/\bIbraheem\b/, "Abraham"],
  [/\bMoosa\b/, "Moses"],
  [/\bIsa\b/, "Jesus"],
  [/\bNooh\b/, "Noah"],
  [/\bYoosuf\b/, "Joseph"],
  [/\bYa'qoob\b/, "Jacob"],
  [/\bIs'haaq\b/, "Isaac"],
  [/\bIsmaa'eel\b/, "Ishmael"],
  [/\bHaaroon\b/, "Aaron"],
  [/\bDawood\b/, "David"],
  [/\bSulaymaan\b/, "Solomon"],
  [/\bLoot\b/, "Lot"],
  [/\bMaryam\b/, "Mary"],
  [/\bHawwa\b/, "Eve"],
  [/\bJibra'eel\b/, "Gabriel"],
  [/\bSaara\b/, "Sarah"],
  [/\bYoonus\b/, "Jonah"],
  [/\bFir'oun\b/, "Pharaoh"],
  [/\bShaytaan\b/, "Satan"],
  [/\bIblees\b/, "Satan"],
  [/\bSaha+bah\b/, "the Companions"],
  [/\bMushrikeen\b/, "polytheists"],
  [/\bMushrik\b/, "polytheist"],
  [/\bKaafiroon\b/, "disbelievers"],
  [/\bKuffaar\b/, "disbelievers"],
  [/\bKaafir\b/, "disbeliever"],
  [/\bMu'mineen\b/, "believers"],
  [/\bMu'minoon\b/, "believers"],
  [/\bMu'min\b/, "believer"],
  [/\bMuhaajireen\b/, "the emigrants"],
  [/\bMuhaajir\b/, "emigrant"],
  [/\bAnsaar\b/, "the helpers"],
  [/\bAmbiyaa\b/, "Prophets"],
  [/\bMurtaddeen\b/, "apostates"],
  [/\bAhaadeeth\b/, "narrations of the Prophet's words and actions"],
  [/\bHadeeth\b/, "a narration of the Prophet's words or actions"],
  [/\bQuraysh\b/, "the tribe of Makkah"],
  [/\bImaan\b/, "faith"],
  [/\bKufr\b/i, "disbelief"],
  [/\bShirk\b/i, "polytheism"],
  [/\bTauheed\b/, "the Oneness of Allaah"],
  [/\bRisaalah\b/, "Prophethood"],
  [/\bDeen\b/, "religion"],
  [/\bShari'ah\b/, "Islamic law"],
  [/\bSunnah\b/, "the Prophet's practice"],
  [/\bIbaadah\b/, "worship"],
  [/\bsalaahs\b/i, "prayers"],
  [/\bsalaah\b/i, "prayer"],
  [/\bzakaah\b/i, "obligatory charity"],
  [/\bUmrah\b/, "minor pilgrimage"],
  [/\bHajj\b/, "pilgrimage"],
  [/\bFardh\b/, "obligatory"],
  [/\bHaraam\b/, "unlawful"],
  [/\bHalaal\b/, "lawful"],
  [/\bMasjid\b/, "mosque"],
  [/\bKa'bah\b/, "the House of Allaah in Makkah"],
  [/\bQiblah\b/, "direction of prayer"],
  [/\bRakaahs\b/, "units of prayer"],
  [/\bRakaah\b/, "unit of prayer"],
  [/\bSajdah\b/, "prostration"],
  [/\bAdhaan\b/, "call to prayer"],
  [/\bIsha\b/, "night"],
  [/\bFajr\b/, "dawn"],
  [/\bRamadhaan\b/, "the month of fasting"],
  [/\bIhraam\b/, "the state of pilgrimage"],
  [/\bIddah\b/, "waiting period"],
  [/\bQisaas\b/, "retaliation"],
  [/\bMahaarim\b/, "those one may not marry"],
  [/\bJihaad\b/, "striving"],
  [/\bHijrah\b/, "migration"],
  [/\bdu'aas?\b/i, "supplication"],
  [/\bDhikr\b/, "remembrance of Allaah"],
  [/\bTaqwa\b/, "consciousness of Allaah"],
  [/\bJannah\b/, "paradise"],
  [/\bJahannam\b/, "hell"],
  [/\bAakhirah\b/, "the Hereafter"],
  [/\bInjeel\b/, "the Gospel"],
  [/\bZaboor\b/, "the Psalms"],
  [/\bMuhkamaat\b/, "verses whose meaning is clear"],
  [/\bMutashaabihaat\b/, "verses whose meaning is best known to Allaah"],
  [/\bIlaah\b/, "the one worshipped"],
  [/\bMi'raaj\b/, "the ascension to the heavens"],
];

const HONORIFIC: [RegExp, string][] = [
  [/\s*\(SallAllaahu Alayhi Wasallam\)/g, " \u0001S\u0001"],
  [/\s*\(Alayhis Salaam\)/g, " \u0001H\u0001"],
  [/\b(Saha+bah)\s*\(RA\)/g, "$1 \u0001P\u0001"],
  [/\s*\(RA\)/g, " \u0001R\u0001"],
];
const SHOW: Record<string, { cls: "saw" | "hon"; text: string; meaning: string }> = {
  S: { cls: "saw", text: "ﷺ", meaning: "Peace be upon him" },
  H: { cls: "hon", text: "عليه السلام", meaning: "Peace be upon him" },
  R: { cls: "hon", text: "رضي الله عنه", meaning: "May Allaah be pleased with him" },
  P: { cls: "hon", text: "رضي الله عنهم", meaning: "May Allaah be pleased with them" },
};

/** The spans of text inside quotation marks ('…', "…", “…”), which are kept as written. */
function quoted(s: string): [number, number][] {
  const out: [number, number][] = [];
  const re = /(^|[\s(])(['"“‘])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const open = m.index + m[1].length;
    const close = { "'": /'(?=[\s.,;:)!?]|$)/g, '"': /"/g, "“": /”/g, "‘": /’(?=[\s.,;:)!?]|$)/g }[m[2]]!;
    close.lastIndex = open + 1;
    const c = close.exec(s);
    // (a quotation mark the print never closes opens nothing: quotes here are a few words)
    if (!c || c.index - open > 90) continue;
    out.push([open, c.index + 1]);
    re.lastIndex = c.index + 1;
  }
  return out;
}

export function glossNodes(text: string, term: string): ReactNode[] {
  let s = text;
  for (const [re, to] of HONORIFIC) s = s.replace(re, to);
  // the entry's own words are not explained in brackets inside it
  const own = new Set(term.toLowerCase().split(/\s+or\s+|\s+/));
  for (const [re, english] of ENGLISH) {
    const q = quoted(s);
    const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
    let m: RegExpExecArray | null;
    while ((m = g.exec(s))) {
      const at = m.index, end = at + m[0].length;
      if (own.has(m[0].toLowerCase()) || [...own].some((w) => m![0].toLowerCase().startsWith(w + " ") || m![0].toLowerCase() === w + "s")) break;
      if (q.some(([a, b]) => at >= a && at < b)) continue;
      // already explained right after it ("Haajar (Hagar)")
      if (/^\s*\(/.test(s.slice(end))) break;
      s = s.slice(0, end) + ` (${english})` + s.slice(end);
      break;
    }
  }
  // honorific marks to their Arabic
  return s.split(/\u0001([SHRP])\u0001/).map((part, i) => {
    if (i % 2 === 0) return part;
    const h = SHOW[part];
    return (
      <span key={i} className={h.cls} lang="ar" title={h.meaning}>
        {h.text}
      </span>
    );
  });
}
