import type { AnalysisRequest } from './engine.js';

export interface AnalysisSchedulingPolicy {
  select(requests: readonly AnalysisRequest[]): number;
}
