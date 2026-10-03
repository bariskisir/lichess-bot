import type { AnalysisSchedulingPolicy } from '../../domain/engine/analysis-scheduling.js';
import type { AnalysisRequest } from '../../domain/engine/engine.js';

/** Rechecks current clock deadlines when a worker becomes available; ties retain arrival order. */
export class ClockPriorityScheduling implements AnalysisSchedulingPolicy {
  select(requests: readonly AnalysisRequest[]): number {
    let selected = 0;
    let earliest = Number.POSITIVE_INFINITY;
    for (const [index, request] of requests.entries()) {
      const deadline = request.getDeadline?.();
      if (
        deadline !== null &&
        deadline !== undefined &&
        Number.isFinite(deadline) &&
        deadline < earliest
      ) {
        selected = index;
        earliest = deadline;
      }
    }
    return selected;
  }
}
