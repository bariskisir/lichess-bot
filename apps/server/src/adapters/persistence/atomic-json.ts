import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

export class AtomicJsonFile<T> {
  private writes: Promise<void> = Promise.resolve();
  constructor(
    private readonly path: string,
    private readonly parse: (value: unknown) => T,
  ) {}
  async read(fallback: T): Promise<T> {
    try {
      return this.parse(JSON.parse(await readFile(this.path, 'utf8')));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return fallback;
      throw new Error(`Cannot read ${this.path}. Restore or repair the file before restarting.`, {
        cause: error,
      });
    }
  }
  write(value: T): Promise<void> {
    const serialized = `${JSON.stringify(value, null, 2)}\n`;
    const task = this.writes.then(async () => {
      await mkdir(dirname(this.path), { recursive: true });
      const temporary = `${this.path}.${randomUUID()}.tmp`;
      await writeFile(temporary, serialized, { encoding: 'utf8', mode: 0o600 });
      await rename(temporary, this.path);
    });
    this.writes = task.catch(() => {});
    return task;
  }
  async flush(): Promise<void> {
    await this.writes;
  }
}
