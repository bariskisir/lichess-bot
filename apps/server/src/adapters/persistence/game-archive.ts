import { join } from 'node:path';
import { z } from 'zod';
import type { GameView } from '../../../../../packages/contracts/src/index.js';
import { AtomicJsonFile } from './atomic-json.js';

const archivedGameSchema = z.object({
  id: z.string(),
  accountId: z.string(),
  accountName: z.string(),
  color: z.enum(['white', 'black']),
  white: z.object({
    id: z.string(),
    name: z.string(),
    rating: z.number().nullable(),
    title: z.string().nullable(),
  }),
  black: z.object({
    id: z.string(),
    name: z.string(),
    rating: z.number().nullable(),
    title: z.string().nullable(),
  }),
  fen: z.string(),
  initialFen: z.string(),
  moves: z.array(z.string()),
  lastMove: z.string().nullable(),
  ply: z.number(),
  turn: z.enum(['white', 'black']),
  check: z.boolean(),
  clock: z
    .object({ white: z.number(), black: z.number(), running: z.boolean(), updatedAt: z.number() })
    .nullable(),
  timeControl: z.string(),
  rated: z.boolean(),
  activity: z.literal('finished'),
  status: z.string(),
  evaluation: z
    .object({
      score: z.number(),
      mate: z.number().nullable(),
      depth: z.number(),
      fen: z.string(),
      updatedAt: z.number(),
    })
    .nullable(),
  startedAt: z.number(),
  finishedAt: z.number(),
  result: z.enum(['win', 'loss', 'draw', 'aborted']),
});
export class GameArchive {
  private readonly file: AtomicJsonFile<GameView[]>;
  private games: GameView[] = [];
  constructor(directory: string) {
    this.file = new AtomicJsonFile(join(directory, 'history.json'), (value) =>
      z.array(archivedGameSchema).parse(value),
    );
  }
  async load(): Promise<GameView[]> {
    this.games = await this.file.read([]);
    return this.games;
  }
  async save(game: GameView, limit: number): Promise<void> {
    this.games = [game, ...this.games.filter((item) => item.id !== game.id)].slice(0, limit);
    await this.file.write(this.games);
  }
  async flush(): Promise<void> {
    await this.file.flush();
  }
}
