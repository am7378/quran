import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Live clock in the mono label style of the frame corners. */
export function Clock({ className }: { className?: string }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <span className={cn("label tabular-nums", className)}>
      {now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" })}
    </span>
  );
}

const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/\\-_:+";

/** Mono text that scrambles and resolves left-to-right on hover. */
export function Scramble({ text, className, active }: { text: string; className?: string; active?: boolean }) {
  const [out, setOut] = useState(text);
  const raf = useRef(0);
  const run = () => {
    cancelAnimationFrame(raf.current);
    const start = performance.now();
    const dur = 380;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / dur);
      const settled = Math.floor(k * text.length);
      setOut(
        text
          .split("")
          .map((ch, i) => (i < settled || ch === " " || ch === "[" || ch === "]" ? ch : GLYPHS[(Math.random() * GLYPHS.length) | 0]))
          .join(""),
      );
      if (k < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  };
  useEffect(() => {
    setOut(text);
  }, [text]);
  useEffect(() => {
    if (active) run();
    return () => cancelAnimationFrame(raf.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
  return (
    <span className={className} onMouseEnter={active === undefined ? run : undefined} aria-label={text}>
      <span aria-hidden>{out}</span>
    </span>
  );
}

/**
 * Turn-the-frame-over glyph: the two halves of a box trading places, like a
 * camera's flip icon, drawn square to match the frame.
 */
export function FlipGlyph({ size = 15, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="square" className={className} aria-hidden>
      <path d="M10.5 19H2.5V5h6" />
      <path d="M13.5 5h8v14h-6" />
      <path d="m18 22-3-3 3-3" />
      <path d="m6 2 3 3-3 3" />
      <path d="M12 9.6 14.4 12 12 14.4 9.6 12Z" />
    </svg>
  );
}

/** Fixed film-grain overlay for the whole viewport. */
export function Grain({ on = true }: { on?: boolean }) {
  if (!on) return null;
  return <div className="grain" aria-hidden />;
}

/**
 * Hairline gold corner marks — the illumination of a mushaf page border,
 * reduced to the frame's own geometry.
 */
export function CornerMarks({ size = 18, inset = 10, className }: { size?: number; inset?: number; className?: string }) {
  const corner = (rot: number, pos: React.CSSProperties) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 18 18"
      className="pointer-events-none absolute"
      style={{ ...pos, transform: `rotate(${rot}deg)` }}
      aria-hidden
    >
      <path d="M1 12 V1 H12" fill="none" stroke="var(--box-accent)" strokeWidth="1" />
      <path d="M4.5 4.5 L7 3 L9.5 4.5 L8 7 Z" fill="none" stroke="var(--box-accent)" strokeWidth="0.8" opacity="0.9" />
    </svg>
  );
  return (
    <div className={cn("pointer-events-none absolute inset-0", className)} aria-hidden>
      {corner(0, { top: inset, left: inset })}
      {corner(90, { top: inset, right: inset })}
      {corner(180, { bottom: inset, right: inset })}
      {corner(270, { bottom: inset, left: inset })}
    </div>
  );
}

/** The dotted field from the footer inspiration, used as a quiet texture. */
export function DotField({ className, cols = 10, rows = 6 }: { className?: string; cols?: number; rows?: number }) {
  return (
    <svg className={cn("pointer-events-none", className)} width={cols * 10} height={rows * 10} aria-hidden>
      {Array.from({ length: cols * rows }, (_, i) => (
        <circle key={i} cx={(i % cols) * 10 + 2} cy={Math.floor(i / cols) * 10 + 2} r="0.9" fill="currentColor" opacity={0.25 + ((i * 7) % 5) * 0.08} />
      ))}
    </svg>
  );
}

/** Bracketed mono button — the [HOME] style from the inspiration footer. */
export function BracketButton({
  children,
  onClick,
  active,
  className,
  title,
  icon,
}: {
  children?: ReactNode;
  onClick?: () => void;
  active?: boolean;
  className?: string;
  title?: string;
  icon?: ReactNode;
}) {
  const [hover, setHover] = useState(false);
  const label = typeof children === "string" ? children : "";
  return (
    <button
      type="button"
      title={title}
      aria-label={title ?? label}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className={cn(
        "group relative inline-flex h-7 items-center gap-1.5 px-2 text-[var(--box-muted)] transition-colors hover:text-[var(--box-fg)]",
        active && "is-on text-[var(--box-fg)]",
        className,
      )}
    >
      <span
        className={cn(
          "btn-fill absolute inset-0 origin-left scale-x-0 bg-[var(--box-hover)] transition-transform duration-300 ease-out group-hover:scale-x-100",
          active && "is-active scale-x-100",
        )}
      />
      {icon && <span className="relative">{icon}</span>}
      {label && (
        <span className={cn("label relative whitespace-nowrap transition-transform duration-300 ease-out", hover && "translate-x-[1px]")}>
          {label}
        </span>
      )}
    </button>
  );
}
