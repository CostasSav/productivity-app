import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { runCheck } from '../scripts/check-calendar-feed';

// Synthetic fixtures and placeholder URLs only; the real script is never given a real URL.
const SECRET = 'SYNTHETIC-SECRET-TOKEN';
const outlookUrl = `https://outlook.office365.com/owa/calendar/${SECRET}/synthetic/calendar.ics`;
const fixture = (name: string) => readFileSync(path.join(__dirname, 'fixtures/calendar', name), 'utf8');
const script = path.join(__dirname, '../scripts/check-calendar-feed.ts');

async function check(args: string[], options: { now: string; body?: string; status?: number; url?: string; throws?: boolean }) {
  const lines: string[] = [];
  const fetchCalls: string[] = [];
  let prompted = false;
  const fetchImpl = (async (input: string | URL | Request) => {
    fetchCalls.push(String(input));
    if (options.throws) throw new TypeError(`fetch failed for ${String(input)}`);
    return new Response(options.body ?? '', { status: options.status ?? 200 });
  }) as typeof fetch;
  const code = await runCheck({ args, now: new Date(options.now), fetchImpl, out: line => lines.push(line),
    readUrl: async () => { prompted = true; return options.url ?? outlookUrl; } });
  const output = lines.join('\n');
  assert.ok(!output.includes(SECRET) && !output.includes('office365.com/owa'), 'URL never printed');
  return { code, output, lines, prompted, fetchCalls };
}

test('Outlook fixture: grouped by Paris day, recurring marker, cancelled excluded, DST kept at 09:00', async () => {
  const r = await check(['--from', '2026-03-23', '--to', '2026-03-30'], { now: '2026-03-20T10:00:00Z', body: fixture('outlook.ics') });
  assert.equal(r.code, 0);
  assert.deepEqual(r.fetchCalls, [outlookUrl]);
  assert.equal(r.output, [
    'Events from 2026-03-23 to 2026-03-30 (Europe/Paris). rec = occurrence of a recurring series.',
    '', 'Mon 23 Mar 2026', '  09:00–09:30        rec  Synthetic weekly sync',
    '', 'Thu 26 Mar 2026', '  15:00–15:30             Busy',
    '', 'Mon 30 Mar 2026', '  09:00–09:30        rec  Synthetic weekly sync',
    '', 'Total: 3 events on 3 days (0 all-day, 2 recurring).', 'Feed status: ok',
  ].join('\n'));
  const moved = await check(['--from', '2026-04-06', '--to', '2026-04-13'], { now: '2026-03-20T10:00:00Z', body: fixture('outlook.ics') });
  assert.match(moved.output, /Tue 7 Apr 2026\n {2}14:00–14:30 {8}rec {2}Synthetic weekly sync \(moved\)/);
  assert.doesNotMatch(moved.output, /Mon 6 Apr|Mon 13 Apr/);
});

test('Google fixture: all-day on each covered day, autumn DST, 40-char titles, defaults to today + 7', async () => {
  const r = await check(['--from', '2026-10-19', '--to', '2026-10-30'], { now: '2026-10-15T10:00:00Z', body: fixture('google.ics') });
  assert.equal(r.code, 0);
  assert.match(r.output, /Tue 20 Oct 2026\n {2}all day {12} {5}Synthetic two-day holiday/);
  assert.match(r.output, /Wed 21 Oct 2026\n {2}all day/);
  assert.match(r.output, /Thu 22 Oct 2026\n {2}18:00–19:00 {8}rec {2}Synthetic evening class/);
  assert.match(r.output, /Thu 29 Oct 2026\n {2}18:00–19:00 {8}rec/);
  assert.match(r.output, /Total: 3 events on 4 days \(1 all-day, 2 recurring\)\./);

  const long = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:long@example.invalid\r\nDTSTAMP:20261001T000000Z\r\n'
    + 'DTSTART:20261016T220000Z\r\nDTEND:20261017T000000Z\r\nSUMMARY:An extremely long synthetic meeting title that keeps going\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n';
  const d = await check([], { now: '2026-10-15T10:00:00Z', body: long });
  assert.match(d.output, /^Events from 2026-10-15 to 2026-10-22 /);
  assert.match(d.output, /Sat 17 Oct 2026\n {2}00:00–02:00 {13}An extremely long synthetic meeting tit…\n/);
});

test('invalid URL, failed fetch and parse errors print only codes', async () => {
  for (const url of ['https://attacker.example/feed.ics', `webcal://outlook.office365.com/owa/calendar/${SECRET}/x.ics`, '']) {
    const r = await check([], { now: '2026-10-15T10:00:00Z', url });
    assert.equal(r.code, 1);
    assert.deepEqual(r.fetchCalls, []);
    assert.ok(!r.output.includes('attacker.example'));
  }
  assert.match((await check([], { now: '2026-10-15T10:00:00Z', url: 'https://attacker.example/x' })).lines[0], /\(invalid_url\)/);
  assert.equal((await check([], { now: '2026-10-15T10:00:00Z', status: 404 })).output, 'Feed status: http_error');
  assert.equal((await check([], { now: '2026-10-15T10:00:00Z', throws: true })).output, 'Feed status: http_error');
  assert.equal((await check([], { now: '2026-10-15T10:00:00Z', body: '<html>login</html>' })).output, 'Feed status: parse_error');
});

test('arguments: only --from/--to, valid dates inside the sync window; checked before prompting', async () => {
  for (const args of [[outlookUrl], ['--url', outlookUrl], ['--from'], ['--from', '2026-02-30'], ['--from', '2026-10-20', '--to', '2026-10-19'],
    ['--from', '2026-09-01'], ['--to', '2027-02-01'], ['--from', '2026-10-15', '--from', '2026-10-16']]) {
    const r = await check(args, { now: '2026-10-15T10:00:00Z' });
    assert.equal(r.code, 2, args.join(' '));
    assert.equal(r.prompted, false);
    assert.deepEqual(r.fetchCalls, []);
  }
  assert.equal((await check(['--from', '2026-10-01', '--to', '2027-01-13'], { now: '2026-10-15T10:00:00Z', body: fixture('google.ics') })).code, 0, 'exact window edges');
});

test('script refuses non-interactive input, ignores env vars and writes nothing', () => {
  const before = readdirSync(path.join(__dirname, '..')).sort();
  const piped = spawnSync(process.execPath, ['--import', 'tsx', script], {
    input: `${outlookUrl}\n`, encoding: 'utf8', timeout: 20000,
    env: { ...process.env, CALENDAR_FEEDS: JSON.stringify([{ id: 'x', label: 'X', color: '#000000', url: outlookUrl }]), CALENDAR_FEED_URL: outlookUrl },
  });
  assert.equal(piped.status, 1);
  assert.match(piped.stderr, /interactive terminal/);
  assert.ok(!`${piped.stdout}${piped.stderr}`.includes(SECRET));
  const withArg = spawnSync(process.execPath, ['--import', 'tsx', script, outlookUrl], { encoding: 'utf8', timeout: 20000 });
  assert.equal(withArg.status, 2);
  assert.ok(!`${withArg.stdout}${withArg.stderr}`.includes(SECRET));
  assert.deepEqual(readdirSync(path.join(__dirname, '..')).sort(), before);

  const source = readFileSync(script, 'utf8') + readFileSync(path.join(__dirname, '../scripts/hiddenInput.ts'), 'utf8');
  assert.doesNotMatch(source, /writeFile|appendFile|createWriteStream|mkdir|process\.env|readFileSync|dotenv/);
});
