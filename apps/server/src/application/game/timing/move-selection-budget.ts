import type { GamePosition } from '../../../domain/game/position.js';
import { toUci } from '../../../domain/game/position.js';
import type { Variation } from '../../../domain/engine/engine.js';
import { abortError } from '../../../shared/async.js';

/** Bounds the whole selection, including queued work, using the latest live clock budget. */
export class MoveSelectionBudget {
  private fallback: string;

  constructor(
    private readonly position: GamePosition,
    private readonly remainingMs: () => number | null,
  ) {
    const legal = position.chess.moves({ verbose: true });
    const first = legal.find((move) => move.san.endsWith('#')) ?? legal[0];
    if (!first) throw new Error('There is no legal move in this position.');
    this.fallback = toUci(first);
  }

  remember(variation: Variation): void {
    const move = variation.moves[0];
    if (!move) return;
    this.rememberMove(move);
  }

  rememberMove(move: string): void {
    try {
      this.position.candidate(move);
      this.fallback = move;
    } catch {
      // Partial or stale engine output cannot replace a legal fallback.
    }
  }

  async run(
    signal: AbortSignal,
    select: (scope: AbortSignal, getSearchDeadline: () => number | null) => Promise<string>,
  ): Promise<string> {
    signal.throwIfAborted();
    if ((this.remainingMs() ?? Infinity) <= 0) return this.fallback;
    const controller = new AbortController();
    const scope = AbortSignal.any([signal, controller.signal]);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let expire!: (move: string) => void;
    let rejectCancellation!: (reason: unknown) => void;
    const deadline = new Promise<string>((resolve, reject) => {
      expire = resolve;
      rejectCancellation = reject;
    });
    const cancelled = () => rejectCancellation(signal.reason);
    signal.addEventListener('abort', cancelled, { once: true });
    const check = () => {
      const remaining = this.remainingMs();
      if (remaining !== null && remaining <= 0) {
        expire(this.fallback);
        controller.abort(abortError('The turn analysis budget was exhausted.'));
        return;
      }
      timer = setTimeout(check, remaining === null ? 50 : Math.max(1, Math.min(50, remaining)));
    };
    const getSearchDeadline = () => {
      const remaining = this.remainingMs();
      // Give the engine time to return bestmove before the application-level cutoff.
      return remaining === null ? null : Date.now() + remaining - 100;
    };
    try {
      check();
      const move = await Promise.race([select(scope, getSearchDeadline), deadline]);
      signal.throwIfAborted();
      return move;
    } finally {
      clearTimeout(timer);
      signal.removeEventListener('abort', cancelled);
    }
  }
}
