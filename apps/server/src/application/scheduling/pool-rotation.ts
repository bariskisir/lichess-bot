export class PoolRotation {
  private readonly assignments = new Map<string, string>();
  private readonly cursors = new Map<string, number>();
  constructor(private readonly pools: readonly string[]) {}
  choose(accountId: string): string {
    this.release(accountId);
    const cursor = this.cursors.get(accountId) ?? 0;
    const ordered = this.pools.map((_, index) => ({
      pool: this.pools[(cursor + index) % this.pools.length]!,
      index: (cursor + index) % this.pools.length,
    }));
    const occupancy = (pool: string) =>
      [...this.assignments.values()].filter((value) => value === pool).length;
    ordered.sort((a, b) => occupancy(a.pool) - occupancy(b.pool));
    const chosen = ordered[0];
    if (!chosen) throw new Error('At least one time control is required.');
    this.assignments.set(accountId, chosen.pool);
    this.cursors.set(accountId, (chosen.index + 1) % this.pools.length);
    return chosen.pool;
  }
  release(accountId: string): void {
    this.assignments.delete(accountId);
  }
}
