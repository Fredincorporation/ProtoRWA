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

import { useOnboarding } from '@/components/onboarding/onboarding-dialog';
import { dashboardPathFor } from '@/lib/dashboard';
import { Icon } from '@/components/ui/icon';

export interface NavItem {
  label: string;
  href: string;
  path: string;
  roles?: Array<'investor' | 'founder' | 'admin'>;
}

/**
 * Primary navigation, ordered public-first.
 *
 * A missing `roles` means the item is public. Everything else is gated, and the
 * gate is enforced by `visibleNav` below - there is deliberately no second,
 * unfiltered nav any more. An earlier version rendered `primaryNav` unfiltered
 * in one <nav> and `visibleNav` in another, so every role saw every destination
 * and the `roles` field had no effect.
 */
export const primaryNav: NavItem[] = [
  { label: 'Explore Projects', href: '/explore', path: 'explore-projects' },
  { label: 'How It Works', href: '/how-it-works', path: 'how-it-works' },

  {
    label: 'Secondary Market',
    href: '/market',
    path: 'secondary-market',
    roles: ['investor', 'founder', 'admin'],
  },
  {
    label: 'Protocol Admin',
    href: '/admin',
    path: 'admin',
    roles: ['admin'],
  },
];

export const utilityNav: NavItem[] = [
  { label: 'Notifications', href: '/notifications', path: 'notifications' },
  { label: 'Account', href: '/account', path: 'account' },
];

export function MainNav({ className }: { className?: string }) {
  const pathname = usePathname();
  const { role, openOnboarding } = useOnboarding();

  const visibleNav = React.useMemo(() => {
    return primaryNav.filter((item) => {
      if (!item.roles) return true;
      return item.roles.includes(role);
    });
  }, [role]);

  return (
    <div className="hidden items-center gap-space-sm xl:flex">
      <nav className={cn('flex items-center gap-space-xs', className)} aria-label="Primary">
        <Link
          href={dashboardPathFor(role)}
          data-path="dashboard"
          aria-current={pathname === dashboardPathFor(role) ? 'page' : undefined}
          className={cn(
            'rounded px-space-sm py-1.5 font-label-md transition-colors',
            pathname === dashboardPathFor(role)
              ? 'border border-outline-variant bg-surface-container text-primary font-semibold'
              : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface',
          )}
        >
          Dashboard
        </Link>
        {visibleNav.map((item) => {
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
                  ? 'border border-outline-variant bg-surface-container text-primary font-semibold'
                  : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface',
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Role Switcher Pill */}
      <button
        type="button"
        onClick={openOnboarding}
        className={cn(
          'flex items-center gap-1.5 px-2.5 py-1 rounded-full border font-mono text-[11px] uppercase tracking-wider transition-all',
          role === 'investor' && 'border-primary/40 bg-primary/10 text-primary hover:bg-primary/20',
          role === 'founder' && 'border-secondary/40 bg-secondary/10 text-secondary hover:bg-secondary/20',
          role === 'admin' && 'border-tertiary/40 bg-tertiary/10 text-tertiary hover:bg-tertiary/20'
        )}
        title="Click to switch your operational persona"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
        <span className="font-bold">{role}</span>
        <Icon name="tune" size={12} />
      </button>
    </div>
  );
}
