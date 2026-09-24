'use client';

import * as React from 'react';
import { useAccount } from 'wagmi';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';
import { protocolChain } from '@/lib/wagmi';
import type { Address } from '@protorwa/shared';
import { isActivityDeployed } from '@/lib/data/founders';
import { useFollow, useIsFollowing, useUnfollow } from '@/lib/data/useFounderActivity';

/**
 * Follow / Unfollow an on-chain founder.
 *
 * The contract enforces "only registered founders are followable", so this is
 * only ever rendered for a founder address. Three states decide the control:
 *   - not deployed: a disabled, honestly-labelled "not live yet" chip (demo).
 *   - no wallet:   a "connect to follow" button (the header already prompts it).
 *   - connected:   follow / unfollow, driven by the on-chain isFollowing read.
 *
 * `onFollowChange` lets the parent refresh the follower count once the tx mines.
 */
export interface FollowButtonProps {
  founder: Address;
  founderName: string;
  /** Whether the connected address IS this founder (self-follow is impossible). */
  isSelf?: boolean;
  className?: string;
  size?: 'sm' | 'md';
  onFollowChange?: () => void;
}

export function FollowButton({
  founder,
  founderName,
  isSelf = false,
  className,
  size = 'md',
  onFollowChange,
}: FollowButtonProps) {
  const { address, isConnected } = useAccount();
  const deployed = isActivityDeployed();
  const { following, refetch } = useIsFollowing(address, founder);
  const follow = useFollow();
  const unfollow = useUnfollow();

  const active = follow.isSuccess ? true : unfollow.isSuccess ? false : following;
  const pending = follow.isPending || follow.isConfirming || unfollow.isPending || unfollow.isConfirming;

  // When a write mines, refresh the membership + let the parent refetch counts,
  // then clear the tx so the next click starts from the settled on-chain value.
  React.useEffect(() => {
    if (!follow.isSuccess && !unfollow.isSuccess) return;
    refetch();
    onFollowChange?.();
    follow.reset();
    unfollow.reset();
  }, [follow.isSuccess, unfollow.isSuccess]);

  if (isSelf) return null;

  if (!deployed) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded border border-dashed border-outline-variant/50 px-3 font-mono text-label-sm text-outline',
          size === 'sm' ? 'h-8' : 'h-10',
          className,
        )}
        title="FounderActivity is not deployed on this network yet, so follows are not live."
      >
        <Icon name="hourglass_empty" size={14} />
        Follows go live on-chain
      </span>
    );
  }

  const error = follow.error ?? unfollow.error;

  return (
    <div className={cn('flex flex-col items-stretch gap-1', className)}>
      {isConnected ? (
        <Button
          type="button"
          size={size}
          variant={active ? 'outline' : 'primary'}
          disabled={pending}
          onClick={() => (active ? unfollow.unfollow(founder) : follow.follow(founder))}
        >
          <Icon
            name={pending ? 'pending' : active ? 'person_remove' : 'person_add'}
            size={16}
            className={pending ? 'animate-spin' : ''}
          />
          {pending ? 'Confirming…' : active ? 'Following' : `Follow ${founderName.split(' ')[0]}`}
        </Button>
      ) : (
        <Button type="button" size={size} variant="outline" disabled title={`Connect a ${protocolChain.name} wallet to follow.`}>
          <Icon name="account_balance_wallet" size={16} />
          Connect to follow
        </Button>
      )}
      {error ? (
        <span className="font-mono text-label-sm text-error">
          {error.message.includes('User rejected') ? 'Cancelled in wallet.' : 'Follow failed.'}
        </span>
      ) : null}
    </div>
  );
}
