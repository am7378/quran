import { animate, AnimatePresence, motion, useIsPresent, useMotionValue } from "framer-motion";
import { Copy, Mic, Pause, Play, StickyNote, Trash2, X } from "lucide-react";
import { del, get } from "idb-keyval";
import { voiceKey } from "./VoiceNote";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { HIGHLIGHT_COLORS, HIGHLIGHT_HEX, useStore, type Highlight, type HighlightColor, type Note } from "@/lib/store";
import { EASE_OUT, cn } from "@/lib/utils";
import { useUI } from "@/lib/ui";
import { glossNodes, type GlossLinks } from "./glossText";
import { glossByTerm } from "./terms";
import { peekHover, refsIn } from "./Peek";
import { sfx } from "@/lib/sound";

/* ── word meaning tooltip ─────────────────────────────────────── */

export type Tip = {
  x: number;
  y: number;
  w: number;
  h?: number; // the word's own box: the tip sits beside it, never over it
  ref: string;
  // an Arabic word
  meaning?: string;
  translit?: string;
  arabic?: string;
  // a term of the translation, from its glossary (or the honorific ﷺ)
  gloss?: { term: string; text: string; saw?: boolean };
};

/**
 * Pointing away from a term, or from its meaning, closes the meaning a moment later, so the pointer
 * can travel from the word into the box (to follow a "see …" in it) without it going.
 */
let tipCloseTimer = 0;
export const tipHover = {
  leave(close: () => void) {
    window.clearTimeout(tipCloseTimer);
    tipCloseTimer = window.setTimeout(close, 260);
  },
  stay() {
    window.clearTimeout(tipCloseTimer);
  },
};

let seeTimer = 0;

export function WordTip({ tip, translit, onClose }: { tip: Tip | null; translit: boolean; onClose: () => void }) {
  // a term a meaning sends the reader to ("See Rasool"): its own meaning, beside the link
  const [sub, setSub] = useState<Tip | null>(null);
  useEffect(() => setSub(null), [tip?.ref]);
  const links: GlossLinks = {
    onSee: (term, el, hover) => {
      window.clearTimeout(seeTimer);
      const show = () => {
        const g = glossByTerm(term);
        if (!g || !el.isConnected) return;
        const r = el.getBoundingClientRect();
        setSub({ x: r.left, y: r.top, w: r.width, h: r.height, ref: `see:${g.term}:${Math.round(r.left)}:${Math.round(r.top)}`, gloss: g });
      };
      if (hover) seeTimer = window.setTimeout(show, 280);
      else show();
    },
    onRef: (rf, el) => {
      const r = el.getBoundingClientRect();
      useUI.getState().setPeek({ s: rf.s, a: rf.a, to: rf.to, x: r.left, y: r.top, w: r.width, h: r.height, pinned: true });
    },
    onHoverEnd: () => window.clearTimeout(seeTimer),
  };
  return (
    <>
      <AnimatePresence>{tip && <TipBox key={tip.ref} tip={tip} translit={translit} links={links} onClose={onClose} />}</AnimatePresence>
      <AnimatePresence>{tip && sub && <TipBox key={sub.ref} tip={sub} translit={translit} links={links} onClose={() => setSub(null)} nested />}</AnimatePresence>
    </>
  );
}

type TipSide = "above" | "below" | "left" | "right";
const TIP_GAP = 11; // from the word to the box (the pointer sits in it)
const TIP_EDGE = 8; // the nearest the box comes to the screen's edge

/**
 * A word's meaning, placed where it fits: above the word, else below it, else beside it; slid
 * along so it stays whole on the screen, its pointer moving along the box's edge to stay on the word.
 */
function TipBox({ tip, translit, links, onClose, nested }: { tip: Tip; translit: boolean; links: GlossLinks; onClose: () => void; nested?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  // a tap anywhere but on a meaning, a word or a term closes it (the one tapped opens its own)
  useEffect(() => {
    const down = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest?.("[data-tip], .word, .gl, .saw, .hon, [role=dialog]")) return;
      onClose();
    };
    window.addEventListener("pointerdown", down, true);
    return () => window.removeEventListener("pointerdown", down, true);
  }, [onClose]);
  const interactive = !!tip.gloss && !tip.gloss.saw; // a meaning with words to follow
  const [at, setAt] = useState<{ left: number; top: number; side: TipSide; point: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const W = el.offsetWidth, H = el.offsetHeight;
    const vw = window.innerWidth, vh = window.innerHeight;
    const wh = tip.h ?? 24;
    const cx = tip.x + tip.w / 2, cy = tip.y + wh / 2;
    const clampTo = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
    let side: TipSide;
    let top: number;
    if (tip.y - TIP_GAP - H >= TIP_EDGE) {
      side = "above";
      top = tip.y - TIP_GAP - H;
    } else if (tip.y + wh + TIP_GAP + H <= vh - TIP_EDGE) {
      side = "below";
      top = tip.y + wh + TIP_GAP;
    } else {
      side = tip.x + tip.w + TIP_GAP + W <= vw - TIP_EDGE || tip.x < vw / 2 ? "right" : "left";
      top = clampTo(cy - H / 2, TIP_EDGE, vh - H - TIP_EDGE);
    }
    if (side === "above" || side === "below") {
      const left = clampTo(cx - W / 2, TIP_EDGE, vw - W - TIP_EDGE);
      setAt({ left, top, side, point: clampTo(cx - left, 12, W - 12) });
    } else {
      const left = side === "right" ? Math.min(tip.x + tip.w + TIP_GAP, vw - W - TIP_EDGE) : Math.max(TIP_EDGE, tip.x - TIP_GAP - W);
      setAt({ left, top, side, point: clampTo(cy - top, 12, H - 12) });
    }
  }, [tip, translit]);

  const from = { above: { y: 6 }, below: { y: -6 }, left: { x: 6 }, right: { x: -6 } }[at?.side ?? "above"];
  // the pointer: a small square turned to a diamond, half outside the edge that faces the word
  const pointer: React.CSSProperties | null = !at
    ? null
    : at.side === "above"
      ? { bottom: -5, left: at.point - 5 }
      : at.side === "below"
        ? { top: -5, left: at.point - 5 }
        : at.side === "right"
          ? { left: -5, top: at.point - 5 }
          : { right: -5, top: at.point - 5 };
  return (
    <motion.div
      ref={ref}
      data-tip
      className={cn("fixed", nested ? "z-[72]" : "z-[70]", interactive ? "pointer-events-auto" : "pointer-events-none")}
      onPointerEnter={(e) => e.pointerType === "mouse" && tipHover.stay()}
      onPointerLeave={(e) => e.pointerType === "mouse" && tipHover.leave(onClose)}
      // measured once where it cannot be seen, then put where it fits
      style={at ? { left: at.left, top: at.top } : { left: 0, top: 0, visibility: "hidden" }}
      initial={{ opacity: 0, ...from }}
      animate={at ? { opacity: 1, x: 0, y: 0 } : { opacity: 0 }}
      exit={{ opacity: 0, transition: { duration: 0.12 } }}
      transition={{ duration: 0.18, ease: EASE_OUT }}
    >
      <div className="relative">
        {tip.gloss ? (
          <div
            className={cn(
              "theme-pop relative z-[1] border-t-2 border-[var(--color-gold)] bg-[var(--tip-bg)] px-3.5 py-2.5 text-[var(--tip-fg)] shadow-[0_14px_40px_-12px_rgba(0,0,0,0.6)]",
              tip.gloss.saw ? "max-w-[calc(100vw-16px)] text-center" : "w-[min(340px,calc(100vw-16px))] text-left",
            )}
          >
            {!tip.gloss.saw && <div className="font-serif text-[16px] italic leading-snug">{tip.gloss.term}</div>}
            <div className={cn("font-serif leading-snug", tip.gloss.saw ? "text-[15px]" : "mt-1 text-[14px] opacity-90")}>{tip.gloss.saw ? tip.gloss.text : glossNodes(tip.gloss.text, tip.gloss.term, links)}</div>
            {!tip.gloss.saw && <div className="label-sm mt-2 opacity-45">Glossary · Quraan Made Easy</div>}
          </div>
        ) : (
          <div className="theme-pop relative z-[1] min-w-[132px] max-w-[260px] border-t-2 border-[var(--color-gold)] bg-[var(--tip-bg)] px-3 py-2 text-center text-[var(--tip-fg)] shadow-[0_14px_40px_-12px_rgba(0,0,0,0.6)]">
            <div className="font-serif text-[16px] leading-snug">{tip.meaning || "—"}</div>
            {translit && tip.translit && <div className="mt-0.5 font-mono text-[11px] italic opacity-70">{tip.translit}</div>}
            <div className="label-sm mt-1.5 opacity-45">{tip.ref} · click to hear</div>
          </div>
        )}
        {pointer && (
          <div
            className={cn("absolute z-[2] h-2.5 w-2.5 rotate-45", at?.side === "below" ? "bg-[var(--color-gold)]" : "bg-[var(--tip-bg)]")}
            style={pointer}
          />
        )}
      </div>
    </motion.div>
  );
}

/* ── highlight menu ───────────────────────────────────────────── */

const SWATCH: Record<HighlightColor, string> = HIGHLIGHT_HEX;

export function HighlightMenu({
  hl,
  at,
  onClose,
  onCopy,
  onNote,
  onVoice,
}: {
  hl: Highlight | null;
  at: { x: number; y: number; bottom: number; below?: boolean } | null;
  onClose: () => void;
  onCopy: (h: Highlight) => void;
  onNote: (h: Highlight) => void;
  onVoice: (h: Highlight, anchor: DOMRect) => void;
}) {
  const update = useStore((s) => s.updateHighlight);
  const remove = useStore((s) => s.removeHighlight);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!hl) return;
    const down = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) && !(e.target as HTMLElement).closest?.("mark.hl")) onClose();
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("keydown", key);
    };
  }, [hl, onClose]);

  const above = at ? !(at.below && at.bottom < window.innerHeight - 90) && at.y > 90 : true;
  // centred on the words, but always whole on the screen (a phone is narrower than the toolbar's reach)
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    if (ref.current) setW(ref.current.offsetWidth);
  }, [hl?.id, at]);
  const left = at ? Math.max(w / 2 + 8, Math.min(window.innerWidth - w / 2 - 8, at.x)) : 0;
  return (
    <AnimatePresence>
      {hl && at && (
        <motion.div
          ref={ref}
          key={hl.id}
          role="toolbar"
          aria-label="Highlight"
          className="fixed z-[75]"
          style={{ left, top: above ? at.y : at.bottom }}
          initial={{ opacity: 0, y: above ? 6 : -6, x: "-50%", scale: 0.96 }}
          animate={{ opacity: 1, y: 0, x: "-50%", scale: 1 }}
          exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.12 } }}
          transition={{ duration: 0.22, ease: EASE_OUT }}
        >
          <div className={cn("theme-pop flex items-center gap-1 border border-[var(--box-line)] bg-[var(--box-bg-solid)] p-1.5 shadow-[0_18px_50px_-14px_rgba(0,0,0,0.7)]", above ? "-translate-y-[calc(100%+10px)]" : "translate-y-[10px]")}>
            {HIGHLIGHT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Highlight ${c}`}
                onClick={() => update(hl.id, { color: c })}
                className="flex h-7 w-7 items-center justify-center transition-transform hover:scale-110"
              >
                {/* every swatch keeps a thin round edge, so a pale ink on a pale box still reads as a
                    colour; the chosen one has the strong ring */}
                <span
                  className={cn(
                    "block h-4 w-4 rounded-full transition-all",
                    hl.color === c ? "ring-2 ring-[var(--box-fg)] ring-offset-2 ring-offset-[var(--box-bg-solid)]" : "swatch-edge",
                  )}
                  style={{ background: SWATCH[c] }}
                />
              </button>
            ))}
            <span className="mx-1 h-5 w-px bg-[var(--box-line)]" />
            <MenuBtn label="Copy highlighted text" onClick={() => onCopy(hl)}>
              <Copy size={14} strokeWidth={1.6} />
            </MenuBtn>
            <MenuBtn label="Add a note to this highlight" onClick={() => onNote(hl)}>
              <StickyNote size={14} strokeWidth={1.6} />
            </MenuBtn>
            <MenuBtn label="Record a voice note on this highlight" onClick={(e) => onVoice(hl, e.currentTarget.getBoundingClientRect())}>
              <Mic size={14} strokeWidth={1.6} />
            </MenuBtn>
            <MenuBtn
              label="Remove highlight"
              onClick={() => {
                remove(hl.id);
                onClose();
              }}
            >
              <Trash2 size={14} strokeWidth={1.6} />
            </MenuBtn>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function MenuBtn({ children, label, onClick }: { children: React.ReactNode; label: string; onClick: (e: React.MouseEvent<HTMLButtonElement>) => void }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="flex h-7 w-7 items-center justify-center text-[var(--box-muted)] transition-colors hover:bg-[var(--box-hover)] hover:text-[var(--box-fg)]"
    >
      {children}
    </button>
  );
}

/* ── sticky notes ─────────────────────────────────────────────── */

const PEEK = 30; // how much of a note pushed off the edge stays visible

export function StickyNotes({ notes, focusId, onFocused }: { notes: Note[]; focusId: string | null; onFocused: () => void }) {
  return (
    <div className="pointer-events-none fixed inset-0 z-[65] overflow-hidden">
      <AnimatePresence>
        {notes.map((n) => (
          <NoteCard key={n.id} note={n} autoFocus={focusId === n.id} onFocused={onFocused} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function noteSize(n: Note) {
  const small = window.innerWidth < 768;
  return n.kind === "voice" ? { w: small ? 208 : 236, h: n.quote ? 156 : 138 } : { w: small ? 190 : 232, h: small ? 190 : 232 };
}

/** Where a note sits: freely anywhere, or tucked behind an edge with a corner peeking out. */
function placeOf(n: Note) {
  const vw = window.innerWidth, vh = window.innerHeight;
  const { w, h } = noteSize(n);
  const left = n.x * vw, top = n.y * vh;
  const clampY = (y: number) => Math.min(vh - PEEK - 8, Math.max(8 - h + PEEK, y));
  const clampX = (x: number) => Math.min(vw - PEEK - 8, Math.max(8 - w + PEEK, x));
  switch (n.docked) {
    case "left":
      return { left: -w + PEEK, top: clampY(top) };
    case "right":
      return { left: vw - PEEK, top: clampY(top) };
    case "top":
      return { left: clampX(left), top: -h + PEEK };
    case "bottom":
      return { left: clampX(left), top: vh - PEEK };
    default:
      // always whole on the screen, even one smaller than where it was placed
      return { left: Math.min(vw - w - 8, Math.max(8, left)), top: Math.min(vh - h - 8, Math.max(8, top)) };
  }
}

function NoteCard({ note, autoFocus, onFocused }: { note: Note; autoFocus: boolean; onFocused: () => void }) {
  const update = useStore((s) => s.updateNote);
  const [drag, setDrag] = useState(false);
  const { w, h } = noteSize(note);
  const place = placeOf(note);
  const L = useMotionValue(place.left);
  const T = useMotionValue(place.top);
  const moved = useRef(false);
  // the note follows the pointer directly: where it is let go is exactly where it stays
  // (pressed on the words, the note still drags; a plain tap there writes, one on the fold shares)
  const grab = useRef<{ id: number; x: number; y: number; l: number; t: number; text: HTMLTextAreaElement | null; share: boolean; ref: HTMLElement | null } | null>(null);

  // the note going (its ayah scrolled out of the frame, or the note deleted): an ayah opened from
  // it goes with it
  const present = useIsPresent();
  useEffect(() => {
    const close = () => {
      if (useUI.getState().peek?.from === note.id) useUI.getState().setPeek(null);
    };
    if (!present) close();
    return close;
  }, [present, note.id]);

  // glide to a new place when it changes (docking, undocking, window resize)
  useEffect(() => {
    const a = animate(L, place.left, { type: "spring", stiffness: 260, damping: 30 });
    const b = animate(T, place.top, { type: "spring", stiffness: 260, damping: 30 });
    return () => {
      a.stop();
      b.stop();
    };
  }, [place.left, place.top, L, T]);

  const undock = () => {
    const vw = window.innerWidth, vh = window.innerHeight;
    const left = Math.min(vw - w - 20, Math.max(20, place.left));
    const top = Math.min(vh - h - 20, Math.max(20, place.top));
    update(note.id, { docked: null, x: left / vw, y: top / vh });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest("button, input, [data-nodrag]")) return;
    const text = target.closest("textarea");
    if (text && document.activeElement === text) return; // writing: the words select, the note stays
    if (e.pointerType === "mouse" && e.button !== 0) return;
    L.stop();
    T.stop();
    moved.current = false;
    grab.current = { id: e.pointerId, x: e.clientX, y: e.clientY, l: L.get(), t: T.get(), text, share: !!target.closest("[data-share]"), ref: target.closest<HTMLElement>("[data-ref]") };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const g = grab.current;
    if (!g || g.id !== e.pointerId) return;
    const ox = e.clientX - g.x, oy = e.clientY - g.y;
    if (!moved.current && Math.hypot(ox, oy) < 4) return; // a click, not a drag
    if (!moved.current) {
      moved.current = true;
      setDrag(true);
      sfx("lift"); // the paper picked up
    }
    L.set(g.l + ox);
    T.set(g.t + oy);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const g = grab.current;
    if (!g || g.id !== e.pointerId) return;
    grab.current = null;
    if (moved.current) onDragEnd(g);
    else if (g.share) useUI.getState().shareNote(note);
    else if (g.ref) {
      // an ayah the note refers to: open beside the note, to read here
      const [s, a, to] = (g.ref.dataset.ref ?? "").split(/[:-]/).map(Number);
      const card = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const cur = useUI.getState().peek;
      useUI.getState().setPeek(cur?.pinned && cur.s === s && cur.a === a ? null : { s, a, to: to || undefined, x: card.left, y: card.top, w: card.width, h: card.height, pinned: true, from: note.id });
    }
    else if (g.text) {
      g.text.focus();
      g.text.setSelectionRange(g.text.value.length, g.text.value.length);
    }
  };

  // the note goes to where its stored place now says (tucked notes slide back behind their edge)
  const settle = (n: Note) => {
    const p = placeOf(n);
    animate(L, p.left, { type: "spring", stiffness: 260, damping: 30 });
    animate(T, p.top, { type: "spring", stiffness: 260, damping: 30 });
  };

  const onDragEnd = (g: { l: number; t: number }) => {
    setDrag(false);
    sfx("drop"); // and laid down
    const vw = window.innerWidth, vh = window.innerHeight;
    const left = L.get(), top = T.get();
    if (note.docked) {
      // pulled out from its edge, even a little: it comes back onto the page, whole, where it was let go
      const inward = { left: left - g.l, right: g.l - left, top: top - g.t, bottom: g.t - top }[note.docked];
      const next: Note =
        inward > 24
          ? { ...note, docked: null, x: Math.min(vw - w - 12, Math.max(12, left)) / vw, y: Math.min(vh - h - 12, Math.max(12, top)) / vh }
          : { ...note, x: left / vw, y: top / vh }; // stays tucked, moved along its edge
      update(note.id, { docked: next.docked, x: next.x, y: next.y });
      settle(next);
      return;
    }
    // how much of the note is still on screen?
    const visW = Math.max(0, Math.min(vw, left + w) - Math.max(0, left));
    const visH = Math.max(0, Math.min(vh, top + h) - Math.max(0, top));
    const shown = (visW * visH) / (w * h);
    let docked: Note["docked"] = null;
    if (shown < 0.4) {
      const over = { left: -left, right: left + w - vw, top: -top, bottom: top + h - vh };
      docked = (Object.entries(over).sort((a, b) => b[1] - a[1])[0][0] as Note["docked"]) ?? null;
    }
    update(note.id, { x: left / vw, y: top / vh, docked });
    settle({ ...note, x: left / vw, y: top / vh, docked });
  };

  return (
    <motion.div
      className="pointer-events-auto absolute left-0 top-0 touch-none"
      style={{ left: L, top: T, width: w, height: h, perspective: 800 }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onClick={() => {
        if (note.docked && !moved.current) undock();
      }}
      initial={{ opacity: 0, scale: 0.6, rotate: note.rot - 8 }}
      animate={{ opacity: 1, scale: drag ? 1.04 : 1, rotate: note.docked ? 0 : note.rot }}
      exit={{ opacity: 0, scale: 0.7, rotate: note.rot + 6, transition: { duration: 0.25 } }}
      transition={{ type: "spring", stiffness: 300, damping: 28 }}
      whileHover={note.docked || drag ? undefined : { rotateX: 4, rotateY: -3 }}
      title={note.docked ? "Bring the note back" : undefined}
    >
      {note.kind === "voice" ? <VoiceCard note={note} drag={drag} /> : <PaperCard note={note} drag={drag} autoFocus={autoFocus} onFocused={onFocused} />}
      {note.docked && <DockTab edge={note.docked} />}
    </motion.div>
  );
}

/**
 * The share mark on a note's folded corner: drawn as if by hand, lightly. A tap on the fold shares
 * the note; pressed and dragged, the fold moves the note like the rest of it.
 */
function ShareFold({ note, tone }: { note: Note; tone: string }) {
  return (
    <span
      data-share
      role="button"
      tabIndex={0}
      aria-label="Share this note"
      title="Share this note"
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          useUI.getState().shareNote(note);
        }
      }}
      className="absolute bottom-0 right-0 z-[1] flex h-[34px] w-[34px] cursor-pointer items-end justify-end p-[5px] opacity-50 outline-none transition-opacity hover:opacity-95 focus-visible:opacity-95"
      style={{ color: tone }}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="-rotate-6" aria-hidden>
        <path d="M18.1 3.4c1.6.2 2.8 1.5 2.6 3.1-.1 1.5-1.5 2.6-3 2.5-1.6-.2-2.7-1.6-2.5-3.1.2-1.4 1.4-2.6 2.9-2.5z" />
        <path d="M5.8 9.7c1.6-.1 2.9 1.2 2.9 2.7 0 1.6-1.4 2.8-2.9 2.7-1.5 0-2.7-1.3-2.6-2.8.1-1.5 1.2-2.6 2.6-2.6z" />
        <path d="M18.2 15.1c1.5.1 2.7 1.4 2.5 2.9-.1 1.6-1.4 2.7-3 2.6-1.5-.1-2.6-1.5-2.5-3 .2-1.5 1.5-2.6 3-2.5z" />
        <path d="M8.4 11.1c2.3-1.2 4.4-2.3 6.8-3.6" />
        <path d="M8.5 13.6c2.2 1.2 4.6 2.5 6.9 3.5" />
      </svg>
    </span>
  );
}

/** the folded corner that shows where a tucked-away note is */
function DockTab({ edge }: { edge: NonNullable<Note["docked"]> }) {
  const pos: Record<string, string> = {
    left: "right-0 top-0 h-full w-[30px]",
    right: "left-0 top-0 h-full w-[30px]",
    top: "bottom-0 left-0 h-[30px] w-full",
    bottom: "top-0 left-0 h-[30px] w-full",
  };
  return (
    <span className={cn("absolute z-10 flex cursor-pointer items-center justify-center", pos[edge])}>
      <span className="h-3 w-3 rotate-45 border-b-2 border-r-2 border-[#8a6d1f]/70" style={{ transform: `rotate(${{ left: -45, right: 135, top: 45, bottom: -135 }[edge]}deg)` }} />
    </span>
  );
}

function PaperCard({ note, drag, autoFocus, onFocused }: { note: Note; drag: boolean; autoFocus: boolean; onFocused: () => void }) {
  const update = useStore((s) => s.updateNote);
  const remove = useStore((s) => s.removeNote);
  const [text, setText] = useState(note.text);
  const area = useRef<HTMLTextAreaElement>(null);
  const mirror = useRef<HTMLDivElement>(null);
  const refs = useMemo(() => refsIn(text), [text]);
  // the mirror over the words scrolls with them
  const sync = () => {
    if (mirror.current && area.current) mirror.current.scrollTop = area.current.scrollTop;
  };

  useEffect(() => {
    if (autoFocus) {
      setTimeout(() => area.current?.focus(), 420);
      onFocused();
    }
  }, [autoFocus, onFocused]);

  // save typing without writing on every keystroke
  useEffect(() => {
    if (text === note.text) return;
    const t = setTimeout(() => update(note.id, { text }), 350);
    return () => clearTimeout(t);
  }, [text, note.id, note.text, update]);

  return (
    <div
      className={cn(
        "note-paper relative flex h-full w-full cursor-grab flex-col px-4 pb-3 pt-6 text-[#2b2410] active:cursor-grabbing",
        drag ? "shadow-[0_34px_50px_-14px_rgba(0,0,0,0.55),0_10px_18px_-8px_rgba(0,0,0,0.35)]" : "shadow-[0_16px_28px_-12px_rgba(0,0,0,0.5),0_4px_8px_-4px_rgba(0,0,0,0.25)]",
      )}
    >
      <span className="absolute -top-3 left-1/2 h-6 w-20 -translate-x-1/2 rotate-[-3deg] bg-[rgba(255,255,255,0.45)] shadow-[0_1px_2px_rgba(0,0,0,0.12)] backdrop-blur-[2px]" />
      <div className="flex items-start justify-between gap-2">
        <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#6b5a24]">ayah {note.key}</span>
        <button
          type="button"
          aria-label="Delete note"
          title="Delete note"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            remove(note.id);
          }}
          className="-mr-1 -mt-1 flex h-6 w-6 items-center justify-center text-[#6b5a24] opacity-60 transition-opacity hover:opacity-100"
        >
          <X size={13} />
        </button>
      </div>
      {note.quote && (
        <div className="mt-1 line-clamp-2 border-l-2 border-[#c9a24a] pl-2 font-hand text-[15px] leading-[1.1] text-[#6b5a24]" dir="auto">
          “{note.quote}”
        </div>
      )}
      <div className="relative mt-1 min-h-0 w-full flex-1">
        <textarea
          ref={area}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            requestAnimationFrame(sync);
          }}
          onScroll={sync}
          onBlur={() => text !== note.text && update(note.id, { text })}
          aria-label={`Note on ayah ${note.key}`}
          className="no-scrollbar absolute inset-0 h-full w-full resize-none bg-transparent font-hand text-[21px] leading-[28px] text-[#2b2410] outline-none placeholder:text-[#8a7a45]"
          placeholder="Write here…"
          dir="auto"
        />
        {/* the same words laid over the textarea, unseen but for the ayah references in them: those
            stay live while writing (pointed at, the ayah shows; tapped, it stays) */}
        {refs.length > 0 && (
          <div ref={mirror} className="no-scrollbar pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words font-hand text-[21px] leading-[28px] text-transparent" dir="auto" aria-hidden>
            {withRefs(text, refs, note)}
          </div>
        )}
      </div>
      <ShareFold note={note} tone="#6b5a24" />
    </div>
  );
}

/** a note's words with each ayah reference a quiet link (dotted, like a pencil underline) */
function withRefs(text: string, refs: ReturnType<typeof refsIn>, note: Note) {
  const out: React.ReactNode[] = [];
  let i = 0;
  const at = (el: HTMLElement) => {
    const card = (el.closest(".note-paper") ?? el).getBoundingClientRect();
    return { x: card.left, y: card.top, w: card.width, h: card.height };
  };
  refs.forEach((r, k) => {
    out.push(text.slice(i, r.at));
    out.push(
      <span
        key={k}
        data-ref={`${r.s}:${r.a}${r.to ? `-${r.to}` : ""}`}
        data-note={note.id}
        onPointerEnter={(e) => e.pointerType === "mouse" && peekHover.enter({ s: r.s, a: r.a, to: r.to, from: note.id, ...at(e.currentTarget) })}
        onPointerLeave={(e) => e.pointerType === "mouse" && peekHover.leave()}
        onMouseDown={(e) => e.preventDefault() /* writing goes on: the caret stays in the note */}
        className="pointer-events-auto cursor-pointer rounded-[3px] underline decoration-[#6b5a24]/60 decoration-dotted decoration-[1.5px] underline-offset-[5px] transition-colors hover:bg-[#c9a24a]/25 hover:decoration-solid"
      >
        {text.slice(r.at, r.end)}
      </span>,
    );
    i = r.end;
  });
  out.push(text.slice(i));
  return out;
}

/** a voice note: kraft paper with a play button and the recording's shape */
function VoiceCard({ note, drag }: { note: Note; drag: boolean }) {
  const remove = useStore((s) => s.removeNote);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const audio = useRef<HTMLAudioElement | null>(null);
  const url = useRef<string | null>(null);
  const bars = useMemo(() => {
    let s = [...(note.audio ?? note.id)].reduce((a, c) => a + c.charCodeAt(0), 7);
    return Array.from({ length: 26 }, () => {
      s = (s * 9301 + 49297) % 233280;
      return 0.25 + (s / 233280) * 0.75;
    });
  }, [note.audio, note.id]);

  useEffect(
    () => () => {
      audio.current?.pause();
      if (url.current) URL.revokeObjectURL(url.current);
    },
    [],
  );

  const toggle = async () => {
    if (!audio.current) {
      const blob = note.audio ? await get<Blob>(voiceKey(note.audio)) : null;
      if (!blob) return;
      url.current = URL.createObjectURL(blob);
      const a = new Audio(url.current);
      a.ontimeupdate = () => setProgress(a.duration && isFinite(a.duration) ? a.currentTime / a.duration : a.currentTime / (note.dur || 1));
      a.onended = () => {
        setPlaying(false);
        setProgress(0);
      };
      audio.current = a;
    }
    if (playing) {
      audio.current.pause();
      setPlaying(false);
    } else {
      await audio.current.play();
      setPlaying(true);
    }
  };

  const dur = note.dur ?? 0;
  return (
    <div
      className={cn(
        "relative flex h-full w-full cursor-grab flex-col justify-between p-3.5 text-[#3a2c14] active:cursor-grabbing",
        drag ? "shadow-[0_34px_50px_-14px_rgba(0,0,0,0.55)]" : "shadow-[0_16px_28px_-12px_rgba(0,0,0,0.5)]",
      )}
      style={{ background: "var(--voice-paper)" }}
    >
      <span className="absolute -top-3 left-6 h-6 w-16 rotate-[4deg] bg-[rgba(255,255,255,0.45)] shadow-[0_1px_2px_rgba(0,0,0,0.12)]" />
      <div className="flex items-start justify-between">
        <span className="min-w-0">
          <span className="block font-hand text-[19px] leading-none">voice note</span>
          {note.quote && (
            <span className="mt-1 block truncate font-hand text-[14px] leading-tight text-[#6b5024]" dir="auto">
              on “{note.quote}”
            </span>
          )}
        </span>
        <button
          type="button"
          aria-label="Delete voice note"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            audio.current?.pause();
            if (note.audio) del(voiceKey(note.audio));
            remove(note.id);
          }}
          className="-mr-1 -mt-1 flex h-6 w-6 items-center justify-center opacity-60 hover:opacity-100"
        >
          <X size={13} />
        </button>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label={playing ? "Pause" : "Play"}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            toggle();
          }}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#3a2c14] text-[#e9d7ae] transition-transform hover:scale-105"
        >
          {playing ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" className="ml-0.5" />}
        </button>
        <div className="flex h-8 flex-1 items-center gap-[2px]">
          {bars.map((b, i) => (
            <span
              key={i}
              className="flex-1 transition-colors"
              style={{ height: `${b * 100}%`, background: i / bars.length < progress ? "#8a5a12" : "rgba(58,44,20,0.35)" }}
            />
          ))}
        </div>
      </div>
      {/* its folded corner, like the paper notes', with the share mark */}
      <span
        className="pointer-events-none absolute bottom-0 right-0 h-[34px] w-[34px]"
        style={{ background: "linear-gradient(135deg, rgba(0,0,0,0) 45%, rgba(0,0,0,0.16) 50%, #c9ad74 56%, #ecdcb4 100%)", boxShadow: "-3px -3px 6px rgba(0,0,0,0.08)" }}
      />
      <ShareFold note={note} tone="#5b4420" />
      <div className="flex items-center justify-between pr-7 font-mono text-[9px] uppercase tracking-[0.14em] text-[#6b5024]">
        <span>ayah {note.key}</span>
        <span className="tabular-nums">
          {Math.floor(dur / 60)}:{String(Math.floor(dur % 60)).padStart(2, "0")}
        </span>
      </div>
    </div>
  );
}

/* ── toast ────────────────────────────────────────────────────── */

export function Toast({ msg }: { msg: string | null }) {
  return (
    <AnimatePresence>
      {msg && (
        <motion.div
          key={msg}
          role="status"
          className="theme-pop label pointer-events-none absolute bottom-12 left-1/2 z-50 border border-[var(--box-line)] bg-[var(--box-bg-solid)] px-3 py-2 text-[var(--box-fg)]"
          initial={{ opacity: 0, y: 10, x: "-50%" }}
          animate={{ opacity: 1, y: 0, x: "-50%" }}
          exit={{ opacity: 0, y: 6, x: "-50%" }}
          transition={{ duration: 0.25, ease: EASE_OUT }}
        >
          {msg}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
