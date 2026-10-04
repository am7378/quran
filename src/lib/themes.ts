import type React from "react";

/**
 * The site's themes: each its own sky, box, type and motion (index.css under
 * :root[data-theme=…], components/ui/skies.tsx, ImmersivePanel). `preview` draws its swatch.
 */
export type ThemeId = "classic" | "mono" | "atlas" | "folio" | "lunar" | "paper";

export const THEMES: { id: ThemeId; name: string; line: string; preview: { bg: string; box: string; fg: string; ac: string; r: number; b: string }; face: React.CSSProperties }[] = [
  { id: "classic", name: "Classic", line: "Night glass and gold", preview: { bg: "#0b1320", box: "rgba(12,18,28,0.92)", fg: "#efe9dd", ac: "#c9a24a", r: 0, b: "3px solid #06080c" }, face: { fontFamily: "Newsreader Variable", fontStyle: "italic" } },
  { id: "mono", name: "Monochrome", line: "Charcoal on stone, drawn square", preview: { bg: "#e6e2dc", box: "#161616", fg: "#ece6dc", ac: "#ece6dc", r: 0, b: "1px solid #161616" }, face: { fontFamily: "Geist Variable", fontWeight: 500, letterSpacing: "-0.02em" } },
  { id: "atlas", name: "Atlas", line: "Bone and ink, an ember accent", preview: { bg: "#070707", box: "#ebe9dc", fg: "#0e0e0c", ac: "#ff5a2e", r: 0, b: "0" }, face: { fontFamily: "Bodoni Moda Variable", fontWeight: 500 } },
  { id: "folio", name: "Folio", line: "Sand paper and hairlines", preview: { bg: "#cdb98e", box: "#d8c294", fg: "#141210", ac: "#141210", r: 0, b: "1.5px solid #141210" }, face: { fontFamily: "Josefin Sans Variable", textTransform: "uppercase", letterSpacing: "0.08em" } },
  { id: "paper", name: "Paper", line: "Torn paper, typewriter and clips", preview: { bg: "#8e8a82", box: "#ece8de", fg: "#23211c", ac: "#9b3d2c", r: 0, b: "1px solid #b8b1a2" }, face: { fontFamily: "Fraunces Variable", fontStyle: "italic", fontWeight: 340 } },
  { id: "lunar", name: "Lunar", line: "Moonlight over the night", preview: { bg: "#0a1a2c", box: "#0f1b29", fg: "#e8eef5", ac: "#c9d6e3", r: 12, b: "4px solid #04070c" }, face: { fontFamily: "Jost Variable", fontWeight: 300, textTransform: "uppercase", letterSpacing: "0.16em" } },
];
