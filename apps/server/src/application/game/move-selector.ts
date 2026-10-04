import type { BotSettings } from '../../../../../packages/contracts/src/index.js';
import type { AnalysisService, Variation } from '../../domain/engine/engine.js';
import type { GamePosition } from '../../domain/game/position.js';
import { MoveSelectionBudget } from './timing/move-selection-budget.js';

export class MoveSelector {
  constructor(
    private readonly engines: AnalysisService,
    private readonly random: () => number = Math.random,
  ) {}
  async select(
    gameId: string,
    position: GamePosition,
    settings: BotSettings,
    signal: AbortSignal,
    onInfo: (variation: Variation) => void,
    onStarted: () => void,
    getDeadline?: () => number | null,
    getRemainingMs?: () => number | null,
  ): Promise<string> {
    if (!getRemainingMs)
      return this.choose(gameId, position, settings, signal, onInfo, onStarted, getDeadline);
    const budget = new MoveSelectionBudget(position, getRemainingMs);
    return budget.run(signal, (scope, getSearchDeadline) =>
      this.choose(
        gameId,
        position,
        settings,
        scope,
        (variation) => {
          if (scope.aborted) return;
          budget.remember(variation);
          onInfo(variation);
        },
        onStarted,
        getDeadline,
        getSearchDeadline,
        (move) => budget.rememberMove(move),
      ),
    );
  }

  private async choose(
    gameId: string,
    position: GamePosition,
    settings: BotSettings,
    signal: AbortSignal,
    onInfo: (variation: Variation) => void,
    onStarted: () => void,
    getDeadline?: () => number | null,
    getSearchDeadline?: () => number | null,
    onCandidate?: (move: string) => void,
  ): Promise<string> {
    const request = {
      gameId,
      position: position.enginePosition(),
      depth: settings.depth,
      variations:
        settings.movePolicy === 'balanced' || settings.mistakeProbability > 0
          ? settings.variations
          : 1,
      signal,
      onInfo,
      onStarted,
      ...(getDeadline ? { getDeadline } : {}),
      ...(getSearchDeadline ? { getSearchDeadline } : {}),
    };
    const analysis = await this.engines.analyze(request);
    signal.throwIfAborted();
    const outOfTime = () => (getSearchDeadline?.() ?? Infinity) <= Date.now();
    position.candidate(analysis.bestMove);
    onCandidate?.(analysis.bestMove);
    if (outOfTime()) return analysis.bestMove;
    let root = analysis.variations[0];
    if (
      settings.evaluationDepth > settings.depth &&
      (settings.movePolicy === 'balanced' || settings.mistakeProbability > 0)
    ) {
      const evaluation = await this.engines.analyze({
        ...request,
        depth: settings.evaluationDepth,
        variations: 1,
      });
      signal.throwIfAborted();
      root = evaluation.variations[0] ?? root;
      if (root) onInfo(root);
      onCandidate?.(evaluation.bestMove);
    }
    let chosen = analysis.bestMove;
    if (outOfTime()) return chosen;
    const winningMates = [...analysis.variations, ...(root ? [root] : [])]
      .filter((variation) => variation.mate !== null && variation.mate > 0)
      .sort((a, b) => a.mate! - b.mate!);
    if (winningMates[0]?.moves[0]) return winningMates[0].moves[0];
    if (settings.movePolicy === 'balanced') {
      const candidates = analysis.variations.filter(
        (variation) => variation.mate === null && variation.score >= -0.5,
      );
      const mean =
        candidates.reduce((sum, variation) => sum + variation.score, 0) /
        Math.max(1, candidates.length);
      candidates.sort((a, b) => Math.abs(a.score - mean) - Math.abs(b.score - mean));
      const candidate = candidates[0]?.moves[0];
      if (
        candidate &&
        (await this.verify(
          gameId,
          position,
          candidate,
          Math.max(settings.evaluationDepth, settings.depth),
          signal,
          getDeadline,
          getSearchDeadline,
        )) >= -0.5
      ) {
        chosen = candidate;
        onCandidate?.(chosen);
      }
    }
    if (
      !outOfTime() &&
      root &&
      root.mate === null &&
      root.score >= settings.mistakeKeep &&
      this.random() * 100 < settings.mistakeProbability
    ) {
      const candidates = analysis.variations
        .filter(
          (variation) =>
            variation.mate === null &&
            variation.score >= settings.mistakeKeep &&
            variation.score < root.score,
        )
        .sort((a, b) => a.score - b.score);
      for (const candidate of candidates) {
        if (outOfTime()) break;
        const move = candidate.moves[0];
        if (
          move &&
          (await this.verify(
            gameId,
            position,
            move,
            Math.max(settings.evaluationDepth, settings.depth),
            signal,
            getDeadline,
            getSearchDeadline,
          )) >= settings.mistakeKeep
        ) {
          chosen = move;
          onCandidate?.(chosen);
          break;
        }
      }
    }
    position.candidate(chosen);
    return chosen;
  }
  private async verify(
    gameId: string,
    position: GamePosition,
    move: string,
    depth: number,
    signal: AbortSignal,
    getDeadline?: () => number | null,
    getSearchDeadline?: () => number | null,
  ): Promise<number> {
    const candidate = position.candidate(move);
    if (candidate.isCheckmate()) return Number.POSITIVE_INFINITY;
    if (candidate.isGameOver()) return 0;
    const result = await this.engines.analyze({
      gameId,
      position: position.enginePosition(move),
      depth,
      variations: 1,
      signal,
      ...(getDeadline ? { getDeadline } : {}),
      ...(getSearchDeadline ? { getSearchDeadline } : {}),
    });
    const score = result.variations[0];
    if (!score) return Number.NEGATIVE_INFINITY;
    return score.mate === null
      ? -score.score
      : score.mate < 0
        ? Number.POSITIVE_INFINITY
        : Number.NEGATIVE_INFINITY;
  }
}
