import { fromArabicDigits, loadSearchIndex, type Surah } from "./data";

export type Result =
  | { kind: "surah"; surah: Surah; score: number; why?: string }
  | { kind: "ayah"; surah: Surah; ayah: number; score: number }
  | { kind: "juz"; juz: number; surah: Surah; ayah: number; score: number }
  | { kind: "text"; surah: Surah; ayah: number; snippet: string; match: [number, number][]; score: number };

/** Other names and common spellings people type. */
export const ALIASES: Record<number, string[]> = {
  1: ["fatiha", "alhamd", "umm al kitab", "the opener", "seven oft repeated"],
  2: ["bakara", "baqara", "the heifer"],
  3: ["ali imran", "aal imran", "al imran", "family of imran", "house of imran"],
  4: ["nisa", "nisaa", "women"],
  5: ["maida", "maidah", "table", "the table spread", "the feast"],
  6: ["anam", "livestock", "cattle"],
  7: ["araf", "the heights", "the elevations"],
  8: ["anfal", "spoils of war", "the bounties"],
  9: ["tauba", "tawba", "baraah", "bara'ah", "repentance", "immunity"],
  10: ["jonah", "younus", "yoonus"],
  11: ["hood"],
  12: ["joseph", "yousuf", "yoosuf"],
  13: ["rad", "thunder"],
  14: ["abraham", "ibraheem"],
  15: ["hijr", "the rocky tract", "stoneland"],
  16: ["nahl", "the bee", "bees"],
  17: ["isra", "israa", "bani israil", "bani israel", "night journey", "children of israel"],
  18: ["kahaf", "the cave"],
  19: ["mary", "mariam", "maryum"],
  20: ["taha", "ta ha", "tah"],
  21: ["anbiya", "the prophets"],
  22: ["hajj", "pilgrimage"],
  23: ["muminoon", "mominun", "the believers"],
  24: ["noor", "the light"],
  25: ["furqan", "the criterion", "the standard"],
  26: ["shuara", "the poets"],
  27: ["naml", "the ants", "ant"],
  28: ["qasas", "kasas", "the stories", "the narration", "the whole story"],
  29: ["ankaboot", "the spider"],
  30: ["room", "the romans", "rome", "byzantines"],
  31: ["lukman", "luqmaan"],
  32: ["sajda", "sajdah", "prostration"],
  33: ["ahzab", "the confederates", "the clans", "the enemy alliance"],
  34: ["sheba", "saba"],
  35: ["fatir", "malaika", "the originator", "the angels"],
  36: ["yaseen", "yasin", "ya sin", "yaa seen", "heart of the quran"],
  37: ["saffat", "those ranged in ranks"],
  38: ["saad", "suad"],
  39: ["zumar", "the troops", "the groups"],
  40: ["ghafir", "mumin", "al mumin", "the forgiver"],
  41: ["fussilat", "ha mim sajdah", "hamim sajdah"],
  42: ["shura", "consultation"],
  43: ["zukhruf", "gold ornaments", "ornaments of gold"],
  44: ["dukhan", "smoke"],
  45: ["jathiya", "jasiya", "kneeling", "crouching"],
  46: ["ahqaf", "the sand dunes", "wind curved sandhills"],
  47: ["qital", "muhammad"],
  48: ["fath", "victory", "the triumph"],
  49: ["hujurat", "the rooms", "the inner apartments", "private quarters"],
  50: ["qaaf", "kaf"],
  51: ["dhariyat", "zariyat", "the winnowing winds", "scattering winds"],
  52: ["toor", "the mount", "mount sinai"],
  53: ["najm", "the star"],
  54: ["qamar", "the moon"],
  55: ["rehman", "rahmaan", "the most merciful", "the beneficent"],
  56: ["waqia", "waqiah", "the inevitable", "the event"],
  57: ["hadeed", "iron"],
  58: ["mujadala", "mujadilah", "the pleading woman", "the disputation"],
  59: ["hashr", "the exile", "the gathering"],
  60: ["mumtahina", "mumtahanah", "she that is to be examined", "the tested woman"],
  61: ["saff", "the ranks", "battle array"],
  62: ["juma", "jumuah", "jumma", "friday", "the congregation"],
  63: ["munafiqoon", "munafiqun", "the hypocrites"],
  64: ["taghabun", "mutual loss", "the mutual disillusion"],
  65: ["talaq", "divorce"],
  66: ["tahreem", "prohibition"],
  67: ["mulk", "tabarak", "dominion", "sovereignty", "the kingdom"],
  68: ["qalam", "noon", "nun", "the pen"],
  69: ["haqqa", "haaqqah", "the reality", "the inevitable hour"],
  70: ["maarij", "the ascending stairways", "ways of ascent"],
  71: ["nooh", "noah"],
  72: ["jin", "the jinn"],
  73: ["muzammil", "muzzammil", "the enshrouded one", "the wrapped"],
  74: ["mudassir", "muddathir", "muddaththir", "the cloaked one"],
  75: ["qiyama", "qiyamah", "resurrection"],
  76: ["dahr", "insaan", "man", "humanity", "time"],
  77: ["mursalat", "the emissaries", "those sent forth"],
  78: ["naba", "amma", "the tidings", "the great news", "the announcement"],
  79: ["naziat", "those who drag forth", "those who pull out"],
  80: ["abasa", "he frowned"],
  81: ["takweer", "takwir", "the overthrowing", "folding up", "the rolling"],
  82: ["infitar", "the cleaving", "bursting apart"],
  83: ["mutaffifeen", "tatfif", "the defrauding", "the defrauders"],
  84: ["inshiqaq", "the splitting open", "the sundering"],
  85: ["burooj", "buruj", "the constellations", "the mansions of the stars"],
  86: ["tariq", "the nightcomer", "the morning star", "the night star"],
  87: ["ala", "the most high"],
  88: ["ghashiya", "the overwhelming", "the pall"],
  89: ["fajr", "the dawn"],
  90: ["balad", "the city"],
  91: ["shams", "the sun"],
  92: ["lail", "layl", "the night"],
  93: ["duha", "zuha", "dhuha", "the morning hours", "morning brightness"],
  94: ["inshirah", "sharh", "alam nashrah", "relief", "the expansion"],
  95: ["teen", "the fig"],
  96: ["alaq", "iqra", "the clot", "the embryo"],
  97: ["qadr", "power", "the night of decree"],
  98: ["bayyina", "bayyinah", "the clear proof", "the clear evidence"],
  99: ["zilzal", "zalzala", "zalzalah", "the earthquake"],
  100: ["adiyat", "the chargers", "the courser"],
  101: ["qaria", "qariah", "the calamity", "the striking hour"],
  102: ["takasur", "takathur", "rivalry in world increase", "competition"],
  103: ["asr", "time", "the declining day", "the epoch"],
  104: ["humaza", "humazah", "the slanderer", "the traducer"],
  105: ["feel", "fil", "the elephant"],
  106: ["quraish", "quraysh"],
  107: ["maun", "small kindnesses", "the assistance", "neighbourly assistance"],
  108: ["kausar", "kawsar", "kauthar", "kawthar", "abundance", "plenty"],
  109: ["kafiroon", "kafirun", "the disbelievers"],
  110: ["nasr", "divine support", "the help", "victory"],
  111: ["lahab", "abu lahab", "masad", "palm fiber", "the flame"],
  112: ["ikhlaas", "tawhid", "sincerity", "purity of faith", "oneness"],
  113: ["falak", "the daybreak", "the dawn"],
  114: ["naas", "mankind", "humankind", "people"],
};

/** Collapse transliteration variants so 'Yaseen', 'Ya-Sin' and 'yasin' meet. */
export function normLatin(s: string) {
  let t = s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’‘`'ʿʾ"]/g, "")
    .replace(/[-_.,/]/g, " ")
    .replace(/\b(surah|surat|sura|chapter)\b/g, " ")
    .trim()
    .replace(/^(al|an|ar|as|at|ash|ad|adh|az|aal|ali|el|ul)\s+/, "")
    .replace(/^(al|an|ar|as|at|ash|ad|az)(?=[a-z]{3,})/, (m, _p, _off, str) =>
      // only strip a glued article when what's left still looks like a name
      str.length - m.length >= 3 ? "" : m,
    );
  t = t
    .replace(/\s+/g, "")
    .replace(/dh/g, "z")
    .replace(/q/g, "k")
    .replace(/aw/g, "au")
    .replace(/ay/g, "ai")
    .replace(/ee/g, "i")
    .replace(/oo|ou/g, "u")
    .replace(/o/g, "u")
    .replace(/(.)\1+/g, "$1")
    .replace(/h$/g, "");
  return t;
}

/** Arabic without diacritics, with unified letter forms and no article. */
export function normArabic(s: string) {
  return s
    .replace(/[ً-ٰٟۖ-ۭـ]/g, "")
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/سورة\s*/g, "")
    .trim();
}
const stripArticle = (s: string) => s.replace(/^ال/, "");

function dl(a: string, b: string) {
  // Damerau-Levenshtein (optimal string alignment)
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > 3) return 99;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  return d[m][n];
}

/** A name by its consonants: vowels gone and sound-alike letters merged, so spellings the way people
 *  say them still meet ('kosar' and 'kawthar', 'rehman' and 'rahman', 'mariam' and 'maryam'). */
function skeleton(norm: string) {
  return norm
    .replace(/th/g, "s")
    .replace(/kh/g, "k")
    .replace(/gh/g, "g")
    .replace(/sh/g, "s")
    .replace(/ph/g, "f")
    .replace(/[aeiouyw]/g, "")
    .replace(/(.)\1+/g, "$1");
}

type Prepared = { surah: Surah; latin: string[]; skel: string[]; words: string[][]; arabic: string };
let prepared: Prepared[] | null = null;
function prepare(surahs: Surah[]) {
  if (prepared) return prepared;
  prepared = surahs.map((s) => {
    const names = [s.tr, s.tc, ...(ALIASES[s.n] ?? [])];
    const english = [s.en, ...(ALIASES[s.n] ?? []).filter((a) => a.includes(" ") || a.length > 5)];
    return {
      surah: s,
      latin: [...new Set(names.map(normLatin))],
      skel: [...new Set(names.map((n) => skeleton(normLatin(n))))],
      words: english.map((e) => e.toLowerCase().replace(/^the\s+/, "").split(/[\s-]+/)),
      arabic: stripArticle(normArabic(s.ar)),
    };
  });
  return prepared;
}

function scoreSurah(p: Prepared, qRaw: string): number {
  const isArabic = /[؀-ۿ]/.test(qRaw);
  if (isArabic) {
    const q = stripArticle(normArabic(qRaw));
    if (!q) return 0;
    if (q === p.arabic) return 100;
    if (p.arabic.startsWith(q)) return 85;
    if (p.arabic.includes(q)) return 65;
    const d = dl(q, p.arabic);
    return d <= 1 ? 60 : 0;
  }
  const q = normLatin(qRaw);
  if (!q) return 0;
  let best = 0;
  for (const name of p.latin) {
    if (q === name) best = Math.max(best, 100);
    else if (name.startsWith(q) && q.length >= 2) best = Math.max(best, 82 + (q.length / name.length) * 10);
    else if (q.length >= 4 && name.includes(q)) best = Math.max(best, 62);
    else if (q.length >= 3) {
      const d = dl(q, name);
      const tol = q.length <= 4 ? 1 : q.length <= 8 ? 2 : 3;
      if (d <= tol) best = Math.max(best, 76 - d * 9);
    }
  }
  // said the way it sounds: the same consonants, or one off for a longer name
  const qs = skeleton(q);
  if (qs.length >= 3) {
    for (const sk of p.skel) {
      if (qs === sk) best = Math.max(best, 72);
      else if (qs.length >= 4 && sk.length >= 4 && dl(qs, sk) <= 1) best = Math.max(best, 58);
    }
  }
  // English meaning: every typed word must appear (prefix) in the meaning
  const qWords = qRaw.toLowerCase().replace(/^the\s+/, "").split(/[\s-]+/).filter(Boolean);
  if (qWords.length && qWords.join("").length >= 3) {
    for (const words of p.words) {
      if (qWords.every((w) => words.some((x) => x === w))) best = Math.max(best, 90);
      else if (qWords.every((w) => words.some((x) => x.startsWith(w)))) best = Math.max(best, 74);
    }
  }
  return best;
}

export function findSurahs(surahs: Surah[], q: string, limit = 6) {
  const list = prepare(surahs)
    .map((p) => ({ surah: p.surah, score: scoreSurah(p, q) }))
    .filter((r) => r.score >= 50)
    .sort((a, b) => b.score - a.score || a.surah.n - b.surah.n);
  return list.slice(0, limit);
}

/** Instant results: references, surah names, juz. */
export function searchDirect(surahs: Surah[], juz: Record<string, string>, raw: string): Result[] {
  const q = fromArabicDigits(raw).trim().replace(/\s+/g, " ");
  if (!q) return [];
  const byN = (n: number) => surahs[n - 1];
  const out: Result[] = [];

  // 2:255 · 2 255 · 2.255 · 2/255 · 2-255
  let m = q.match(/^(\d{1,3})\s*[:.\/\-\s,]\s*(\d{1,3})(?:\s*-\s*\d{1,3})?$/);
  if (m) {
    const s = +m[1], a = +m[2];
    if (s >= 1 && s <= 114) {
      const sur = byN(s);
      if (a >= 1 && a <= sur.count) out.push({ kind: "ayah", surah: sur, ayah: a, score: 100 });
      out.push({ kind: "surah", surah: sur, score: 70 });
    }
    return out;
  }
  // 18
  m = q.match(/^(\d{1,3})$/);
  if (m) {
    const s = +m[1];
    if (s >= 1 && s <= 114) out.push({ kind: "surah", surah: byN(s), score: 100 });
    // also offer juz of that number
    if (s >= 1 && s <= 30) {
      const [js, ja] = juz[String(s)].split(":").map(Number);
      out.push({ kind: "juz", juz: s, surah: byN(js), ayah: ja, score: 40 });
    }
    return out;
  }
  // juz 30 · para 30 · j30
  m = q.match(/^(?:juz|juzz|jz|para|part|j|sipara|جزء)\s*(\d{1,2})$/i);
  if (m) {
    const n = +m[1];
    if (n >= 1 && n <= 30) {
      const [js, ja] = juz[String(n)].split(":").map(Number);
      out.push({ kind: "juz", juz: n, surah: byN(js), ayah: ja, score: 100 });
    }
    return out;
  }
  // kahf 10 · baqarah:255 · the cow 255 · الكهف ١٠
  m = q.match(/^(.+?)\s*[:\s,.]\s*(\d{1,3})$/);
  if (m) {
    const hits = findSurahs(surahs, m[1], 3);
    const a = +m[2];
    for (const h of hits) {
      if (a >= 1 && a <= h.surah.count) out.push({ kind: "ayah", surah: h.surah, ayah: a, score: h.score });
    }
    if (out.length) return out;
  }
  for (const h of findSurahs(surahs, q)) out.push({ kind: "surah", surah: h.surah, score: h.score });
  return out;
}

type IndexRow = { key: string; en: string; ar: string; raw: [string, string, string, string] };
let rows: IndexRow[] | null = null;

/** Full-text search across Saheeh International, The Clear Quran and the Arabic. */
export async function searchText(surahs: Surah[], raw: string, limit = 40): Promise<Result[]> {
  const q = raw.trim();
  if (q.length < 3 || /^\d/.test(q)) return [];
  if (!rows) {
    const data = await loadSearchIndex();
    rows = data.map((r) => ({ key: r[0], en: (r[1] + " ‖ " + r[2]).toLowerCase(), ar: normArabic(r[3]), raw: r }));
  }
  const arabic = /[؀-ۿ]/.test(q);
  const needle = arabic ? normArabic(q) : q.toLowerCase();
  const words = needle.split(/\s+/).filter((w) => w.length >= 2);
  if (!words.length) return [];
  const results: Result[] = [];
  for (const r of rows) {
    const hay = arabic ? r.ar : r.en;
    if (!words.every((w) => hay.includes(w))) continue;
    let score = 0;
    for (const w of words) {
      const re = new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g");
      score += (hay.match(re)?.length ?? 0) * 2 + 1;
    }
    if (hay.includes(needle)) score += 6;
    const [s, a] = r.key.split(":").map(Number);
    const src = arabic ? r.raw[3] : r.raw[1];
    const low = arabic ? normArabic(src) : src.toLowerCase();
    const at = Math.max(0, low.indexOf(words[0]));
    const from = Math.max(0, at - 50);
    const snippet = (from > 0 ? "…" : "") + src.slice(from, from + 150) + (from + 150 < src.length ? "…" : "");
    const match: [number, number][] = [];
    if (!arabic) {
      const sl = snippet.toLowerCase();
      for (const w of words) {
        let i = sl.indexOf(w);
        while (i >= 0) {
          match.push([i, i + w.length]);
          i = sl.indexOf(w, i + w.length);
        }
      }
    }
    results.push({ kind: "text", surah: surahs[s - 1], ayah: a, snippet, match, score });
  }
  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}
