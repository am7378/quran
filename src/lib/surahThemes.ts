/**
 * A visual theme per surah, drawn from its name and subject: a palette
 * [light, mid, deep] and a motif rendered (heavily blurred) behind the
 * card text. The Bee gets a honeycomb, the Sun a sun, the Cave an arch …
 */
export type Motif =
  | "arch" | "dunes" | "orbit" | "leaves" | "disc" | "mountain" | "rays" | "light"
  | "waves" | "smoke" | "stars" | "cracks" | "flame" | "pillars" | "hex" | "cube"
  | "split" | "ink" | "dots" | "web" | "lines" | "scales" | "steps" | "folds"
  | "star" | "moon" | "sun" | "eclipse" | "horizon" | "city" | "drop" | "swirl" | "lamp";

export type SurahTheme = { p: [string, string, string]; m: Motif };

export const THEMES: SurahTheme[] = [
  { p: ["#EAD9A6", "#C9A24A", "#5E4418"], m: "arch" }, // 1 The Opening — a gate of light
  { p: ["#D2B387", "#7A5C3A", "#2A241C"], m: "dunes" }, // 2 The Cow
  { p: ["#9FB6DA", "#2B4C7E", "#0F1729"], m: "orbit" }, // 3 Family of Imran
  { p: ["#E2B1AA", "#8C4A55", "#2A1A20"], m: "leaves" }, // 4 Women
  { p: ["#E8BE84", "#9E5A2C", "#2B1A12"], m: "disc" }, // 5 The Table Spread
  { p: ["#B3C293", "#5A6B3F", "#1D2416"], m: "dunes" }, // 6 Cattle
  { p: ["#AFC0D2", "#4C6178", "#161E29"], m: "mountain" }, // 7 The Heights
  { p: ["#D3A56D", "#6E4A2A", "#1E150E"], m: "rays" }, // 8 Spoils of War
  { p: ["#EBCDA5", "#7B5B7A", "#141225"], m: "horizon" }, // 9 Repentance — dawn after night
  { p: ["#6FA8B6", "#123B4A", "#061A22"], m: "waves" }, // 10 Jonah — the deep
  { p: ["#A5B7B9", "#3E5256", "#12191B"], m: "smoke" }, // 11 Hud — the storm wind
  { p: ["#E2CF96", "#35507A", "#0E1628"], m: "stars" }, // 12 Joseph — eleven stars, sun and moon
  { p: ["#C4CCE0", "#4A5570", "#12151F"], m: "cracks" }, // 13 Thunder
  { p: ["#F3BC77", "#B4452C", "#2A0F0A"], m: "flame" }, // 14 Abraham — the fire made cool
  { p: ["#CF9C77", "#7A4B34", "#21140E"], m: "pillars" }, // 15 The Rocky Tract
  { p: ["#F4C85A", "#B7791F", "#3A2408"], m: "hex" }, // 16 The Bee
  { p: ["#8E86C8", "#27234F", "#0A0918"], m: "stars" }, // 17 The Night Journey
  { p: ["#6F928D", "#1F3431", "#0A1211"], m: "arch" }, // 18 The Cave
  { p: ["#E8CEC9", "#9C6E73", "#2E1F24"], m: "leaves" }, // 19 Mary — the palm
  { p: ["#EDAA66", "#6B3B2A", "#1A0E0B"], m: "flame" }, // 20 Ta-Ha — the fire in the valley
  { p: ["#DDD0A6", "#5E6F8A", "#141B26"], m: "orbit" }, // 21 The Prophets
  { p: ["#ECE9E2", "#8E8A80", "#161616"], m: "cube" }, // 22 The Pilgrimage
  { p: ["#A8CCB3", "#3F6B54", "#10201A"], m: "light" }, // 23 The Believers
  { p: ["#FFF3C8", "#E0B44C", "#4A3410"], m: "lamp" }, // 24 The Light — the niche and the lamp
  { p: ["#E4E4E4", "#6E6E6E", "#101010"], m: "split" }, // 25 The Criterion
  { p: ["#DED1B8", "#5B4A3A", "#171310"], m: "ink" }, // 26 The Poets
  { p: ["#C49769", "#5E4028", "#1B120B"], m: "dots" }, // 27 The Ants
  { p: ["#98BCB1", "#2F5B5E", "#0E1C1D"], m: "waves" }, // 28 The Stories — the river
  { p: ["#D0D3DA", "#5B606B", "#121418"], m: "web" }, // 29 The Spider
  { p: ["#A87DB5", "#4A2E5A", "#140C1A"], m: "pillars" }, // 30 The Romans
  { p: ["#C4BB85", "#5E5A33", "#1B1A0E"], m: "leaves" }, // 31 Luqman
  { p: ["#7488B8", "#243157", "#0B0F1E"], m: "arch" }, // 32 Prostration
  { p: ["#B69C77", "#5B4A33", "#18130C"], m: "lines" }, // 33 The Confederates — the trench
  { p: ["#7FB296", "#2D5A45", "#0C1A14"], m: "leaves" }, // 34 Sheba — the two gardens
  { p: ["#F2DDBC", "#8E9FC7", "#1A1E33"], m: "rays" }, // 35 The Originator
  { p: ["#DE9677", "#7A2E2A", "#1F0B0A"], m: "light" }, // 36 Ya-Sin
  { p: ["#CDD4E1", "#5C6A85", "#111623"], m: "lines" }, // 37 Ranged in Rows
  { p: ["#B6A893", "#5A4E40", "#17130F"], m: "mountain" }, // 38 Sad
  { p: ["#97A7BB", "#3C4A5E", "#10151D"], m: "pillars" }, // 39 The Groups — the gates
  { p: ["#B2CFC2", "#8F7A38", "#10201B"], m: "light" }, // 40 The Forgiver
  { p: ["#E0D4BD", "#6D5F4B", "#15120E"], m: "ink" }, // 41 Explained in Detail
  { p: ["#AFC3AC", "#4D6150", "#121A14"], m: "orbit" }, // 42 Consultation
  { p: ["#F4DC92", "#B88A2E", "#2D1F06"], m: "hex" }, // 43 Gold Ornaments
  { p: ["#C0C0C0", "#4F4F52", "#121213"], m: "smoke" }, // 44 Smoke
  { p: ["#BC9C87", "#4F3B35", "#150F0D"], m: "dunes" }, // 45 Kneeling
  { p: ["#E4BE8E", "#9A6A3C", "#2A1A0C"], m: "dunes" }, // 46 The Sand Dunes
  { p: ["#8DBB9C", "#2F5E45", "#0B1A12"], m: "light" }, // 47 Muhammad
  { p: ["#F7DCA6", "#C0833A", "#2B170A"], m: "rays" }, // 48 Victory
  { p: ["#C8BFB2", "#6A6158", "#171513"], m: "pillars" }, // 49 The Rooms
  { p: ["#98ADC3", "#344760", "#0C121B"], m: "mountain" }, // 50 Qaf
  { p: ["#CFD8DB", "#6A7F86", "#131A1C"], m: "swirl" }, // 51 The Scattering Winds
  { p: ["#C29275", "#5E3C2C", "#190F0B"], m: "mountain" }, // 52 The Mount
  { p: ["#EAE4FF", "#5D5A9A", "#0B0A1F"], m: "star" }, // 53 The Star
  { p: ["#E9EBF0", "#7C8499", "#0D0F16"], m: "moon" }, // 54 The Moon
  { p: ["#A9DACE", "#E8A598", "#12302C"], m: "waves" }, // 55 The Most Merciful — two seas, pearl and coral
  { p: ["#CAB1DC", "#4E3563", "#120B1A"], m: "orbit" }, // 56 The Inevitable
  { p: ["#B6BCC2", "#4E555C", "#121416"], m: "lines" }, // 57 Iron
  { p: ["#DCBEB9", "#7A5A5E", "#1E1517"], m: "light" }, // 58 The Pleading Woman
  { p: ["#C9B095", "#6B563F", "#19140E"], m: "dunes" }, // 59 The Exile
  { p: ["#CFC9BA", "#6E685A", "#161511"], m: "scales" }, // 60 She Who Is Examined
  { p: ["#B8C8D5", "#4A5B6C", "#10161C"], m: "lines" }, // 61 The Ranks
  { p: ["#F3E6C0", "#B59A54", "#2A220F"], m: "rays" }, // 62 Friday
  { p: ["#9A95A3", "#3E3A47", "#121015"], m: "smoke" }, // 63 The Hypocrites
  { p: ["#BCAAC2", "#5A4A63", "#140F18"], m: "scales" }, // 64 Mutual Loss
  { p: ["#D0C3B1", "#6B5E50", "#171411"], m: "split" }, // 65 Divorce
  { p: ["#C2A5A9", "#5E4448", "#170F11"], m: "lines" }, // 66 Prohibition
  { p: ["#8B9BDB", "#2B3570", "#080B1E"], m: "stars" }, // 67 Sovereignty — the layered heavens
  { p: ["#D6CFC1", "#3B3630", "#0E0D0B"], m: "ink" }, // 68 The Pen
  { p: ["#D6CBC0", "#6C4F43", "#170E0B"], m: "cracks" }, // 69 The Reality
  { p: ["#C3CEE5", "#4F5F85", "#0F1422"], m: "steps" }, // 70 The Ascending Stairways
  { p: ["#7FA4BB", "#27475C", "#0A151D"], m: "waves" }, // 71 Noah — the flood
  { p: ["#BE98E6", "#5B2E8A", "#12081E"], m: "flame" }, // 72 The Jinn — smokeless fire
  { p: ["#9B94C0", "#39345C", "#0E0C1A"], m: "folds" }, // 73 The Wrapped One
  { p: ["#DCA57B", "#7A3B25", "#1D0D08"], m: "folds" }, // 74 The Cloaked One
  { p: ["#CFBFAC", "#5E4E42", "#16110E"], m: "rays" }, // 75 The Resurrection
  { p: ["#C0D8B2", "#5E7F4E", "#131E0F"], m: "leaves" }, // 76 Man
  { p: ["#C1CDD2", "#566A72", "#11181B"], m: "swirl" }, // 77 The Emissaries
  { p: ["#CFBB98", "#6A5A40", "#18140C"], m: "mountain" }, // 78 The Great News
  { p: ["#A6B0D1", "#3D4670", "#0C0F1E"], m: "orbit" }, // 79 Those Who Drag Forth
  { p: ["#D8C0AA", "#76584A", "#1A120E"], m: "light" }, // 80 He Frowned
  { p: ["#E49E69", "#2A1A14", "#070404"], m: "eclipse" }, // 81 The Folding Up — the sun wound round
  { p: ["#AABAD8", "#3A4668", "#0B0F1C"], m: "cracks" }, // 82 The Cleaving
  { p: ["#D1BD95", "#6B5A36", "#18140B"], m: "scales" }, // 83 The Defrauders
  { p: ["#CFB1CC", "#5B3D62", "#140B17"], m: "split" }, // 84 The Splitting Open
  { p: ["#B2BEF3", "#353F80", "#080A1E"], m: "stars" }, // 85 The Constellations
  { p: ["#F3F2FF", "#4B4A8C", "#07061A"], m: "star" }, // 86 The Night-Comer
  { p: ["#D0DEC8", "#5E7A58", "#121B10"], m: "mountain" }, // 87 The Most High
  { p: ["#BEA597", "#4E3B33", "#130D0B"], m: "waves" }, // 88 The Overwhelming
  { p: ["#F6CBA5", "#B05F5A", "#1E1022"], m: "horizon" }, // 89 The Dawn
  { p: ["#D0C0A8", "#6A5B47", "#17130F"], m: "city" }, // 90 The City
  { p: ["#FFCC7A", "#E0702E", "#3A1406"], m: "sun" }, // 91 The Sun
  { p: ["#7F84B8", "#23264A", "#07081A"], m: "moon" }, // 92 The Night
  { p: ["#FFEBBB", "#F2B45E", "#4A2E10"], m: "sun" }, // 93 The Morning Brightness
  { p: ["#D4E9DE", "#6FA58E", "#12241C"], m: "light" }, // 94 The Relief
  { p: ["#AABA7A", "#5B3F5A", "#171410"], m: "leaves" }, // 95 The Fig
  { p: ["#DE7C7C", "#7A1F2A", "#1A0508"], m: "drop" }, // 96 The Clot — "Read!"
  { p: ["#D2C4FF", "#3B2E7A", "#07051A"], m: "rays" }, // 97 The Night of Decree
  { p: ["#E9F0F3", "#8FA3AE", "#141A1D"], m: "light" }, // 98 The Clear Proof
  { p: ["#CCA586", "#5E3B28", "#170D08"], m: "cracks" }, // 99 The Earthquake
  { p: ["#E5BA98", "#8A4B2A", "#1F0F07"], m: "dots" }, // 100 The Chargers — sparks from hooves
  { p: ["#C7BBD0", "#54485E", "#120E15"], m: "dots" }, // 101 The Striking Hour — scattered moths
  { p: ["#D2C2A5", "#6C5C43", "#17130D"], m: "lines" }, // 102 Rivalry in Increase
  { p: ["#F4C995", "#A86A3A", "#241208"], m: "horizon" }, // 103 Time — the declining day
  { p: ["#E48F68", "#7A2A18", "#1C0804"], m: "flame" }, // 104 The Slanderer
  { p: ["#C2B19A", "#5A4B3C", "#16110C"], m: "dots" }, // 105 The Elephant — birds and stones
  { p: ["#DFC296", "#7C5E3A", "#1C140A"], m: "dunes" }, // 106 Quraysh — the caravans
  { p: ["#D0C8B9", "#6A6254", "#161410"], m: "light" }, // 107 Small Kindnesses
  { p: ["#9BE5DB", "#2C8C88", "#062624"], m: "waves" }, // 108 Abundance — the river
  { p: ["#C4C4C4", "#555555", "#111111"], m: "split" }, // 109 The Disbelievers
  { p: ["#F6D994", "#BF8B2E", "#2A1A04"], m: "rays" }, // 110 Divine Help
  { p: ["#E09E68", "#6E3A1E", "#1A0C05"], m: "flame" }, // 111 Palm Fibre
  { p: ["#F5F7FB", "#9DB1D6", "#1C2A4A"], m: "disc" }, // 112 Sincerity — the One
  { p: ["#F8DBB8", "#9C7AA8", "#1A1230"], m: "horizon" }, // 113 The Daybreak
  { p: ["#E8CAB0", "#8C6450", "#1E140F"], m: "orbit" }, // 114 Mankind
];

export const themeOf = (n: number) => THEMES[(n - 1 + 114) % 114];
