/**
 * POST /api/ai/assist
 *
 * Server-side proxy for the founder wizard's AI helpers. The provider keys never
 * leave the server: the browser talks only to this route.
 *
 * Request:  { task: 'description' | 'milestones' | 'tokenomics' | 'risk', prompt: string,
 *             context?: Record<string, string | number | boolean> }
 * Response: { task, data, provider, model } | { error, detail? }
 */

import { NextResponse } from 'next/server';

import { scrubProjectCopy, scrubRiskNotes } from '@/lib/ai/guard';
import { complete } from '@/lib/ai/provider';
import { aiTasks, extractJson, isAiTaskName } from '@/lib/ai/tasks';

export const runtime = 'nodejs';

interface AssistBody {
  task?: unknown;
  prompt?: unknown;
  context?: unknown;
}

export async function POST(request: Request) {
  let body: AssistBody;

  try {
    body = (await request.json()) as AssistBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { task, prompt, context } = body;

  if (typeof task !== 'string' || !isAiTaskName(task)) {
    return NextResponse.json(
      { error: `Unknown task. Expected one of: ${Object.keys(aiTasks).join(', ')}` },
      { status: 400 },
    );
  }

  if (typeof prompt !== 'string' || prompt.trim().length < 10) {
    return NextResponse.json(
      { error: 'Prompt must be a string of at least 10 characters' },
      { status: 400 },
    );
  }

  const definition = aiTasks[task];

  // Fold structured wizard context into the prompt so the model sees it.
  let userPrompt = prompt.trim();
  if (context && typeof context === 'object') {
    const entries = Object.entries(context as Record<string, unknown>)
      .filter(([, value]) => value !== null && value !== undefined && value !== '')
      .map(([key, value]) => `- ${key}: ${String(value)}`);

    if (entries.length > 0) {
      userPrompt = `${userPrompt}\n\nProject context:\n${entries.join('\n')}`;
    }
  }

  try {
    // Budget is per-task: a single shared cap truncated the longer copy task
    // mid-string and produced unparseable JSON.
    const completion = await complete({
      system: definition.system,
      prompt: userPrompt,
      json: true,
      maxTokens: definition.maxTokens,
    });

    let data: unknown;
    try {
      data = extractJson(completion.text);
    } catch {
      /**
       * Distinguish truncation from genuine malformation. An unterminated JSON
       * object means the model ran out of room, which is worth retrying with a
       * larger budget rather than reporting as a bad response.
       */
      const looksTruncated = !completion.text.trimEnd().endsWith('}');

      if (looksTruncated) {
        const retry = await complete({
          system: definition.system,
          prompt: `${userPrompt}\n\nIMPORTANT: return compact JSON only. Keep prose concise so the object closes properly.`,
          json: true,
          maxTokens: definition.maxTokens * 2,
        });

        try {
          data = extractJson(retry.text);
        } catch {
          return NextResponse.json(
            {
              error: 'Model response was truncated and could not be repaired',
              detail: retry.text.slice(-300),
              provider: retry.provider,
            },
            { status: 502 },
          );
        }
      } else {
        return NextResponse.json(
          {
            error: 'Model returned unparseable JSON',
            detail: completion.text.slice(0, 500),
            provider: completion.provider,
          },
          { status: 502 },
        );
      }
    }

    // Validate against the task schema before the UI ever sees it.
    const parsed = definition.schema.safeParse(data);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: `Model output failed ${definition.label} validation`,
          detail: parsed.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
          provider: completion.provider,
        },
        { status: 502 },
      );
    }

    /**
     * Scrub unsupportable compliance claims before the UI can show them.
     *
     * A real run invented "meets IEC 60705" and "certified for CE marking" for a
     * fictional product despite the system prompt forbidding it. Anything that
     * gets edited and published is scrubbed in code, and the caller is told what
     * was removed so the founder can state the true status themselves.
     */
    let guarded: unknown = parsed.data;
    let scrubbed: string[] = [];

    if (task === 'description') {
      const result = scrubProjectCopy(
        parsed.data as { tagline?: string; description?: string; highlights?: string[] },
      );
      guarded = result.copy;
      scrubbed = result.removed;
    } else if (task === 'risk') {
      const result = scrubRiskNotes(parsed.data as { risks?: Array<{ note?: string; mitigation?: string }> });
      guarded = result.value;
      scrubbed = result.removed;
    }

    return NextResponse.json({
      task,
      data: guarded,
      provider: completion.provider,
      model: completion.model,
      /** Present only when the guard changed the output. */
      ...(scrubbed.length > 0
        ? {
            warnings: [
              `Removed ${scrubbed.length} unsupported compliance claim(s). State the real certification status yourself.`,
            ],
            scrubbedClaims: scrubbed.slice(0, 5),
          }
        : {}),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';

    // Missing keys is a configuration problem, not a client error.
    const isConfig = message.startsWith('No AI provider configured');
    return NextResponse.json(
      { error: isConfig ? message : 'AI request failed', detail: message },
      { status: isConfig ? 503 : 502 },
    );
  }
}

/** Reports which providers are available, without calling them. */
export async function GET() {
  const { configuredProviders, isAiConfigured } = await import('@/lib/ai/provider');

  return NextResponse.json({
    configured: isAiConfigured(),
    providers: configuredProviders(),
    tasks: Object.keys(aiTasks),
  });
}
