export class MatchBudget {
  private readonly reservations = new Map<string, Set<string>>();
  private readonly searches = new Set<string>();
  private readonly finished = new Set<string>();
  target: number;
  constructor(
    target: number,
    private readonly capacity: number,
  ) {
    this.target = target;
  }
  get active(): number {
    return this.reservations.size;
  }
  get searching(): number {
    return this.searches.size;
  }
  get completed(): number {
    return this.finished.size;
  }
  get reached(): boolean {
    return this.completed >= this.target;
  }

  search(accountId: string): boolean {
    if (this.searches.has(accountId)) return true;
    if (
      this.active + this.searching >= this.capacity ||
      this.completed + this.active + this.searching >= this.target
    )
      return false;
    this.searches.add(accountId);
    return true;
  }
  releaseSearch(accountId: string): void {
    this.searches.delete(accountId);
  }
  reserve(gameId: string, accountId: string, recovered = false): boolean {
    this.releaseSearch(accountId);
    if (this.finished.has(gameId)) return false;
    const existing = this.reservations.get(gameId);
    if (existing) {
      existing.add(accountId);
      return true;
    }
    if (!recovered && (this.active >= this.capacity || this.completed + this.active >= this.target))
      return false;
    this.reservations.set(gameId, new Set([accountId]));
    this.target = Math.max(this.target, this.completed + this.active);
    return true;
  }
  complete(gameId: string): boolean {
    if (!this.reservations.has(gameId) || this.finished.has(gameId)) return false;
    this.reservations.delete(gameId);
    this.finished.add(gameId);
    return true;
  }
}
