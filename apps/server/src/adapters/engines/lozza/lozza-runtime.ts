import { compileFunction } from 'node:vm';
import { enginePositionBoard } from '../../../domain/game/position.js';

interface LozzaGlobals {
  lozza: {
    rootNode: { getNextMove: () => number };
    board: { mvFmt: number; formatMove?: (move: number, format: number) => string };
  };
  UCI_FMT: number;
  MATE: number;
  MINMATE: number;
  formatMove: ((move: number, format: number) => string) | null;
  onmessage: (event: { data: string }) => void;
}

/** Adapts the unmodified JS engines to scored coordinate MultiPV while retaining position history. */
export function createLozzaRuntime(
  source: string,
  output: (line: string) => void,
): (command: string) => void {
  let lines = 1,
    rank = 1,
    position = '',
    candidate = '',
    primary = '',
    collecting = false;
  let legalMoves = 0,
    hasVariation = false,
    fallbackScore = 'cp 0';
  const excluded = new Set<string>();
  // Lexical globals avoid slow proxy lookups in Lozza 2's hash initialization and search.
  // The worker global and hidden process keep both upstream versions on their postMessage path.
  const load = compileFunction(
    `let onmessage;\n${source}\nreturn {lozza, UCI_FMT, MATE, MINMATE, onmessage, formatMove: typeof formatMove === "function" ? formatMove : null};`,
    ['WorkerGlobalScope', 'postMessage', 'console', 'process'],
  );
  const runtime = load(
    class {},
    (message: string) => receive(message.trim()),
    { log: () => {}, warn: () => {}, error: () => {} },
    undefined,
  ) as LozzaGlobals;
  const nextMove = runtime.lozza.rootNode.getNextMove.bind(runtime.lozza.rootNode);
  runtime.lozza.rootNode.getNextMove = () => {
    let move = nextMove();
    const format = runtime.lozza.board.formatMove?.bind(runtime.lozza.board) ?? runtime.formatMove!;
    while (move && excluded.has(format(move, runtime.UCI_FMT))) move = nextMove();
    return move;
  };

  /** Normalizes mate-range values and removes the browser mate marker from coordinate PVs. */
  function normalizeScore(message: string): string {
    let normalized = message.replace(/#/g, '');
    const mate = /\bscore mate (\d+)\b/.exec(normalized);
    if (mate)
      normalized = normalized.replace(/\bscore mate \d+\b/, `score mate ${Number(mate[1]) + 1}`);
    const score = Number(/\bscore cp (-?\d+)\b/.exec(normalized)?.[1] ?? 0);
    if (Math.abs(score) >= runtime.MINMATE && Math.abs(score) <= runtime.MATE) {
      const distance =
        Math.max(1, Math.ceil((runtime.MATE - Math.abs(score)) / 2)) * Math.sign(score);
      normalized = normalized.replace(/\bscore cp -?\d+\b/, `score mate ${distance}`);
    }
    return normalized;
  }

  /** Keeps one final bestmove and publishes a scored PV for sole legal moves that finish early. */
  function receive(message: string): void {
    if (!collecting) {
      output(message);
      return;
    }
    if (message.startsWith('bestmove ')) {
      candidate = message.split(/\s+/)[1] ?? '';
      if (!hasVariation && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(candidate))
        output(`info multipv ${rank} depth 1 score ${fallbackScore} pv ${candidate}`);
      return;
    }
    const normalized = normalizeScore(message);
    fallbackScore = /\bscore ((?:cp|mate) -?\d+)\b/.exec(normalized)?.[1] ?? fallbackScore;
    if (
      message.startsWith('info ') &&
      /\bpv\s+[a-h][1-8][a-h][1-8]/.test(normalized) &&
      /\bscore (?:cp|mate)\b/.test(normalized)
    ) {
      hasVariation = true;
      output(normalized.replace(/^info /, `info multipv ${rank} `));
    } else output(normalized);
  }

  /** Restores coordinate output after the engine resets its browser move format. */
  function command(data: string): void {
    runtime.onmessage({ data });
    runtime.lozza.board.mvFmt = runtime.UCI_FMT;
  }

  /** Restricts successive root searches to new moves under one shared movetime deadline. */
  function search(data: string): void {
    excluded.clear();
    primary = '';
    const moveTime = Number(/\bmovetime (\d+)/.exec(data)?.[1] ?? 0);
    const deadline = moveTime ? Date.now() + moveTime : null;
    collecting = true;
    try {
      const count = Math.min(lines, legalMoves);
      for (rank = 1; rank <= count; rank++) {
        const remaining = deadline === null ? null : deadline - Date.now();
        if (rank > 1 && remaining !== null && remaining <= 0) break;
        candidate = '';
        hasVariation = false;
        fallbackScore = 'cp 0';
        if (rank > 1) {
          command('ucinewgame');
          command(position);
        }
        command(
          remaining === null
            ? data
            : data.replace(
                /\bmovetime \d+/,
                `movetime ${Math.max(1, Math.floor(remaining / (count - rank + 1)))}`,
              ),
        );
        if (!candidate || candidate === '0000' || candidate === '(none)' || excluded.has(candidate))
          break;
        primary ||= candidate;
        excluded.add(candidate);
      }
    } finally {
      collecting = false;
      excluded.clear();
    }
    output(`bestmove ${primary || '0000'}`);
  }

  return (data: string): void => {
    data = data.trim();
    if (/^setoption name MultiPV value \d+$/.test(data)) {
      lines = Math.max(1, Math.min(10, Number(data.split(' ').at(-1))));
      return;
    }
    if (data.startsWith('position ')) {
      position = data;
      const [base, moves] = data.slice(9).split(' moves ');
      const board = enginePositionBoard({
        ...(base?.startsWith('fen ') ? { initialFen: base.slice(4) } : {}),
        moves: moves?.split(/\s+/) ?? [],
      });
      legalMoves = board.moves().length;
    }
    if (data.startsWith('go ')) search(data);
    else command(data);
  };
}
