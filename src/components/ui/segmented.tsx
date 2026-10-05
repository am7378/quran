import { useLayoutEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { EASE_OUT, cn } from "@/lib/utils";

/**
 * A choice of a few, side by side in one pill: one row, never wrapped. An option may have a shorter
 * label (third item), used whenever the full ones would not fit the row (a phone, a narrow panel,
 * a theme's wider lettering).
 */
export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: [T, string, string?][] }) {
  const hasShort = options.some((o) => o[2]);
  const box = useRef<HTMLDivElement>(null);
  const probe = useRef<HTMLDivElement>(null);
  const [full, setFull] = useState(true);
  useLayoutEffect(() => {
    const b = box.current, pr = probe.current;
    if (!hasShort || !b || !pr) return;
    const check = () => setFull(pr.offsetWidth <= b.clientWidth);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(b);
    ro.observe(pr); // (the lettering arriving, or the theme changing it)
    return () => ro.disconnect();
  }, [hasShort]);
  return (
    <div ref={box} className="relative w-full">
      {hasShort && (
        <div className="pointer-events-none invisible absolute h-0 w-full overflow-hidden" aria-hidden>
          <div ref={probe} className="flex w-max border p-0.5">
            {options.map(([v, l]) => (
              <span key={v} className="label whitespace-nowrap px-3 py-2">{l}</span>
            ))}
          </div>
        </div>
      )}
      <div className="pill relative flex w-max max-w-full flex-nowrap border border-[var(--box-line)] p-0.5">
        {options.map(([v, l, short]) => (
          <button key={v} type="button" onClick={() => onChange(v)} aria-pressed={value === v} aria-label={l} className={cn("label relative px-3 py-2 transition-colors", value === v ? "text-[var(--panel-bg)]" : "text-[var(--box-muted)] hover:text-[var(--box-fg)]")}>
            {value === v && <motion.span layoutId={`seg-${options.map((o) => o[0]).join("")}`} className="pill absolute inset-0 bg-[var(--box-fg)]" transition={{ duration: 0.35, ease: EASE_OUT }} />}
            <span className="relative whitespace-nowrap">{full || !short ? l : short}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
