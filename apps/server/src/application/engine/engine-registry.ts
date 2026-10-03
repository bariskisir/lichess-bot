import type { EngineFactory } from '../../domain/engine/engine.js';

export class EngineRegistry {
  private readonly factories = new Map<string, EngineFactory>();
  list(): { id: string; name: string }[] {
    return [...this.factories.values()].map(({ id, name }) => ({ id, name }));
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
