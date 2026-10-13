import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { createApiApp } from '../src/app';
import { hashPassword } from '../src/auth/password';
import { readWidgetConfig, readWidgetActionConfig } from '../src/widgets/config';
import { CompletionError } from '../src/db/completion';

const readToken = 'r'.repeat(43), actionToken = 'w'.repeat(43);
const digest = (token: string) => createHash('sha256').update(token).digest('hex');
const env = { WIDGET_READ_TOKEN_SHA256: digest(readToken), WIDGET_READ_TOKEN_EXPIRES_AT: '2030-01-01T00:00:00Z',
  WIDGET_ACTION_TOKEN_SHA256: digest(actionToken), WIDGET_ACTION_TOKEN_EXPIRES_AT: '2030-01-01T00:00:00Z', WIDGET_TIME_ZONE: 'Europe/Paris' };
const instant = new Date('2026-10-13T12:00:00Z');
function directory(t: TestContext) {
  const dir = fs.mkdtempSync(path.join(tmpdir(), 'workspace-actions-tests-'));
  t.after(() => {
    assert.equal(path.dirname(dir), path.resolve(tmpdir()));
    assert.ok(path.basename(dir).startsWith('workspace-actions-tests-'));
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return dir;
}
// Separate child imports only database.ts after DATA_DIR points at generated synthetic data.
function databaseCase(t: TestContext, body: string) {
  const dir = directory(t);
  const file = path.join(dir, 'db.json');
  fs.writeFileSync(file, JSON.stringify({ tasks: [], notes: [], _taskSeq: 0, _noteSeq: 0 }));
  const source = `const assert=require('node:assert/strict'); const fs=require('node:fs');
    const file=${JSON.stringify(file)}; const {db}=require(${JSON.stringify(path.resolve(__dirname, '../src/db/database.ts'))});
    const fresh=()=>JSON.parse(fs.readFileSync(file,'utf8')); const seed=d=>fs.writeFileSync(file,JSON.stringify(d));
    const now=new Date('2026-10-13T12:00:00Z'); const zone='Europe/Paris';
    const task=(extra={})=>db.createTask({title:'synthetic',status:'todo',priority:'medium',deadline:'2026-10-13',recurrence:null,description:'keep',note_id:null,section_id:null,recurrence_day:null,recurrence_time:null,subtasks:[{id:1,title:'preserved',status:'done'}],pinnedToday:true,pinnedAt:null,...extra});
    const habit=(extra={})=>db.createHabit({name:'synthetic',description:null,sectionId:null,color:'#123456',icon:'star',frequency:'daily',targetDays:[],targetCount:null,...extra});
    const act=(kind,id,completed,date='2026-10-13',time=now)=>db.widgetCompletion(kind,id,date,completed,zone,time);
    const conflict=(fn,code)=>assert.throws(fn,e=>e.code===code);
    ${body}`;
  const result = spawnSync(process.execPath, [require.resolve('tsx/cli'), '-e', source],
    { env: { ...process.env, DATA_DIR: dir, WIDGET_TIME_ZONE: 'Europe/Paris' }, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
}

test('normal task complete/repeat/reopen, metadata preserved, optimistic check', t => databaseCase(t, `
  const a=task(); assert.equal(act('tasks',a.id,true).outcome,'applied');
  const bytes=fs.readFileSync(file,'utf8'); assert.equal(act('tasks',a.id,true).outcome,'already-applied');
  assert.equal(fs.readFileSync(file,'utf8'),bytes);
  assert.equal(act('tasks',a.id,false).completed,false); assert.equal(act('tasks',a.id,false).outcome,'already-applied');
  assert.deepEqual(db.getTask(a.id).subtasks,a.subtasks); assert.equal(db.getTask(a.id).description,'keep');
  conflict(()=>db.widgetCompletion('tasks',a.id,'2026-10-13',true,zone,now,'2000-01-01T00:00:00Z'),'STALE_TASK');
`));
test('recurring successor exactly once across browser/widget retries and reopen cycles', t => databaseCase(t, `
  const a=task({recurrence:'daily'});
  const first=db.updateTask(a.id,{status:'done'}); assert.ok(first.nextTask); assert.equal(first.nextTask.deadline,'2026-10-14');
  assert.deepEqual(first.nextTask.subtasks,a.subtasks);
  for(let i=0;i<8;i++) act('tasks',a.id,true);
  db.updateTask(a.id,{status:'todo'}); assert.equal(act('tasks',a.id,true).completed,true);
  assert.equal(db.getTasks().length,2); assert.equal(db.getTask(a.id).recurrenceIssued,true);
  db.deleteTask(first.nextTask.id); act('tasks',a.id,false); act('tasks',a.id,true); assert.equal(db.getTasks().length,1);
`));
test('ambiguous legacy recurring task conflicts; historical done uses conservative issued marker', t => databaseCase(t, `
  const a=task({recurrence:'weekly'}); let data=fresh(); delete data.tasks[0].recurrenceIssued; seed(data);
  const before=fs.readFileSync(file,'utf8'); conflict(()=>act('tasks',a.id,true),'AMBIGUOUS_RECURRENCE'); assert.equal(fs.readFileSync(file,'utf8'),before);
  data=fresh(); data.tasks[0].status='done'; seed(data);
  act('tasks',a.id,false); act('tasks',a.id,true); assert.equal(db.getTasks().length,1);
`));
test('task cohort, missing ID, invalid status/date, stale day and monthly recurrence', t => databaseCase(t, `
  conflict(()=>act('tasks',999,true),'TASK_UNAVAILABLE'); const a=task();
  conflict(()=>act('tasks',a.id,true,'2026-10-12'),'STALE_DAY'); conflict(()=>act('tasks',a.id,true,'2026-02-30'),'INVALID_DATE');
  for(const fields of [{deadline:'2026-10-14'},{deadline:null},{deadline:'bad'},{status:'invalid'}]) {
    const b=task(fields); conflict(()=>act('tasks',b.id,true),'TASK_NOT_ELIGIBLE');
  }
  // Preserve the existing month-end calculation (including its rollover behavior).
  const m=task({deadline:'2026-01-31',recurrence:'monthly'}); assert.equal(db.updateTask(m.id,{status:'done'}).nextTask.deadline,'2026-03-31');
`));
test('atomic write failure keeps completion and successor together; retry creates once', t => databaseCase(t, `
  const a=task({recurrence:'daily'}); const before=fs.readFileSync(file,'utf8'); const rename=fs.renameSync;
  fs.renameSync=()=>{throw Object.assign(new Error('synthetic'),{code:'EIO'})};
  try { conflict(()=>act('tasks',a.id,true),'IO'); } finally {fs.renameSync=rename;}
  assert.equal(fs.readFileSync(file,'utf8'),before); act('tasks',a.id,true); assert.equal(db.getTasks().length,2);
`));
test('habit complete/repeat/undo/repeat shared with browser logs', t => databaseCase(t, `
  const h=habit(); assert.equal(act('habits',h.id,true).outcome,'applied'); const before=fs.readFileSync(file,'utf8');
  assert.equal(act('habits',h.id,true).outcome,'already-applied'); assert.equal(fs.readFileSync(file,'utf8'),before);
  const same=db.createHabitLog({habitId:h.id,completedAt:'2026-10-13T12:00:00',note:null}); assert.equal(db.getHabitLogs().length,1);
  assert.equal(db.deleteHabitLog(same.id),true); assert.equal(act('habits',h.id,false).outcome,'already-applied');
`));
test('habit atomic write failure and retry preserve log count and metadata', t => databaseCase(t, `
  const h=habit(); const before=fs.readFileSync(file,'utf8'); const rename=fs.renameSync;
  fs.renameSync=()=>{throw Object.assign(new Error('synthetic'),{code:'EIO'})};
  try { conflict(()=>act('habits',h.id,true),'IO'); } finally { fs.renameSync=rename; }
  assert.equal(fs.readFileSync(file,'utf8'),before); act('habits',h.id,true); act('habits',h.id,true); assert.equal(db.getHabitLogs().length,1);
  conflict(()=>db.createHabitLog({habitId:h.id,completedAt:'2026-10-13T12:00:00',note:'new note'}),'EXISTING_LOG_METADATA');
`));
test('duplicate logs removed only on explicit undo; notes and unknown metadata conflict', t => databaseCase(t, `
  const h=habit(); act('habits',h.id,true); let d=fresh(); d.habitLogs.push({...d.habitLogs[0],id:2}); seed(d);
  act('habits',h.id,true); assert.equal(db.getHabitLogs().length,2); act('habits',h.id,false); assert.equal(db.getHabitLogs().length,0);
  for(const extra of [{note:'valuable'},{custom:'valuable'}]) {
    act('habits',h.id,true); d=fresh(); Object.assign(d.habitLogs[0],extra); seed(d);
    const before=fs.readFileSync(file,'utf8'); conflict(()=>act('habits',h.id,false),'ANNOTATED_LOG_CONFLICT'); assert.equal(fs.readFileSync(file,'utf8'),before);
    d=fresh(); d.habitLogs=[]; seed(d);
  }
`));
test('weekly schedules, weekly-count target completion/undo and invalid/archived habits', t => databaseCase(t, `
  const selected=habit({frequency:'weekly',targetDays:[2]}); act('habits',selected.id,true);
  for(const fields of [{frequency:'weekly',targetDays:[1]},{frequency:'weekly',targetDays:[]},{frequency:'weekly_count',targetCount:0}]) {
    const h=habit(fields); conflict(()=>act('habits',h.id,true),'HABIT_NOT_ELIGIBLE');
  }
  const weekly=habit({frequency:'weekly_count',targetCount:1}); act('habits',weekly.id,true); assert.equal(act('habits',weekly.id,true).outcome,'already-applied');
  act('habits',weekly.id,false); act('habits',weekly.id,true);
  conflict(()=>act('habits',weekly.id,true,'2026-10-14',new Date('2026-10-14T12:00:00Z')),'HABIT_NOT_ELIGIBLE');
  db.updateHabit(selected.id,{archivedAt:now.toISOString()}); conflict(()=>act('habits',selected.id,true),'HABIT_UNAVAILABLE');
  conflict(()=>act('habits',999,true),'HABIT_UNAVAILABLE');
`));
test('Paris midnight and repeated DST hour count once; malformed historical logs conflict', t => databaseCase(t, `
  const h=habit(); act('habits',h.id,true,'2026-10-25',new Date('2026-10-25T00:30:00Z'));
  assert.equal(act('habits',h.id,true,'2026-10-25',new Date('2026-10-25T01:30:00Z')).outcome,'already-applied');
  conflict(()=>act('habits',h.id,true,'2026-10-25',new Date('2026-10-25T23:00:00Z')),'STALE_DAY');
  act('habits',h.id,true,'2026-03-29',new Date('2026-03-28T23:00:00Z'));
  assert.equal(act('habits',h.id,true,'2026-03-29',new Date('2026-03-29T01:30:00Z')).outcome,'already-applied');
  let d=fresh(); d.habitLogs.push({id:99,habitId:h.id,completedAt:'bad',note:null}); seed(d);
  conflict(()=>act('habits',h.id,true),'AMBIGUOUS_HABIT_LOGS');
`));
test('parallel queued task/habit operations use fresh state and persist one successor/log', t => databaseCase(t, `
  const a=task({recurrence:'daily'}),h=habit();
  Promise.all(Array.from({length:20},()=>Promise.resolve().then(()=>{act('tasks',a.id,true);act('habits',h.id,true)}))).then(()=>{
    assert.equal(db.getTasks().length,2); assert.equal(db.getHabitLogs().length,1);
  });
`));
test('simultaneous HTTP actions and actual browser routes share atomic completion state', t => databaseCase(t, `
  (async()=>{
    const root=${JSON.stringify(path.resolve(__dirname, '../src'))};
    const {createApiApp}=require(root+'/app.ts'); const {hashPassword}=require(root+'/auth/password.ts');
    const {createHash}=require('node:crypto'); const token='w'.repeat(43);
    const app=createApiApp({passwordHash:await hashPassword('synthetic'),sessionSecret:'ab'.repeat(32),sessionDir:require('node:path').join(require('node:path').dirname(file),'sessions'),secure:true,origins:['https://workspace.test'],trustProxy:1,sessionTtlMs:86400000,legacyExpiresAt:0},
      {config:null,actionConfig:{digest:createHash('sha256').update(token).digest('hex'),expiresAt:Date.parse('2030-01-01'),timeZone:zone},now:()=>now,read:()=>db.getWidgetData(),complete:(...args)=>db.widgetCompletion(...args)});
    app.use('/api/tasks',require(root+'/routes/tasks.ts').default); app.use('/api/habit-logs',require(root+'/routes/habitLogs.ts').default);
    const server=app.listen(0,'127.0.0.1'); await require('node:events').once(server,'listening');
    try {
      const base='http://127.0.0.1:'+server.address().port; const a=task({recurrence:'daily'}),h=habit();
      const request=(url,method,body,headers={})=>fetch(base+url,{method,headers:{'Content-Type':'application/json','X-Forwarded-Proto':'https',...headers},body:body===undefined?undefined:JSON.stringify(body)});
      const responses=await Promise.all(Array.from({length:10},()=>[
        request('/api/widgets/tasks/'+a.id+'/completion','PATCH',{date:'2026-10-13',completed:true},{Authorization:'Bearer '+token}),
        request('/api/widgets/habits/'+h.id+'/completion','PUT',{date:'2026-10-13',completed:true},{Authorization:'Bearer '+token})]).flat());
      for(const r of responses) assert.equal(r.status,200);
      assert.equal(db.getTasks().length,2); assert.equal(db.getHabitLogs().length,1);
      const session=await request('/api/auth/session','GET'); const csrf=(await session.json()).csrfToken;
      const login=await request('/api/auth/login','POST',{password:'synthetic'},{Cookie:session.headers.get('set-cookie').split(';')[0],Origin:'https://workspace.test','X-CSRF-Token':csrf});
      const headers={Cookie:login.headers.get('set-cookie').split(';')[0],Origin:'https://workspace.test','X-CSRF-Token':(await login.json()).csrfToken};
      const reopened=await request('/api/tasks/'+a.id,'PUT',{status:'todo'},headers); assert.equal(reopened.status,200); assert.equal((await reopened.json()).task.status,'todo');
      const redone=await request('/api/tasks/'+a.id,'PUT',{status:'done'},headers); assert.equal(redone.status,200); assert.equal((await redone.json()).nextTask,null);
      const logged=await request('/api/habit-logs','POST',{habitId:h.id,completedAt:'2026-10-13T12:00:00'},headers); assert.equal(logged.status,201); const entry=await logged.json();
      assert.equal(db.getHabitLogs().length,1);
      const removed=await request('/api/habit-logs/'+entry.id,'DELETE',undefined,headers); assert.equal(removed.status,204); assert.equal(db.getHabitLogs().length,0);
    } finally {server.closeAllConnections(); await new Promise(r=>server.close(r));}
  })().catch(e=>{console.error(e);process.exitCode=1});
`));

async function fixture(t: TestContext, overrides: Partial<typeof env> = {}, fail = false) {
  const dir = directory(t); let calls = 0;
  const app = createApiApp({ passwordHash: await hashPassword('synthetic'), sessionSecret: 'ab'.repeat(32), sessionDir: dir,
    sessionTtlMs: 86400000, secure: true, origins: ['https://workspace.test'], trustProxy: 1, legacyExpiresAt: 0 },
  { config: readWidgetConfig(env), actionConfig: readWidgetActionConfig({ ...env, ...overrides }), now: () => instant,
    read: () => ({ tasks: [], habits: [], habitLogs: [] }), complete: (_kind, id, date, completed) => {
      calls++; if (fail) throw new CompletionError(409, 'STALE_DAY'); return { id, date, completed, outcome: 'applied' };
    } });
  for (const p of ['tasks', 'habits', 'notes', 'ai', 'settings']) app.use('/api/' + p, (_req, res) => res.json({ private: true }));
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(r => server.close(() => r())); });
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const call = (url = '/api/widgets/tasks/1/completion', token: string | null = actionToken, method = 'PATCH', body: unknown = { date: '2026-10-13', completed: true }, secure = true) =>
    fetch(base + url, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(secure ? { 'X-Forwarded-Proto': 'https' } : {}) },
      body: method === 'GET' ? undefined : typeof body === 'string' ? body : JSON.stringify(body) });
  return { call, calls: () => calls };
}
test('action bearer scope, HTTPS, no-store and read/browser separation', async t => {
  const f = await fixture(t);
  const ok = await f.call(); assert.equal(ok.status, 200); assert.equal(ok.headers.get('cache-control'), 'no-store'); assert.equal(ok.headers.get('set-cookie'), null);
  assert.equal((await f.call('/api/widgets/habits/1/completion', actionToken, 'PUT')).status, 200);
  for (const token of [null, 'bad', 'z'.repeat(43)]) assert.equal((await f.call(undefined, token)).status, 401);
  assert.equal((await f.call(undefined, readToken)).status, 403);
  assert.equal((await f.call(undefined, actionToken, 'PATCH', undefined, false)).status, 403);
  assert.equal((await f.call('/api/widgets/today', actionToken, 'GET')).status, 401);
  assert.equal((await f.call('/api/widgets/today', readToken, 'GET')).status, 200);
  for (const p of ['tasks', 'habits', 'notes', 'ai', 'settings']) assert.equal((await f.call('/api/' + p, actionToken, 'GET')).status, 401);
  assert.equal(f.calls(), 2);
});
test('action config absent/expired/malformed/shared digest disables writes only', async t => {
  for (const overrides of [{ WIDGET_ACTION_TOKEN_SHA256: '' }, { WIDGET_ACTION_TOKEN_SHA256: 'bad' },
    { WIDGET_ACTION_TOKEN_EXPIRES_AT: instant.toISOString() }, { WIDGET_ACTION_TOKEN_EXPIRES_AT: 'bad' },
    { WIDGET_ACTION_TOKEN_SHA256: env.WIDGET_READ_TOKEN_SHA256 }]) {
    const f = await fixture(t, overrides);
    assert.equal((await f.call()).status, 401);
    assert.equal((await f.call('/api/widgets/today', readToken, 'GET')).status, 200);
    assert.equal((await f.call('/api/auth/session', null, 'GET')).status, 200);
  }
});
test('strict IDs, payloads, JSON, methods and conflict errors', async t => {
  const f = await fixture(t);
  for (const id of ['0', '-1', '1.0', '01', '1e2', '9007199254740992']) assert.equal((await f.call('/api/widgets/tasks/' + id + '/completion')).status, 400);
  for (const body of [{}, { date: '2026-02-30', completed: true }, { date: '2026-10-13', completed: 'true' },
    { date: '2026-10-13', completed: true, title: 'forbidden' }, [], '{broken']) assert.equal((await f.call(undefined, actionToken, 'PATCH', body)).status, 400);
  assert.equal((await f.call(undefined, actionToken, 'POST')).status, 403); assert.equal(f.calls(), 0);
  const conflict = await fixture(t, {}, true); assert.equal((await conflict.call()).status, 409);
});
test('action rate limit is independent from read and auth budgets', async t => {
  const f = await fixture(t);
  for (let i = 0; i < 30; i++) assert.equal((await f.call(undefined, null)).status, 401);
  assert.equal((await f.call()).status, 429);
  assert.equal((await f.call('/api/widgets/today', readToken, 'GET')).status, 200);
  assert.equal((await f.call('/api/auth/session', null, 'GET')).status, 200);
});
