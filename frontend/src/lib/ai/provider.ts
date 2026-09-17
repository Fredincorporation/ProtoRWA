/**
 * AI provider layer.
 *
 * Groq is the primary provider; Gemini is the automatic fallback. Keys are read
 * from the server environment only - never expose them to the client bundle.
 *
 * The abstraction exists so a provider swap is a config change, not a refactor:
 * callers interact with `complete()` and receive a normalised response.
 */

import type { AiAssistResponse } from '@protorwa/shared';

/** Providers are tried in this order until one succeeds. */
export type ProviderName = 'groq' | 'gemini';

export interface CompletionRequest {
  /** System framing for the model. */
  system: string;
  /** The user's actual ask. */
  prompt: string;
  /** Upper bound on generated tokens. */
  maxTokens?: number;
  /** Sampling temperature. */
  temperature?: number;
  /** Ask the provider for strict JSON output when the caller needs structure. */
  json?: boolean;
}

export interface CompletionResult {
  text: string;
  provider: ProviderName;
  model: string;
}

interface ProviderConfig {
  name: ProviderName;
  apiKey: string;
  model: string;
  endpoint: string;
}

/* ------------------------------------------------------------------ *
 * Configuration
 * ------------------------------------------------------------------ */

const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * Model defaults.
 *
 * These are only fallbacks: the ids below were confirmed available on a real
 * Groq account via GET /openai/v1/models. An earlier default of
 * `llama-3.3-70b-versatile` returned 404 for this account, which silently pushed
 * every request onto the fallback provider - so "the AI works" was really "Gemini
 * works". Set GROQ_MODEL / GEMINI_MODEL to override.
 *
 * Preferred Groq ids in order, matched against what the account actually exposes.
 */
const GROQ_MODEL = process.env.GROQ_MODEL ?? 'openai/gpt-oss-120b';
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';

/**
 * Groq model ids to try in order when GROQ_MODEL is not set explicitly.
 * Kept as a preference list because availability varies per account and model
 * ids are retired over time.
 */
const GROQ_MODEL_PREFERENCES = [
  'openai/gpt-oss-120b',
  'qwen/qwen3.8-27b',
  'openai/gpt-oss-20b',
  'groq/compound-mini',
] as const;

function readProviders(): ProviderConfig[] {
  const providers: ProviderConfig[] = [];

  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey) {
    providers.push({
      name: 'groq',
      apiKey: groqKey,
      model: GROQ_MODEL,
      endpoint: GROQ_ENDPOINT,
    });
  }

  const geminiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
  if (geminiKey) {
    providers.push({
      name: 'gemini',
      apiKey: geminiKey,
      model: GEMINI_MODEL,
      endpoint: `${GEMINI_ENDPOINT}/${GEMINI_MODEL}:generateContent`,
    });
  }

  return providers;
}

/** True when at least one provider is configured. */
export function isAiConfigured(): boolean {
  return readProviders().length > 0;
}

/** Which providers are usable, in fallback order. */
export function configuredProviders(): ProviderName[] {
  return readProviders().map((provider) => provider.name);
}

/* ------------------------------------------------------------------ *
 * Providers
 * ------------------------------------------------------------------ */

interface GroqChoice {
  message?: { content?: string };
}

interface GroqResponse {
  choices?: GroqChoice[];
  error?: { message?: string };
}

async function callGroqOnce(
  config: ProviderConfig,
  request: CompletionRequest,
  model: string,
): Promise<{ text: string; model: string }> {
  const body: Record<string, unknown> = {
    model,
    messages: [
      { role: 'system', content: request.system },
      { role: 'user', content: request.prompt },
    ],
    temperature: request.temperature ?? 0.7,
    max_tokens: request.maxTokens ?? 1_200,
  };

  // Groq is OpenAI-compatible and supports a JSON response mode.
  if (request.json) {
    body.response_format = { type: 'json_object' };
  }

  const response = await fetch(config.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  const payload = (await response.json()) as GroqResponse;

  if (!response.ok) {
    throw new Error(`groq ${response.status}: ${payload.error?.message ?? 'request failed'}`);
  }

  const text = payload.choices?.[0]?.message?.content;
  if (!text) throw new Error('groq: empty completion');

  return { text, model };
}

/**
 * Calls Groq, retrying against the preference list if the configured model is
 * unavailable.
 *
 * Motivated by a real failure: the original default model returned 404 for the
 * account, so every request silently fell through to Gemini. Retrying across
 * known-good ids means an absent or retired model degrades to another Groq model
 * rather than abandoning the provider entirely.
 */
async function callGroq(
  config: ProviderConfig,
  request: CompletionRequest,
): Promise<CompletionResult> {
  const explicit = process.env.GROQ_MODEL;
  const candidates = explicit ? [explicit] : [...GROQ_MODEL_PREFERENCES];

  const failures: string[] = [];

  for (const model of candidates) {
    try {
      const result = await callGroqOnce(config, request, model);
      return { text: result.text, provider: 'groq', model: result.model };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      failures.push(`${model}: ${reason}`);

      // Only a missing-model error is worth retrying; auth and rate limits are
      // not fixed by trying a different id.
      const isModelError = reason.includes('404') || reason.includes('does not exist');
      if (!isModelError) break;
    }
  }

  throw new Error(`groq: no usable model. ${failures.join(' | ')}`);
}

interface GeminiPart {
  text?: string;
}

interface GeminiCandidate {
  content?: { parts?: GeminiPart[] };
}

interface GeminiResponse {
  candidates?: GeminiCandidate[];
  error?: { message?: string };
}

async function callGemini(
  config: ProviderConfig,
  request: CompletionRequest,
): Promise<CompletionResult> {
  const body: Record<string, unknown> = {
    systemInstruction: { parts: [{ text: request.system }] },
    contents: [{ role: 'user', parts: [{ text: request.prompt }] }],
    generationConfig: {
      temperature: request.temperature ?? 0.7,
      maxOutputTokens: request.maxTokens ?? 1_200,
      ...(request.json ? { responseMimeType: 'application/json' } : {}),
    },
  };

  const response = await fetch(`${config.endpoint}?key=${config.apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const payload = (await response.json()) as GeminiResponse;

  if (!response.ok) {
    throw new Error(`gemini ${response.status}: ${payload.error?.message ?? 'request failed'}`);
  }

  const text = payload.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? '')
    .join('')
    .trim();

  if (!text) throw new Error('gemini: empty completion');

  return { text, provider: 'gemini', model: config.model };
}

/* ------------------------------------------------------------------ *
 * Orchestration
 * ------------------------------------------------------------------ */

/**
 * Whether a provider error looks temporary.
 *
 * 5xx and rate-limit responses are worth retrying; a 401/403 (bad key) or a 404
 * (model not available) is not - retrying those just wastes the demo's time.
 */
function isTransient(reason: string): boolean {
  return (
    reason.includes(' 500') ||
    reason.includes(' 502') ||
    reason.includes(' 503') ||
    reason.includes(' 504') ||
    reason.includes(' 429') ||
    /high demand|overloaded|timeout|ECONNRESET|fetch failed/i.test(reason)
  );
}

/**
 * Runs a completion, falling back to the next provider on failure.
 *
 * Operationally this means a Groq outage or rate limit degrades to Gemini
 * instead of breaking the founder wizard mid-demo.
 */
export async function complete(request: CompletionRequest): Promise<CompletionResult> {
  const providers = readProviders();
  if (providers.length === 0) {
    throw new Error(
      'No AI provider configured. Set GROQ_API_KEY (primary) and/or GEMINI_API_KEY (fallback).',
    );
  }

  const failures: string[] = [];

  // Two passes: the first respects preference order, and if every provider fails
  // with a *transient* error (5xx / rate limit) a second pass retries them.
  // Gemini in particular returns 503 "experiencing high demand" regularly, which
  // is not a reason to give up on the request.
  for (let pass = 0; pass < 2; pass += 1) {
    let sawTransientOnly = true;

    for (const config of providers) {
      try {
        return config.name === 'groq'
          ? await callGroq(config, request)
          : await callGemini(config, request);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        if (!isTransient(reason)) sawTransientOnly = false;

        // Record each provider's failure once, on the final pass.
        if (pass === 1) failures.push(`${config.name}: ${reason}`);
      }
    }

    // No point retrying a hard failure such as an invalid key or missing model.
    if (!sawTransientOnly) break;

    // Brief backoff before the retry pass.
    if (pass === 0) await new Promise((resolve) => setTimeout(resolve, 750));
  }

  throw new Error(`All AI providers failed. ${failures.join(' | ')}`);
}

/** Convenience wrapper returning the shape the shared domain types expect. */
export async function completeForTask(
  task: AiAssistResponse['task'],
  system: string,
  prompt: string,
  json = false,
): Promise<AiAssistResponse> {
  const result = await complete({ system, prompt, json });
  return {
    task,
    text: result.text,
    provider: result.provider,
    model: result.model,
  };
}
