import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useUI } from "@/lib/ui";
import { EASE_OUT, cn } from "@/lib/utils";

/** The site's own right-click menu: the useful actions for whatever was clicked. */
export function ContextMenu() {
  const menu = useUI((s) => s.menu);
  const close = useUI((s) => s.closeMenu);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [active, setActive] = useState(-1);

  useLayoutEffect(() => {
    if (!menu) return;
    const el = ref.current;
    const w = el?.offsetWidth ?? 240, h = el?.offsetHeight ?? 300;
    setPos({ x: Math.min(menu.x, window.innerWidth - w - 8), y: Math.min(menu.y, window.innerHeight - h - 8) });
    setActive(-1);
  }, [menu]);

  useEffect(() => {
    if (!menu) return;
    const down = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const items = menu.items.map((it, i) => ({ it, i })).filter(({ it }) => it.type === "item" && !it.disabled);
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const idx = items.findIndex((x) => x.i === active);
        const next = e.key === "ArrowDown" ? (idx + 1) % items.length : (idx - 1 + items.length) % items.length;
        setActive(items[next]?.i ?? -1);
      } else if (e.key === "Enter" && active >= 0) {
        const it = menu.items[active];
        if (it.type === "item") {
          close();
          it.onSelect();
        }
      }
    };
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("keydown", key);
    window.addEventListener("blur", close);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("keydown", key);
      window.removeEventListener("blur", close);
      window.removeEventListener("resize", close);
    };
  }, [menu, close, active]);

  return createPortal(
    <AnimatePresence>
      {menu && (
        <motion.div
          ref={ref}
          role="menu"
          className="theme-pop fixed z-[100] min-w-[228px] overflow-hidden border border-[var(--box-line)] bg-[var(--box-bg-solid)] py-1.5 text-[var(--box-fg)] shadow-[0_24px_70px_-20px_rgba(0,0,0,0.8)]"
          style={{ left: pos.x, top: pos.y }}
          initial={{ opacity: 0, scale: 0.97, y: -4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.1 } }}
          transition={{ duration: 0.18, ease: EASE_OUT }}
          onContextMenu={(e) => e.preventDefault()}
        >
          {menu.items.map((it, i) =>
            it.type === "sep" ? (
              <div key={i} className="my-1.5 h-px bg-[var(--box-line)]" />
            ) : it.type === "label" ? (
              <div key={i} className="label px-3 pb-1 pt-1.5 text-[var(--box-faint)]">
                {it.label}
              </div>
            ) : (
              <button
                key={i}
                type="button"
                role="menuitem"
                disabled={it.disabled}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  close();
                  it.onSelect();
                }}
                className={cn(
                  "relative flex w-full items-center gap-3 px-3 py-[7px] text-left text-[13px] transition-colors disabled:opacity-40",
                  active === i && "bg-[var(--box-hover)]",
                )}
              >
                {active === i && <motion.span layoutId="menu-bar" className="absolute inset-y-1 left-0 w-[2px] bg-[var(--color-gold)]" transition={{ duration: 0.15 }} />}
                <span className="flex w-4 justify-center text-[var(--box-muted)]">{it.icon}</span>
                <span className="flex-1">{it.label}</span>
                {it.hint && <span className="label-sm text-[var(--box-faint)]">{it.hint}</span>}
              </button>
            ),
          )}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
