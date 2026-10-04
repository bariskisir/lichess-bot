import { Chess, DEFAULT_POSITION } from 'chess.js';
import type { GameSnapshot } from '../lichess/gateway.js';
import type { EnginePosition } from '../engine/engine.js';

export function toUci(move: { from: string; to: string; promotion?: string }): string {
  return `${move.from}${move.to}${move.promotion ?? ''}`;
}

export function applyUci(chess: Chess, uci: string) {
  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) throw new Error('Invalid UCI move.');
  return chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
}

/** Reconstructs engine positions with their complete history and special-move rights. */
export function enginePositionBoard(position: EnginePosition): Chess {
  const board = new Chess(position.initialFen);
  for (const move of position.moves) applyUci(board, move);
  return board;
}

export class GamePosition {
  readonly chess: Chess;
  readonly uciMoves: string[];
  readonly sanMoves: string[];
  readonly initialFen: string;
  private readonly basePly: number;

  constructor(snapshot: GameSnapshot) {
    if (snapshot.variant !== 'standard') throw new Error('Only standard chess is supported.');
    const first = snapshot.steps[0];
    if (!first) throw new Error('The game has no initial position.');
    this.initialFen = snapshot.initialFen === 'startpos' ? DEFAULT_POSITION : snapshot.initialFen;
    this.chess = new Chess(this.initialFen);
    this.basePly = first.ply;
    this.uciMoves = [];
    this.sanMoves = [];
    for (const step of snapshot.steps.slice(1)) {
      if (step.ply !== this.ply + 1 || !step.san)
        throw new Error('The game history is incomplete.');
      this.apply(step.san, step.fen);
    }
    const last = snapshot.steps.at(-1);
    if (snapshot.ply !== this.ply || !last || this.boardFen !== last.fen.split(' ')[0])
      throw new Error('The game history differs from the server position.');
  }

  get ply(): number {
    return this.basePly + this.uciMoves.length;
  }
  get key(): string {
    return `${this.ply}:${this.chess.fen()}`;
  }
  get boardFen(): string {
    return this.chess.fen().split(' ')[0] ?? '';
  }

  apply(san: string, fen: string): void {
    const move = this.chess.move(san);
    if (this.boardFen !== fen.split(' ')[0]) {
      this.chess.undo();
      throw new Error('The move differs from the server position.');
    }
    this.uciMoves.push(toUci(move));
    this.sanMoves.push(move.san);
  }

  candidate(uci: string): Chess {
    const board = new Chess(this.chess.fen());
    applyUci(board, uci);
    return board;
  }
  enginePosition(extra?: string): EnginePosition {
    return {
      initialFen: this.initialFen,
      moves: extra ? [...this.uciMoves, extra] : [...this.uciMoves],
    };
  }
}
