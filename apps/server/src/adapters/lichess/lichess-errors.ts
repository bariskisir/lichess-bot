export class LichessHttpError extends Error {
  constructor(
    readonly status: number,
    readonly retryAfterMs = 0,
  ) {
    super(`Lichess returned HTTP ${status}.`);
    this.name = 'LichessHttpError';
  }
}

export function retryAfterMilliseconds(header: string | undefined | null, status: number): number {
  const value = header
    ? /^\d+$/.test(header)
      ? Number(header) * 1000
      : Date.parse(header) - Date.now()
    : 0;
  return Math.max(status === 429 ? 60_000 : 0, Number.isFinite(value) ? value : 0);
}
