import { describe, expect, it, vi } from 'vitest';
import { EnginePool } from '../../../apps/server/src/application/engine/engine-pool.js';
import type { Analysis, AnalysisRequest } from '../../../apps/server/src/domain/engine/engine.js';
import { abortError, deferred, sleep } from '../../../apps/server/src/shared/async.js';

function request(id: string, signal = new AbortController().signal): AnalysisRequest {
  return { gameId: id, signal, depth: 8, variations: 1, position: { moves: [] } };
}
const result: Analysis = {
  bestMove: 'e2e4',
  variations: [{ index: 1, depth: 8, score: 0.2, mate: null, nodes: 1, moves: ['e2e4'] }],
};

describe('engine pool', () => {
  it('starts workers lazily and retains arrival order when clocks are unavailable', async () => {
    const started: string[] = [];
    const responses = new Map<string, ReturnType<typeof deferred<Analysis>>>();
    const create = vi.fn(() => ({
      close: vi.fn(async () => {}),
      analyze: (job: AnalysisRequest) => {
        started.push(job.gameId);
        const reply = deferred<Analysis>();
        responses.set(job.gameId, reply);
        return reply.promise;
      },
    }));
    const pool = new EnginePool({ id: 'fake', name: 'Fake', create }, 1);
    expect(create).not.toHaveBeenCalled();
    const one = pool.analyze(request('one'));
    const two = pool.analyze(request('two'));
    expect(started).toEqual(['one']);
    expect(create).toHaveBeenCalledTimes(1);
    responses.get('one')!.resolve(result);
    await one;
    await sleep(0);
    expect(started).toEqual(['one', 'two']);
    responses.get('two')!.resolve(result);
    await two;
    await pool.close();
  });
  it('prioritizes current clock deadlines, keeps ties in arrival order and never interrupts active work', async () => {
    const started: string[] = [];
    const replies = new Map<string, ReturnType<typeof deferred<Analysis>>>();
    const pool = new EnginePool(
      {
        id: 'fake',
        name: 'Fake',
        create: () => ({
          close: vi.fn(async () => {}),
          analyze: (job: AnalysisRequest) => {
            started.push(job.gameId);
            const reply = deferred<Analysis>();
            replies.set(job.gameId, reply);
            return reply.promise;
          },
        }),
      },
      1,
    );
    const jobs = new Map<string, Promise<Analysis>>();
    jobs.set('active', pool.analyze(request('active')));
    jobs.set('long', pool.analyze({ ...request('long'), getDeadline: () => 60_000 }));
    jobs.set('normal', pool.analyze({ ...request('normal'), getDeadline: () => 20_000 }));
    let urgentDeadline = 25_000;
    jobs.set('urgent', pool.analyze({ ...request('urgent'), getDeadline: () => urgentDeadline }));
    jobs.set('tie', pool.analyze({ ...request('tie'), getDeadline: () => 20_000 }));
    jobs.set('untimed', pool.analyze(request('untimed')));
    expect(started).toEqual(['active']);
    urgentDeadline = 5_000;
    for (const [index, id] of ['active', 'urgent', 'normal', 'tie', 'long', 'untimed'].entries()) {
      expect(started[index]).toBe(id);
      replies.get(id)!.resolve(result);
      await jobs.get(id);
      await sleep(0);
    }
    await pool.close();
  });
  it('removes cancelled queued positions without interrupting another game', async () => {
    const reply = deferred<Analysis>();
    const engine = { close: vi.fn(async () => {}), analyze: vi.fn(() => reply.promise) };
    const pool = new EnginePool({ id: 'fake', name: 'Fake', create: () => engine }, 1);
    const active = pool.analyze(request('active'));
    const controller = new AbortController();
    const queued = pool.analyze(request('queued', controller.signal));
    const rejection = expect(queued).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort(abortError());
    await rejection;
    expect(engine.close).not.toHaveBeenCalled();
    reply.resolve(result);
    await active;
    await pool.close();
    expect(engine.analyze).toHaveBeenCalledTimes(1);
  });
  it('closes workers on shutdown and rejects waiting requests', async () => {
    const reply = deferred<Analysis>();
    const engine = {
      close: vi.fn(async () => {
        reply.reject(abortError());
      }),
      analyze: vi.fn(() => reply.promise),
    };
    const pool = new EnginePool({ id: 'fake', name: 'Fake', create: () => engine }, 1);
    const first = pool.analyze(request('active'));
    const second = pool.analyze(request('waiting'));
    const outcomes = Promise.allSettled([first, second]);
    await pool.close();
    expect((await outcomes).every((outcome) => outcome.status === 'rejected')).toBe(true);
    await expect(pool.analyze(request('new'))).rejects.toMatchObject({ name: 'AbortError' });
  });
});
