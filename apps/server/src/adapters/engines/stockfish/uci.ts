import type { EnginePosition, Variation } from '../../../domain/engine/engine.js';

export function positionCommand(position: EnginePosition): string {
  const base = position.initialFen ? `position fen ${position.initialFen}` : 'position startpos';
  return position.moves.length ? `${base} moves ${position.moves.join(' ')}` : base;
}

export function parseInfo(line: string): Variation | null {
  const score = /\bscore (cp|mate) (-?\d+)/.exec(line);
  const pv = /\bpv (.+)/.exec(line);
  if (!score || !pv || /\b(lowerbound|upperbound)\b/.test(line)) return null;
  return {
    index: Number(/\bmultipv (\d+)/.exec(line)?.[1] ?? 1),
    depth: Number(/\bdepth (\d+)/.exec(line)?.[1] ?? 0),
    score: score[1] === 'cp' ? Number(score[2]) / 100 : 0,
    mate: score[1] === 'mate' ? Number(score[2]) : null,
    moves: pv[1]!.trim().split(/\s+/),
    nodes: Number(/\bnodes (\d+)/.exec(line)?.[1] ?? 0),
  };
}
