import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { hashPassword } from '../src/auth/password';
import { hiddenInput } from './hiddenInput';

// Interactive only: passwords never enter command history or process arguments.
async function main() {
  const password = await hiddenInput('Choose a password (12+ characters; input is hidden): ');
  const confirm = await hiddenInput('Confirm password (hidden): ');
  if (password.length < 12 || password.length > 1024 || password !== confirm) throw new Error('Passwords must match and contain 12–1024 characters');
  const destination = path.resolve('auth-secrets.env');
  writeFileSync(destination, `AUTH_PASSWORD_HASH='${await hashPassword(password)}'\nSESSION_SECRET='${randomBytes(32).toString('hex')}'\n`, { flag: 'wx', mode: 0o600 });
  console.log('Created auth-secrets.env in the current workspace directory. Keep it private; values were not printed.');
}
main().catch(() => { console.error('Setup failed or was cancelled. Use a terminal, matching passwords, and a destination without an existing auth-secrets.env.'); process.exitCode = 1; });
