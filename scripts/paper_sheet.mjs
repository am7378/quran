// The Paper theme's sheet: an off-white page with a slightly uneven edge (torn a little more along
// its foot), paper texture and two soft folds, as one SVG drawn once (index.css: --paper-sheet).
// Run: node scripts/paper_sheet.mjs  → prints the CSS custom property to paste into index.css.
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const W = 1000, H = 1000;
const pts = [];
// along each edge: small irregularities; the foot torn, with a few deeper bites
const edge = (x0, y0, x1, y1, n, amp, bites) => {
  for (let i = 0; i < n; i++) {
    const t = i / n;
    let j = (rnd() - 0.5) * 2 * amp + Math.sin(t * 37) * amp * 0.25;
    if (bites && rnd() < 0.08) j += amp * (1.6 + rnd() * 1.6);
    const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
    // push inwards from the edge (the normal points into the sheet)
    const nx = y1 - y0, ny = x0 - x1, len = Math.hypot(nx, ny);
    pts.push([x + (nx / len) * Math.abs(j), y + (ny / len) * Math.abs(j)]);
  }
};
const m = 3; // the sheet stays inside the box by this much, so the edge shows
edge(m, m, W - m, m, 90, 1.6, false); // top
edge(W - m, m, W - m, H - m, 90, 1.4, false); // right
edge(W - m, H - m, m, H - m, 130, 4.2, true); // bottom: torn
edge(m, H - m, m, m, 90, 1.4, false); // left
const d = "M" + pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join("L") + "Z";

const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${W} ${H}' preserveAspectRatio='none'>
<defs>
<filter id='t' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='0.75 0.95' numOctaves='3' seed='4' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.42 0 0 0 0 0.39 0 0 0 0 0.33 0 0 0 0.16 0'/></filter>
<filter id='f' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='0.012 0.05' numOctaves='2' seed='9'/><feColorMatrix values='0 0 0 0 0.5 0 0 0 0 0.47 0 0 0 0 0.4 0 0 0 0.09 0'/></filter>
<linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#f1eee6'/><stop offset='0.55' stop-color='#ebe6da'/><stop offset='1' stop-color='#e2dccd'/></linearGradient>
<clipPath id='c'><path d='${d}'/></clipPath>
</defs>
<path d='${d}' fill='url(#g)'/>
<g clip-path='url(#c)'>
<rect width='${W}' height='${H}' filter='url(#f)'/>
<rect width='${W}' height='${H}' filter='url(#t)'/>
<line x1='618' y1='0' x2='612' y2='${H}' stroke='#000' stroke-opacity='0.045' stroke-width='2.2'/>
<line x1='621' y1='0' x2='615' y2='${H}' stroke='#fff' stroke-opacity='0.5' stroke-width='1.4'/>
<line x1='0' y1='452' x2='${W}' y2='444' stroke='#000' stroke-opacity='0.035' stroke-width='2'/>
<line x1='0' y1='455' x2='${W}' y2='447' stroke='#fff' stroke-opacity='0.4' stroke-width='1.2'/>
</g>
<path d='${d}' fill='none' stroke='#a29b8a' stroke-opacity='0.5' stroke-width='1.1' vector-effect='non-scaling-stroke'/>
</svg>`;
const url = "data:image/svg+xml," + encodeURIComponent(svg.replace(/\n/g, "")).replace(/'/g, "%27");
console.log(`  --paper-sheet: url("${url}");`);
