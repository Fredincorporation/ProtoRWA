'use client';

import * as React from 'react';
import { toast } from 'sonner';

/**
 * Client hook for the server-side AI proxy (/api/ai/assist).
 *
 * Provider keys never reach the browser: this calls our own route, which then
 * talks to Groq with Gemini as fallback. Keeping the call in one hook means the
 * wizard has a single place to show provider and error state.
 */

export interface AiAssistParams {
  task: 'description' | 'milestones' | 'tokenomics' | 'risk';
  prompt: string;
  context?: Record<string, string | number | boolean>;
}

export interface UseAiAssistResult<T> {
  run: (params: AiAssistParams) => Promise<T | null>;
  data: T | null;
  loading: boolean;
  error: string | null;
  /** Which provider served the last successful response. */
  provider: string | null;
  reset: () => void;
}

export function useAiAssist<T>(): UseAiAssistResult<T> {
  const [data, setData] = React.useState<T | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [provider, setProvider] = React.useState<string | null>(null);

  // Tracks the latest request so a slow earlier response cannot overwrite a
  // newer one when the founder clicks generate twice.
  const requestId = React.useRef(0);

  const run = React.useCallback(async (params: AiAssistParams): Promise<T | null> => {
    const current = ++requestId.current;
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/ai/assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });

      const payload = (await response.json()) as {
        data?: T;
        provider?: string;
        error?: string;
        detail?: string | unknown[];
        /** Set when the compliance guard altered the model's output. */
        warnings?: string[];
        scrubbedClaims?: string[];
      };

      // Surface guard removals: the founder needs to know a claim was stripped
      // so they can state the real certification status.
      if (payload.warnings?.length) {
        toast.warning('Compliance check applied', {
          description: payload.warnings[0],
        });
      }

      if (current !== requestId.current) return null;

      if (!response.ok) {
        const message =
          typeof payload.detail === 'string' ? payload.detail : (payload.error ?? 'AI request failed');
        setError(message);
        setProvider(payload.provider ?? null);
        toast.error('AI assist failed', { description: message });
        return null;
      }

      setData(payload.data ?? null);
      setProvider(payload.provider ?? null);
      return payload.data ?? null;
    } catch (caught) {
      if (current !== requestId.current) return null;
      const message = caught instanceof Error ? caught.message : 'Network error';
      setError(message);
      toast.error('AI assist failed', { description: message });
      return null;
    } finally {
      if (current === requestId.current) setLoading(false);
    }
  }, []);

  const reset = React.useCallback(() => {
    setData(null);
    setError(null);
    setProvider(null);
  }, []);

  return { run, data, loading, error, provider, reset };
}

/**
 * Reports which AI providers the server has keys for, so the wizard can disable
 * the assist affordances instead of offering a button that always fails.
 */
export function useAiStatus() {
  const [status, setStatus] = React.useState<{
    configured: boolean;
    providers: string[];
    loading: boolean;
  }>({ configured: false, providers: [], loading: true });

  React.useEffect(() => {
    let cancelled = false;

    fetch('/api/ai/assist')
      .then((response) => response.json())
      .then((payload: { configured?: boolean; providers?: string[] }) => {
        if (cancelled) return;
        setStatus({
          configured: Boolean(payload.configured),
          providers: payload.providers ?? [],
          loading: false,
        });
      })
      .catch(() => {
        if (!cancelled) setStatus({ configured: false, providers: [], loading: false });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return status;
}
