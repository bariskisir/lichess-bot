import type { GameView } from '../../../../../packages/contracts/src/index.js';

export interface GameHistoryRepository {
  load(): Promise<GameView[]>;
  save(game: GameView, limit: number): Promise<void>;
  flush(): Promise<void>;
}
