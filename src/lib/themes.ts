import type React from "react";

/**
 * The site's themes: each its own sky, box, type and motion (index.css under
 * :root[data-theme=…], components/ui/skies.tsx, ImmersivePanel). `preview` draws its swatch.
 */
export type ThemeId = "classic" | "crimson" | "mono" | "atlas" | "folio" | "lunar" | "paper" | "blue";

export const THEMES: { id: ThemeId; name: string; preview: { bg: string; box: string; fg: string; ac: string; r: number; b: string }; face: React.CSSProperties }[] = [
  { id: "classic", name: "Classic", preview: { bg: "#0b1320", box: "rgba(12,18,28,0.92)", fg: "#efe9dd", ac: "#c9a24a", r: 0, b: "3px solid #06080c" }, face: { fontFamily: "Newsreader Variable", fontStyle: "italic" } },
  { id: "crimson", name: "Crimson", preview: { bg: "#5a0d13", box: "#1a0507", fg: "#eddcbb", ac: "#c9a35f", r: 0, b: "3px solid #100203" }, face: { fontFamily: "Amiri", fontStyle: "italic" } },
  { id: "mono", name: "Monochrome", preview: { bg: "#141414", box: "#f3f0ea", fg: "#161616", ac: "#161616", r: 0, b: "1px solid #f3f0ea" }, face: { fontFamily: "Geist Variable", fontWeight: 500, letterSpacing: "-0.02em" } },
  { id: "atlas", name: "Atlas", preview: { bg: "#070707", box: "#ebe9dc", fg: "#0e0e0c", ac: "#ff5a2e", r: 0, b: "0" }, face: { fontFamily: "Bodoni Moda Variable", fontWeight: 500 } },
  { id: "folio", name: "Folio", preview: { bg: "#cdb98e", box: "#d8c294", fg: "#141210", ac: "#141210", r: 0, b: "1.5px solid #141210" }, face: { fontFamily: "Josefin Sans Variable", textTransform: "uppercase", letterSpacing: "0.08em" } },
  { id: "paper", name: "Paper", preview: { bg: "#8e8a82", box: "#ece8de", fg: "#23211c", ac: "#9b3d2c", r: 0, b: "1px solid #b8b1a2" }, face: { fontFamily: "Fraunces Variable", fontStyle: "italic", fontWeight: 340 } },
  { id: "blue", name: "Blue", preview: { bg: "#050d2e", box: "#070b1c", fg: "#e9ecf5", ac: "#4169e1", r: 4, b: "1px solid rgba(233,236,245,0.16)" }, face: { fontFamily: "Lexend Variable", fontWeight: 300, letterSpacing: "-0.01em" } },
  { id: "lunar", name: "Lunar", preview: { bg: "#0a1a2c", box: "#0f1b29", fg: "#e8eef5", ac: "#c9d6e3", r: 12, b: "4px solid #04070c" }, face: { fontFamily: "Jost Variable", fontWeight: 300, textTransform: "uppercase", letterSpacing: "0.16em" } },
];
