import { cn } from '@/lib/utils';

/**
 * Progress bar used for funding coverage, production progress and vote tallies.
 *
 * `segments` renders a stacked bar (e.g. approved / rejected / abstained vote
 * weight) which the milestone screens need.
 */

export interface ProgressSegment {
  value: number;
  className: string;
  label?: string;
}

export function Progress({
  value,
  max = 100,
  className,
  barClassName,
  label,
}: {
  value: number;
  max?: number;
  className?: string;
  barClassName?: string;
  label?: string;
}) {
  const pct = max <= 0 ? 0 : Math.min(100, Math.max(0, (value / max) * 100));

  return (
    <div className={cn('space-y-1.5', className)}>
      {label ? (
        <div className="flex items-center justify-between font-mono text-label-sm text-on-surface-variant">
          <span>{label}</span>
          <span className="tabular">{pct.toFixed(1)}%</span>
        </div>
      ) : null}
      <div
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? 'Progress'}
        className="h-1.5 w-full overflow-hidden rounded-full bg-surface-container-highest"
      >
        <div
          className={cn('h-full rounded-full bg-primary transition-[width] duration-500', barClassName)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/** Stacked bar for multi-way splits such as vote tallies. */
export function SegmentedProgress({
  segments,
  total,
  className,
  height = 'h-2',
}: {
  segments: ProgressSegment[];
  total: number;
  className?: string;
  height?: string;
}) {
  const safeTotal = total > 0 ? total : 1;

  return (
    <div className={cn('space-y-2', className)}>
      <div
        className={cn(
          'flex w-full overflow-hidden rounded-full bg-surface-container-highest',
          height,
        )}
      >
        {segments.map((segment, index) => {
          const pct = Math.min(100, Math.max(0, (segment.value / safeTotal) * 100));
          if (pct === 0) return null;
          return (
            <div
              key={index}
              className={cn('h-full first:rounded-l-full last:rounded-r-full', segment.className)}
              style={{ width: `${pct}%` }}
              title={segment.label}
            />
          );
        })}
      </div>
      {segments.some((segment) => segment.label) ? (
        <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-label-sm text-on-surface-variant">
          {segments.map((segment, index) => (
            <span key={index} className="inline-flex items-center gap-1.5">
              <span className={cn('h-2 w-2 rounded-sm', segment.className)} aria-hidden />
              {segment.label}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
