'use client';

import * as React from 'react';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { useAiAssist, useAiStatus } from '@/lib/ai/client';
import { cn } from '@/lib/utils';

/**
 * "Generate with AI" control for a wizard field group.
 *
 * Design decisions:
 *  - The affordance is disabled (with the reason shown) when the server has no
 *    provider keys, rather than offering a button that always errors.
 *  - Generated output is inserted into the form as a *suggestion* the founder can
 *    edit. Nothing is auto-saved, because the model can be confidently wrong and
 *    this text ends up in public project pages.
 *  - The provider that served the response is shown, so it is visible when a
 *    request fell back from Groq to Gemini.
 */

export interface AiAssistButtonProps<T> {
  task: 'description' | 'milestones' | 'tokenomics' | 'risk';
  prompt: string;
  context?: Record<string, string | number | boolean>;
  label: string;
  /** Applies the model's suggestion to the form. */
  onApply: (data: T) => void;
  className?: string;
}

export function AiAssistButton<T>({
  task,
  prompt,
  context,
  label,
  onApply,
  className,
}: AiAssistButtonProps<T>) {
  const { run, loading, error, provider } = useAiAssist<T>();
  const status = useAiStatus();
  const [applied, setApplied] = React.useState(false);

  const unavailable = !status.loading && !status.configured;

  const handleClick = async () => {
    setApplied(false);
    const result = await run({ task, prompt, context });
    if (result) {
      onApply(result);
      setApplied(true);
      // Clear the confirmation after a moment so the button reads as idle again.
      window.setTimeout(() => setApplied(false), 2_500);
    }
  };

  return (
    <div className={cn('flex flex-wrap items-center gap-space-sm', className)}>
      <Button
        type="button"
        variant="terminal"
        size="sm"
        onClick={handleClick}
        disabled={loading || unavailable || prompt.trim().length < 10}
        title={
          unavailable
            ? 'No AI provider configured. Set GROQ_API_KEY (and optionally GEMINI_API_KEY) on the server.'
            : prompt.trim().length < 10
              ? 'Add more detail above so the model has something to work with.'
              : undefined
        }
      >
        <Icon name={loading ? 'progress_activity' : 'auto_awesome'} size={16} />
        {loading ? 'Generating…' : label}
      </Button>

      {applied ? (
        <span className="inline-flex items-center gap-1 font-mono text-label-sm text-primary">
          <Icon name="check_circle" size={14} />
          Applied — review before publishing
        </span>
      ) : null}

      {provider && !applied ? (
        <span className="font-mono text-label-sm text-outline">via {provider}</span>
      ) : null}

      {unavailable ? (
        <span className="font-mono text-label-sm text-outline">
          AI assist unavailable (no server key)
        </span>
      ) : null}

      {error ? (
        <span className="font-mono text-label-sm text-error" role="alert">
          {error.slice(0, 120)}
        </span>
      ) : null}
    </div>
  );
}

/** Renders AI risk notes as a reviewable list. */
export function RiskNotesList({
  notes,
}: {
  notes: Array<{ severity: string; category: string; note: string; mitigation: string }>;
}) {
  const tone = {
    LOW: 'border-primary/40 bg-primary/5 text-primary',
    MEDIUM: 'border-tertiary/40 bg-tertiary/5 text-tertiary',
    HIGH: 'border-error/40 bg-error/5 text-error',
  } as const;

  return (
    <ul className="flex flex-col gap-space-xs">
      {notes.map((note, index) => (
        <li
          key={`${note.category}-${index}`}
          className={cn(
            'rounded border p-space-sm',
            tone[note.severity as keyof typeof tone] ?? tone.MEDIUM,
          )}
        >
          <div className="flex items-center justify-between gap-space-sm font-mono text-label-sm uppercase tracking-wider">
            <span>{note.category}</span>
            <span>{note.severity}</span>
          </div>
          <p className="mt-1 text-body-sm text-on-surface">{note.note}</p>
          <p className="mt-1 text-body-sm text-on-surface-variant">
            <strong className="text-on-surface-variant">Mitigation:</strong> {note.mitigation}
          </p>
        </li>
      ))}
    </ul>
  );
}
