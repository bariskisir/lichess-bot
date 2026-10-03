import type { BotSettings } from '../../../../../packages/contracts/src/index.js';
import type { AnalysisService, Variation } from '../../domain/engine/engine.js';
import type { GamePosition } from '../../domain/game/position.js';

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
    };
    const analysis = await this.engines.analyze(request);
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
      root = evaluation.variations[0] ?? root;
      if (root) onInfo(root);
    }
    let chosen = analysis.bestMove;
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
        )) >= -0.5
      )
        chosen = candidate;
    }
    if (
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
          )) >= settings.mistakeKeep
        ) {
          chosen = move;
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
