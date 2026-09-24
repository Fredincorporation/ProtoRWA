import { Icon } from '@/components/ui/icon';
import { ipfsUrl } from '@/lib/ipfs';

interface ProjectCidGalleryProps {
  title: string;
  coverCid: string;
  galleryCids: string[];
  pitchVideoCid: string | null;
}

/**
 * Founder-uploaded media for a real (non-curated) project.
 *
 * Renders the pitch video, cover and photo gallery directly from the IPFS CIDs
 * stored on-chain via the public gateway. Unlike the curated demo showcase, this
 * is a real <video> element - what the founder pinned is what a backer plays.
 */
export function ProjectCidGallery({
  title,
  coverCid,
  galleryCids,
  pitchVideoCid,
}: ProjectCidGalleryProps) {
  const cover = ipfsUrl(coverCid);
  const video = ipfsUrl(pitchVideoCid);
  const gallery = galleryCids.map(ipfsUrl).filter((url): url is string => Boolean(url));

  if (!cover && !video && gallery.length === 0) return null;

  return (
    <section className="flex flex-col gap-space-sm overflow-hidden rounded-lg border border-outline-variant/40 bg-surface-container-lowest">
      {video ? (
        <div className="relative aspect-video w-full overflow-hidden bg-black">
          <video
            src={video}
            poster={cover ?? undefined}
            controls
            playsInline
            preload="metadata"
            className="h-full w-full object-contain"
          >
            Your browser cannot play this video.
          </video>
        </div>
      ) : cover ? (
        <div className="relative aspect-video w-full overflow-hidden bg-black">
          {/* Remote, arbitrary content: a plain <img> avoids the next/image
              remote loader, which is not configured for the IPFS gateway. */}
          <img src={cover} alt={`${title} — cover`} className="h-full w-full object-cover" />
        </div>
      ) : null}

      {gallery.length > 0 ? (
        <div className="flex gap-2 overflow-x-auto px-space-md pb-2">
          {gallery.map((url, i) => (
            <img
              key={url + i}
              src={url}
              alt={`${title} — photo ${i + 1}`}
              className="h-14 w-20 shrink-0 rounded border border-outline-variant/40 object-cover"
            />
          ))}
        </div>
      ) : null}

      <div className="flex items-center gap-1.5 px-space-md pb-2 font-mono text-label-sm uppercase tracking-wider text-outline">
        <Icon name="cloud_done" size={14} />
        Pinned to IPFS
      </div>
    </section>
  );
}
