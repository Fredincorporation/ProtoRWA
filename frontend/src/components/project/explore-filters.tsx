'use client';

import * as React from 'react';

import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';
import { categoryMap } from '@/lib/status';
import type { IndustryCategory, Project } from '@protorwa/shared';

/**
 * Explore filter deck.
 *
 * Ported from the design's "Interactive Terminal Filter Deck": an omnisearch
 * row with a sort control and a view toggle, then a row of category pills
 * grouped by lifecycle status.
 *
 * Filtering happens client-side over the supplied set, which is correct for the
 * demo. When the indexer lands, these become query params on a server fetch -
 * `ExploreFilters` is deliberately a plain data shape so that swap is local.
 */

export type SortKey = 'newest' | 'most-funded' | 'ending-soon' | 'most-holders';

/**
 * Sort option labels, matching the design's select exactly.
 *
 * "Highest Target Multiple" and "Newly Minted" come from the source design. The
 * first is omitted: ranking by target multiple implies a return projection the
 * protocol does not make. "Most holders" replaces it as a comparable signal that
 * is actually observable. "Newly Minted" is kept as `newest`.
 */
export const sortLabels: Record<SortKey, string> = {
  'most-funded': 'Most Funded',
  'ending-soon': 'Ending Soon',
  'most-holders': 'Most Holders',
  newest: 'Newly Minted',
};

export interface ExploreFilters {
  search: string;
  category: IndustryCategory | 'ALL';
  status: 'ALL' | 'FUNDING' | 'IN_PRODUCTION' | 'COMPLETED';
  sort: SortKey;
  /** Grid or list rendering, as in the design's view toggle. */
  view: 'grid' | 'list';
}

export const defaultFilters: ExploreFilters = {
  search: '',
  category: 'ALL',
  status: 'ALL',
  sort: 'newest',
  view: 'grid',
};

/** Lifecycle groups shown as pills, matching the design's two filter rows. */
const statusGroups: Array<{ key: ExploreFilters['status']; label: string }> = [
  { key: 'ALL', label: 'All Products' },
  { key: 'FUNDING', label: 'Funding' },
  { key: 'IN_PRODUCTION', label: 'In Production' },
  { key: 'COMPLETED', label: 'Delivered' },
];

const categoryKeys = Object.keys(categoryMap) as IndustryCategory[];

interface ExploreFiltersProps {
  filters: ExploreFilters;
  onChange: (next: ExploreFilters) => void;
  /** Total matching the current filters, for the result count. */
  resultCount: number;
  totalCount: number;
}

export function ExploreFilterDeck({
  filters,
  onChange,
  resultCount,
  totalCount,
}: ExploreFiltersProps) {
  const set = <K extends keyof ExploreFilters>(key: K, value: ExploreFilters[K]) =>
    onChange({ ...filters, [key]: value });

  const dirty =
    filters.search !== '' ||
    filters.category !== 'ALL' ||
    filters.status !== 'ALL' ||
    filters.sort !== defaultFilters.sort;

  return (
    <section className="w-full px-space-lg pb-space-md pt-space-lg lg:px-margin">
      <div className="mx-auto flex max-w-7xl flex-col gap-space-md">
        {/* Upper row: omnisearch, sort, view toggle */}
        <div className="flex flex-col gap-space-sm rounded-lg border-outline-variant/40 bg-surface-container p-space-sm md:flex-row md:items-center md:justify-between">
          <div className="relative flex-1">
            <Icon
              name="search"
              size={18}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-outline"
            />
            <input
              type="search"
              value={filters.search}
              onChange={(event) => set('search', event.target.value)}
              placeholder="Search projects, SKUs, founders..."
              aria-label="Search projects"
              className="w-full rounded bg-surface-container-lowest py-2 pl-10 pr-space-sm font-mono text-label-md text-on-surface placeholder:text-outline focus:bg-surface-container-high focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-space-xs">
            <label
              htmlFor="explore-sort"
              className="font-mono text-label-sm uppercase text-on-surface-variant"
            >
              Sort:
            </label>
            <select
              id="explore-sort"
              value={filters.sort}
              onChange={(event) =>
                set('sort', event.target.value as ExploreFilters['sort'])
              }
              className="cursor-pointer rounded border-outline-variant/50 bg-surface-container-lowest px-space-sm py-2 font-mono text-label-md text-on-surface focus:outline-none"
            >
              {(Object.keys(sortLabels) as Array<keyof typeof sortLabels>).map((key) => (
                <option key={key} value={key}>
                  {sortLabels[key]}
                </option>
              ))}
            </select>

            {/* View toggle, as in the design's grid/list buttons. */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => set('view', 'grid')}
                aria-pressed={filters.view === 'grid'}
                aria-label="Grid view"
                title="Grid view"
                className={cn(
                  'rounded p-2 transition-colors',
                  filters.view === 'grid'
                    ? 'bg-surface-container-high text-primary'
                    : 'bg-surface-container-low text-on-surface-variant hover:text-on-surface',
                )}
              >
                <Icon name="grid_view" size={20} />
              </button>
              <button
                type="button"
                onClick={() => set('view', 'list')}
                aria-pressed={filters.view === 'list'}
                aria-label="List view"
                title="List registry"
                className={cn(
                  'rounded p-2 transition-colors',
                  filters.view === 'list'
                    ? 'bg-surface-container-high text-primary'
                    : 'bg-surface-container-low text-on-surface-variant hover:text-on-surface',
                )}
              >
                <Icon name="view_agenda" size={20} />
              </button>
            </div>

            {/* Result count keeps the deck informative rather than decorative. */}
            <span className="ml-space-xs hidden whitespace-nowrap font-mono text-label-sm text-outline lg:inline">
              {resultCount} of {totalCount}
            </span>

            {dirty ? (
              <button
                type="button"
                onClick={() => onChange(defaultFilters)}
                className="ml-space-xs rounded border-outline-variant/50 px-space-sm py-2 font-mono text-label-sm text-on-surface-variant transition-colors hover:border-outline hover:text-on-surface"
              >
                Clear
              </button>
            ) : null}
          </div>
        </div>

        {/* Lower row: lifecycle pills + category pills.
            `min-w-0` on the scroll containers is required: without it the flex
            children refuse to shrink below content width and the pills overflow
            the card instead of scrolling within it. */}
        <div className="flex min-w-0 flex-col gap-space-sm">
          <div className="flex min-w-0 items-center gap-space-xs overflow-x-auto pb-1">
            {statusGroups.map((group) => {
              const active = filters.status === group.key;
              return (
                <button
                  key={group.key}
                  type="button"
                  onClick={() => set('status', group.key)}
                  aria-pressed={active}
                  className={cn(
                    'whitespace-nowrap rounded-lg px-space-md py-1.5 font-mono text-label-md uppercase tracking-wider transition-colors',
                    active
                      ? 'bg-primary font-semibold text-on-primary'
                      : 'bg-surface-container text-on-surface-variant hover:text-on-surface',
                  )}
                >
                  {group.label}
                </button>
              );
            })}
          </div>

          <div className="flex min-w-0 items-center gap-2 overflow-x-auto pb-2">
            <button
              type="button"
              onClick={() => set('category', 'ALL')}
              aria-pressed={filters.category === 'ALL'}
              className={cn(
                'whitespace-nowrap rounded px-space-sm py-1 font-mono text-label-sm uppercase tracking-wider transition-colors',
                filters.category === 'ALL'
                  ? 'bg-primary/15 text-primary'
                  : 'bg-surface-container-low text-on-surface-variant hover:text-on-surface',
              )}
            >
              All categories
            </button>

            {categoryKeys.map((key) => {
              const active = filters.category === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => set('category', key)}
                  aria-pressed={active}
                  className={cn(
                    'inline-flex items-center gap-1.5 whitespace-nowrap rounded px-space-sm py-1 font-mono text-label-sm uppercase tracking-wider transition-colors',
                    active
                      ? 'bg-primary/15 text-primary'
                      : 'bg-surface-container-low text-on-surface-variant hover:text-on-surface',
                  )}
                >
                  <Icon name={categoryMap[key].icon} size={13} />
                  {categoryMap[key].label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

/** Applies filters and sorting to a project list. Pure, so it is unit-testable. */
export function applyFilters(projects: Project[], filters: ExploreFilters): Project[] {
  const term = filters.search.trim().toLowerCase();

  const filtered = projects.filter((project) => {
    if (filters.status !== 'ALL' && project.status !== filters.status) return false;
    if (filters.category !== 'ALL' && project.category !== filters.category) return false;

    if (term.length > 0) {
      const haystack = [
        project.title,
        project.tagline,
        project.founderHandle ?? '',
        project.manufacturingLocation,
      ]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(term)) return false;
    }

    return true;
  });

  const sorted = [...filtered];

  switch (filters.sort) {
    case 'most-funded':
      sorted.sort((a, b) => {
        const aPct = percent(a);
        const bPct = percent(b);
        return bPct - aPct;
      });
      break;
    case 'ending-soon':
      sorted.sort((a, b) => {
        // Projects past their deadline sink to the bottom.
        const aTime = new Date(a.escrow.fundingDeadline).getTime();
        const bTime = new Date(b.escrow.fundingDeadline).getTime();
        const now = Date.now();
        const aFuture = aTime > now ? aTime : Number.POSITIVE_INFINITY;
        const bFuture = bTime > now ? bTime : Number.POSITIVE_INFINITY;
        return aFuture - bFuture;
      });
      break;
    case 'most-holders':
      sorted.sort((a, b) => (b.metrics?.holders ?? 0) - (a.metrics?.holders ?? 0));
      break;
    case 'newest':
    default:
      sorted.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
      break;
  }

  return sorted;
}

function percent(project: Project): number {
  const target = BigInt(project.escrow.target || '0');
  if (target === 0n) return 0;
  const committed = BigInt(project.escrow.totalCommitted || '0');
  return Number((committed * 10_000n) / target);
}
