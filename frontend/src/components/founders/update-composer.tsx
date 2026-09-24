'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { useAccount } from 'wagmi';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';
import { uploadFile } from '@/lib/ipfs';
import { pinUpdateDoc } from '@/lib/ipfs';
import { protocolChain } from '@/lib/wagmi';
import type { Project } from '@protorwa/shared';
import { isActivityDeployed } from '@/lib/data/founders';
import { usePostUpdate } from '@/lib/data/useFounderActivity';

/**
 * Founder update composer.
 *
 * Pins the post body (title / text / attachment CIDs) to IPFS through the same
 * server proxy the project wizard uses, then anchors the returned CID on-chain
 * with `FounderActivity.postUpdate`. The contract proves the sender owns the
 * project, so only a real founder can publish to a real build — no UI gate to
 * trust. When FounderActivity is not deployed the composer is honestly disabled
 * rather than writing to a fake feed.
 */
const IMAGE_TYPES = /^image\/(png|jpe?g|gif|webp|avif)$/i;
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;

export interface UpdateComposerProps {
  /** Projects owned by the connected founder. */
  projects: Project[];
  onPosted?: () => void;
  className?: string;
}

export function UpdateComposer({ projects, onPosted, className }: UpdateComposerProps) {
  const { isConnected } = useAccount();
  const deployed = isActivityDeployed();
  const post = usePostUpdate();

  const [projectId, setProjectId] = React.useState('');
  const [title, setTitle] = React.useState('');
  const [body, setBody] = React.useState('');
  const [attachments, setAttachments] = React.useState<string[]>([]);
  const [uploading, setUploading] = React.useState(false);

  React.useEffect(() => {
    if (!projectId && projects[0]) setProjectId(projects[0].onChainProjectId ?? projects[0].id);
  }, [projects, projectId]);

  // A published tx landed: notify, clear the draft, and reset the writer.
  React.useEffect(() => {
    if (!post.isSuccess) return;
    toast.success('Update published on-chain', { description: 'Your backers who follow you will see it.' });
    setTitle('');
    setBody('');
    setAttachments([]);
    post.reset();
    onPosted?.();
  }, [post.isSuccess]);

  const onChainId = React.useMemo(() => {
    const project = projects.find((p) => (p.onChainProjectId ?? p.id) === projectId);
    const raw = project?.onChainProjectId ?? project?.id;
    if (!raw || !/^\d+$/.test(raw)) return undefined;
    return BigInt(raw);
  }, [projects, projectId]);

  const canPost =
    deployed &&
    isConnected &&
    projects.length > 0 &&
    onChainId !== undefined &&
    title.trim().length > 0 &&
    body.trim().length > 0 &&
    !uploading &&
    !post.isPending &&
    !post.isConfirming;

  const addAttachment = async (file: File) => {
    if (!IMAGE_TYPES.test(file.type)) {
      toast.error('Only images can be attached to an update.');
      return;
    }
    if (file.size > MAX_ATTACHMENT_BYTES) {
      toast.error('Image too large (max 8 MB).');
      return;
    }
    setUploading(true);
    try {
      const { cid } = await uploadFile(file);
      setAttachments((prev) => [...prev, cid]);
    } catch (error) {
      toast.error('Could not upload image', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setUploading(false);
    }
  };

  const submit = async () => {
    if (!canPost || onChainId === undefined) return;
    setUploading(true);
    try {
      const { cid } = await pinUpdateDoc({
        title: title.trim(),
        body: body.trim(),
        attachmentCids: attachments,
      });
      post.postUpdate(onChainId, cid);
    } catch (error) {
      toast.error('Could not pin update to IPFS', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setUploading(false);
    }
  };

  const busy = uploading || post.isPending || post.isConfirming;
  const error = post.error;

  if (!deployed) {
    return (
      <div
        className={cn(
          'rounded-xl border border-dashed border-outline-variant/50 bg-surface-container p-space-md',
          className,
        )}
      >
        <div className="flex items-center gap-2 font-mono text-label-md text-on-surface">
          <Icon name="edit_note" size={18} className="text-outline" />
          Post an update
        </div>
        <p className="mt-1 text-body-sm text-on-surface-variant">
          The founder feed is read-only until FounderActivity is deployed to{' '}
          {protocolChain.name}. Once live, posts here pin to IPFS and anchor a CID on-chain —
          only a wallet that owns the project can publish to it.
        </p>
      </div>
    );
  }

  if (!isConnected) {
    return (
      <div className={cn('rounded-xl border-outline-variant/40 bg-surface-container p-space-md', className)}>
        <p className="flex items-center gap-2 font-mono text-label-sm text-on-surface-variant">
          <Icon name="account_balance_wallet" size={16} />
          Connect the founder wallet to post updates.
        </p>
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className={cn('rounded-xl border-outline-variant/40 bg-surface-container p-space-md', className)}>
        <p className="flex items-center gap-2 font-mono text-label-sm text-on-surface-variant">
          <Icon name="info" size={16} />
          This wallet doesn&rsquo;t own any projects on {protocolChain.name}, so there is
          nothing to post about yet.
        </p>
      </div>
    );
  }

  return (
    <div className={cn('rounded-xl border-outline-variant/40 bg-surface-container p-space-md', className)}>
      <div className="mb-space-sm flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/15 text-primary">
          <Icon name="campaign" size={18} />
        </span>
        <div>
          <h2 className="font-display text-headline-sm text-on-surface">Post an update</h2>
          <p className="font-mono text-label-sm text-outline">Pinned to IPFS, anchored on-chain</p>
        </div>
      </div>

      <div className="flex flex-col gap-space-sm">
        <div>
          <label htmlFor="update-project" className="mb-1 block font-mono text-label-sm uppercase tracking-wider text-on-surface-variant">
            Project
          </label>
          <select
            id="update-project"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="w-full rounded border border-outline-variant/50 bg-surface-container-lowest px-space-sm py-2 font-mono text-label-md text-on-surface focus:border-primary/60 focus:outline-none"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.onChainProjectId ?? p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="update-title" className="mb-1 block font-mono text-label-sm uppercase tracking-wider text-on-surface-variant">
            Title
          </label>
          <input
            id="update-title"
            type="text"
            value={title}
            maxLength={120}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Milestone 2 shipped to the pilot fleet"
            className="w-full rounded border border-outline-variant/50 bg-surface-container-lowest px-space-sm py-2 font-body-md text-on-surface focus:border-primary/60 focus:outline-none"
          />
        </div>

        <div>
          <label htmlFor="update-body" className="mb-1 block font-mono text-label-sm uppercase tracking-wider text-on-surface-variant">
            Update
          </label>
          <textarea
            id="update-body"
            value={body}
            rows={4}
            maxLength={2000}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Share progress, test results, next steps…"
            className="w-full resize-y rounded border border-outline-variant/50 bg-surface-container-lowest px-space-sm py-2 font-body-md text-on-surface focus:border-primary/60 focus:outline-none"
          />
          <div className="mt-1 flex justify-between font-mono text-label-sm text-outline">
            <span>{body.length} / 2000</span>
          </div>
        </div>

        {/* Attachments */}
        <div>
          <label className="mb-1 block font-mono text-label-sm uppercase tracking-wider text-on-surface-variant">
            Photos (optional)
          </label>
          <div className="flex flex-wrap items-center gap-2">
            {attachments.map((cid) => (
              <span
                key={cid}
                className="inline-flex items-center gap-1 rounded border-outline-variant/50 bg-surface-container-lowest px-2 py-1 font-mono text-label-sm text-on-surface-variant"
              >
                <Icon name="image" size={13} />
                {cid.slice(0, 10)}…
                <button
                  type="button"
                  aria-label="Remove attachment"
                  onClick={() => setAttachments((prev) => prev.filter((c) => c !== cid))}
                  className="text-outline hover:text-error"
                >
                  <Icon name="close" size={13} />
                </button>
              </span>
            ))}
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded border border-dashed border-outline-variant/60 px-2 py-1 font-mono text-label-sm text-on-surface-variant hover:border-primary hover:text-primary">
              <Icon name={uploading ? 'pending' : 'add_photo_alternate'} size={14} className={uploading ? 'animate-spin' : ''} />
              {uploading ? 'Uploading…' : 'Add photo'}
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                disabled={uploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void addAttachment(file);
                  e.target.value = '';
                }}
              />
            </label>
          </div>
        </div>

        {error ? (
          <p className="flex items-center gap-1.5 rounded bg-error/10 p-2 font-mono text-label-sm text-error">
            <Icon name="error" size={15} />
            {error.message.includes('User rejected') ? 'Cancelled in wallet.' : 'Failed to post update.'}
          </p>
        ) : null}

        <div className="flex items-center justify-end gap-2">
          <Button type="button" onClick={submit} disabled={!canPost}>
            <Icon name={busy ? 'pending' : 'send'} size={16} className={busy ? 'animate-spin' : ''} />
            {busy ? (post.isConfirming ? 'Mining…' : 'Publishing…') : 'Publish update'}
          </Button>
        </div>
      </div>
    </div>
  );
}
