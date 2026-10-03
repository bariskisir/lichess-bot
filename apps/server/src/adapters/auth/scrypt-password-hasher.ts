import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import type { PasswordHash, PasswordHasher } from '../../application/auth/authentication-ports.js';

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

export class ScryptPasswordHasher implements PasswordHasher {
  async hash(password: string): Promise<PasswordHash> {
    const salt = randomBytes(16);
    return {
      algorithm: 'scrypt',
      salt: salt.toString('hex'),
      digest: (await derive(password, salt)).toString('hex'),
    };
  }
  async verify(password: string, hash: PasswordHash): Promise<boolean> {
    const expected = Buffer.from(hash.digest, 'hex');
    const actual = await derive(password, Buffer.from(hash.salt, 'hex'));
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }
}
