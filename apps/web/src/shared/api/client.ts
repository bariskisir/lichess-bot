import type { ApiError } from '../../../../../packages/contracts/src/index.js';

export class RequestError extends Error {
  constructor(
    message: string,
    readonly details: Record<string, string[]> = {},
  ) {
    super(message);
  }
}
export async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-Lichess-Bot': 'dashboard' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new RequestError(
      'Cannot reach lichess-bot. Check that the application is running and try again.',
    );
  }
  if (!response.ok) {
    const error = (await response.json()) as ApiError;
    throw new RequestError(error.error ?? 'The request failed. Try again.', error.details);
  }
  return response.json() as Promise<T>;
}
