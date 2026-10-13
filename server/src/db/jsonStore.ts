import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

export class DatabaseError extends Error {
  constructor(public readonly code: string, message: string) {
    super(`Database ${code}: ${message}`);
    this.name = 'DatabaseError';
  }
}

type FileSystem = Pick<typeof fs, 'lstatSync' | 'readFileSync' | 'openSync' | 'writeFileSync' | 'fsyncSync' | 'closeSync' | 'renameSync' | 'unlinkSync' | 'linkSync'>;
function ioError(error: unknown, operation: string): DatabaseError {
  const code = (error as NodeJS.ErrnoException)?.code;
  if (code === 'ENOENT') return new DatabaseError('MISSING', `${operation} failed: required file or directory is absent. Restore the volume/file or explicitly initialize a new database.`);
  if (code === 'EACCES' || code === 'EPERM') return new DatabaseError('PERMISSION', `${operation} denied. Check filesystem permissions.`);
  if (code === 'EEXIST') return new DatabaseError('EXISTS', 'Initialization refused: destination already exists.');
  return new DatabaseError('IO', `${operation} failed. Check storage availability and filesystem health.`);
}

/** Synchronous single-writer persistence. Never falls back to an empty database. */
export class JsonStore<T> {
  constructor(private filename: string, private validate: (value: unknown) => asserts value is T,
    private io: FileSystem = fs, private platform: NodeJS.Platform = process.platform) {}

  read(): T {
    let text: string;
    try {
      if (!this.io.lstatSync(this.filename).isFile()) throw new DatabaseError('FORMAT', 'Expected a regular database file, not a directory or symbolic link.');
      text = this.io.readFileSync(this.filename, 'utf8');
    } catch (error) { throw error instanceof DatabaseError ? error : ioError(error, 'read'); }
    let value: unknown;
    try { value = JSON.parse(text); }
    catch { throw new DatabaseError('CORRUPT', 'Invalid, empty or truncated JSON. Original file preserved; restore a verified backup.'); }
    this.validate(value);
    return value;
  }

  write(value: T): void { this.persist(value, false); }
  initialize(value: T): void { this.persist(value, true); }

  private persist(value: T, initialize: boolean) {
    // Serialize before touching disk. Never expose JSON contents or raw errors.
    let serialized: string;
    try {
      serialized = JSON.stringify(value, null, 2);
      if (typeof serialized !== 'string') throw new Error();
      this.validate(JSON.parse(serialized));
    } catch { throw new DatabaseError('SERIALIZE', 'Could not serialize a valid database. Original file preserved.'); }
    let mode = 0o600;
    if (initialize) {
      try {
        this.io.lstatSync(this.filename);
        throw new DatabaseError('EXISTS', 'Initialization refused: destination already exists.');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error instanceof DatabaseError ? error : ioError(error, 'initialization');
      }
    } else {
      // A missing/corrupt destination is never recreated by an ordinary save.
      this.read();
      try { mode = this.io.lstatSync(this.filename).mode & 0o777; }
      catch (error) { throw ioError(error, 'stat'); }
    }
    const temporary = path.join(path.dirname(this.filename), `.db-${randomUUID()}.tmp`);
    let fd: number | undefined;
    let created = false;
    let committed = false;
    let failure: unknown;
    try {
      fd = this.io.openSync(temporary, 'wx', mode);
      created = true;
      this.io.writeFileSync(fd, serialized, 'utf8');
      this.io.fsyncSync(fd);
      this.io.closeSync(fd);
      fd = undefined;
      if (initialize) {
        // Atomic no-clobber publication: a concurrent creator is never replaced.
        this.io.linkSync(temporary, this.filename);
      } else {
        // Same-directory rename; never unlink the original as a fallback.
        this.io.renameSync(temporary, this.filename);
      }
      committed = true;
      if (initialize) this.io.unlinkSync(temporary);
      created = false;
      // Windows does not support opening/fsyncing directories this way.
      if (this.platform !== 'win32') {
        const directory = this.io.openSync(path.dirname(this.filename), 'r');
        try { this.io.fsyncSync(directory); } finally { this.io.closeSync(directory); }
      }
    } catch (error) { failure = error; }
    finally {
      if (fd !== undefined) {
        try { this.io.closeSync(fd); } catch (error) { failure ??= error; }
      }
      if (created) {
        try { this.io.unlinkSync(temporary); }
        catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
            failure = new DatabaseError(committed ? 'COMMIT_UNCERTAIN' : 'CLEANUP', 'Temporary file cleanup failed. Inspect storage before retrying; do not promote temporary files automatically.');
          }
        }
      }
    }
    if (failure) {
      if (committed) throw new DatabaseError('COMMIT_UNCERTAIN', 'Replacement completed but final synchronization/cleanup failed. The write may already be visible; inspect before retrying.');
      throw failure instanceof DatabaseError ? failure : ioError(failure, 'write');
    }
  }
}
