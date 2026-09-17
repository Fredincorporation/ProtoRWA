'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/utils';

/**
 * Primary navigation.
 *
 * Descriptions come from the design: the active item gets a surface container
 * background plus a hairline border, inactive items are muted until hover.
 */

export interface NavItem {
  label: string;
  href: string;
  /** Matches the design's `data-path` attribute. */
  path: string;
}

export const primaryNav: NavItem[] = [
  { label: 'Explore Projects', href: '/explore', path: 'explore-projects' },
  { label: 'How It Works', href: '/how-it-works', path: 'how-it-works' },
  { label: 'Secondary Market', href: '/market', path: 'secondary-market' },
  { label: 'Founder Studio', href: '/studio', path: 'founder-studio' },
  { label: 'Governance', href: '/governance', path: 'governance' },
];

/**
 * Routes linked from the header but not shown in the primary nav (the wallet
 * chip and bell cover notifications; account is reached from the wallet menu).
 * Kept here so the desktop and mobile nav cannot drift apart.
 */
export const utilityNav: NavItem[] = [
  { label: 'Notifications', href: '/notifications', path: 'notifications' },
  { label: 'Account', href: '/account', path: 'account' },
];

export function MainNav({ className }: { className?: string }) {
  const pathname = usePathname();

  return (
    <nav className={cn('hidden items-center gap-space-xs xl:flex', className)} aria-label="Primary">
      {primaryNav.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.path}
            href={item.href}
            data-path={item.path}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'rounded px-space-sm py-1.5 font-label-md transition-colors',
              active
                ? 'border border-outline-variant bg-surface-container text-primary'
                : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface',
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
