import { describe, expect, it, vi } from 'vitest';
import { TurnDelay } from '../../../apps/server/src/application/game/turn-delay.js';
import { abortError } from '../../../apps/server/src/shared/async.js';

describe('total turn delay', () => {
  it.each([
    { elapsed: 2000, expected: 1000 },
    { elapsed: 1500, expected: 1500 },
    { elapsed: 3000, expected: 0 },
    { elapsed: 5000, expected: 0 },
  ])(
    'waits $expected ms after $elapsed ms of queue and analysis for a 3000 ms target',
    async ({ elapsed, expected }) => {
      let now = 100;
      const wait = vi.fn(async (duration: number) => {
        now += duration;
      });
      const waiting = vi.fn();
      const delay = new TurnDelay(3000, () => now, wait);
      now += elapsed;
      const signal = new AbortController().signal;
      await delay.wait(signal, waiting);
      if (expected) expect(wait).toHaveBeenCalledWith(expected, signal);
      else expect(wait).not.toHaveBeenCalled();
      expect(waiting).toHaveBeenCalledTimes(expected ? 1 : 0);
    },
  );
  it('does not wait when disabled and rejects already cancelled turns', async () => {
    const wait = vi.fn(async () => {});
    const delay = new TurnDelay(0, () => 100, wait);
    await delay.wait(new AbortController().signal, vi.fn());
    const controller = new AbortController();
    controller.abort(abortError());
    await expect(delay.wait(controller.signal, vi.fn())).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(wait).not.toHaveBeenCalled();
  });
});
