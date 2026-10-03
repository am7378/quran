import { memo, type ReactElement } from "react";
import type { Motif as MotifName } from "@/lib/surahThemes";

/** Deterministic pseudo-random numbers so each surah's art is stable. */
function rng(seed: number) {
  let s = seed * 9301 + 49297;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

type Props = { motif: MotifName; p: [string, string, string]; seed: number };

/** The abstract artwork behind a surah card, drawn on a 100×140 canvas. */
export const MotifArt = memo(function MotifArt({ motif, p, seed }: Props) {
  const [light, mid, deep] = p;
  const r = rng(seed);
  const id = `g${seed}`;
  const shapes = draw(motif, light, mid, deep, r);
  return (
    <svg viewBox="0 0 100 140" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor={mid} />
          <stop offset="1" stopColor={deep} />
        </linearGradient>
        <radialGradient id={`${id}r`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor={light} stopOpacity="1" />
          <stop offset="1" stopColor={light} stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="100" height="140" fill={`url(#${id})`} />
      {shapes(`url(#${id}r)`)}
    </svg>
  );
});

function draw(m: MotifName, light: string, mid: string, deep: string, r: () => number) {
  switch (m) {
    case "sun":
      return (glow: string) => (
        <>
          <circle cx="50" cy="58" r="46" fill={glow} opacity="0.55" />
          <circle cx="50" cy="58" r="22" fill={light} />
        </>
      );
    case "moon":
      return () => (
        <>
          <circle cx="54" cy="52" r="24" fill={light} />
          <circle cx="64" cy="46" r="21" fill={deep} />
          {Array.from({ length: 10 }, (_, i) => (
            <circle key={i} cx={r() * 100} cy={r() * 140} r={0.8 + r() * 1.2} fill={light} opacity="0.8" />
          ))}
        </>
      );
    case "eclipse":
      return (glow: string) => (
        <>
          <circle cx="50" cy="62" r="40" fill={glow} opacity="0.7" />
          <circle cx="50" cy="62" r="20" fill={deep} />
        </>
      );
    case "star":
      return (glow: string) => (
        <>
          <circle cx="50" cy="58" r="40" fill={glow} opacity="0.5" />
          <path d="M50 28 L55 53 L80 58 L55 63 L50 88 L45 63 L20 58 L45 53 Z" fill={light} />
        </>
      );
    case "stars":
      return () => (
        <>
          {Array.from({ length: 28 }, (_, i) => (
            <circle key={i} cx={r() * 100} cy={r() * 140} r={0.8 + r() * 2.8} fill={light} opacity={0.5 + r() * 0.5} />
          ))}
        </>
      );
    case "orbit":
      return () => (
        <>
          {[18, 30, 42].map((rr, i) => (
            <ellipse key={i} cx="50" cy="70" rx={rr + 8} ry={rr} fill="none" stroke={light} strokeWidth="2.5" opacity={0.8 - i * 0.18} />
          ))}
          <circle cx="50" cy="70" r="8" fill={light} />
          <circle cx={50 + 38} cy="62" r="4" fill={light} />
        </>
      );
    case "waves":
      return () => (
        <>
          {Array.from({ length: 6 }, (_, i) => {
            const y = 60 + i * 13;
            return (
              <path
                key={i}
                d={`M-10 ${y} Q 15 ${y - 10} 40 ${y} T 90 ${y} T 140 ${y}`}
                fill="none"
                stroke={i % 2 ? mid : light}
                strokeWidth="5"
                opacity={0.9 - i * 0.1}
              />
            );
          })}
        </>
      );
    case "dunes":
      return () => (
        <>
          <path d="M-10 90 Q 30 60 60 85 T 120 80 L120 150 L-10 150 Z" fill={light} opacity="0.75" />
          <path d="M-10 110 Q 40 85 70 105 T 120 100 L120 150 L-10 150 Z" fill={mid} />
          <circle cx="72" cy="38" r="10" fill={light} opacity="0.8" />
        </>
      );
    case "mountain":
      return () => (
        <>
          <path d="M-5 120 L35 50 L55 80 L72 40 L108 120 Z" fill={light} opacity="0.8" />
          <path d="M-5 140 L25 95 L50 125 L80 85 L108 140 Z" fill={mid} />
        </>
      );
    case "arch":
      return (glow: string) => (
        <>
          <path d="M25 125 L25 60 Q25 30 50 28 Q75 30 75 60 L75 125 Z" fill={glow} opacity="0.9" />
          <path d="M34 125 L34 64 Q34 42 50 40 Q66 42 66 64 L66 125 Z" fill={light} />
        </>
      );
    case "rays":
      return () => (
        <>
          {Array.from({ length: 11 }, (_, i) => {
            const a = (-80 + i * 16) * (Math.PI / 180);
            return (
              <line key={i} x1="50" y1="-6" x2={50 + Math.sin(a) * 170} y2={-6 + Math.cos(a) * 170} stroke={light} strokeWidth="5" opacity={0.3 + (i % 3) * 0.2} />
            );
          })}
        </>
      );
    case "light":
      return (glow: string) => (
        <>
          <ellipse cx="50" cy="66" rx="48" ry="62" fill={glow} opacity="0.85" />
          <ellipse cx="50" cy="66" rx="14" ry="30" fill={light} opacity="0.9" />
        </>
      );
    case "lamp":
      return (glow: string) => (
        <>
          <circle cx="50" cy="66" r="46" fill={glow} />
          <path d="M40 60 Q50 38 60 60 Q62 78 50 80 Q38 78 40 60 Z" fill={light} />
          <rect x="44" y="82" width="12" height="6" fill={mid} />
        </>
      );
    case "horizon":
      return (glow: string) => (
        <>
          <rect x="0" y="0" width="100" height="85" fill={deep} opacity="0.5" />
          <ellipse cx="50" cy="90" rx="70" ry="30" fill={glow} />
          <rect x="0" y="92" width="100" height="60" fill={mid} opacity="0.85" />
        </>
      );
    case "smoke":
      return () => (
        <>
          {Array.from({ length: 7 }, (_, i) => (
            <circle key={i} cx={20 + r() * 60} cy={20 + i * 17} r={14 + r() * 16} fill={i % 2 ? light : mid} opacity={0.35 + r() * 0.3} />
          ))}
        </>
      );
    case "swirl":
      return () => (
        <>
          {[40, 28, 16].map((rr, i) => (
            <path key={i} d={`M ${50 - rr} 70 A ${rr} ${rr} 0 1 1 ${50 + rr * 0.6} ${70 + rr * 0.8}`} fill="none" stroke={light} strokeWidth="5" opacity={0.9 - i * 0.2} />
          ))}
        </>
      );
    case "cracks":
      return () => (
        <>
          <path d="M55 -5 L45 35 L60 55 L40 90 L55 110 L45 145" fill="none" stroke={light} strokeWidth="4" />
          <path d="M45 35 L20 50 M60 55 L85 70 M40 90 L15 100" fill="none" stroke={light} strokeWidth="2.5" opacity="0.8" />
        </>
      );
    case "flame":
      return (glow: string) => (
        <>
          <ellipse cx="50" cy="100" rx="45" ry="40" fill={glow} />
          <path d="M50 30 Q70 60 62 85 Q72 78 70 64 Q88 92 66 115 L34 115 Q14 92 32 70 Q32 84 40 88 Q30 60 50 30 Z" fill={light} />
        </>
      );
    case "pillars":
      return () => (
        <>
          <rect x="10" y="32" width="80" height="8" fill={light} />
          {[16, 36, 56, 76].map((x) => (
            <rect key={x} x={x} y="42" width="8" height="80" fill={light} opacity="0.85" />
          ))}
          <rect x="6" y="122" width="88" height="8" fill={mid} />
        </>
      );
    case "hex":
      return () => {
        const cells: ReactElement[] = [];
        for (let row = 0; row < 8; row++)
          for (let col = 0; col < 5; col++) {
            const cx = col * 22 + (row % 2 ? 11 : 0);
            const cy = row * 19 + 4;
            const pts = Array.from({ length: 6 }, (_, k) => {
              const a = (Math.PI / 3) * k + Math.PI / 6;
              return `${cx + Math.cos(a) * 10},${cy + Math.sin(a) * 10}`;
            }).join(" ");
            cells.push(<polygon key={`${row}-${col}`} points={pts} fill={(row + col) % 3 ? light : mid} opacity={0.4 + ((row * 7 + col) % 5) * 0.12} />);
          }
        return <>{cells}</>;
      };
    case "cube":
      return (glow: string) => (
        <>
          <circle cx="50" cy="70" r="46" fill={glow} opacity="0.6" />
          <rect x="30" y="50" width="40" height="44" fill={deep} />
          <rect x="30" y="58" width="40" height="5" fill={light} opacity="0.9" />
        </>
      );
    case "split":
      return () => (
        <>
          <rect x="0" y="0" width="50" height="140" fill={light} opacity="0.75" />
          <rect x="50" y="0" width="50" height="140" fill={deep} />
        </>
      );
    case "ink":
      return () => (
        <>
          {Array.from({ length: 9 }, (_, i) => (
            <rect key={i} x={12 + (i % 2) * 6} y={24 + i * 11} width={50 + r() * 30} height="3" fill={light} opacity="0.75" />
          ))}
          <circle cx="78" cy="112" r="10" fill={deep} />
        </>
      );
    case "dots":
      return () => (
        <>
          {Array.from({ length: 40 }, (_, i) => (
            <circle key={i} cx={r() * 100} cy={r() * 140} r={1.5 + r() * 4} fill={i % 3 ? light : mid} opacity={0.4 + r() * 0.5} />
          ))}
        </>
      );
    case "web":
      return () => (
        <>
          {Array.from({ length: 8 }, (_, i) => {
            const a = (i / 8) * Math.PI * 2;
            return <line key={i} x1="50" y1="64" x2={50 + Math.cos(a) * 80} y2={64 + Math.sin(a) * 80} stroke={light} strokeWidth="1.8" />;
          })}
          {[12, 24, 36, 48].map((rr) => (
            <polygon
              key={rr}
              points={Array.from({ length: 8 }, (_, k) => {
                const a = (k / 8) * Math.PI * 2;
                return `${50 + Math.cos(a) * rr},${64 + Math.sin(a) * rr}`;
              }).join(" ")}
              fill="none"
              stroke={light}
              strokeWidth="1.6"
            />
          ))}
        </>
      );
    case "lines":
      return () => (
        <>
          {Array.from({ length: 9 }, (_, i) => (
            <rect key={i} x="-5" y={14 + i * 14} width="110" height="5" fill={i % 2 ? mid : light} opacity={0.35 + (i % 3) * 0.2} />
          ))}
        </>
      );
    case "scales":
      return () => (
        <>
          <rect x="48" y="30" width="4" height="80" fill={light} />
          <rect x="18" y="40" width="64" height="4" fill={light} />
          <path d="M14 70 Q24 84 34 70 Z M66 64 Q76 78 86 64 Z" fill={light} />
          <line x1="24" y1="44" x2="24" y2="70" stroke={light} strokeWidth="1.5" />
          <line x1="76" y1="44" x2="76" y2="64" stroke={light} strokeWidth="1.5" />
        </>
      );
    case "steps":
      return () => (
        <>
          {Array.from({ length: 6 }, (_, i) => (
            <rect key={i} x={10 + i * 14} y={120 - i * 16} width={90 - i * 14} height="12" fill={light} opacity={0.4 + i * 0.1} />
          ))}
        </>
      );
    case "folds":
      return () => (
        <>
          {Array.from({ length: 6 }, (_, i) => (
            <path key={i} d={`M${-10 + i * 20} -5 Q ${10 + i * 20} 70 ${-5 + i * 20} 150`} fill="none" stroke={i % 2 ? light : mid} strokeWidth="9" opacity="0.7" />
          ))}
        </>
      );
    case "city":
      return () => (
        <>
          {[8, 22, 34, 50, 64, 78].map((x, i) => {
            const h = 30 + ((i * 37) % 45);
            return <rect key={x} x={x} y={120 - h} width="12" height={h} fill={i % 2 ? light : mid} opacity="0.85" />;
          })}
          <circle cx="74" cy="34" r="8" fill={light} opacity="0.7" />
        </>
      );
    case "drop":
      return (glow: string) => (
        <>
          <circle cx="50" cy="74" r="44" fill={glow} opacity="0.6" />
          <path d="M50 36 Q70 70 64 86 Q58 100 50 100 Q42 100 36 86 Q30 70 50 36 Z" fill={light} />
        </>
      );
    case "disc":
      return (glow: string) => (
        <>
          <circle cx="50" cy="70" r="46" fill={glow} opacity="0.7" />
          <circle cx="50" cy="70" r="26" fill="none" stroke={light} strokeWidth="6" />
          <circle cx="50" cy="70" r="10" fill={light} />
        </>
      );
    case "leaves":
    default:
      return () => (
        <>
          {Array.from({ length: 7 }, (_, i) => {
            const cx = 15 + r() * 70, cy = 20 + r() * 100, rot = r() * 180;
            return (
              <ellipse key={i} cx={cx} cy={cy} rx="7" ry="20" fill={i % 2 ? light : mid} opacity="0.75" transform={`rotate(${rot} ${cx} ${cy})`} />
            );
          })}
        </>
      );
  }
}
