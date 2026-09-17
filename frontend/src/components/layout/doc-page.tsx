import * as React from 'react';

import { Icon } from '@/components/ui/icon';

/**
 * Shared layout for long-form text pages (FAQ, terms, support).
 *
 * Gives them one consistent reading column, a table of contents built from the
 * sections passed in, and anchor links that work without client-side JS.
 */

export interface DocSection {
  id: string;
  title: string;
  /** Body content for the section. */
  content: React.ReactNode;
}

export function DocPage({
  kicker,
  title,
  intro,
  sections,
  footer,
}: {
  kicker: string;
  title: string;
  intro: string;
  sections: DocSection[];
  footer?: React.ReactNode;
}) {
  return (
    <>
      <header className="w-full border-b border-outline-variant/30 bg-surface-container-lowest px-space-lg py-space-lg lg:px-margin">
        <div className="mx-auto max-w-7xl">
          <div className="mb-1 font-mono text-label-md uppercase tracking-widest text-primary">
            {kicker}
          </div>
          <h1 className="font-display text-headline-lg uppercase tracking-tight text-on-surface">
            {title}
          </h1>
          <p className="mt-2 max-w-3xl text-body-lg text-on-surface-variant">{intro}</p>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-space-lg px-space-lg py-space-lg lg:grid-cols-[240px_1fr] lg:px-margin">
        {/* Contents: plain anchor links, so no JS is needed to jump. */}
        <nav aria-label="On this page" className="lg:sticky lg:top-24 lg:self-start">
          <div className="mb-space-sm font-mono text-label-md uppercase tracking-wider text-on-surface-variant">
            Contents
          </div>
          <ol className="flex flex-col gap-1">
            {sections.map((section) => (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  className="block rounded px-2 py-1 font-mono text-label-sm text-on-surface-variant transition-colors hover:bg-surface-container hover:text-primary"
                >
                  {section.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="flex flex-col gap-space-lg">
          {sections.map((section, index) => (
            <section
              key={section.id}
              id={section.id}
              className="flex-col gap-space-sm rounded-lg border-outline-variant/40 bg-surface-container p-space-md"
            >
              <h2 className="font-display text-headline-sm text-on-surface">
                <span className="mr-2 font-mono text-label-md text-outline">
                  {String(index + 1).padStart(2, '0')}
                </span>
                {section.title}
              </h2>
              <div className="flex flex-col gap-space-sm text-body-md leading-relaxed text-on-surface-variant">
                {section.content}
              </div>
            </section>
          ))}

          {footer}
        </div>
      </div>
    </>
  );
}

/** Disclosure callout used inside legal pages. */
export function Notice({
  tone = 'warn',
  title,
  children,
}: {
  tone?: 'warn' | 'danger' | 'brand';
  title: string;
  children: React.ReactNode;
}) {
  const styles = {
    warn: { border: 'border-tertiary/40', bg: 'bg-tertiary/5', text: 'text-tertiary', icon: 'warning' },
    danger: { border: 'border-error/40', bg: 'bg-error/5', text: 'text-error', icon: 'gpp_maybe' },
    brand: { border: 'border-primary/40', bg: 'bg-primary/5', text: 'text-primary', icon: 'info' },
  }[tone];

  return (
    <aside className={`rounded border ${styles.border} ${styles.bg} p-space-sm`}>
      <div className={`flex items-center gap-2 font-display text-headline-sm ${styles.text}`}>
        <Icon name={styles.icon} size={18} />
        {title}
      </div>
      <div className="mt-2 text-body-sm text-on-surface-variant">{children}</div>
    </aside>
  );
}
