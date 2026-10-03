import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "@fontsource-variable/newsreader/opsz.css";
import "@fontsource-variable/newsreader/opsz-italic.css";
import "@fontsource/amiri-quran";
import "@fontsource/reem-kufi/400.css";
import "@fontsource/reem-kufi/600.css";
import "@fontsource-variable/caveat";
// the themes' own type: Monochrome, Atlas (headings, labels), Folio, Lunar
import "@fontsource-variable/manrope";
import "@fontsource-variable/bodoni-moda";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource-variable/josefin-sans";
import "@fontsource-variable/jost";
import "@fontsource-variable/fraunces/wght-italic.css";
import "@fontsource/courier-prime/400.css";
import "@fontsource/courier-prime/700.css";
import "./index.css";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
