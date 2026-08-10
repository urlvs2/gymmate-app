import 'server-only';
import type { ZodType, ZodTypeDef } from 'zod';

/**
 * Thin OpenRouter client.
 *
 * Lives behind `server-only`: the API key is read from the environment on the
 * server and never reaches the browser. Every AI feature in the app goes
 * through `completeJson`, which asks for JSON, validates it against a Zod
 * schema, and retries once with the validation error fed back to the model
 * before giving up. Free-tier models are flaky, so the model list is a fallback
 * chain rather than a single name.
 */

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

export class AiError extends Error {
  readonly status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.name = 'AiError';
    this.status = status;
  }
}

export interface AiMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

function models(kind: 'chat' | 'plan'): string[] {
  const raw =
    (kind === 'plan' ? process.env.OPENROUTER_MODEL_PLAN : undefined) ||
    process.env.OPENROUTER_MODEL ||
    'openai/gpt-oss-20b:free';
  return raw
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);
}

function apiKey(): string {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    throw new AiError(
      'OPENROUTER_API_KEY is not set. Add it to .env.local and restart the dev server.',
      503,
    );
  }
  return key;
}

/**
 * Models that can reason are far slower when they do, and the coach's replies
 * are short and structured enough not to need it — turning it off took one
 * model from 30s to 2.4s. Not every model allows it, so a refusal is retried
 * with the switch left alone rather than failing the turn.
 */
async function callOnce(
  model: string,
  messages: AiMessage[],
  maxTokens: number,
  signal?: AbortSignal,
  allowReasoning = false,
): Promise<string> {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    signal,
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.OPENROUTER_SITE_URL ?? 'http://localhost:3000',
      'X-Title': process.env.OPENROUTER_SITE_NAME ?? 'GymMate',
    },
    body: JSON.stringify({
      model,
      messages,
      response_format: { type: 'json_object' },
      temperature: 0.6,
      max_tokens: maxTokens,
      ...(allowReasoning ? {} : { reasoning: { enabled: false } }),
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    if (!allowReasoning && res.status === 400 && /reasoning/i.test(body)) {
      return callOnce(model, messages, maxTokens, signal, true);
    }
    throw new AiError(`OpenRouter ${res.status} for ${model}: ${body.slice(0, 300)}`, res.status);
  }

  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    error?: { message?: string };
  };

  if (json.error) throw new AiError(json.error.message ?? 'OpenRouter returned an error');

  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new AiError('OpenRouter returned an empty response');
  return content;
}

/**
 * Models sometimes wrap JSON in prose or a code fence. Pull out the first
 * balanced JSON object rather than failing on a stray "Here you go:".
 */
function extractJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // fall through to a brace scan
  }

  const start = trimmed.indexOf('{');
  if (start === -1) throw new AiError('The AI did not return JSON');

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < trimmed.length; i += 1) {
    const ch = trimmed[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(trimmed.slice(start, i + 1));
        } catch (err) {
          throw new AiError(`The AI returned malformed JSON: ${(err as Error).message}`);
        }
      }
    }
  }
  throw new AiError('The AI returned truncated JSON');
}

export interface CompleteJsonOptions<T> {
  system: string;
  messages: AiMessage[];
  /** Third parameter left open so `T` binds to the schema's *output* type. */
  schema: ZodType<T, ZodTypeDef, unknown>;
  /** Which model list to use — the plan job gets its own, usually larger, model. */
  kind?: 'chat' | 'plan';
  maxTokens?: number;
  signal?: AbortSignal;
}

export async function completeJson<T>({
  system,
  messages,
  schema,
  kind = 'chat',
  maxTokens = 1800,
  signal,
}: CompleteJsonOptions<T>): Promise<T> {
  const chain = models(kind);
  let lastError: unknown;

  for (const model of chain) {
    const thread: AiMessage[] = [{ role: 'system', content: system }, ...messages];

    // One initial attempt plus one repair attempt per model.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      let raw: string;
      try {
        raw = await callOnce(model, thread, maxTokens, signal);
      } catch (err) {
        // Free-tier models throttle constantly; one short wait is usually
        // enough, and it beats falling through to a weaker model immediately.
        if (err instanceof AiError && err.status === 429 && attempt === 0) {
          lastError = err;
          await new Promise((resolve) => setTimeout(resolve, 1500));
          continue;
        }
        lastError = err;
        break; // model-level failure: move to the next model
      }

      try {
        return schema.parse(extractJson(raw));
      } catch (err) {
        lastError = err;
        const detail = err instanceof Error ? err.message : String(err);
        thread.push({ role: 'assistant', content: raw.slice(0, 4000) });
        thread.push({
          role: 'user',
          content:
            'That response did not match the required JSON schema. ' +
            `Problem: ${detail.slice(0, 600)}\n` +
            'Reply again with the corrected JSON object only — no prose, no code fence.',
        });
      }
    }
  }

  if (lastError instanceof AiError) throw lastError;
  throw new AiError(
    `The AI could not produce a valid response (${
      lastError instanceof Error ? lastError.message.slice(0, 200) : 'unknown error'
    })`,
  );
}
