import { sfx, soundSettingsFrom, wakeSound, type Sfx } from "./sound";
import { useStore } from "./store";

/**
 * The site's sounds, heard wherever they belong without each button asking for one: a press on
 * anything pressable taps; a switch ticks up going on and down going off (read from its own
 * aria-pressed / aria-checked, or a checkbox); typing where people write is heard as keys.
 * Something with a sound of its own (recording, completing a surah) says so with data-sfx="none",
 * or names its sound: data-sfx="menu". Only the reader's own presses and keys: never a click the
 * page makes itself.
 */
const PRESSABLE =
  "button, [role=button], [role=menuitem], [role=menuitemradio], [role=menuitemcheckbox], [role=radio], [role=tab], [role=switch], [role=option], a[href], summary, input[type=checkbox], input[type=radio], [data-sfx]";
const TYPING = "input, textarea, [contenteditable=''], [contenteditable='true']";

export function watchSounds() {
  soundSettingsFrom(() => useStore.getState().settings);

  const wake = () => wakeSound();
  const onClick = (e: MouseEvent) => {
    if (!e.isTrusted) return;
    wake(); // (inside the click: allowed to start sound everywhere)
    const el = (e.target as HTMLElement | null)?.closest?.<HTMLElement>(PRESSABLE);
    if (!el) return;
    if ((el as HTMLButtonElement).disabled || el.getAttribute("aria-disabled") === "true") return;
    const own = el.closest<HTMLElement>("[data-sfx]")?.dataset.sfx;
    if (own === "none") return;
    if (own) return sfx(own as Sfx);
    // a switch: which way it is going (the click comes before the page has changed its state)
    if (el instanceof HTMLInputElement && el.type === "checkbox") return sfx(el.checked ? "on" : "off");
    const pressed = el.getAttribute("aria-pressed");
    const role = el.getAttribute("role");
    const checked = el.getAttribute("aria-checked");
    if (pressed === "true" || pressed === "false") return sfx(pressed === "true" ? "off" : "on");
    if ((role === "switch" || role === "menuitemcheckbox") && (checked === "true" || checked === "false")) return sfx(checked === "true" ? "off" : "on");
    sfx("tap");
  };
  const onKey = (e: KeyboardEvent) => {
    if (!e.isTrusted) return;
    wake();
    if (e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target as HTMLElement | null;
    if (!t?.closest?.(TYPING)) return;
    const input = t as HTMLInputElement;
    if (input.type && /^(checkbox|radio|range|button|submit|date|color|file)$/.test(input.type)) return;
    if (e.key.length === 1 || e.key === "Backspace" || e.key === "Enter" || e.key === "Delete") sfx("key");
  };

  // (down for a computer, where that is allowed; the lift for a phone, where only it is)
  window.addEventListener("pointerdown", wake, { capture: true, passive: true });
  window.addEventListener("pointerup", wake, { capture: true, passive: true });
  window.addEventListener("touchend", wake, { capture: true, passive: true });
  document.addEventListener("click", onClick, true);
  document.addEventListener("keydown", onKey, true);
  return () => {
    window.removeEventListener("pointerdown", wake, true);
    window.removeEventListener("pointerup", wake, true);
    window.removeEventListener("touchend", wake, true);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("keydown", onKey, true);
  };
}
