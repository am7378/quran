import { cn } from "@/lib/utils";

/**
 * The reflection's mark: a quill, its line still being written. Drawn as the site's other icons
 * are (class "lucide"), so each theme gives it its own line: Paper's as by a pen, Lunar's fine.
 */
export function QuillGlyph({ size = 16, strokeWidth = 1.6, className }: { size?: number; strokeWidth?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("lucide", className)}
      aria-hidden
    >
      <path d="M20 3.6c-6.4.4-11 4.9-12.4 11.9l-1.2 3.1" />
      <path d="M20 3.6c-.7 5.7-4.7 10.4-10.9 11.6" />
      <path d="M11.4 10.6l3.2.4M9.6 13.3l2.7.3" />
      <path d="M3.5 21c3.3-1.6 6.4-.2 9.6-.9 1.8-.4 3.3-1.1 5.6-.8" />
    </svg>
  );
}
