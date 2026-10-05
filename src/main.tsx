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
import "@fontsource-variable/bodoni-moda";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource-variable/josefin-sans";
import "@fontsource-variable/jost";
import "@fontsource-variable/fraunces/wght-italic.css";
// each theme's faces to read in and to name things with (index.css: each theme's lettering)
import "@fontsource-variable/alegreya";
import "@fontsource-variable/alegreya/wght-italic.css";
import "@fontsource-variable/cormorant-garamond";
import "@fontsource-variable/cormorant-garamond/wght-italic.css";
import "@fontsource-variable/space-grotesk";
import "@fontsource/space-mono/400.css";
import "@fontsource-variable/commissioner/flar.css";
import "@fontsource-variable/brygada-1918";
import "@fontsource-variable/brygada-1918/wght-italic.css";
import "@fontsource-variable/fraunces/opsz.css";
import "@fontsource/spectral/300.css";
import "@fontsource/spectral/300-italic.css";
import "@fontsource/spectral/400.css";
import "@fontsource/spectral/500.css";
// Blue: a grotesk with a heavy, wide italic for names and its text weights for reading, and a
// technical mono for labels (both with a width axis)
import "@fontsource-variable/archivo/wdth.css";
import "@fontsource-variable/archivo/wdth-italic.css";
import "@fontsource-variable/martian-mono/wdth.css";
import "@fontsource/courier-prime/400.css";
import "@fontsource/courier-prime/700.css";
import "./index.css";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// a touch screen: the site's own selection and menus (index.css html.touch, lib/touch.ts)
if (matchMedia("(pointer: coarse)").matches) document.documentElement.classList.add("touch");

// Safari on iPhone zooms on a pinch whatever the page asks; its own gesture events can stop it
for (const type of ["gesturestart", "gesturechange"]) document.addEventListener(type, (e) => e.preventDefault(), { passive: false });

// kept on the device (dist/sw.js): the site opens at once and reads offline. Once the page has
// settled, the rest of the Qur'an is fetched quietly too, unless the reader saves data.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./sw.js")
      .then(() => {
        const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
        if (!saveData) setTimeout(() => navigator.serviceWorker.ready.then((r) => r.active?.postMessage("keep-all")), 8000);
      })
      .catch(() => {});
  });
}
