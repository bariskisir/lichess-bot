import { Chess, DEFAULT_POSITION } from 'chess.js';
import type { Logger } from 'pino';
import type {
  AccountView,
  BotSettings,
  Color,
  GameActivity,
  GameView,
  PlayerView,
} from '../../../../../packages/contracts/src/index.js';
import type { MoveSelector } from './move-selector.js';
import type { DashboardStore } from '../dashboard/dashboard-store.js';
import type { ChesscomChannel, ChesscomGameEvent } from '../../domain/chesscom/gateway.js';
import { chesscomExternalGameUrl } from '../../domain/chesscom/gateway.js';
import { decodeTCN, encodeTCN, tcnToUci } from '../../adapters/chesscom/tcn.js';
import { GamePosition, applyUci } from '../../domain/game/position.js';
import type { GameSnapshot } from '../../domain/lichess/gateway.js';
import { Pulse, abortError, isAbort, retryDelay, sleep } from '../../shared/async.js';
import { TurnTiming } from './timing/turn-timing.js';
import type { TurnClock } from './timing/dynamic-turn-budget.js';

type GameReporter = Pick<DashboardStore, 'setGame' | 'updateGame' | 'addActivity'>;

interface PendingMove {
  index: number;
  tcn: string;
  sentAt: number;
}

export class ChesscomGameRunner {
  private readonly pulse = new Pulse();
  private chess = new Chess();
  private view?: GameView;
  private pending?: PendingMove;
  private operation?: AbortController;
  private needsReconnect = true;
  private finished: GameView | null = null;
  private lastEventAt = 0;
  private lastProgressAt = Date.now();
  private lastUpdatedAt = '';
  private turnTiming?: TurnTiming;
  private readonly startedAt = Date.now();

  constructor(
    private readonly gameId: string,
    private readonly account: AccountView,
    private readonly color: Color,
    private readonly pool: string,
    private readonly players: { white: PlayerView; black: PlayerView },
    private readonly channel: ChesscomChannel,
    private readonly selector: MoveSelector,
    private readonly settings: BotSettings,
    private readonly isActive: () => boolean,
    private readonly reporter: GameReporter | null,
    private readonly logger: Logger,
    private readonly createTiming: (getClock: () => TurnClock | null) => TurnTiming = (getClock) =>
      new TurnTiming(settings, getClock),
  ) {}

  async run(signal: AbortSignal): Promise<GameView> {
    let attempt = 0;
    try {
      while (!signal.aborted) {
        try {
          if (this.finished) return this.finished;
          if (this.needsReconnect || !this.channel.connected) {
            await this.channel.connect(signal);
            this.channel.watchGame(this.gameId, this.onEvent);
            this.needsReconnect = false;
          }
          if (this.pending && Date.now() - this.pending.sentAt > 5000) {
            this.pending = undefined;
            this.cancelAnalysis();
          }
          if (!this.pending && this.myTurn && !this.finished) await this.play(signal);
          else {
            this.activity(this.pending ? 'confirming' : 'waiting');
            this.flagIfExpired();
          }
          if (Date.now() - this.lastEventAt > 30_000 && this.lastEventAt > 0) this.needsReconnect = true;
          if (
            !this.finished &&
            Date.now() - this.lastProgressAt > 60_000 &&
            !this.isActive()
          ) {
            this.logger.info(
              { gameId: this.gameId },
              'chess.com game left the active list; aborting',
            );
            this.finish('aborted');
            return this.finished!;
          }
          attempt = 0;
          await this.pulse.wait(250, signal);
        } catch (error) {
          if (signal.aborted) throw signal.reason;
          if (isAbort(error)) continue;
          this.cancelAnalysis();
          this.channel.close();
          this.needsReconnect = true;
          this.activity('recovering');
          this.logger.warn(
            { gameId: this.gameId, error: error instanceof Error ? error.message : 'Unknown error' },
            'Recovering chess.com game',
          );
          await sleep(retryDelay(attempt++), signal);
        }
      }
      throw signal.reason;
    } finally {
      this.cancelAnalysis();
      this.channel.close();
    }
  }

  private get myTurn(): boolean {
    return this.chess.turn() === (this.color === 'white' ? 'w' : 'b');
  }

  private clocksMs?: [number, number];

  private readonly onEvent = (event: ChesscomGameEvent): void => {
    try {
      if (event.id !== this.gameId) return;
      if (event.updatedAt === this.lastUpdatedAt) return;
      this.lastUpdatedAt = event.updatedAt;
      this.lastEventAt = Date.now();
      this.lastProgressAt = this.lastEventAt;
      this.channel.acknowledge(this.gameId, event.updatedAt);
      this.clocksMs = [...event.clocks] as [number, number];
      const decoded = decodeTCN(event.moves.map(([tcn]) => tcn).join(''));
      const replay = new Chess();
      for (const move of decoded) {
        if (move.drop) throw new Error('Unsupported chess.com drop move.');
        applyUci(replay, tcnToUci(move));
      }
      this.chess = replay;
      if (this.pending && event.moves.length > this.pending.index) this.pending = undefined;
      this.project(this.myTurn ? 'queued' : 'waiting');
      if (this.myTurn) this.turnTiming = undefined;
      const end = this.resultFromEvent(event.results);
      if (end) {
        this.finish(end.result, end.status);
        return;
      }
      if (this.chess.isCheckmate() || this.chess.isStalemate() || this.chess.isDraw()) {
        const decisive = this.chess.isCheckmate();
        this.finish(this.resultFromBoard(), decisive ? 'mate' : 'draw');
      }
    } catch {
      this.needsReconnect = true;
    }
    this.pulse.notify();
  };

  /**
   * Reads the server's terminal `results` array: per-player entries where the
   * winner's slot holds `'win'` (players[0] is White), e.g. `['win', 'resigned']`.
   */
  private resultFromEvent(results: unknown): { result: NonNullable<GameView['result']>; status: string } | null {
    if (!Array.isArray(results)) return null;
    const own = this.color === 'white' ? 0 : 1;
    const winner = results.indexOf('win');
    if (winner === 0 || winner === 1)
      return {
        result: winner === own ? 'win' : 'loss',
        status: String(results[1 - winner] ?? 'mate'),
      };
    if (results[0] === 'aborted') return { result: 'aborted', status: 'aborted' };
    return { result: 'draw', status: String(results[0] ?? 'draw') };
  }

  private resultFromBoard(): GameView['result'] {
    if (this.chess.isCheckmate()) return this.myTurn ? 'loss' : 'win';
    return 'draw';
  }

  private project(activity: GameActivity): void {
    const ownName = this.account.username ?? this.account.label;
    const history = this.chess.history();
    const verbose = this.chess.history({ verbose: true });
    this.view = {
      id: this.gameId,
      provider: 'chesscom',
      externalUrl: chesscomExternalGameUrl(this.gameId),
      accountId: this.account.id,
      accountName: ownName,
      color: this.color,
      white: this.players.white,
      black: this.players.black,
      fen: this.chess.fen(),
      initialFen: new Chess().fen(),
      moves: history,
      lastMove: verbose.at(-1)
        ? `${verbose.at(-1)!.from}${verbose.at(-1)!.to}${verbose.at(-1)!.promotion ?? ''}`
        : null,
      ply: history.length,
      turn: this.chess.turn() === 'w' ? 'white' : 'black',
      check: this.chess.isCheck(),
      clock: this.clocksMs
        ? {
            white: this.clocksMs[0] / 1000,
            black: this.clocksMs[1] / 1000,
            running: history.length >= 2,
            updatedAt: this.lastEventAt,
          }
        : null,
      timeControl: this.pool,
      rated: true,
      activity,
      delayUntil: null,
      status: 'started',
      evaluation: this.view?.evaluation ?? null,
      startedAt: this.startedAt,
      finishedAt: null,
      result: null,
    };
    this.reporter?.setGame(this.view);
  }

  private activity(activity: GameActivity, delayUntil: number | null = null): void {
    if (!this.view) return;
    this.view = { ...this.view, activity, delayUntil };
    this.reporter?.updateGame(this.view.id, { activity, delayUntil });
  }

  private async play(signal: AbortSignal): Promise<void> {
    const operation = new AbortController();
    this.operation = operation;
    const scope = AbortSignal.any([signal, operation.signal]);
    const fen = this.chess.fen();
    const timing = (this.turnTiming ??= this.createTiming(this.turnClock));
    this.activity('queued');
    try {
      const position = this.gamePosition();
      const move = await this.selector.select(
        this.gameId,
        position,
        this.settings,
        scope,
        (variation) => {
          if (scope.aborted || !this.view || this.chess.fen() !== fen) return;
          const perspective = this.chess.turn() === 'w' ? 1 : -1;
          const evaluation = {
            score: variation.score * perspective,
            mate: variation.mate === null ? null : variation.mate * perspective,
            depth: variation.depth,
            fen,
            updatedAt: Date.now(),
          };
          this.view = { ...this.view, evaluation };
          this.reporter?.updateGame(this.view.id, { evaluation });
        },
        () => this.activity('thinking'),
        this.analysisDeadline,
        timing.remainingAnalysisMs,
      );
      await timing.wait(scope, (remainingMs) => this.activity('delaying', Date.now() + remainingMs));
      scope.throwIfAborted();
      if (!this.myTurn || this.chess.fen() !== fen || this.finished) return;
      const from = move.slice(0, 2);
      const to = move.slice(2, 4);
      const promotion = move.slice(4) || undefined;
      const tcn = encodeTCN({ from, to, promotion });
      const clock = this.turnClock();
      const remainingMs = Math.max(0, Math.round(clock?.remainingMs ?? 60_000));
      this.pending = { index: this.chess.history().length, tcn, sentAt: Date.now() };
      this.activity('confirming');
      await this.channel.sendMove({
        clock: remainingMs,
        gameId: this.gameId,
        index: this.pending.index,
        metadata: {
          clockms: remainingMs * 100,
          toggledMove: false,
          changeOfHeartMove: false,
          moveHoldTime: 2,
          CM_6: 7 + Math.floor(Math.random() * 59),
          CM_8: true,
        },
        move: tcn,
      });
      this.lastProgressAt = Date.now();
    } finally {
      if (this.operation === operation) this.operation = undefined;
    }
  }

  private gamePosition(): GamePosition {
    const board = new Chess();
    const steps: GameSnapshot['steps'] = [{ ply: 0, fen: board.fen(), san: null, uci: null }];
    for (const verbose of this.chess.history({ verbose: true })) {
      const uci = `${verbose.from}${verbose.to}${verbose.promotion ?? ''}`;
      board.move({ from: verbose.from, to: verbose.to, promotion: verbose.promotion });
      steps.push({ ply: steps.length, fen: board.fen(), san: verbose.san, uci });
    }
    const [base, increment] = this.pool.split('+').map(Number);
    const white = this.clocksMs ? this.clocksMs[0] / 1000 : (base ?? 1) * 60;
    const black = this.clocksMs ? this.clocksMs[1] / 1000 : (base ?? 1) * 60;
    return new GamePosition({
      id: this.gameId.slice(0, 8),
      playerId: 'chesscom',
      userId: this.account.userId ?? '',
      variant: 'standard',
      version: steps.length,
      color: this.color,
      white: { id: '', name: 'White', rating: null, title: null },
      black: { id: '', name: 'Black', rating: null, title: null },
      initialFen: DEFAULT_POSITION,
      steps,
      ply: steps.length - 1,
      status: 20,
      statusName: 'started',
      winner: null,
      clock: {
        white,
        black,
        running: steps.length > 2,
        initial: (base ?? 1) * 60,
        increment: increment ?? 0,
      },
      rated: true,
      createdAt: this.startedAt,
      opponentGone: false,
      ownDrawOffer: false,
      opponentDrawOffer: false,
      noClaimWin: false,
    });
  }

  private readonly turnClock = (): TurnClock | null => {
    const view = this.view;
    if (!view?.clock) return null;
    const [base, increment] = this.pool.split('+').map(Number);
    const elapsedMs = view.clock.running && this.myTurn ? Math.max(0, Date.now() - view.clock.updatedAt) : 0;
    return {
      remainingMs: Math.max(0, view.clock[this.color] * 1000 - elapsedMs),
      initialMs: (base ?? 1) * 60_000,
      incrementMs: (increment ?? 0) * 1000,
      completedMoves:
        this.color === 'white'
          ? Math.ceil(view.ply / 2)
          : Math.floor(view.ply / 2),
      materialPhase: 1,
      quietHalfMoves: 0,
      lagMs: 0,
      running: view.clock.running,
    };
  };

  private readonly analysisDeadline = (): number | null => {
    const view = this.view;
    if (!view?.clock?.running || view.turn !== view.color) return null;
    return view.clock.updatedAt + view.clock[view.color] * 1000;
  };

  private flagIfExpired(): void {
    const clock = this.view?.clock;
    if (!clock?.running || !this.view || this.finished) return;
    const remaining = clock[this.view.turn] - (Date.now() - clock.updatedAt) / 1000;
    if (remaining > 0) return;
    const result: GameView['result'] = this.view.turn === this.color ? 'loss' : 'win';
    this.finish(result);
  }

  private finish(result: GameView['result'], status?: string): void {
    if (!this.view || this.finished || !result) return;
    this.view = {
      ...this.view,
      result,
      status: status ?? (result === 'draw' ? 'draw' : 'mate'),
      activity: 'finished',
      delayUntil: null,
      finishedAt: Date.now(),
      clock: this.view.clock ? { ...this.view.clock, running: false } : null,
    };
    this.finished = this.view;
    this.reporter?.setGame(this.view);
    this.pulse.notify();
  }

  private cancelAnalysis(): void {
    this.operation?.abort(abortError('The game position changed.'));
    this.operation = undefined;
  }
}
