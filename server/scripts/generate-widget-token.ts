import { randomBytes, createHash } from 'crypto';

// Operator-only: never called by builds, startup or tests. No files are written.
const token = randomBytes(32).toString('base64url');
process.stdout.write(JSON.stringify({ token, sha256: createHash('sha256').update(token).digest('hex') }));
