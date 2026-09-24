'use client';

import Link from 'next/link';
import { useAccount } from 'wagmi';

import { Badge, StatusDot } from '@/components/ui/badge';
import { Icon } from '@/components/ui/icon';
import { FounderAvatar } from '@/components/founders/founder-post-card';
import { FollowButton } from '@/components/founders/follow-button';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import { defaultChain } from '@protorwa/shared';
import { founderHandle, type FounderSummary } from '@/lib/data/founders';

/**
 * Founder discovery directory (/founders).
 *
 * Cards for every founder the catalogue knows — the addresses that actually own
 * a funded project — so discovery can never surface someone with nothing behind
 * them. Follow controls are live against FounderActivity when it is deployed;
 * otherwise they render the honest "goes live on-chain" state.
 */
export function FoundersDirectoryView({ founders }: { founders: FounderSummary[] }) {
  const { address } = useAccount();

  return (
    <div className="mx-auto max-w-6xl px-space-lg py-space-lg lg:px-margin">
      <header className="mb-space-lg">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="rounded bg-secondary/10 px-2 py-0.5 font-mono text-label-sm font-semibold uppercase tracking-widest text-secondary">
            Founder network
          </span>
          <span className="font-mono text-label-sm text-on-surface-variant">
            {defaultChain.name} · chain {defaultChain.id}
          </span>
        </div>
        <h1 className="font-display text-headline-lg tracking-tight text-on-surface">Founders</h1>
        <p className="mt-1 max-w-2xl text-body-md text-on-surface-variant">
          Every founder here has hardware in escrow. Follow one to get their build
          updates in your feed. Only founders — addresses that own a project — can be
          followed.
        </p>
      </header>

      {founders.length === 0 ? (
        <p className="rounded-lg border-dashed border-outline-variant/40 bg-surface-container p-space-xl text-center font-mono text-label-sm text-outline">
          No founders yet.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-space-md sm:grid-cols-2 lg:grid-cols-3">
          {founders.map((founder) => {
            const isSelf = Boolean(
              address && address.toLowerCase() === founder.address.toLowerCase(),
            );
            return (
              <div
                key={founder.address}
                className="flex flex-col gap-space-sm rounded-xl border-outline-variant/40 bg-surface-container p-space-md transition-colors hover:border-outline-variant hover:bg-surface-container-high"
              >
                <div className="flex items-start gap-space-sm">
                  <FounderAvatar name={founder.displayName} avatarCid={founder.avatarCid} size={52} />
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/founders/${founder.handle}`}
                      className="flex items-center gap-1.5 truncate font-display text-headline-sm text-on-surface transition-colors hover:text-primary"
                    >
                      {founder.displayName}
                      <Badge tone={founder.source === 'live' ? 'success' : 'neutral'} className="shrink-0">
                        <StatusDot tone={founder.source === 'live' ? 'brand' : 'neutral'} />
                        {founder.source}
                      </Badge>
                    </Link>
                    <p className="truncate font-mono text-label-sm text-secondary">
                      @{founderHandle(founder.address)}
                    </p>
                  </div>
                </div>

                <p className="line-clamp-2 min-h-[2.5rem] text-body-sm text-on-surface-variant">
                  {founder.bio ?? 'No bio published yet.'}
                </p>

                <div className="flex items-center justify-between font-mono text-label-sm">
                  <span className="inline-flex items-center gap-1.5 text-outline">
                    <Icon name="deployed_code" size={14} />
                    <span className="tabular text-on-surface">{founder.projectCount}</span>
                    {founder.projectCount === 1 ? 'project' : 'projects'}
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-outline">
                    <Icon name="groups" size={14} />
                    <span className="tabular text-on-surface">
                      {founder.followers != null ? formatNumber(founder.followers) : '—'}
                    </span>
                    followers
                  </span>
                </div>

                <div className={cn('mt-1 flex items-center gap-2')}>
                  <Link
                    href={`/founders/${founder.handle}`}
                    className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded border-outline-variant/50 bg-surface-container-lowest font-mono text-label-sm text-on-surface-variant transition-colors hover:border-primary hover:text-primary"
                  >
                    View page
                    <Icon name="arrow_forward" size={14} />
                  </Link>
                  <FollowButton founder={founder.address} founderName={founder.displayName} isSelf={isSelf} size="sm" />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
