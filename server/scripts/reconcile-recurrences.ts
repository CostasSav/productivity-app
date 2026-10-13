import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { diagnose } from './diagnose-recurrences';
import { JsonStore } from '../src/db/jsonStore';

// Operator-only, offline utility. No environment loading, startup or network imports.
type RecordValue = Record<string, unknown>;
type Snapshot = RecordValue & { tasks: RecordValue[] };
type Decision = boolean | 'unresolved';
export interface Plan {
  version: 1;
  snapshotSHA256: string;
  operatorApproved: boolean;
  tasks: { id: number; status: unknown; recurrence: unknown; recurrence_day: unknown;
    recurrence_time: unknown; deadline: unknown; recordSHA256: string; decision: Decision }[];
}
const hash = (v: string | Buffer) => createHash('sha256').update(v).digest('hex');
function validate(v: unknown): asserts v is Snapshot {
  const report = diagnose(v);
  if (report.categories.F || report.categories.G) throw new Error('INVALID_RECORDS');
}
function localPath(filename: string, exists: boolean) {
  if (!path.isAbsolute(filename) || /^[\\/]{2}/.test(filename)) throw new Error('EXPLICIT_LOCAL_PATH_REQUIRED');
  // Reject links in ancestors as well as the final component; output directories must exist.
  let current = exists ? filename : path.dirname(filename);
  for (;;) {
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink()) throw new Error('LINK_REFUSED');
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  if (exists && !fs.lstatSync(filename).isFile()) throw new Error('REGULAR_FILE_REQUIRED');
}
function read(filename: string) {
  localPath(filename, true);
  const bytes = fs.readFileSync(filename);
  const data: unknown = JSON.parse(bytes.toString('utf8'));
  validate(data);
  return { bytes, data };
}
export function createPlan(filename: string): Plan {
  const { bytes, data } = read(filename);
  return { version: 1, snapshotSHA256: hash(bytes), operatorApproved: false,
    tasks: data.tasks.filter(t => t.status !== 'done' && t.recurrence && t.deadline &&
      !Object.prototype.hasOwnProperty.call(t, 'recurrenceIssued')).map(t => ({
      id: t.id as number, status: t.status, recurrence: t.recurrence,
      recurrence_day: t.recurrence_day ?? null, recurrence_time: t.recurrence_time ?? null,
      deadline: t.deadline, recordSHA256: hash(JSON.stringify(t)), decision: 'unresolved' })) };
}
function syncDirectory(filename: string) {
  if (process.platform === 'win32') return;
  const fd = fs.openSync(path.dirname(filename), 'r');
  try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}
function exclusiveFile(filename: string, bytes: string | Buffer) {
  localPath(filename, false);
  const fd = fs.openSync(filename, 'wx', 0o600);
  try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  syncDirectory(filename);
}
export function writePlan(snapshot: string, output: string) {
  const plan = createPlan(snapshot);
  exclusiveFile(output, JSON.stringify(plan, null, 2) + '\n');
  return { affected: plan.tasks.length, approved: 0 };
}
export interface ApplyOptions { apply?: boolean; writerStopped?: boolean; backup?: string; audit?: string }
export function reconcile(filename: string, decisions: string, options: ApplyOptions = {}, io: typeof fs = fs) {
  localPath(decisions, true);
  const plan: Plan = JSON.parse(fs.readFileSync(decisions, 'utf8'));
  const expected = createPlan(filename);
  if (plan.version !== 1 || plan.snapshotSHA256 !== expected.snapshotSHA256 || !Array.isArray(plan.tasks) ||
      typeof plan.operatorApproved !== 'boolean' || plan.tasks.length !== expected.tasks.length) throw new Error('STALE_OR_INVALID_PLAN');
  const seen = new Set<number>();
  for (const entry of plan.tasks) {
    const original = expected.tasks.find(t => t.id === entry?.id);
    if (!original || seen.has(entry.id) || ![true, false, 'unresolved'].includes(entry.decision)) throw new Error('INVALID_DECISION');
    seen.add(entry.id);
    const { decision: ignored, ...metadata } = entry;
    const { decision: unused, ...current } = original;
    // Compare every approved precondition, without relying on field ordering in an edited plan.
    if (Object.keys(metadata).length !== Object.keys(current).length ||
        Object.entries(current).some(([k, v]) => metadata[k as keyof typeof metadata] !== v)) throw new Error('STALE_RECORD');
  }
  const approved = plan.tasks.filter(t => t.decision !== 'unresolved');
  const summary = { affected: expected.tasks.length, proposedChanges: approved.length,
    unresolved: plan.tasks.length - approved.length, operatorApproved: plan.operatorApproved, applied: false };
  if (!options.apply) return summary;
  if (!plan.operatorApproved || !options.writerStopped || !options.backup || !options.audit) throw new Error('APPROVAL_AND_OFFLINE_BACKUP_REQUIRED');
  const paths = [filename, decisions, options.backup, options.audit].map(p => path.resolve(p));
  if (new Set(paths.map(p => process.platform === 'win32' ? p.toLowerCase() : p)).size !== paths.length) throw new Error('PATH_COLLISION');
  if (!approved.length) return summary;
  const { bytes, data } = read(filename);
  if (hash(bytes) !== plan.snapshotSHA256) throw new Error('STALE_SNAPSHOT');
  for (const entry of approved) data.tasks.find(t => t.id === entry.id)!.recurrenceIssued = entry.decision;
  const resultHash = hash(JSON.stringify(data, null, 2));
  exclusiveFile(options.backup, bytes);
  if (hash(fs.readFileSync(options.backup)) !== plan.snapshotSHA256) throw new Error('BACKUP_VERIFICATION_FAILED');
  // Persist intent before replacement: even an interrupted operation has an exact private audit.
  exclusiveFile(options.audit, JSON.stringify({ state: 'prepared', beforeSHA256: plan.snapshotSHA256,
    expectedAfterSHA256: resultHash, approved: approved.map(t => ({ id: t.id, recurrenceIssued: t.decision })) }) + '\n');
  const guardedIO = { ...io, renameSync: ((from: fs.PathLike, to: fs.PathLike) => {
    if (hash(read(filename).bytes) !== plan.snapshotSHA256) throw new Error('STALE_SNAPSHOT');
    io.renameSync(from, to);
  }) as typeof fs.renameSync };
  // Existing same-directory temporary file, fsync, atomic rename and no initialization fallback.
  new JsonStore<Snapshot>(filename, validate, guardedIO).write(data);
  if (hash(read(filename).bytes) !== resultHash) throw new Error('RESULT_VERIFICATION_FAILED');
  const fd = fs.openSync(options.audit, 'a');
  try { fs.writeFileSync(fd, JSON.stringify({ state: 'verified', afterSHA256: resultHash,
    changedIds: approved.map(t => t.id) }) + '\n'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  return { ...summary, applied: true };
}
export function main(args: string[]): number {
  try {
    const [mode, snapshot, ...flags] = args;
    if (!snapshot || !['plan', 'apply'].includes(mode)) throw new Error('USAGE');
    const values = new Map<string, string>();
    const switches = new Set<string>();
    for (let i = 0; i < flags.length; i++) {
      const flag = flags[i];
      if (values.has(flag) || switches.has(flag)) throw new Error('USAGE');
      if (['--apply', '--writer-stopped', '--details'].includes(flag)) switches.add(flag);
      else if (['--out', '--decisions', '--backup', '--audit'].includes(flag) && flags[i + 1] && !flags[i + 1].startsWith('--')) values.set(flag, flags[++i]);
      else throw new Error('USAGE');
    }
    if (mode === 'plan') {
      if (!values.has('--out') || values.size !== 1 || switches.has('--apply') || switches.has('--writer-stopped')) throw new Error('USAGE');
      const result = writePlan(snapshot, values.get('--out')!);
      console.log(JSON.stringify({ ...result, ...(switches.has('--details') ? { tasks: createPlan(snapshot).tasks } : {}) }, null, 2));
    } else {
      if (!values.has('--decisions') || values.has('--out')) throw new Error('USAGE');
      const result = reconcile(snapshot, values.get('--decisions')!, { apply: switches.has('--apply'),
        writerStopped: switches.has('--writer-stopped'), backup: values.get('--backup'), audit: values.get('--audit') });
      console.log(JSON.stringify({ ...result, ...(switches.has('--details') ? { tasks: JSON.parse(fs.readFileSync(values.get('--decisions')!, 'utf8')).tasks } : {}) }, null, 2));
    }
    return 0;
  } catch {
    console.error('Reconciliation refused or failed. Check explicit local paths, input validity, plan fingerprints and approval/offline flags. If applying was requested, inspect the backup, audit and current fingerprint before retrying: replacement may already have occurred. No automatic rollback.');
    return 1;
  }
}
if (require.main === module) process.exitCode = main(process.argv.slice(2));
