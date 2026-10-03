import { z } from 'zod';
import { DEFAULT_POSITION } from 'chess.js';
import type { GameSnapshot } from '../../domain/lichess/gateway.js';
import type { PlayerView } from '../../../../../packages/contracts/src/index.js';

const colorSchema = z.enum(['white', 'black']);
const userSchema = z.object({
  id: z.string(),
  username: z.string().optional(),
  name: z.string().optional(),
  title: z.string().nullish(),
});
const playerSchema = z.object({
  color: colorSchema,
  user: userSchema.optional(),
  rating: z.number().nullish(),
  offeringDraw: z.boolean().optional(),
});
export const wireSnapshotSchema = z.object({
  game: z.object({
    id: z.string(),
    variant: z.object({ key: z.string() }),
    initialFen: z.string().optional(),
    turns: z.number().int(),
    status: z.object({ id: z.number(), name: z.string() }),
    winner: colorSchema.optional(),
    rated: z.boolean().optional(),
    createdAt: z.number().optional(),
    rules: z.array(z.string()).optional(),
  }),
  player: playerSchema.extend({ id: z.string(), version: z.number().int() }),
  opponent: playerSchema.extend({ isGone: z.boolean().optional() }),
  steps: z
    .array(
      z.object({
        ply: z.number().int(),
        fen: z.string(),
        san: z.string().nullish(),
        uci: z.string().nullish(),
      }),
    )
    .min(1),
  clock: z
    .object({
      white: z.number(),
      black: z.number(),
      running: z.boolean().optional(),
      initial: z.number().optional(),
      increment: z.number().optional(),
    })
    .optional(),
});
export const accountSchema = z.object({ id: z.string(), username: z.string() });
export const playingSchema = z.object({
  nowPlaying: z.array(
    z.object({ fullId: z.string().regex(/^[a-zA-Z0-9]{12}$/), speed: z.string() }),
  ),
});
export const frameSchema = z.object({
  t: z.string(),
  d: z.unknown().optional(),
  v: z.number().int().optional(),
});
export const moveSchema = z.object({
  ply: z.number().int(),
  san: z.string(),
  fen: z.string(),
  clock: z.object({ white: z.number(), black: z.number() }).optional(),
});

export function normalizeSnapshot(value: unknown): GameSnapshot {
  const snapshot = wireSnapshotSchema.parse(value);
  const view = (player: z.infer<typeof playerSchema>): PlayerView => ({
    id: player.user?.id ?? '',
    name: player.user?.username ?? player.user?.name ?? 'Anonymous',
    rating: player.rating ?? null,
    title: player.user?.title ?? null,
  });
  const color = snapshot.player.color;
  return {
    id: snapshot.game.id,
    playerId: snapshot.player.id,
    userId: snapshot.player.user?.id ?? '',
    variant: snapshot.game.variant.key,
    version: snapshot.player.version,
    color,
    white: view(color === 'white' ? snapshot.player : snapshot.opponent),
    black: view(color === 'black' ? snapshot.player : snapshot.opponent),
    initialFen:
      !snapshot.game.initialFen || snapshot.game.initialFen === 'startpos'
        ? DEFAULT_POSITION
        : snapshot.game.initialFen,
    steps: snapshot.steps.map((step) => ({
      ...step,
      san: step.san ?? null,
      uci: step.uci ?? null,
    })),
    ply: snapshot.game.turns,
    status: snapshot.game.status.id,
    statusName: snapshot.game.status.name,
    winner: snapshot.game.winner ?? null,
    clock: snapshot.clock
      ? {
          ...snapshot.clock,
          running: snapshot.clock.running ?? snapshot.game.turns >= 2,
          initial: snapshot.clock.initial ?? 0,
          increment: snapshot.clock.increment ?? 0,
        }
      : null,
    rated: snapshot.game.rated ?? true,
    createdAt: snapshot.game.createdAt ?? Date.now(),
    opponentGone: snapshot.opponent.isGone === true,
    ownDrawOffer: snapshot.player.offeringDraw === true,
    opponentDrawOffer: snapshot.opponent.offeringDraw === true,
    noClaimWin: snapshot.game.rules?.includes('noClaimWin') ?? false,
  };
}

export function redirectFullId(data: unknown): string | null {
  const parsed = z.union([z.string(), z.object({ url: z.string() })]).safeParse(data);
  if (!parsed.success) return null;
  const path = typeof parsed.data === 'string' ? parsed.data : parsed.data.url;
  return /^\/?([a-zA-Z0-9]{12})(?:[?#].*)?$/.exec(path)?.[1] ?? null;
}
