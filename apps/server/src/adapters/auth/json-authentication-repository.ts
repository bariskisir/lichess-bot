import { resolve } from 'node:path';
import { z } from 'zod';
import type {
  AuthenticationRepository,
  PasswordHash,
} from '../../application/auth/authentication-ports.js';
import { AtomicJsonFile } from '../persistence/atomic-json.js';

const schema = z
  .object({
    algorithm: z.literal('scrypt'),
    salt: z.string().regex(/^[a-f\d]{32}$/),
    digest: z.string().regex(/^[a-f\d]{128}$/),
  })
  .nullable();

export class JsonAuthenticationRepository implements AuthenticationRepository {
  private readonly file: AtomicJsonFile<PasswordHash | null>;
  constructor(directory: string) {
    this.file = new AtomicJsonFile(resolve(directory, 'dashboard-auth.json'), (value) =>
      schema.parse(value),
    );
  }
  load(): Promise<PasswordHash | null> {
    return this.file.read(null);
  }
  save(hash: PasswordHash | null): Promise<void> {
    return this.file.write(hash);
  }
}
