/**
 * The Monochrome theme's sky: near-black (or warm stone), ruled like a technical sheet, the drawing
 * of an instrument laid over it in fine ink: rulers along the screen's edges, a viewfinder in its
 * corners, the axes through its middle, a ring and a bezel of ticks around the frame, a crosshair
 * above it and a leader beside it. Its ink and ground are the theme's (index.css --mono-*). Only the bezel moves, turning very slowly (held when still, and when motion is reduced).
 * Drawn in the screen's own pixels so every line stays a hairline at any size.
 */
import { useEffect, useRef, useState } from "react"

const INK = "currentColor" // var(--mono-ink), set on the drawing's box

export function MonoSky({ className, still }: { className?: string; still?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }))
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => {
      const { width: w, height: h } = e.contentRect
      if (w && h) setSize((s) => (Math.abs(s.w - w) < 1 && Math.abs(s.h - h) < 1 ? s : { w, h }))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const { w, h } = size
  const wide = w >= 768
  const cx = w / 2
  const cy = h / 2
  const inset = wide ? 26 : 14

  // the rulers: a tick every 10px, longer every 50 and 250
  let ticks = ""
  const len = (i: number) => (i % 250 === 0 ? (wide ? 14 : 9) : i % 50 === 0 ? (wide ? 8 : 6) : 3.5)
  for (let x = 10; x < w; x += 10) ticks += `M${x} 0V${len(x)}M${x} ${h}V${h - len(x)}`
  for (let y = 10; y < h; y += 10) ticks += `M0 ${y}H${len(y)}M${w} ${y}H${w - len(y)}`

  // the viewfinder in the screen's corners
  const arm = wide ? 26 : 16
  const corners =
    `M${inset} ${inset + arm}V${inset}H${inset + arm}` +
    `M${w - inset - arm} ${inset}H${w - inset}V${inset + arm}` +
    `M${inset} ${h - inset - arm}V${h - inset}H${inset + arm}` +
    `M${w - inset - arm} ${h - inset}H${w - inset}V${h - inset - arm}`

  // around the frame: a ring above and below it, a wider one beside it, and the bezel of ticks
  const ring = h * 0.43
  const side = w * 0.45
  const bezel = h * 0.47
  const bezelTick = (2 * Math.PI * bezel) / 180 // 180 ticks around

  // a crosshair above the frame, a mark pointing down to it
  const hy = h * (wide ? 0.052 : 0.04)
  const fade = "linear-gradient(to bottom, #000 0%, #000 81%, transparent 84%, transparent 100%)"

  return (
    <div ref={ref} className={className} style={{ color: "var(--mono-ink)", background: "radial-gradient(120% 90% at 50% 45%, var(--mono-sky-a) 0%, var(--mono-sky-b) 55%, var(--mono-sky-c) 100%)" }}>
      <svg className="absolute inset-0 h-full w-full" width={w} height={h} viewBox={`0 0 ${w} ${h}`} fill="none" stroke={INK} strokeWidth={1} shapeRendering="geometricPrecision">
        <path d={ticks} strokeOpacity={0.26} shapeRendering="crispEdges" />
        <path d={corners} strokeOpacity={0.5} strokeWidth={1.2} />
        {/* the axes */}
        <path d={`M0 ${cy}H${w}M${cx} 0V${h}`} strokeOpacity={0.14} shapeRendering="crispEdges" />
        {/* the crosshair */}
        <g strokeOpacity={0.55}>
          <circle cx={cx} cy={hy} r={wide ? 7 : 5.5} />
          <path d={`M${cx - 20} ${hy}H${cx - 7}M${cx + 7} ${hy}H${cx + 20}M${cx} ${hy - 20}V${hy - 7}M${cx} ${hy + 7}V${hy + 20}`} />
        </g>
        {wide && <path d={`M${cx - 7} ${hy + 30}H${cx + 7}L${cx} ${hy + 38}Z`} fill={INK} fillOpacity={0.6} stroke="none" />}
        {/* the axes' ends: small squares at the screen's edges */}
        <g fill={INK} fillOpacity={0.45} stroke="none">
          <rect x={inset - 3} y={cy - 3} width={6} height={6} />
          <rect x={w - inset - 3} y={cy - 3} width={6} height={6} />
        </g>
        {wide && (
          <>
            {/* beside the frame, a leader with its arrow pointing in */}
            <g strokeOpacity={0.45}>
              <path d={`M${w * 0.905} ${cy - 64}H${w * 0.955}V${cy - 20}`} />
              <path d={`M${w * 0.905} ${cy - 64}l8 -4.5v9z`} fill={INK} fillOpacity={0.5} stroke="none" />
            </g>
          </>
        )}
      </svg>
      {/* the rings (on a phone, faded out before the ayah slider under the frame) */}
      <div className="absolute inset-0" style={wide ? undefined : { maskImage: fade, WebkitMaskImage: fade }}>
        <svg className="absolute inset-0 h-full w-full" width={w} height={h} viewBox={`0 0 ${w} ${h}`} fill="none" stroke={INK} strokeWidth={1}>
          <circle cx={cx} cy={cy} r={ring} strokeOpacity={0.2} />
          {wide && <circle cx={cx} cy={cy} r={side} strokeOpacity={0.16} />}
          {wide && <circle cx={cx} cy={cy} r={Math.hypot(cx, cy) * 0.94} strokeOpacity={0.12} strokeDasharray="3 6" />}
        </svg>
        {/* the bezel: its own layer, turned by the compositor */}
        <svg
          className="mono-turn absolute"
          style={{ left: cx - bezel - 6, top: cy - bezel - 6, width: (bezel + 6) * 2, height: (bezel + 6) * 2, animationPlayState: still ? "paused" : "running" }}
          viewBox={`${-bezel - 6} ${-bezel - 6} ${(bezel + 6) * 2} ${(bezel + 6) * 2}`}
          fill="none"
          stroke={INK}
        >
          <circle r={bezel} strokeOpacity={0.24} strokeWidth={7} strokeDasharray={`1 ${bezelTick - 1}`} />
          <circle r={bezel} strokeOpacity={0.4} strokeWidth={12} strokeDasharray={`1.4 ${bezelTick * 15 - 1.4}`} />
          <circle r={bezel + 6} strokeOpacity={0.14} strokeWidth={1} />
        </svg>
      </div>
    </div>
  )
}
