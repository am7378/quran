import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Check, FolderPlus } from "lucide-react";
import { useStore } from "@/lib/store";
import { EASE_OUT, cn } from "@/lib/utils";

/**
 * Bookmark folders. Every bookmark is under All; the reader can also file it in folders of their
 * own. Once a folder exists, bookmarking an ayah opens a small popup right there to choose them.
 */

const NO_IDS: string[] = [];

/** The folders, ticked for the ones this bookmark is in, and a field to start a new one. */
export function FolderPicker({ bkey, autoFocusNew }: { bkey: string; autoFocusNew?: boolean }) {
  const folders = useStore((s) => s.folders);
  const ids = useStore((s) => s.inFolders[bkey] ?? NO_IDS);
  const setIn = useStore((s) => s.setInFolders);
  const addFolder = useStore((s) => s.addFolder);
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(!!autoFocusNew);
  const list = Object.values(folders).sort((a, b) => a.at - b.at);

  const toggle = (id: string) => setIn(bkey, ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
  const create = () => {
    if (!name.trim()) return setAdding(false);
    const id = addFolder(name);
    setIn(bkey, [...ids, id]);
    setName("");
    setAdding(false);
  };

  return (
    <div className="flex flex-col">
      {list.map((f) => {
        const on = ids.includes(f.id);
        return (
          <button key={f.id} type="button" onClick={() => toggle(f.id)} aria-pressed={on} className="flex items-center gap-2.5 px-2 py-1.5 text-left text-[14px] transition-colors hover:bg-[var(--box-hover)]">
            <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center border transition-colors", on ? "border-[var(--box-fg)] bg-[var(--box-fg)] text-[var(--box-bg-solid)]" : "border-[var(--box-muted)]")}>
              {on && <Check size={11} strokeWidth={2.6} />}
            </span>
            <span className="min-w-0 flex-1 truncate">{f.name}</span>
          </button>
        );
      })}
      {adding ? (
        <form
          className="flex items-center gap-2 px-2 py-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            create();
          }}
        >
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && (e.stopPropagation(), setAdding(false))}
            placeholder="Folder name"
            maxLength={40}
            className="min-w-0 flex-1 border-b border-[var(--box-line)] bg-transparent py-0.5 text-[14px] text-[var(--box-fg)] outline-none placeholder:text-[var(--box-faint)] focus:border-[var(--color-gold)]"
          />
          <button type="submit" className="label-sm text-[var(--box-muted)] hover:text-[var(--box-fg)]">
            Add
          </button>
        </form>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="flex items-center gap-2.5 px-2 py-1.5 text-left text-[13px] text-[var(--box-muted)] transition-colors hover:bg-[var(--box-hover)] hover:text-[var(--box-fg)]">
          <FolderPlus size={15} strokeWidth={1.5} />
          New folder
        </button>
      )}
    </div>
  );
}

/** Right where an ayah was bookmarked: which folders to file it in. */
export function FolderPop({ at, bkey, onClose }: { at: { x: number; y: number } | null; bkey: string | null; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!at) return;
    const down = (e: PointerEvent) => ref.current && !ref.current.contains(e.target as Node) && onClose();
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    // (after the tap that opened it)
    const t = window.setTimeout(() => window.addEventListener("pointerdown", down, true), 0);
    window.addEventListener("keydown", key);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("keydown", key);
    };
  }, [at, onClose]);

  const W = 248;
  const left = at ? Math.max(12, Math.min(window.innerWidth - W - 12, at.x - W / 2)) : 0;
  const above = at ? at.y > window.innerHeight * 0.55 : false;
  return (
    <AnimatePresence>
      {at && bkey && (
        <motion.div
          ref={ref}
          key={bkey}
          role="dialog"
          aria-label={`Folders for ${bkey}`}
          className="theme-pop fixed z-[80] border border-[var(--box-line)] bg-[var(--box-bg-solid)] p-1.5 text-[var(--box-fg)] shadow-[0_18px_50px_-14px_rgba(0,0,0,0.7)]"
          style={{ left, width: W, ...(above ? { bottom: window.innerHeight - at.y + 12 } : { top: at.y + 12 }) }}
          initial={{ opacity: 0, y: above ? 6 : -6, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.12 } }}
          transition={{ duration: 0.22, ease: EASE_OUT }}
        >
          <div className="flex items-baseline justify-between px-2 pb-1 pt-1">
            <span className="label text-[var(--box-faint)]">Bookmarked {bkey}</span>
            <button type="button" onClick={onClose} className="label-sm text-[var(--box-muted)] hover:text-[var(--box-fg)]">
              Done
            </button>
          </div>
          <div className="px-2 pb-1 text-[12.5px] text-[var(--box-faint)]">Add to a folder</div>
          <FolderPicker bkey={bkey} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
