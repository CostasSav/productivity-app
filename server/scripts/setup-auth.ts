import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { emitKeypressEvents, type Key } from 'node:readline';
import path from 'node:path';
import { hashPassword } from '../src/auth/password';

// Interactive only: passwords never enter command history or process arguments.
async function hiddenInput(prompt: string): Promise<string> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('Use an interactive terminal');
  process.stdout.write(prompt);
  emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  return new Promise((resolve, reject) => {
    let value = '';
    const finish = () => {
      process.stdin.removeListener('keypress', onKey);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write('\n');
    };
    const onKey = (text: string, key: Key) => {
      if (key.ctrl && key.name === 'c') { finish(); reject(new Error('Cancelled')); }
      else if (key.name === 'return') { finish(); resolve(value); }
      else if (key.name === 'backspace') value = Array.from(value).slice(0, -1).join('');
      else if (!key.ctrl && !key.meta && text && !/[\x00-\x1f\x7f]/.test(text) && value.length < 1024) value += text;
    };
    process.stdin.on('keypress', onKey);
  });
}

async function main() {
  const password = await hiddenInput('Choose a password (12+ characters; input is hidden): ');
  const confirm = await hiddenInput('Confirm password (hidden): ');
  if (password.length < 12 || password.length > 1024 || password !== confirm) throw new Error('Passwords must match and contain 12–1024 characters');
  const destination = path.resolve('auth-secrets.env');
  writeFileSync(destination, `AUTH_PASSWORD_HASH='${await hashPassword(password)}'\nSESSION_SECRET='${randomBytes(32).toString('hex')}'\n`, { flag: 'wx', mode: 0o600 });
  console.log('Created auth-secrets.env in the current workspace directory. Keep it private; values were not printed.');
}
main().catch(() => { console.error('Setup failed or was cancelled. Use a terminal, matching passwords, and a destination without an existing auth-secrets.env.'); process.exitCode = 1; });
