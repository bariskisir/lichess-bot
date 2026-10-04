import type { Logger } from 'pino';
import type {
  AccountView,
  BotSettings,
  GameActivity,
  GameView,
} from '../../../../../packages/contracts/src/index.js';
import {
  AuthenticationError,
  type GameChannel,
  type GameSnapshot,
  type LichessGateway,
  type RemoteFrame,
} from '../../domain/lichess/gateway.js';
import { GamePosition } from '../../domain/game/position.js';
import { Pulse, abortError, isAbort, retryDelay, sleep } from '../../shared/async.js';
import type { MoveSelector } from './move-selector.js';
import type { DashboardStore } from '../dashboard/dashboard-store.js';
import { clockEventSchema, moveEventSchema } from './game-events.js';
import { TurnTiming } from './timing/turn-timing.js';
import type { TurnClock } from './timing/dynamic-turn-budget.js';

interface PendingMove {
  ply: number;
  sentAt: number;
  ack: number;
  acknowledged: boolean;
}
type GameReporter = Pick<DashboardStore, 'setGame' | 'updateGame' | 'addActivity'>;

export class GameRunner {
  private readonly channel: GameChannel;
  private readonly pulse = new Pulse();
  private snapshot?: GameSnapshot;
  private position?: GamePosition;
  private view?: GameView;
  private needsRefresh = true;
  private operation?: AbortController;
  private pending?: PendingMove;
  private ack = 0;
  private refreshedAt = 0;
  private claimAt = 0;
  private drawAt = 0;
  private flagAt = 0;
  private presenceRevision = 0;
  private turnTiming?: TurnTiming;

  constructor(
    private readonly fullId: string,
    private readonly account: AccountView,
    private readonly gateway: LichessGateway,
    private readonly selector: MoveSelector,
    private readonly settings: BotSettings,
    private readonly managedUsers: ReadonlySet<string>,
    private readonly reporter: GameReporter | null,
    private readonly logger: Logger,
    private readonly createTiming: (getClock: () => TurnClock | null) => TurnTiming = (getClock) =>
      new TurnTiming(settings, getClock),
  ) {
    this.channel = gateway.createChannel();
  }

  async run(signal: AbortSignal): Promise<GameView> {
    const unsubscribe = this.channel.subscribe(this.onFrame);
    const disconnect = this.channel.onDisconnect(this.invalidate);
    let attempt = 0;
    try {
      while (!signal.aborted) {
        try {
          if (this.needsRefresh || !this.channel.connected) {
            await this.refresh(signal);
            if (this.snapshot!.status >= 25) return this.finish();
            if (this.needsRefresh) continue;
            if (!this.channel.connected)
              await this.channel.connect(`/play/${this.fullId}/v6`, signal, this.snapshot!.version);
          }
          if (this.snapshot!.status >= 25) return this.finish();
          if (this.pending && Date.now() - this.pending.sentAt > 2500) {
            await this.refresh(signal);
            if (this.snapshot!.status >= 25) return this.finish();
            if (this.pending && this.position!.ply === this.pending.ply) this.pending = undefined;
            continue;
          }
          if (this.managedGame) {
            this.cancelAnalysis();
            if (Date.now() - this.drawAt >= 5000) {
              if (this.drawAt) await this.refresh(signal);
              if (this.snapshot!.status >= 25) return this.finish();
              if (
                this.snapshot!.opponentDrawOffer ||
                (!this.snapshot!.ownDrawOffer && this.position!.ply >= 2)
              ) {
                this.channel.send('draw-yes');
                this.drawAt = Date.now();
              }
            }
            this.activity('waiting');
          } else if (!this.pending && this.myTurn) await this.play(signal);
          else {
            this.activity(this.pending ? 'confirming' : 'waiting');
            this.claimIfEligible();
            this.flagIfExpired();
          }
          if (!this.operation && !this.pending && Date.now() - this.refreshedAt > 20_000)
            this.invalidate();
          attempt = 0;
          await this.pulse.wait(250, signal);
        } catch (error) {
          if (signal.aborted) throw signal.reason;
          if (error instanceof AuthenticationError) throw error;
          if (isAbort(error)) continue;
          this.invalidate();
          this.channel.close();
          this.activity('recovering');
          this.logger.warn(
            {
              gameId: this.fullId.slice(0, 8),
              error: error instanceof Error ? error.message : 'Unknown error',
            },
            'Recovering game state',
          );
          this.reporter?.addActivity(
            'warn',
            'Game connection interrupted; recovering the same game.',
            this.account.id,
            this.fullId.slice(0, 8),
          );
          await sleep(retryDelay(attempt++), signal);
        }
      }
      throw signal.reason;
    } finally {
      unsubscribe();
      disconnect();
      this.cancelAnalysis();
      this.channel.close();
    }
  }

  private get myTurn(): boolean {
    return this.position!.chess.turn() === (this.snapshot!.color === 'white' ? 'w' : 'b');
  }
  private get managedGame(): boolean {
    const snapshot = this.snapshot;
    if (!snapshot || !this.settings.drawManagedAccounts || (this.position?.ply ?? 0) < 2)
      return false;
    const opponent = snapshot.color === 'white' ? snapshot.black : snapshot.white;
    return this.managedUsers.has(opponent.id);
  }

  private async refresh(signal: AbortSignal): Promise<void> {
    this.cancelAnalysis();
    const presenceRevision = this.presenceRevision;
    const snapshot = await this.gateway.snapshot(this.fullId, signal);
    if (
      snapshot.id !== this.fullId.slice(0, 8) ||
      snapshot.playerId !== this.fullId.slice(8) ||
      snapshot.userId !== this.account.userId
    )
      throw new AuthenticationError(
        'The game belongs to a different account. Check the configured session.',
      );
    if (
      this.channel.connected &&
      this.channel.version !== undefined &&
      snapshot.version < this.channel.version
    ) {
      this.needsRefresh = true;
      await sleep(100, signal);
      return;
    }
    if (presenceRevision !== this.presenceRevision && this.snapshot)
      snapshot.opponentGone = this.snapshot.opponentGone;
    this.snapshot = snapshot;
    const previousPosition = this.position?.key;
    this.position = new GamePosition(snapshot);
    this.channel.setVersion(snapshot.version);
    if (this.pending && this.position.ply > this.pending.ply) this.pending = undefined;
    this.refreshedAt = Date.now();
    this.needsRefresh = false;
    this.project(this.myTurn ? 'queued' : 'waiting');
    this.updateTurnTiming(previousPosition);
  }

  private project(activity: GameActivity): void {
    if (!this.snapshot || !this.position) return;
    const snapshot = this.snapshot;
    this.view = {
      id: snapshot.id,
      accountId: this.account.id,
      accountName: this.account.username ?? this.account.label,
      color: snapshot.color,
      white: snapshot.white,
      black: snapshot.black,
      fen: this.position.chess.fen(),
      initialFen: this.position.initialFen,
      moves: [...this.position.sanMoves],
      lastMove: this.position.uciMoves.at(-1) ?? null,
      ply: this.position.ply,
      turn: this.position.chess.turn() === 'w' ? 'white' : 'black',
      check: this.position.chess.isCheck(),
      clock: snapshot.clock
        ? {
            white: snapshot.clock.white,
            black: snapshot.clock.black,
            running: snapshot.clock.running,
            updatedAt: Date.now(),
          }
        : null,
      timeControl: snapshot.clock
        ? `${snapshot.clock.initial / 60}+${snapshot.clock.increment}`
        : 'Untimed',
      rated: snapshot.rated,
      activity,
      delayUntil: null,
      status: snapshot.statusName,
      evaluation: this.view?.evaluation ?? null,
      startedAt: snapshot.createdAt,
      finishedAt: null,
      result: null,
    };
    this.reporter?.setGame(this.view);
  }

  private activity(activity: GameActivity, delayUntil: number | null = null): void {
    if (!this.view) return;
    if (
      this.view.activity === activity &&
      Math.abs((this.view.delayUntil ?? 0) - (delayUntil ?? 0)) < 50
    )
      return;
    this.view = { ...this.view, activity, delayUntil };
    this.reporter?.updateGame(this.view.id, { activity, delayUntil });
  }

  private async play(signal: AbortSignal): Promise<void> {
    const operation = new AbortController();
    this.operation = operation;
    const scope = AbortSignal.any([signal, operation.signal]);
    const position = this.position!;
    const key = position.key;
    const timing = (this.turnTiming ??= this.createTiming(this.turnClock));
    this.activity('queued');
    try {
      const move = await this.selector.select(
        this.fullId.slice(0, 8),
        position,
        this.settings,
        scope,
        (variation) => {
          if (scope.aborted || this.position !== position || this.needsRefresh || !this.view)
            return;
          const perspective = position.chess.turn() === 'w' ? 1 : -1;
          const evaluation = {
            score: variation.score * perspective,
            mate: variation.mate === null ? null : variation.mate * perspective,
            depth: variation.depth,
            fen: position.chess.fen(),
            updatedAt: Date.now(),
          };
          this.view = { ...this.view, evaluation };
          this.reporter?.updateGame(this.view.id, { evaluation });
        },
        () => this.activity('thinking'),
        this.analysisDeadline,
        timing.remainingAnalysisMs,
      );
      await timing.wait(scope, (remainingMs) =>
        this.activity('delaying', Date.now() + remainingMs),
      );
      scope.throwIfAborted();
      if (
        this.needsRefresh ||
        !this.channel.connected ||
        this.position?.key !== key ||
        !this.myTurn ||
        this.managedGame
      )
        return;
      position.candidate(move);
      this.pending = {
        ply: position.ply,
        sentAt: Date.now(),
        ack: ++this.ack,
        acknowledged: false,
      };
      this.channel.send('move', { u: move, a: this.ack, l: Math.round(this.channel.lagMs) });
      this.activity('confirming');
    } finally {
      if (this.operation === operation) this.operation = undefined;
    }
  }

  private updateTurnTiming(previousPosition?: string): void {
    if (!this.myTurn) this.turnTiming = undefined;
    else if (!this.turnTiming || this.position!.key !== previousPosition)
      this.turnTiming = this.createTiming(this.turnClock);
  }

  private readonly turnClock = (): TurnClock | null => {
    const clock = this.view?.clock;
    const position = this.position;
    const snapshot = this.snapshot;
    if (!clock || !position || !snapshot?.clock) return null;
    const elapsedMs = clock.running && this.myTurn ? Math.max(0, Date.now() - clock.updatedAt) : 0;
    const phaseWeights = { p: 0, n: 1, b: 1, r: 2, q: 4, k: 0 } as const;
    const material = position.chess
      .board()
      .flat()
      .reduce((sum, piece) => sum + (piece ? phaseWeights[piece.type] : 0), 0);
    return {
      remainingMs: Math.max(0, clock[snapshot.color] * 1000 - elapsedMs),
      initialMs: snapshot.clock.initial * 1000,
      incrementMs: snapshot.clock.increment * 1000,
      completedMoves:
        snapshot.color === 'white' ? Math.ceil(position.ply / 2) : Math.floor(position.ply / 2),
      materialPhase: Math.min(1, material / 24),
      quietHalfMoves: Number(position.chess.fen().split(' ')[4]),
      lagMs: this.channel.lagMs,
      running: clock.running,
    };
  };

  private readonly analysisDeadline = (): number | null => {
    const view = this.view;
    const clock = view?.clock;
    if (!view || !clock?.running || view.turn !== view.color) return null;
    return clock.updatedAt + clock[view.color] * 1000;
  };

  private readonly onFrame = (frame: RemoteFrame): void => {
    if (!this.snapshot || !this.position) return;
    if (frame.t === 'move') {
      const parsed = moveEventSchema.safeParse(frame.d);
      if (!parsed.success) {
        this.invalidate();
        return;
      }
      const move = parsed.data;
      if (move.ply <= this.position.ply) return;
      if (this.needsRefresh || move.ply !== this.position.ply + 1) {
        this.invalidate();
        return;
      }
      try {
        this.position.apply(move.san, move.fen);
      } catch {
        this.invalidate();
        return;
      }
      if (this.position.chess.turn() === (this.snapshot.color === 'white' ? 'w' : 'b'))
        this.setOpponentGone(false);
      this.cancelAnalysis();
      this.pending = undefined;
      if (move.clock && this.snapshot.clock)
        this.snapshot.clock = { ...this.snapshot.clock, ...move.clock, running: true };
      this.project(this.myTurn ? 'queued' : 'waiting');
      this.updateTurnTiming();
    } else if (frame.t === 'ack') {
      if (this.pending && frame.d === this.pending.ack) this.pending.acknowledged = true;
    } else if (frame.t === 'clock') {
      const parsed = clockEventSchema.safeParse(frame.d);
      if (parsed.success && this.snapshot.clock) {
        this.snapshot.clock = { ...this.snapshot.clock, ...parsed.data };
        if (this.view?.clock) {
          this.view = {
            ...this.view,
            clock: { ...this.view.clock, ...parsed.data, updatedAt: Date.now() },
          };
          this.reporter?.updateGame(this.view.id, { clock: this.view.clock });
        }
      }
    } else if (frame.t === 'gone') {
      if (typeof frame.d === 'boolean') this.setOpponentGone(frame.d);
    } else if (frame.t === 'goneIn') {
      this.setOpponentGone(false);
    } else if (frame.t === 'crowd' && frame.d && typeof frame.d === 'object') {
      const opponent = this.snapshot.color === 'white' ? 'black' : 'white';
      if ((frame.d as Record<string, unknown>)[opponent] === true) this.setOpponentGone(false);
    } else if (frame.t === 'drawOffer') {
      this.snapshot.ownDrawOffer = frame.d === this.snapshot.color;
      this.snapshot.opponentDrawOffer =
        frame.d === (this.snapshot.color === 'white' ? 'black' : 'white');
      this.drawAt = 0;
    } else if (
      ['endData', 'end', 'reload', 'resync', 'clockInc', 'takebackOffers'].includes(frame.t)
    )
      this.invalidate();
    this.pulse.notify();
  };

  private claimIfEligible(): void {
    if (
      !this.settings.claimVictory ||
      this.myTurn ||
      !this.snapshot!.opponentGone ||
      this.snapshot!.noClaimWin ||
      this.position!.ply < 2 ||
      Date.now() - this.claimAt < 5000
    )
      return;
    if (this.claimAt) {
      this.invalidate();
      this.claimAt = 0;
      return;
    }
    this.channel.send('resign-force');
    this.claimAt = Date.now();
  }
  private flagIfExpired(): void {
    const clock = this.view?.clock;
    if (!clock?.running || !this.view || Date.now() - this.flagAt < 5000) return;
    const remaining = clock[this.view.turn] - (Date.now() - clock.updatedAt) / 1000;
    if (remaining <= 0) {
      this.channel.send('flag', this.view.turn);
      this.flagAt = Date.now();
    }
  }
  private cancelAnalysis(): void {
    this.operation?.abort(abortError('The game position changed.'));
    this.operation = undefined;
  }
  private setOpponentGone(gone: boolean): void {
    this.presenceRevision++;
    if (this.snapshot) this.snapshot.opponentGone = gone;
    if (!gone) this.claimAt = 0;
  }
  private readonly invalidate = (): void => {
    this.needsRefresh = true;
    this.setOpponentGone(false);
    this.cancelAnalysis();
    this.pulse.notify();
  };
  private finish(): GameView {
    const snapshot = this.snapshot!;
    const result =
      snapshot.status === 25
        ? 'aborted'
        : snapshot.winner
          ? snapshot.winner === snapshot.color
            ? 'win'
            : 'loss'
          : 'draw';
    this.view = {
      ...this.view!,
      result,
      status: snapshot.statusName,
      activity: 'finished',
      delayUntil: null,
      finishedAt: Date.now(),
      clock: this.view!.clock ? { ...this.view!.clock, running: false } : null,
    };
    this.reporter?.setGame(this.view);
    return this.view;
  }
}
