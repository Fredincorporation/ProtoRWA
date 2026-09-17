import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

/**
 * Badge / status chip.
 *
 * Rendered in monospace uppercase to match the design language, where status is
 * always a machine-readable label rather than prose.
 */
const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono ' +
    'text-label-sm uppercase tracking-wide',
  {
    variants: {
      tone: {
        neutral: 'border-outline-variant bg-surface-container text-on-surface-variant',
        brand: 'border-primary/40 bg-primary/10 text-primary',
        accent: 'border-secondary/40 bg-secondary/10 text-secondary',
        warn: 'border-tertiary/40 bg-tertiary/10 text-tertiary',
        danger: 'border-error/40 bg-error/10 text-error',
        success: 'border-primary/50 bg-primary/15 text-primary',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

/**
 * A live indicator dot; pulses to signal an active stream or open window.
 *
 * Tones mirror the status map in lib/status.ts, so every status tone has a
 * matching dot. `accent` was missing, which meant in-production projects had no
 * valid dot tone and the market table failed to typecheck.
 */
export function StatusDot({
  tone = 'brand',
  pulse = false,
  className,
}: {
  tone?: 'brand' | 'accent' | 'success' | 'warn' | 'danger' | 'neutral';
  pulse?: boolean;
  className?: string;
}) {
  const toneClass = {
    brand: 'bg-primary',
    accent: 'bg-secondary',
    success: 'bg-primary',
    warn: 'bg-tertiary',
    danger: 'bg-error',
    neutral: 'bg-outline',
  }[tone];

  return (
    <span
      aria-hidden
      className={cn(
        'inline-block h-1.5 w-1.5 rounded-full',
        toneClass,
        pulse && 'animate-pulse-dot',
        className,
      )}
    />
  );
}
