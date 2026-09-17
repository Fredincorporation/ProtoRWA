import { cn } from '@/lib/utils';

/**
 * Material Symbols icon.
 *
 * The designs use Google's Material Symbols Outlined font, so this renders the
 * ligature in that font rather than swapping to an SVG icon set. That keeps
 * glyph shapes identical to the source designs.
 */
export interface IconProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Ligature name, e.g. "notifications", "how_to_vote". */
  name: string;
  /** Pixel size; the design uses 20px in the header and 18px in dense rows. */
  size?: number;
  /** Filled variant, used for active/selected states. */
  filled?: boolean;
}

export function Icon({ name, size = 20, filled = false, className, ...props }: IconProps) {
  return (
    <span
      aria-hidden
      className={cn('material-symbols-outlined select-none leading-none', className)}
      style={{
        fontSize: `${size}px`,
        fontVariationSettings: filled
          ? "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24"
          : "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24",
      }}
      {...props}
    >
      {name}
    </span>
  );
}
