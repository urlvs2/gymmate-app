import 'server-only';
import { NextResponse } from 'next/server';
import { AiError } from '@/lib/ai/openrouter';
import { UnauthorizedError } from './context';

export function ok<T>(data: T) {
  return NextResponse.json(data);
}

export function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/** One place to turn thrown errors into a response the UI can show. */
export function handleError(err: unknown) {
  if (err instanceof UnauthorizedError) {
    return NextResponse.json({ error: err.message }, { status: 401 });
  }

  if (err instanceof AiError) {
    console.error('[ai]', err.message);
    const friendly =
      err.status === 503
        ? 'The AI is not configured yet — add OPENROUTER_API_KEY to .env.local.'
        : err.status === 401 || err.status === 403
          ? 'OpenRouter rejected the API key. Check OPENROUTER_API_KEY in .env.local.'
          : err.status === 429
            ? 'The AI is rate limited right now. Give it a few seconds and try again.'
            : 'The coach could not answer just now. Try again in a moment.';
    return NextResponse.json({ error: friendly }, { status: err.status === 503 ? 503 : 502 });
  }

  console.error('[api]', err);
  return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 });
}
