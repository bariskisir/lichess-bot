export interface PasswordHash {
  algorithm: 'scrypt';
  salt: string;
  digest: string;
}

export interface PasswordHasher {
  hash(password: string): Promise<PasswordHash>;
  verify(password: string, hash: PasswordHash): Promise<boolean>;
}

export interface AuthenticationRepository {
  load(): Promise<PasswordHash | null>;
  save(hash: PasswordHash | null): Promise<void>;
}
