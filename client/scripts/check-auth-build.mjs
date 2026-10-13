import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'dotenv';

// Report only PASS/FAIL, never matched strings, snippets, or credential values.
const root = fileURLToPath(new URL('../../', import.meta.url));
const keys = ['APP_TOKEN', 'VITE_APP_TOKEN', 'AUTH_PASSWORD_HASH', 'SESSION_SECRET', 'ANTHROPIC_API_KEY', 'WIDGET_READ_TOKEN_SHA256', 'WIDGET_ACTION_TOKEN_SHA256'];
const values = keys.map(key => process.env[key]).filter(Boolean);
for (const directory of [root, path.join(root, 'client'), path.join(root, 'server')]) {
  for (const name of fs.readdirSync(directory)) {
    if (!/^\.env(?:\.|$)/.test(name) && name !== 'auth-secrets.env') continue;
    const filename = path.join(directory, name);
    if (!fs.statSync(filename).isFile()) continue;
    const env = parse(fs.readFileSync(filename));
    values.push(...keys.map(key => env[key]).filter(Boolean));
  }
}
let files = 0;
function inspect(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) inspect(filename);
    else {
      files++;
      const content = fs.readFileSync(filename).toString('utf8');
      if (values.some(value => content.includes(value)) || /VITE_APP_TOKEN|VITE_API_URL|WIDGET_READ_TOKEN|WIDGET_ACTION_TOKEN/.test(content)) {
        throw new Error('FAIL: frontend artifacts contain a forbidden credential or obsolete authentication configuration');
      }
    }
  }
}
inspect(path.join(root, 'client/dist'));
if (!files) throw new Error('Build frontend first');
console.log(`PASS: ${files} frontend artifacts checked; no known configured credentials or obsolete auth variables found.`);
