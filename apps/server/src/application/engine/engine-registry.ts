import type { EngineFactory } from '../../domain/engine/engine.js';
import type { EngineOption } from '../../../../../packages/contracts/src/index.js';

export class EngineRegistry {
  private readonly factories = new Map<string, EngineFactory>();
  list(): EngineOption[] {
    return [...this.factories.values()]
      .map(({ id, name, elo }) => ({ id, name, ...(elo === undefined ? {} : { elo }) }))
      .sort((left, right) => (left.elo ?? Infinity) - (right.elo ?? Infinity));
  }
  register(factory: EngineFactory): void {
    if (this.factories.has(factory.id))
      throw new Error(`Engine ${factory.id} is already registered.`);
    this.factories.set(factory.id, factory);
  }
  get(id: string): EngineFactory {
    const factory = this.factories.get(id);
    if (!factory) throw new Error(`Engine ${id} is not registered.`);
    return factory;
  }
}
