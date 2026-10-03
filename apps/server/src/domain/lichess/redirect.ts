export function redirectFullId(data: unknown): string | null {
  const path =
    typeof data === 'string'
      ? data
      : data && typeof data === 'object' && 'url' in data && typeof data.url === 'string'
        ? data.url
        : null;
  return path ? (/^\/?([a-zA-Z0-9]{12})(?:[?#].*)?$/.exec(path)?.[1] ?? null) : null;
}
