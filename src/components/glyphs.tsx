import { cn } from "@/lib/utils";

/**
 * The reflection's mark: a page of one's own writing, a pen at its corner. Drawn as the site's other
 * icons are (class "lucide"), so each theme gives it its own line.
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
      {/* a page of one's own writing, the pen at its corner: drawn as the site's other icons are */}
      <path d="M12.5 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6.5" />
      <path d="M8 13.5h3.5M8 17.5h8" />
      <path d="M18.3 2.7a1.6 1.6 0 0 1 2.3 2.3l-6.4 6.4-3 .8.8-3z" />
    </svg>
  );
}
