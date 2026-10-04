import { AnimatePresence, motion, type Variants } from "framer-motion";
import type { ReactNode } from "react";
import { Settings } from "lucide-react";
import { EASE_IN_OUT, EASE_OUT, cn } from "@/lib/utils";
import { useStore } from "@/lib/store";

/**
 * A panel that covers the whole frame the way the reference navigation does:
 * a clip-path wipe from one side, then its contents reveal in sequence.
 */
export function ImmersivePanel({
  open,
  from = "left",
  onClose,
  children,
  className,
  label,
}: {
  open: boolean;
  from?: "left" | "right";
  onClose: () => void;
  children: ReactNode;
  className?: string;
  label: string;
}) {
  const hidden = from === "left" ? "inset(0 100% 0 0)" : "inset(0 0 0 100%)";
  const gone = from === "left" ? "inset(0 0 0 100%)" : "inset(0 100% 0 0)";
  // Monochrome draws a panel down the frame like a scan; Classic wipes it across
  const theme = useStore((s) => s.settings.theme);
  const mono = theme === "mono";
  // Atlas slides a dark sheet across the bone box, the way its two halves meet
  const motionOf = theme === "paper"
    ? {
        // a sheet laid down over the page: slid in a little askew, settling straight
        initial: { opacity: 0, x: from === "left" ? -36 : 36, y: 12, rotate: from === "left" ? -1.4 : 1.4 },
        animate: { opacity: 1, x: 0, y: 0, rotate: 0 },
        exit: { opacity: 0, y: 18, rotate: from === "left" ? 0.8 : -0.8, transition: { duration: 0.32, ease: EASE_IN_OUT } },
        transition: { duration: 0.55, ease: EASE_OUT },
      }
    : theme === "folio"
    ? {
        // a page turning in from its spine
        initial: { opacity: 0, rotateY: from === "left" ? 14 : -14, x: from === "left" ? -30 : 30, transformPerspective: 1400 },
        animate: { opacity: 1, rotateY: 0, x: 0, transformPerspective: 1400 },
        exit: { opacity: 0, rotateY: from === "left" ? -10 : 10, x: from === "left" ? 24 : -24, transition: { duration: 0.35, ease: EASE_IN_OUT } },
        transition: { duration: 0.6, ease: EASE_OUT },
      }
    : theme === "lunar"
    ? {
        // rising slowly out of the dark, like the moon
        initial: { opacity: 0, y: 26, filter: "blur(8px)" },
        animate: { opacity: 1, y: 0, filter: "blur(0px)" },
        exit: { opacity: 0, y: 12, filter: "blur(6px)", transition: { duration: 0.4, ease: EASE_OUT } },
        transition: { duration: 0.85, ease: EASE_OUT },
      }
    : theme === "atlas"
    ? {
        initial: { x: from === "left" ? "-100%" : "100%" },
        animate: { x: "0%" },
        exit: { x: from === "left" ? "100%" : "-100%", transition: { duration: 0.55, ease: EASE_IN_OUT } },
        transition: { duration: 0.7, ease: EASE_IN_OUT },
      }
    : mono
    ? {
        initial: { clipPath: "inset(0 0 100% 0)" },
        animate: { clipPath: "inset(0 0 0% 0)" },
        exit: { clipPath: "inset(100% 0 0% 0)", transition: { duration: 0.4, ease: EASE_IN_OUT } },
        transition: { duration: 0.55, ease: EASE_IN_OUT },
      }
    : {
        initial: { clipPath: hidden },
        animate: { clipPath: "inset(0 0 0 0)" },
        exit: { clipPath: gone, transition: { duration: 0.6, ease: EASE_IN_OUT, delay: 0.05 } },
        transition: { duration: 0.75, ease: EASE_IN_OUT },
      };
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="panel"
          role="dialog"
          aria-modal="true"
          aria-label={label}
          className={cn("dark-scope frame-radius-in absolute inset-[3px] z-40 overflow-hidden bg-[var(--panel-bg)] text-[var(--box-fg)]", className)}
          {...motionOf}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              onClose();
            }
          }}
        >
          <div className="grain-local" />
          <motion.div
            className="relative h-full"
            initial="hidden"
            animate="show"
            exit="hide"
            variants={{ show: { transition: { delayChildren: mono ? 0.16 : 0.42, staggerChildren: mono ? 0.05 : 0.075 } }, hide: { transition: { staggerChildren: 0.02, staggerDirection: -1 } } }}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Child that takes part in the panel's staged reveal. */
export const reveal: Variants = {
  hidden: { opacity: 0, y: 18, filter: "blur(6px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.6, ease: EASE_OUT } },
  hide: { opacity: 0, y: -8, transition: { duration: 0.2 } },
};

export function Reveal({ children, className, as = "div" }: { children: ReactNode; className?: string; as?: "div" | "li" | "section" }) {
  const C = motion[as];
  return (
    <C variants={reveal} className={className}>
      {children}
    </C>
  );
}

/** Settings on a phone: a gear, turning a quarter while its panel is open. */
export function SettingsGlyph({ open, size = 17 }: { open: boolean; size?: number }) {
  return (
    <motion.span className="block" aria-hidden animate={{ rotate: open ? 90 : 0 }} transition={{ duration: 0.5, ease: EASE_IN_OUT }}>
      <Settings size={size} strokeWidth={1.5} />
    </motion.span>
  );
}

/** The two-line menu icon that folds into a cross, as in the reference. */
export function MenuGlyph({ open, lines = 2 }: { open: boolean; lines?: 2 | 3 }) {
  return (
    <span className="relative block h-3 w-4" aria-hidden>
      <motion.span
        className="absolute left-0 top-[2px] h-px w-4 bg-current"
        animate={open ? { rotate: 45, y: 4 } : { rotate: 0, y: 0 }}
        transition={{ duration: 0.4, ease: EASE_IN_OUT }}
      />
      {lines === 3 && (
        <motion.span className="absolute left-0 top-[6px] h-px w-4 bg-current" animate={{ opacity: open ? 0 : 1 }} />
      )}
      <motion.span
        className="absolute left-0 top-[10px] h-px w-4 bg-current"
        animate={open ? { rotate: -45, y: -4 } : { rotate: 0, y: 0 }}
        transition={{ duration: 0.4, ease: EASE_IN_OUT }}
      />
    </span>
  );
}
