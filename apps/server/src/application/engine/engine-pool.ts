import type {
  Analysis,
  AnalysisRequest,
  AnalysisService,
  ChessEngine,
  EngineFactory,
} from '../../domain/engine/engine.js';
import { abortError, deferred } from '../../shared/async.js';
import type { AnalysisSchedulingPolicy } from '../../domain/engine/analysis-scheduling.js';
import { ClockPriorityScheduling } from './clock-priority-scheduling.js';

interface Worker {
  engine: ChessEngine;
  busy: boolean;
}
interface Job {
  request: AnalysisRequest;
  result: ReturnType<typeof deferred<Analysis>>;
  abort: () => void;
}
export interface PoolMetrics {
  workers: number;
  busy: number;
  queued: number;
}

export class EnginePool implements AnalysisService {
  private readonly workers: Worker[] = [];
  private readonly queue: Job[] = [];
  private readonly running = new Set<Promise<void>>();
  private closed = false;
  constructor(
    private readonly factory: EngineFactory,
    private readonly capacity: number,
    private readonly changed: (metrics: PoolMetrics) => void = () => {},
    private readonly scheduling: AnalysisSchedulingPolicy = new ClockPriorityScheduling(),
  ) {}

  analyze(request: AnalysisRequest): Promise<Analysis> {
    request.signal.throwIfAborted();
    if (this.closed) return Promise.reject(abortError('The engine pool is closed.'));
    const result = deferred<Analysis>();
    const job: Job = { request, result, abort: () => {} };
    job.abort = () => {
      const index = this.queue.indexOf(job);
      if (index >= 0) {
        this.queue.splice(index, 1);
        request.signal.removeEventListener('abort', job.abort);
        result.reject(abortError());
        this.publish();
      }
    };
    request.signal.addEventListener('abort', job.abort, { once: true });
    this.queue.push(job);
    this.dispatch();
    return result.promise;
  }

  private dispatch(): void {
    while (this.queue.length && !this.closed) {
      let worker = this.workers.find((item) => !item.busy);
      if (!worker && this.workers.length < this.capacity) {
        worker = { engine: this.factory.create(), busy: false };
        this.workers.push(worker);
      }
      if (!worker) break;
      const next = this.scheduling.select(this.queue.map((job) => job.request));
      const job = this.queue.splice(next, 1)[0]!;
      job.request.signal.removeEventListener('abort', job.abort);
      if (job.request.signal.aborted) {
        job.result.reject(abortError());
        continue;
      }
      worker.busy = true;
      const ownedWorker = worker;
      job.request.onStarted?.();
      const task = ownedWorker.engine
        .analyze(job.request)
        .then(job.result.resolve, async (error: unknown) => {
          await ownedWorker.engine.close();
          job.result.reject(error);
        })
        .finally(() => {
          ownedWorker.busy = false;
          this.running.delete(task);
          this.dispatch();
        });
      this.running.add(task);
    }
    this.publish();
  }

  private publish(): void {
    this.changed({
      workers: this.workers.length,
      busy: this.workers.filter((item) => item.busy).length,
      queued: this.queue.length,
    });
  }
  async close(): Promise<void> {
    this.closed = true;
    for (const job of this.queue.splice(0)) {
      job.request.signal.removeEventListener('abort', job.abort);
      job.result.reject(abortError());
    }
    await Promise.allSettled(this.workers.map((worker) => worker.engine.close()));
    await Promise.allSettled(this.running);
    this.workers.length = 0;
    this.publish();
  }
}
