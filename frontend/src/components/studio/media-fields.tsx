'use client';

import * as React from 'react';
import { toast } from 'sonner';

import { Icon } from '@/components/ui/icon';
import { ipfsUrl, uploadFile } from '@/lib/ipfs';
import { uploadVideoToR2 } from '@/lib/r2';
import { MAX_UPLOAD_BYTES, MAX_VIDEO_BYTES, R2_VIDEO_ENABLED } from '@/lib/upload-limits';
import { cn } from '@/lib/utils';

/**
 * Media upload fields for the founder studio.
 *
 * Each field pins its file through `/api/upload` and keeps only the returned
 * CID in the form state; previews render from the public IPFS gateway so what
 * the founder sees is what a backer will see on the project page. The pitch
 * video is mandatory (the schema enforces a non-empty CID); photos and cover
 * follow the same shape.
 */

const IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp,image/avif';
const VIDEO_ACCEPT = 'video/mp4,video/webm,video/quicktime';

// Images are always pinned through the proxied `/api/upload`, so they are capped
// at the serverless body limit (see @/lib/upload-limits). Video uses the larger
// R2 ceiling when direct upload is enabled; when it falls back to the IPFS proxy
// it is capped at that proxy's body limit instead, so the pre-check never lets a
// file through that the route would reject with a 413.
const MAX_IMAGE_BYTES = MAX_UPLOAD_BYTES;
const MAX_VIDEO_LIMIT = R2_VIDEO_ENABLED ? MAX_VIDEO_BYTES : MAX_UPLOAD_BYTES;
const MAX_GALLERY = 8;

interface FieldMessage {
  error?: string;
}

/** Shared upload driver: validates the file, pins it, reports the CID. */
function useUploader(accept: string, maxBytes: number, kindLabel: string) {
  const [busy, setBusy] = React.useState(false);
  const typePrefix = (accept.split(',')[0] ?? '').split('/')[0] ?? '';

  const upload = React.useCallback(
    async (file: File): Promise<string | null> => {
      if (typePrefix && !file.type.startsWith(typePrefix + '/')) {
        toast.error(`Unsupported ${kindLabel} type`, {
          description: `Allowed: ${accept.replace(/,/g, ', ')}`,
        });
        return null;
      }
      if (file.size > maxBytes) {
        toast.error(`${kindLabel} too large`, {
          description: `Maximum ${Math.round(maxBytes / 1024 / 1024)} MB.`,
        });
        return null;
      }

      setBusy(true);
      try {
        const { cid } = await uploadFile(file);
        toast.success(`${kindLabel} pinned`, { description: cid });
        return cid;
      } catch (error) {
        toast.error(`Could not pin ${kindLabel}`, {
          description: error instanceof Error ? error.message : 'Unknown error',
        });
        return null;
      } finally {
        setBusy(false);
      }
    },
    [accept, typePrefix, maxBytes, kindLabel],
  );

  return { busy, upload };
}

function fileFromEvent(event: React.ChangeEvent<HTMLInputElement>): File | null {
  return event.target.files?.[0] ?? null;
}

/** Cover image: single, required. */
export function CoverImageField({
  value,
  onChange,
  error,
}: FieldMessage & { value: string; onChange: (cid: string) => void }) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const { busy, upload } = useUploader(IMAGE_ACCEPT, MAX_IMAGE_BYTES, 'Cover image');
  const preview = ipfsUrl(value);

  return (
    <div className="flex-col gap-1.5">
      <span className="font-mono text-label-md uppercase tracking-wider text-on-surface-variant">
        Cover image
      </span>

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className={cn(
          'group relative flex aspect-video w-full items-center justify-center overflow-hidden rounded border border-dashed transition-colors',
          preview ? 'border-outline-variant/40' : 'border-outline-variant/60 hover:border-primary/60',
          'bg-surface-container-lowest',
          error && 'border-error/60',
        )}
      >
        {preview ? (
          // Gateway images are arbitrary content: a plain <img> is used rather
          // than next/image, whose loader is not configured for remote hosts.
          <img src={preview} alt="Project cover" className="h-full w-full object-cover" />
        ) : (
          <span className="flex flex-col items-center gap-2 text-outline group-hover:text-primary">
            <Icon name={busy ? 'hourglass_top' : 'add_photo_alternate'} size={28} className={busy ? 'animate-pulse' : ''} />
            <span className="font-mono text-label-sm">
              {busy ? 'Pinning…' : 'Upload cover image'}
            </span>
          </span>
        )}
        {preview ? (
          <span className="absolute right-2 top-2 rounded bg-surface/80 px-2 py-1 font-mono text-label-sm uppercase tracking-wider text-on-surface backdrop-blur-sm">
            Change
          </span>
        ) : null}
      </button>

      <input
        ref={inputRef}
        type="file"
        accept={IMAGE_ACCEPT}
        className="hidden"
        onChange={async (event) => {
          const file = fileFromEvent(event);
          event.target.value = '';
          if (!file) return;
          const cid = await upload(file);
          if (cid) onChange(cid);
        }}
      />

      {error ? (
        <p className="flex items-center gap-1 text-label-sm text-error" role="alert">
          <Icon name="error" size={14} />
          {error}
        </p>
      ) : (
        <p className="text-label-sm text-outline">PNG, JPEG, WebP or AVIF · up to {Math.round(MAX_IMAGE_BYTES / 1024 / 1024)} MB</p>
      )}
    </div>
  );
}

/** Project photo gallery: multiple, at least one required. */
export function GalleryField({
  value,
  onChange,
  error,
}: FieldMessage & { value: string[]; onChange: (cids: string[]) => void }) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const { busy, upload } = useUploader(IMAGE_ACCEPT, MAX_IMAGE_BYTES, 'Photo');

  const addPhoto = async (file: File) => {
    if (value.length >= MAX_GALLERY) {
      toast.error('Gallery full', { description: `At most ${MAX_GALLERY} photos.` });
      return;
    }
    const cid = await upload(file);
    if (cid) onChange([...value, cid]);
  };

  return (
    <div className="flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="font-mono text-label-md uppercase tracking-wider text-on-surface-variant">
          Project photos
        </span>
        <span className="font-mono text-label-sm text-outline">
          {value.length}/{MAX_GALLERY}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-space-sm sm:grid-cols-4">
        {value.map((cid, index) => (
          <div
            key={cid}
            className="group relative aspect-square overflow-hidden rounded border border-outline-variant/40"
          >
            <img src={ipfsUrl(cid) ?? ''} alt={`Project photo ${index + 1}`} className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => onChange(value.filter((_, i) => i !== index))}
              aria-label={`Remove photo ${index + 1}`}
              className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded bg-surface/80 text-on-surface opacity-0 backdrop-blur-sm transition-opacity hover:text-error group-hover:opacity-100 focus-visible:opacity-100"
            >
              <Icon name="close" size={14} />
            </button>
          </div>
        ))}

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy || value.length >= MAX_GALLERY}
          className={cn(
            'flex aspect-square items-center justify-center rounded border border-dashed text-outline transition-colors',
            'border-outline-variant/60 hover:border-primary/60 hover:text-primary',
            'bg-surface-container-lowest disabled:opacity-50',
          )}
        >
          <Icon name={busy ? 'hourglass_top' : 'add'} size={22} className={busy ? 'animate-pulse' : ''} />
        </button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={IMAGE_ACCEPT}
        multiple
        className="hidden"
        onChange={async (event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = '';
          for (const file of files) {
            // Sequential so the gateway toast order matches selection order.
            await addPhoto(file);
          }
        }}
      />

      {error ? (
        <p className="flex items-center gap-1 text-label-sm text-error" role="alert">
          <Icon name="error" size={14} />
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Founder pitch video: single, required by the schema. */
export function PitchVideoField({
  value,
  onChange,
  onHashChange,
  error,
}: FieldMessage & {
  value: string;
  onChange: (ref: string) => void;
  onHashChange?: (hash: string) => void;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);
  const preview = ipfsUrl(value);

  const clear = () => {
    onChange('');
    onHashChange?.('');
  };

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('video/')) {
      toast.error('Unsupported pitch video type', {
        description: `Allowed: ${VIDEO_ACCEPT.replace(/,/g, ', ')}`,
      });
      return;
    }
    if (file.size > MAX_VIDEO_LIMIT) {
      toast.error('Pitch video too large', {
        description: `Maximum ${Math.round(MAX_VIDEO_LIMIT / 1024 / 1024)} MB.`,
      });
      return;
    }

    setBusy(true);
    try {
      if (R2_VIDEO_ENABLED) {
        // Direct browser -> R2 upload: bytes bypass the serverless body cap, so
        // large pitch videos work. We store the public URL and the SHA-256 hash.
        const { url, hash } = await uploadVideoToR2(file);
        toast.success('Pitch video uploaded', { description: url });
        onChange(url);
        onHashChange?.(hash);
      } else {
        // Fallback: pin through the IPFS proxy (small files only).
        const { cid } = await uploadFile(file);
        toast.success('Pitch video pinned', { description: cid });
        onChange(cid);
        onHashChange?.('');
      }
    } catch (err) {
      toast.error('Could not upload pitch video', {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setBusy(false);
    }
  };

  const isUrl = /^https?:\/\//i.test(value);

  return (
    <div className="flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <span className="font-mono text-label-md uppercase tracking-wider text-on-surface-variant">
          Founder pitch video
        </span>
        <span className="rounded bg-primary/15 px-1.5 py-0.5 font-mono text-label-sm uppercase tracking-wider text-primary">
          Required
        </span>
      </div>

      {preview ? (
        <div className="overflow-hidden rounded border border-outline-variant/40 bg-black">
          <video src={preview} controls playsInline className="aspect-video w-full" />
          <div className="flex items-center justify-between px-space-sm py-2">
            <span className="truncate font-mono text-label-sm text-outline" title={value}>
              {isUrl ? value : `ipfs://${value}`}
            </span>
            <button
              type="button"
              onClick={clear}
              className="inline-flex items-center gap-1 font-mono text-label-sm text-on-surface-variant transition-colors hover:text-error"
            >
              <Icon name="delete" size={14} />
              Remove
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className={cn(
            'group flex aspect-video w-full flex-col items-center justify-center gap-2 rounded border border-dashed bg-surface-container-lowest text-outline transition-colors',
            error ? 'border-error/60' : 'border-outline-variant/60 hover:border-primary/60 hover:text-primary',
          )}
        >
          <Icon name={busy ? 'hourglass_top' : 'movie'} size={28} className={busy ? 'animate-pulse' : ''} />
          <span className="font-mono text-label-sm">
            {busy ? (R2_VIDEO_ENABLED ? 'Uploading…' : 'Pinning…') : 'Upload pitch video'}
          </span>
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={VIDEO_ACCEPT}
        className="hidden"
        onChange={async (event) => {
          const file = fileFromEvent(event);
          event.target.value = '';
          if (!file) return;
          await handleFile(file);
        }}
      />

      {error ? (
        <p className="flex items-center gap-1 text-label-sm text-error" role="alert">
          <Icon name="error" size={14} />
          {error}
        </p>
      ) : (
        <p className="text-label-sm text-outline">
          MP4, WebM or MOV · up to {Math.round(MAX_VIDEO_LIMIT / 1024 / 1024)} MB. Backers watch this before committing.
        </p>
      )}
    </div>
  );
}
