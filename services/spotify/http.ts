export const SPOTIFY_HTTP_TIMEOUT_MS = 12_000;

export function isFetchTimeoutError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const name = (error as { name?: unknown }).name;
  return name === 'AbortError' || name === 'TimeoutError';
}

/**
 * Runs fetch with an AbortController timeout so flaky mobile connections
 * fail promptly instead of leaving UI actions hung indefinitely.
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = SPOTIFY_HTTP_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const externalSignal = options.signal;

  if (externalSignal?.aborted) {
    controller.abort();
  }

  const onExternalAbort = () => controller.abort();
  externalSignal?.addEventListener?.('abort', onExternalAbort, { once: true });

  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener?.('abort', onExternalAbort);
  }
}

