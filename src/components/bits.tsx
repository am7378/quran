import { useEffect, useState, type ReactNode } from "react";
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

/** Fixed film-grain overlay for the whole viewport. */
export function Grain({ on = true }: { on?: boolean }) {
  if (!on) return null;
  return <div className="grain" aria-hidden />;
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
