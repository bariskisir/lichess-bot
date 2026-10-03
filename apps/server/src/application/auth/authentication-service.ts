import { randomBytes, createHash } from 'node:crypto';
import type { AuthenticationStatus } from '../../../../../packages/contracts/src/index.js';
import type {
  AuthenticationRepository,
  PasswordHash,
  PasswordHasher,
} from './authentication-ports.js';

export class AuthenticationFailure extends Error {
  constructor(
    message: string,
    readonly status = 401,
  ) {
    super(message);
  }
}

const SESSION_DURATION = 12 * 60 * 60 * 1000;

export class AuthenticationService {
  private password: PasswordHash | null = null;
  private readonly sessions = new Map<string, number>();
  private readonly attempts = new Map<string, { count: number; expires: number }>();
  constructor(
    private readonly repository: AuthenticationRepository,
    private readonly hasher: PasswordHasher,
  ) {}

  async load(): Promise<void> {
    this.password = await this.repository.load();
  }
  status(token?: string): AuthenticationStatus {
    return { passwordEnabled: this.password !== null, authenticated: this.authorized(token) };
  }
  authorized(token?: string): boolean {
    if (!this.password) return true;
    if (!token) return false;
    const key = this.key(token);
    const expires = this.sessions.get(key);
    if (!expires) return false;
    if (expires <= Date.now()) {
      this.sessions.delete(key);
      return false;
    }
    return true;
  }
  async login(password: string, client: string): Promise<string | null> {
    if (!this.password) return null;
    this.limit(client);
    if (!(await this.hasher.verify(password, this.password)))
      throw new AuthenticationFailure('Incorrect password. Try again.');
    this.attempts.delete(client);
    return this.createSession();
  }
  logout(token?: string): void {
    if (token) this.sessions.delete(this.key(token));
  }
  async change(
    password: string | null,
    currentPassword: string | undefined,
    client: string,
  ): Promise<string | null> {
    if (this.password) {
      this.limit(client);
      if (!currentPassword || !(await this.hasher.verify(currentPassword, this.password)))
        throw new AuthenticationFailure('The current password is incorrect.');
    }
    const hash = password === null ? null : await this.hasher.hash(password);
    await this.repository.save(hash);
    this.password = hash;
    this.sessions.clear();
    this.attempts.clear();
    return hash ? this.createSession() : null;
  }
  private key(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
  private createSession(): string {
    for (const [key, expires] of this.sessions)
      if (expires <= Date.now()) this.sessions.delete(key);
    if (this.sessions.size >= 50) this.sessions.delete(this.sessions.keys().next().value!);
    const token = randomBytes(32).toString('base64url');
    this.sessions.set(this.key(token), Date.now() + SESSION_DURATION);
    return token;
  }
  private limit(client: string): void {
    const now = Date.now();
    for (const [key, attempt] of this.attempts)
      if (attempt.expires <= now) this.attempts.delete(key);
    const attempt = this.attempts.get(client) ?? { count: 0, expires: now + 60_000 };
    if (attempt.count >= 5)
      throw new AuthenticationFailure('Too many attempts. Wait one minute and try again.', 429);
    attempt.count += 1;
    this.attempts.set(client, attempt);
  }
}
