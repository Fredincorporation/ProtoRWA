import Image from 'next/image';
import Link from 'next/link';

import { Badge, StatusDot } from '@/components/ui/badge';
import { Icon } from '@/components/ui/icon';
import { formatRelativeTime } from '@/lib/format';
import { ipfsUrl } from '@/lib/ipfs';
import { cn } from '@/lib/utils';
import type { FeedItem } from '@/lib/data/founders';

/**
 * A single founder update, rendered as a social post.
 *
 * Display-only (no hooks, no wallet) so it composes into the profile feed, the
 * investor follow feed and the project page alike. It carries its provenance
 * (`live` vs `demo`) as a chip, per the honest-UI rule: a showcase post must
 * never masquerade as an on-chain event.
 */

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|svg)$/i;

function initials(name: string): string {
  const parts = name.replace(/[^a-zA-Z0-9 ]/g, '').trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '?';
  const second = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? '' : '';
  return (first + second).toUpperCase();
}

export function FounderAvatar({
  name,
  avatarCid,
  size = 44,
  className,
}: {
  name: string;
  avatarCid?: string | null;
  size?: number;
  className?: string;
}) {
  const url = ipfsUrl(avatarCid ?? null);
  return (
    <span
      className={cn(
        'relative shrink-0 overflow-hidden rounded-lg bg-gradient-to-br from-primary/25 to-secondary/25 ' +
          'grid place-items-center font-display font-semibold text-primary',
        className,
      )}
      style={{ width: size, height: size, fontSize: size * 0.4 }}
      aria-hidden
    >
      {url ? (
        <Image src={url} alt="" fill className="object-cover" sizes={`${size}px`} unoptimized />
      ) : (
        initials(name)
      )}
    </span>
  );
}

export interface FounderPostCardProps {
  item: FeedItem;
  className?: string;
}

export function FounderPostCard({ item, className }: FounderPostCardProps) {
  const images = item.attachmentCids.filter((c) => IMAGE_EXT.test(c));
  const others = item.attachmentCids.filter((c) => !IMAGE_EXT.test(c));

  return (
    <article
      className={cn(
        'flex flex-col gap-space-sm rounded-lg border-outline-variant/40 bg-surface-container p-space-md',
        className,
      )}
    >
      <header className="flex items-start gap-space-sm">
        <FounderAvatar name={item.authorName} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="truncate font-display text-headline-sm text-on-surface">
              {item.authorName}
            </span>
            <Badge
              tone={item.source === 'live' ? 'success' : 'neutral'}
              className="shrink-0"
            >
              <StatusDot tone={item.source === 'live' ? 'brand' : 'neutral'} />
              {item.source === 'live' ? 'on-chain' : 'demo'}
            </Badge>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 font-mono text-label-sm text-outline">
            <span title={item.createdAt}>{formatRelativeTime(item.createdAt)}</span>
            {item.projectSlug && item.projectTitle ? (
              <>
                <span aria-hidden>·</span>
                <Link
                  href={`/projects/${item.projectSlug}`}
                  className="inline-flex items-center gap-1 text-secondary transition-colors hover:text-primary"
                >
                  <Icon name="deployed_code" size={13} />
                  {item.projectTitle}
                </Link>
              </>
            ) : null}
          </div>
        </div>
      </header>

      <div className="min-w-0">
        <h3 className="font-display text-headline-sm text-on-surface">{item.title}</h3>
        {item.body ? (
          <p className="mt-1 whitespace-pre-line text-body-md leading-relaxed text-on-surface-variant">
            {item.body}
          </p>
        ) : (
          // A missing/failed IPFS pin is shown honestly, never filled with copy.
          <p className="mt-1 font-mono text-label-sm text-outline">
            Update body not available from the pinned source.
          </p>
        )}
      </div>

      {images.length > 0 ? (
        <div
          className={cn(
            'grid gap-2',
            images.length === 1 ? 'grid-cols-1' : 'grid-cols-2',
          )}
        >
          {images.map((cid) => {
            const url = ipfsUrl(cid);
            if (!url) return null;
            return (
              <div key={cid} className="relative aspect-video w-full overflow-hidden rounded bg-surface-container-lowest">
                <Image src={url} alt="" fill className="object-cover" sizes="(max-width: 640px) 100vw, 50vw" unoptimized />
              </div>
            );
          })}
        </div>
      ) : null}

      {others.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {others.map((cid) => {
            const url = ipfsUrl(cid);
            if (!url) return null;
            return (
              <li key={cid}>
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 font-mono text-label-sm text-secondary transition-colors hover:text-primary"
                >
                  <Icon name="attach_file" size={14} />
                  <span className="truncate">Attachment · {cid.slice(0, 18)}…</span>
                </a>
              </li>
            );
          })}
        </ul>
      ) : null}
    </article>
  );
}
