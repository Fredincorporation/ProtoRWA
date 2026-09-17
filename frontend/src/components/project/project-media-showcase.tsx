'use client';

import * as React from 'react';
import Image from 'next/image';

import { Icon } from '@/components/ui/icon';
import { type ProjectMediaAssets } from '@/lib/project-media';
import { cn } from '@/lib/utils';

interface ProjectMediaShowcaseProps {
  title: string;
  tagline: string;
  media: ProjectMediaAssets;
}

/**
 * Video pitch / media showcase for the project detail page.
 *
 * Layout: a full-width hero image with a play-modal overlay, a live
 * hardware telemetry HUD at the bottom, and a spec ribbon below.
 * Matches the HelioFrost Pro Terminal design from Stitch Screen 04.
 */
export function ProjectMediaShowcase({ title, tagline, media }: ProjectMediaShowcaseProps) {
  const [playing, setPlaying] = React.useState(false);
  const [activeImg, setActiveImg] = React.useState(0);

  if (!media.videoPoster) return null;

  const images = media.gallery.length > 0 ? media.gallery : [media.videoPoster];

  return (
    <section className="flex flex-col gap-space-sm overflow-hidden rounded-lg border border-outline-variant/40 bg-surface-container-lowest">
      {/* ── Main showcase frame ───────────────────────────────────── */}
      <div className="relative aspect-video w-full overflow-hidden bg-black">
        {/* Poster / gallery image */}
        <Image
          src={images[activeImg] ?? media.videoPoster}
          alt={`${title} — production media`}
          fill
          className={cn(
            'object-cover transition-opacity duration-500',
            playing && 'opacity-20',
          )}
          sizes="(max-width: 768px) 100vw, 66vw"
          priority
          unoptimized
        />

        {/* Play overlay */}
        {!playing ? (
          <button
            onClick={() => setPlaying(true)}
            className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/30 transition-colors hover:bg-black/40"
            aria-label="Play pitch video"
          >
            <span className="grid h-16 w-16 place-items-center rounded-full bg-primary/90 shadow-2xl backdrop-blur-sm transition-transform hover:scale-105">
              <Icon name="play_arrow" size={36} className="text-on-primary" />
            </span>
            <span className="rounded bg-surface/80 px-3 py-1 font-mono text-label-sm uppercase tracking-widest text-primary backdrop-blur-sm">
              Watch Pitch Video
            </span>
          </button>
        ) : (
          /* Simulated playing state */
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
            <div className="animate-pulse font-mono text-label-sm uppercase tracking-widest text-primary">
              ▶ Playing founder pitch…
            </div>
            <button
              onClick={() => setPlaying(false)}
              className="font-mono text-label-sm text-on-surface-variant hover:text-primary"
            >
              Stop
            </button>
          </div>
        )}

        {/* ── Telemetry HUD bar ──────────────────────────────────── */}
        {media.telemetry.length > 0 && (
          <div className="absolute bottom-0 left-0 right-0 flex flex-wrap items-center gap-x-4 gap-y-1 bg-surface/80 px-space-md py-2 backdrop-blur-md">
            {media.telemetry.map((row) => (
              <span key={row.label} className="inline-flex items-baseline gap-1 font-mono text-label-sm">
                <span className="text-on-surface-variant">{row.label}:</span>
                <span className="tabular text-primary">{row.value}</span>
                <span className="text-outline">{row.unit}</span>
              </span>
            ))}
          </div>
        )}

        {/* Badge top-left */}
        <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded bg-surface/80 px-2 py-1 font-mono text-label-sm uppercase tracking-wider text-primary backdrop-blur-sm">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
          Live Production
        </span>
      </div>

      {/* ── Thumbnail strip (gallery) ─────────────────────────────── */}
      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto px-space-md pb-2">
          {images.map((src, i) => (
            <button
              key={i}
              onClick={() => { setActiveImg(i); setPlaying(false); }}
              className={cn(
                'relative h-14 w-20 shrink-0 overflow-hidden rounded border-2 transition-colors',
                i === activeImg ? 'border-primary' : 'border-outline-variant/40 hover:border-outline-variant',
              )}
              aria-label={`Gallery image ${i + 1}`}
            >
              <Image
                src={src}
                alt={`Gallery ${i + 1}`}
                fill
                className="object-cover"
                sizes="80px"
                unoptimized
              />
            </button>
          ))}
        </div>
      )}

      {/* ── Spec ribbon ──────────────────────────────────────────── */}
      {media.specs.length > 0 && (
        <div className="grid grid-cols-3 gap-px border-t border-outline-variant/30 bg-outline-variant/20">
          {media.specs.map((spec) => (
            <div
              key={spec.label}
              className="flex flex-col items-center gap-0.5 bg-surface-container px-2 py-space-sm text-center"
            >
              <Icon name={spec.icon} size={18} className="text-secondary" />
              <span className="font-mono text-label-sm uppercase tracking-wide text-on-surface-variant">
                {spec.label}
              </span>
              <span className="font-display text-headline-sm tabular text-on-surface">
                {spec.value}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
