import { describe, expect, it } from 'vitest';
import { MatchBudget } from '../../../apps/server/src/application/scheduling/match-budget.js';
import { PoolRotation } from '../../../apps/server/src/application/scheduling/pool-rotation.js';

describe('shared match scheduling', () => {
  it('reserves both capacity and the remaining target before simultaneous searches', () => {
    const budget = new MatchBudget(1, 4);
    expect(budget.search('one')).toBe(true);
    expect(budget.search('two')).toBe(false);
    expect(budget.reserve('game', 'one')).toBe(true);
    expect(budget.search('two')).toBe(false);
    budget.complete('game');
    expect(budget.reached).toBe(true);
    expect(budget.search('two')).toBe(false);
  });
  it('counts a game between two managed accounts only once', () => {
    const budget = new MatchBudget(10, 2);
    expect(budget.search('one')).toBe(true);
    expect(budget.search('two')).toBe(true);
    budget.reserve('same-game', 'one');
    budget.reserve('same-game', 'two');
    expect(budget.active).toBe(1);
    expect(budget.searching).toBe(0);
    expect(budget.complete('same-game')).toBe(true);
    expect(budget.complete('same-game')).toBe(false);
    expect(budget.complete('unknown-game')).toBe(false);
    expect(budget.completed).toBe(1);
  });
  it('preserves recovered games and expands the target without authorizing more searches', () => {
    const budget = new MatchBudget(1, 2);
    budget.reserve('one', 'account', true);
    budget.reserve('two', 'account', true);
    expect(budget.target).toBe(2);
    expect(budget.search('other')).toBe(false);
    budget.complete('one');
    expect(budget.search('other')).toBe(false);
  });
  it('returns failed search capacity and rotates through the least occupied pools', () => {
    const budget = new MatchBudget(10, 1);
    budget.search('one');
    budget.releaseSearch('one');
    expect(budget.search('two')).toBe(true);
    const rotation = new PoolRotation(['1+0', '3+2']);
    expect(rotation.choose('one')).toBe('1+0');
    expect(rotation.choose('two')).toBe('3+2');
    rotation.release('one');
    expect(rotation.choose('one')).toBe('1+0');
  });
});
