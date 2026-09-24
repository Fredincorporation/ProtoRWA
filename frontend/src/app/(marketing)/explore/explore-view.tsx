'use client';

import * as React from 'react';

import {
  ExploreFilterDeck,
  applyFilters,
  defaultFilters,
  type ExploreFilters,
} from '@/components/project/explore-filters';
import { ProjectCard } from '@/components/project/project-card';
import { Icon } from '@/components/ui/icon';
import type { Project } from '@protorwa/shared';

/**
 * Explore results grid (/explore).
 *
 * Client-side filtering stays here: the dataset is small and the interaction must
 * feel instant. The merged catalogue (demo + live on-chain projects) is fetched in
 * the server parent and passed down, so this view never reads the chain itself.
 */
export function ExploreView({ projects }: { projects: Project[] }) {
  const [filters, setFilters] = React.useState<ExploreFilters>(defaultFilters);

  const results = React.useMemo(() => applyFilters(projects, filters), [projects, filters]);

  return (
    <>
      <header className="w-full border-b border-outline-variant/30 bg-surface-container-lowest px-space-lg py-space-lg lg:px-margin">
        <div className="mx-auto max-w-7xl">
          <div className="mb-1 font-mono text-label-md uppercase tracking-widest text-primary">
            {'//'} Asset Directory
          </div>
          <h1 className="font-display text-headline-lg uppercase tracking-tight text-on-surface">
            Explore Projects
          </h1>
          <p className="mt-2 max-w-2xl text-body-md text-on-surface-variant">
            Tokenized hardware builds accepting capital commitments. Each project
            holds committed capital in escrow and releases it against approved
            production milestones.
          </p>
        </div>
      </header>

      <ExploreFilterDeck
        filters={filters}
        onChange={setFilters}
        resultCount={results.length}
        totalCount={projects.length}
      />

      <section className="w-full px-space-lg pb-space-xl lg:px-margin">
        <div className="mx-auto max-w-7xl">
          {results.length === 0 ? (
            <div className="rounded-lg border-dashed border-outline-variant/50 bg-surface-container p-space-xl text-center">
              <Icon name="search_off" size={32} className="mx-auto text-outline" />
              <p className="mt-2 font-display text-headline-sm text-on-surface">
                No projects match those filters
              </p>
              <p className="mx-auto mt-1 max-w-md text-body-sm text-on-surface-variant">
                Try widening the lifecycle stage or clearing the search term.
              </p>
              <button
                type="button"
                onClick={() => setFilters(defaultFilters)}
                className="mt-4 rounded bg-primary px-space-md py-2 font-mono text-label-md text-on-primary"
              >
                Clear filters
              </button>
            </div>
          ) : (
            <div
              className={
                filters.view === 'grid'
                  ? 'grid grid-cols-1 gap-space-md md:grid-cols-2 xl:grid-cols-3'
                  : 'flex flex-col gap-space-sm'
              }
            >
              {results.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  // In list view the card becomes a wide row rather than a tile.
                  className={filters.view === 'list' ? 'md:flex-row md:flex' : undefined}
                />
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
