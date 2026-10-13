import session from 'express-session';
import { createHash, randomBytes } from 'crypto';
import fs from 'fs';
import path from 'path';

declare module 'express-session' {
  interface SessionData {
    owner?: boolean;
    authVersion?: string;
    csrfToken: string;
    expiresAt: number;
  }
}
type RecordData = { expiresAt: number; revoked?: boolean; session?: session.SessionData };

/** Single-process, fixed-expiry store on the existing Railway volume.
 * Tombstones prevent a late save from reviving a logged-out session.
 * Session reads never extend lifetime. This store never touches db.json.
 */
export class FileSessionStore extends session.Store {
  private nextSweep = 0;
  constructor(private directory: string) {
    super();
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  }
  private filename(id: string) {
    return path.join(this.directory, createHash('sha256').update(id).digest('hex') + '.json');
  }
  private read(filename: string): RecordData | null {
    try { return JSON.parse(fs.readFileSync(filename, 'utf8')) as RecordData; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
  }
  private write(filename: string, data: RecordData) {
    const temp = filename + '.' + randomBytes(8).toString('hex') + '.tmp';
    try {
      fs.writeFileSync(temp, JSON.stringify(data), { mode: 0o600, flag: 'wx' });
      fs.renameSync(temp, filename);
    } finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
  }
  get(id: string, callback: (error: unknown, data?: session.SessionData | null) => void) {
    try {
      const record = this.read(this.filename(id));
      callback(null, record && !record.revoked && record.expiresAt > Date.now() ? record.session : null);
    } catch { callback(new Error('Session store unavailable')); }
  }
  set(id: string, data: session.SessionData, callback?: (error?: unknown) => void) {
    try {
      this.sweep();
      const filename = this.filename(id);
      if (!this.read(filename)?.revoked && data.expiresAt > Date.now()) this.write(filename, { expiresAt: data.expiresAt, session: data });
      callback?.();
    } catch { callback?.(new Error('Session store unavailable')); }
  }
  destroy(id: string, callback?: (error?: unknown) => void) {
    try {
      const filename = this.filename(id);
      // Anonymous sessions need only their short lifetime, so public login
      // initialization cannot accumulate a month of logout tombstones.
      const expiresAt = Math.max(this.read(filename)?.expiresAt ?? 0, Date.now() + 15 * 60000);
      this.write(filename, { revoked: true, expiresAt });
      callback?.();
    } catch { callback?.(new Error('Session store unavailable')); }
  }
  touch(_id: string, _data: session.SessionData, callback?: () => void) { callback?.(); }
  private sweep() {
    if (Date.now() < this.nextSweep) return;
    for (const name of fs.readdirSync(this.directory)) {
      if (!/^[a-f0-9]{64}\.json$/.test(name)) continue;
      const filename = path.join(this.directory, name);
      const record = this.read(filename);
      if (record && record.expiresAt <= Date.now()) fs.unlinkSync(filename);
    }
    this.nextSweep = Date.now() + 15 * 60000;
  }
}
