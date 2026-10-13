import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { DatabaseError, JsonStore } from '../src/db/jsonStore';

type Sample = { records: { title: string }[] };
function validate(value: unknown): asserts value is Sample {
  if (!value || typeof value !== 'object' || !Array.isArray((value as Sample).records)) throw new DatabaseError('FORMAT', 'Invalid synthetic structure');
}
const original: Sample = { records: [{ title: 'Synthetic original' }] };
const updated: Sample = { records: [{ title: 'Synthetic updated' }] };
function fault(code = 'EIO') { return Object.assign(new Error('sensitive-content-must-not-leak'), { code }); }
function fixture(t: TestContext) {
  const directory = fs.mkdtempSync(path.join(tmpdir(), 'workspace-db-tests-'));
  const filename = path.join(directory, 'db.json');
  t.after(() => {
    assert.equal(path.dirname(directory), path.resolve(tmpdir()));
    assert.ok(path.basename(directory).startsWith('workspace-db-tests-'));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const store = (overrides: Partial<typeof fs> = {}, platform: NodeJS.Platform = process.platform) => new JsonStore<Sample>(filename, validate, { ...fs, ...overrides }, platform);
  const seed = () => fs.writeFileSync(filename, JSON.stringify(original));
  const unchanged = () => {
    assert.equal(fs.readFileSync(filename, 'utf8'), JSON.stringify(original));
    assert.deepEqual(fs.readdirSync(directory), ['db.json']);
  };
  return { directory, filename, store, seed, unchanged };
}
function fails(fn: () => unknown, code: string) {
  assert.throws(fn, (error: unknown) => error instanceof DatabaseError && error.code === code && !error.message.includes('sensitive-content'));
}

test('missing database is never implicitly initialized; explicit initialization is exclusive', t => {
  const f = fixture(t);
  fails(() => f.store().read(), 'MISSING');
  fails(() => f.store().write(updated), 'MISSING');
  assert.deepEqual(fs.readdirSync(f.directory), []);
  f.store().initialize(original);
  assert.deepEqual(f.store().read(), original);
  fails(() => f.store().initialize(updated), 'EXISTS');
  assert.deepEqual(f.store().read(), original);
});

test('valid database survives atomic write and reload', t => {
  const f = fixture(t); f.seed();
  assert.deepEqual(f.store().read(), original);
  f.store().write(updated);
  assert.deepEqual(f.store().read(), updated);
  assert.deepEqual(fs.readdirSync(f.directory), ['db.json']);
});

for (const [label, content] of [['invalid', '{sensitive-content'], ['empty', ''], ['truncated', '{"records":['], ['wrong structure', '{}']]) {
  test(`${label} database remains byte-for-byte unchanged`, t => {
    const f = fixture(t); fs.writeFileSync(f.filename, content);
    const code = label === 'wrong structure' ? 'FORMAT' : 'CORRUPT';
    fails(() => f.store().read(), code);
    fails(() => f.store().write(updated), code);
    fails(() => f.store().initialize(updated), 'EXISTS');
    assert.equal(fs.readFileSync(f.filename, 'utf8'), content);
    assert.deepEqual(fs.readdirSync(f.directory), ['db.json']);
  });
}

test('unreadable database and read I/O failure are distinct and preserve original', t => {
  const f = fixture(t); f.seed();
  for (const [systemCode, code] of [['EACCES', 'PERMISSION'], ['EPERM', 'PERMISSION'], ['EIO', 'IO']]) {
    const store = f.store({ readFileSync: (() => { throw fault(systemCode); }) as typeof fs.readFileSync });
    fails(() => store.read(), code);
    fails(() => store.write(updated), code);
    f.unchanged();
  }
});

test('directory at database path is rejected without modification', t => {
  const f = fixture(t); fs.mkdirSync(f.filename);
  fails(() => f.store().read(), 'FORMAT');
  assert.ok(fs.statSync(f.filename).isDirectory());
});

test('write permission failure leaves original intact', t => {
  const f = fixture(t); f.seed();
  fails(() => f.store({ openSync: (() => { throw fault('EACCES'); }) as typeof fs.openSync }).write(updated), 'PERMISSION');
  f.unchanged();
});

test('serialization failure occurs before any filesystem mutation', t => {
  const f = fixture(t); f.seed();
  const cyclic: any = { records: [] }; cyclic.self = cyclic;
  fails(() => f.store().write(cyclic), 'SERIALIZE');
  fails(() => f.store().write({ records: [], toJSON() { throw fault(); } } as Sample), 'SERIALIZE');
  f.unchanged();
});

test('partial temporary write is removed and never published', t => {
  const f = fixture(t); f.seed();
  fails(() => f.store({ writeFileSync: ((fd: number) => { fs.writeSync(fd, '{partial'); throw fault('ENOSPC'); }) as typeof fs.writeFileSync }).write(updated), 'IO');
  f.unchanged();
});

test('file fsync failure and close failure preserve original and clean temporary files', t => {
  const f = fixture(t); f.seed();
  fails(() => f.store({ fsyncSync: () => { throw fault(); } }).write(updated), 'IO');
  f.unchanged();
  let first = true;
  fails(() => f.store({ closeSync: fd => { if (first) { first = false; throw fault(); } fs.closeSync(fd); } }).write(updated), 'IO');
  f.unchanged();
});

test('failed replacement never deletes the old database', t => {
  const f = fixture(t); f.seed();
  fails(() => f.store({ renameSync: () => { throw fault('EPERM'); } }).write(updated), 'PERMISSION');
  f.unchanged();
});

test('cleanup failure is reported without exposing raw errors', t => {
  const f = fixture(t); f.seed();
  fails(() => f.store({ renameSync: () => { throw fault(); }, unlinkSync: () => { throw fault('EPERM'); } }).write(updated), 'CLEANUP');
  assert.equal(fs.readFileSync(f.filename, 'utf8'), JSON.stringify(original));
  assert.equal(fs.readdirSync(f.directory).filter(name => name.endsWith('.tmp')).length, 1);
});

test('directory fsync failure reports uncertain commit and leaves complete new JSON', t => {
  const f = fixture(t); f.seed();
  const sentinel = 987654;
  const store = f.store({
    openSync: ((name: fs.PathLike, flags: string, mode?: number) => name === f.directory ? sentinel : fs.openSync(name, flags, mode)) as typeof fs.openSync,
    fsyncSync: fd => { if (fd === sentinel) throw fault(); fs.fsyncSync(fd); },
    closeSync: fd => { if (fd !== sentinel) fs.closeSync(fd); },
  }, 'linux');
  fails(() => store.write(updated), 'COMMIT_UNCERTAIN');
  assert.deepEqual(f.store().read(), updated);
});

test('initialization race cannot overwrite another creator', t => {
  const f = fixture(t);
  fails(() => f.store({ linkSync: (source, destination) => { f.seed(); fs.linkSync(source, destination); } }).initialize(updated), 'EXISTS');
  f.unchanged();
});

test('explicit initialization fails if parent directory is absent', t => {
  const f = fixture(t);
  const store = new JsonStore<Sample>(path.join(f.directory, 'missing', 'db.json'), validate);
  fails(() => store.initialize(original), 'MISSING');
  assert.deepEqual(fs.readdirSync(f.directory), []);
});

test('stale crash temporary files are never treated as a database', t => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.directory, '.db-crash.tmp'), JSON.stringify(updated));
  fails(() => f.store().read(), 'MISSING');
  assert.equal(fs.readdirSync(f.directory).length, 1);
});

// Child processes import only the database module after DATA_DIR points to a
// newly created synthetic directory. Never import server/index.ts or dotenv.
function databaseChild(directory: string, script: string) {
  const modulePath = path.resolve(__dirname, '../src/db/database.ts');
  const result = spawnSync(process.execPath, ['--import', 'tsx', '-e', `const database = require(${JSON.stringify(modulePath)}); ${script}`], {
    env: { ...process.env, DATA_DIR: directory }, encoding: 'utf8', timeout: 20000,
  });
  assert.equal(result.status, 0, result.stderr);
}

test('startup migrations and pin cleanup stop on missing/corrupt/invalid data', t => {
  const f = fixture(t);
  for (const content of [undefined, '', '{truncated', 'null', '{}', '{"tasks":null,"notes":[],"_taskSeq":0,"_noteSeq":0}']) {
    if (content !== undefined) fs.writeFileSync(f.filename, content);
    databaseChild(f.directory, `
      for (const action of [database.prepareDatabase, database.flushMigrations, database.db.unpinStaleTasks]) {
        let rejected = false;
        try { action(); } catch (error) { rejected = ['MISSING', 'CORRUPT', 'FORMAT'].includes(error.code); }
        if (!rejected) throw new Error('Startup did not fail closed');
      }
    `);
    if (content === undefined) assert.equal(fs.existsSync(f.filename), false);
    else assert.equal(fs.readFileSync(f.filename, 'utf8'), content);
  }
});

test('explicit database initialization and legacy backfills preserve compatible records', t => {
  const f = fixture(t);
  databaseChild(f.directory, 'database.initializeDatabase(); database.prepareDatabase();');
  const data = JSON.parse(fs.readFileSync(f.filename, 'utf8'));
  data.tasks = [{ id: 1, title: 'Synthetic task', status: 'todo', created_at: '2026-01-01', pinnedToday: true, pinnedAt: '2020-01-01' }];
  data._taskSeq = 1;
  delete data.habits; delete data._habitSeq;
  data.syntheticExtension = { retained: true };
  fs.writeFileSync(f.filename, JSON.stringify(data));
  databaseChild(f.directory, 'database.prepareDatabase(); if(database.db.getTasks().length !== 1) throw new Error("Task lost");');
  const migrated = JSON.parse(fs.readFileSync(f.filename, 'utf8'));
  assert.equal(migrated.tasks[0].title, 'Synthetic task');
  assert.equal(migrated.tasks[0].pinnedToday, false);
  assert.deepEqual(migrated.tasks[0].subtasks, []);
  assert.deepEqual(migrated.habits, []);
  assert.deepEqual(migrated.syntheticExtension, { retained: true });
  assert.deepEqual(fs.readdirSync(f.directory), ['db.json']);
});

test('startup write failure prevents pin cleanup and preserves the original database', t => {
  const f = fixture(t);
  const content = JSON.stringify({ tasks: [], notes: [], _taskSeq: 0, _noteSeq: 0 });
  fs.writeFileSync(f.filename, content);
  databaseChild(f.directory, `
    const fs = require('node:fs');
    const rename = fs.renameSync;
    let pinsCalled = false, rejected = false;
    database.db.unpinStaleTasks = () => { pinsCalled = true; };
    fs.renameSync = () => { throw Object.assign(new Error('synthetic'), {code: 'EACCES'}); };
    try { database.prepareDatabase(); } catch (error) { rejected = error.code === 'PERMISSION'; }
    finally { fs.renameSync = rename; }
    if (!rejected || pinsCalled) throw new Error('Unsafe startup ordering');
  `);
  assert.equal(fs.readFileSync(f.filename, 'utf8'), content);
  assert.deepEqual(fs.readdirSync(f.directory), ['db.json']);
});

test('startup unreadable-file failure stops before any write or pin cleanup', t => {
  const f = fixture(t);
  const content = JSON.stringify({ tasks: [], notes: [], _taskSeq: 0, _noteSeq: 0 });
  fs.writeFileSync(f.filename, content);
  databaseChild(f.directory, `
    const fs = require('node:fs');
    const read = fs.readFileSync;
    let pinsCalled = false, rejected = false;
    database.db.unpinStaleTasks = () => { pinsCalled = true; };
    fs.readFileSync = () => { throw Object.assign(new Error('synthetic-private-content'), {code: 'EACCES'}); };
    try { database.prepareDatabase(); } catch (error) { rejected = error.code === 'PERMISSION' && !error.message.includes('synthetic-private'); }
    finally { fs.readFileSync = read; }
    if (!rejected || pinsCalled) throw new Error('Unsafe startup ordering');
  `);
  assert.equal(fs.readFileSync(f.filename, 'utf8'), content);
  assert.deepEqual(fs.readdirSync(f.directory), ['db.json']);
});

test('initialization CLI requires an explicit directory and refuses a second initialization', t => {
  const f = fixture(t);
  const script = path.resolve(__dirname, '../scripts/init-database.ts');
  const run = (args: string[]) => spawnSync(process.execPath, ['--import', 'tsx', script, ...args], {
    env: { ...process.env, DATA_DIR: f.directory }, encoding: 'utf8', timeout: 20000,
  });
  assert.equal(run([]).status, 1);
  assert.equal(run(['relative-directory']).status, 1);
  assert.equal(fs.existsSync(f.filename), false);
  const created = run([f.directory]);
  assert.equal(created.status, 0, created.stderr);
  const originalBytes = fs.readFileSync(f.filename);
  assert.equal(run([f.directory]).status, 1);
  assert.deepEqual(fs.readFileSync(f.filename), originalBytes);
  assert.deepEqual(fs.readdirSync(f.directory), ['db.json']);
});
