export interface EnginePosition {
  initialFen?: string;
  moves: readonly string[];
}
export interface Variation {
  index: number;
  depth: number;
  score: number;
  mate: number | null;
  moves: string[];
  nodes: number;
}
export interface Analysis {
  bestMove: string;
  variations: Variation[];
}
export interface AnalysisRequest {
  gameId: string;
  position: EnginePosition;
  depth: number;
  variations: number;
  signal: AbortSignal;
  onInfo?: (variation: Variation) => void;
  onStarted?: () => void;
  getDeadline?: () => number | null;
}
export interface ChessEngine {
  analyze(request: AnalysisRequest): Promise<Analysis>;
  close(): Promise<void>;
}
export interface EngineFactory {
  id: string;
  name: string;
  create(): ChessEngine;
}
export interface AnalysisService {
  analyze(request: AnalysisRequest): Promise<Analysis>;
}
