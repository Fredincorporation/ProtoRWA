import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * Card surfaces.
 *
 * The designs use three deliberate surface levels, so these are separate
 * components rather than one component with a `level` prop - it keeps the call
 * sites readable and prevents accidental level drift.
 */

export const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'rounded-lg border-outline-variant/60 bg-surface-container text-on-surface',
        className,
      )}
      {...props}
    />
  ),
);
Card.displayName = 'Card';

/** Elevated surface for the "featured" tiles and terminal panels. */
export const CardHigh = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'rounded-lg border-outline-variant/60 bg-surface-container-high text-on-surface',
        className,
      )}
      {...props}
    />
  ),
);
CardHigh.displayName = 'CardHigh';

/** Recessed surface for code blocks, log streams and inset lists. */
export const CardLow = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'rounded-lg border-outline-variant/40 bg-surface-container-lowest text-on-surface',
        className,
      )}
      {...props}
    />
  ),
);
CardLow.displayName = 'CardLow';

/** Standard padded card header with an optional trailing action slot. */
export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex items-start justify-between gap-4 border-b border-outline-variant/50 px-5 py-4',
        className,
      )}
    >
      <div className="min-w-0 space-y-1">
        <h3 className="truncate font-display text-headline-sm text-on-surface">{title}</h3>
        {description ? (
          <p className="text-body-sm text-on-surface-variant">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-5 py-4', className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-4 border-t border-outline-variant/50 px-5 py-4',
        className,
      )}
      {...props}
    />
  );
}
