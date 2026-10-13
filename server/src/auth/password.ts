import { randomBytes, scrypt, timingSafeEqual } from 'crypto';

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => scrypt(password, salt, 64,
    { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
    (error, key) => error ? reject(error) : resolve(key)));
}
export function validatePasswordHash(hash: string): void {
  if (!/^scrypt\$32768\$8\$1\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(hash)) {
    throw new Error('AUTH_PASSWORD_HASH must be generated with the auth setup script');
  }
}
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  return `scrypt$32768$8$1$${salt.toString('hex')}$${(await derive(password, salt)).toString('hex')}`;
}
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  validatePasswordHash(hash);
  const parts = hash.split('$');
  return timingSafeEqual(await derive(password, Buffer.from(parts[4], 'hex')), Buffer.from(parts[5], 'hex'));
}
