import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * Form primitives.
 *
 * Kept in one module because the wizard's fields all share the same terminal
 * styling: mono labels, lowest-surface inputs, and inline error text. Errors are
 * always rendered by the field itself so a screen-reader user hears the message
 * in context via aria-describedby.
 */

interface FieldProps {
  label: string;
  hint?: React.ReactNode;
  error?: string;
  /** Renders after the input, e.g. an AI assist button. */
  action?: React.ReactNode;
  children: (props: {
    id: string;
    'aria-invalid': boolean;
    'aria-describedby': string | undefined;
  }) => React.ReactNode;
  className?: string;
}

export function Field({ label, hint, error, action, children, className }: FieldProps) {
  const id = React.useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cn('flex-col gap-1.5', className)}>
      <div className="flex items-center justify-between gap-space-sm">
        <label
          htmlFor={id}
          className="font-mono text-label-md uppercase tracking-wider text-on-surface-variant"
        >
          {label}
        </label>
        {action}
      </div>

      {children({ id, 'aria-invalid': Boolean(error), 'aria-describedby': describedBy })}

      {hint && !error ? (
        <p id={hintId} className="text-label-sm text-outline">
          {hint}
        </p>
      ) : null}

      {error ? (
        <p id={errorId} className="flex items-center gap-1 text-label-sm text-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Shared input styling, so text/textarea/select stay visually identical.
 *
 * The explicit `border` width matters: Tailwind's preflight sets `border-width:0`,
 * so a bare `border-<color>` renders an invisible box and the field reads as
 * static text. The 1px border, hover state, and focus ring are what make these
 * unmistakably editable.
 */
export const inputClass =
  'w-full rounded-md border border-outline-variant/60 bg-surface-container-lowest px-space-sm py-2 ' +
  'font-mono text-label-md text-on-surface placeholder:text-outline ' +
  'transition-colors hover:border-outline-variant ' +
  'focus:border-primary focus:ring-2 focus:ring-primary/30 focus:outline-none ' +
  'disabled:opacity-50 aria-[invalid=true]:border-error/60';

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(inputClass, props.className)} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(inputClass, 'leading-relaxed', props.className)}
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn(inputClass, 'cursor-pointer', props.className)} />;
}

/** Section wrapper used by each wizard step. */
export function FormSection({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        'flex-col gap-space-md rounded-lg border-outline-variant/40 bg-surface-container p-space-md',
        className,
      )}
    >
      <div>
        <h2 className="font-display text-headline-sm text-on-surface">{title}</h2>
        {description ? (
          <p className="mt-1 text-body-sm text-on-surface-variant">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}
