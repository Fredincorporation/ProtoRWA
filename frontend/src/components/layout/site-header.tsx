'use client';

import * as React from 'react';
import Link from 'next/link';

import { BrandLockup } from '@/components/ui/brand';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { DemoModeSwitcher } from '@/components/layout/demo-mode-switcher';
import { MainNav } from '@/components/layout/main-nav';
import { NetworkChip, WalletButton } from '@/components/layout/wallet-button';

/**
 * Fixed site header.
 *
 * Matches the design: 80px tall, translucent surface with a blur, hairline
 * bottom border, and a soft drop shadow. On small screens the nav collapses to
 * a disclosure panel.
 */
export function SiteHeader() {
  const [mobileOpen, setMobileOpen] = React.useState(false);

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-outline-variant/30 bg-surface/90 shadow-[0_1px_8px_rgba(0,0,0,0.4)] backdrop-blur-xl">
      <div className="flex h-20 w-full items-center justify-between gap-space-md px-space-lg lg:px-margin">
        <div className="flex items-center gap-space-lg">
          <Link href="/" className="group flex items-center gap-space-sm" aria-label="ProtoRWA home">
            <BrandLockup />
          </Link>
          <MainNav />
        </div>

        <div className="flex items-center gap-space-md">
          <DemoModeSwitcher />
          <NetworkChip />

          <WalletButton />

          <Button
            variant="ghost"
            size="icon"
            className="relative rounded"
            aria-label="Notifications"
            asChild
          >
            <Link href="/notifications">
              <Icon name="notifications" />
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary" />
            </Link>
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="rounded xl:hidden"
            aria-label="Toggle navigation"
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((open) => !open)}
            type="button"
          >
            <Icon name={mobileOpen ? 'close' : 'menu'} />
          </Button>
        </div>
      </div>

      {mobileOpen ? (
        <div className="border-t border-outline-variant/30 bg-surface-container-lowest xl:hidden">
          <nav className="flex flex-col px-space-lg py-space-sm" aria-label="Mobile">
            {[
              { label: 'Explore Projects', href: '/explore' },
              { label: 'How It Works', href: '/how-it-works' },
              { label: 'Secondary Market', href: '/market' },
              { label: 'Founder Studio', href: '/studio' },
              { label: 'Governance', href: '/governance' },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className="border-b border-outline-variant/20 py-3 font-label-md text-on-surface-variant last:border-0 hover:text-on-surface"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      ) : null}
    </header>
  );
}
