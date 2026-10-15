import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { watch, type CheckRecord, type RunningJob, type WatchOptions } from '../src/monitor';
import type { Judge, Task, Verdict } from '../src/decision';

/** A job whose reads return the queued chunks one per call. */
function fixture(...chunks: string[]) {
  let running = true;
  let stops = 0;
  const { promise: done, resolve } = Promise.withResolvers<void>();
  const finish = () => { running = false; resolve(); };
  const job: RunningJob = { done, running: () => running, read: () => ({ text: chunks.shift() ?? '', lossy: false }), stop: () => { stops++; finish(); } };
  return { job, finish, stops: () => stops };
}
const always = (verdict: Verdict): Judge => ({ decide: async () => verdict });
const stopVerdict: Verdict = { choice: 'stop', probabilities: { stop: 0.9 } };
const never = new AbortController().signal;

function run(f: ReturnType<typeof fixture>, opts: Partial<WatchOptions> & { judge: Judge }, task: Partial<Task> = {}, caller = never, lifetime = never) {
  return watch(f.job, { purpose: 'Run complete tests', command: 'test', ...task }, {
    mode: 'enforce', firstCheckMs: 1, judgeTimeoutMs: 1_000, stopThreshold: 0.8, maxWaitMs: 60_000, recordAfterMs: 0, tickMs: 5, ...opts,
  }, caller, lifetime);
}

test('shadow returns at the wait limit and never acts', async () => {
  const f = fixture();
  const records: CheckRecord[] = [];
  const { handoff, ended } = run(f, { mode: 'shadow', judge: always(stopVerdict), maxWaitMs: 50, record: e => records.push(e) }, { autoStop: true });
  assert.equal((await handoff).status, 'still-running');
  await ended;
  assert.equal(records[0]?.action.kind, 'stop');
  assert.equal(f.stops(), 0);
});

test('a failing judge is bounded by the wait limit and reported', async () => {
  const f = fixture();
  const result = await run(f, { judge: { decide: async () => { throw new Error('HTTP 503'); } }, maxWaitMs: 50 }).handoff;
  assert.equal(result.status, 'still-running');
  assert.deepEqual([result.judgeFailures, result.checks], [1, 1]);
  f.finish();
});

test('a ready server returns at once and keeps running', async () => {
  const f = fixture('booting\n', 'Server ready on 3000\n');
  let calls = 0;
  const { handoff, ended } = run(f, { judge: { decide: async () => { calls++; return { choice: 'check_10s' }; } }, firstCheckMs: 10_000 }, { readyPattern: 'Server ready' });
  assert.equal((await handoff).status, 'ready');
  await ended;
  assert.equal(calls, 0);
  assert.equal(f.job.running(), true);
});

test('enforce: notify returns early without killing and carries line evidence', async () => {
  const f = fixture('Continue? [y/N]\n'.repeat(7));
  const records: CheckRecord[] = [];
  const result = await run(f, { judge: always({ choice: 'notify_agent' }), firstCheckMs: 20, record: e => records.push(e) }).handoff;
  assert.equal(result.status, 'notify');
  assert.equal(f.stops(), 0);
  assert.equal(records[0]?.state.mostRepeated?.count, 7);
  assert.deepEqual(records[0]?.baseline, ['repeated-line', 'possible-input-prompt']);
  f.finish();
});

test('enforce: a stop above threshold cancels an auto-stoppable job', async () => {
  const f = fixture('HTTP 401\n');
  assert.equal((await run(f, { judge: always(stopVerdict) }, { autoStop: true }).handoff).status, 'stop-requested');
  assert.equal(f.stops(), 1);
});

test('lines split across reads are joined before counting', async () => {
  const f = fixture('HTTP 401: retr', 'ying\nHTTP 401: retrying\n');
  const records: CheckRecord[] = [];
  const { handoff } = run(f, { mode: 'shadow', judge: always({ choice: 'check_600s' }), firstCheckMs: 30, record: e => { records.push(e); f.finish(); } });
  assert.equal((await handoff).status, 'finished');
  assert.equal(records[0]?.state.newLines, 2);
  assert.deepEqual(records[0]?.state.mostRepeated, { line: 'HTTP 401: retrying', count: 2 });
});

test('checks after handoff are recorded but never executed', async () => {
  const f = fixture();
  const recorded = Promise.withResolvers<CheckRecord>();
  const { handoff, ended } = run(f, { judge: always(stopVerdict), maxWaitMs: 20, firstCheckMs: 80, recordAfterMs: 10_000, record: recorded.resolve }, { autoStop: true });
  assert.equal((await handoff).status, 'still-running');
  assert.equal((await recorded.promise).phase, 'background');
  assert.equal(f.stops(), 0);
  f.finish();
  await ended;
});

test('completion makes an in-flight verdict stale', async () => {
  const f = fixture();
  const records: CheckRecord[] = [];
  const judge: Judge = { decide: async (_state, _options, signal) => { f.finish(); await delay(60_000, undefined, { signal }); return stopVerdict; } };
  assert.equal((await run(f, { judge, record: e => records.push(e) }, { autoStop: true }).handoff).status, 'finished');
  assert.equal(records.length, 0);
  assert.equal(f.stops(), 0);
});

test('caller cancellation detaches without stopping the existing job', async () => {
  const before = fixture();
  const cancelled = new AbortController();
  const pending = run(before, { judge: always({ choice: 'check_600s' }) }, {}, cancelled.signal).handoff;
  cancelled.abort();
  await assert.rejects(pending);
  assert.equal(before.stops(), 0);

  const after = fixture();
  const caller = new AbortController();
  const { handoff, ended } = run(after, { judge: always({ choice: 'check_600s' }), maxWaitMs: 20, recordAfterMs: 10_000 }, {}, caller.signal);
  assert.equal((await handoff).status, 'still-running');
  caller.abort();
  await delay(20);
  assert.equal(after.stops(), 0);
  after.finish();
  await ended;
});

test('plugin unload detaches without stopping the job', async () => {
  const f = fixture();
  const unload = new AbortController();
  const { handoff } = run(f, { judge: always({ choice: 'check_600s' }) }, {}, never, unload.signal);
  setTimeout(() => unload.abort(), 20);
  assert.equal((await handoff).status, 'detached');
  assert.equal(f.stops(), 0);
  f.finish();
});

test('ready service keeps recording later failures without stopping it', async () => {
  const f = fixture('Server ready\n', 'Database connection lost\n');
  const recorded = Promise.withResolvers<CheckRecord>();
  const w = run(f, { judge: always(stopVerdict), firstCheckMs: 30, recordAfterMs: 1000,
    record: recorded.resolve }, { readyPattern: 'Server ready', autoStop: true });
  assert.equal((await w.handoff).status, 'ready');
  try {
    const event = await Promise.race([recorded.promise, delay(500).then(() => { throw new Error('background check missing'); })]);
    assert.equal(event.phase, 'background');
    assert.match(event.state.recentOutput, /Database connection lost/);
    assert.equal(f.stops(), 0);
  } finally { f.finish(); await w.ended; }
});

test('notify keeps recording after handoff but never executes a later stop', async t => {
  const f = fixture('Continue? [y/N]\n');
  const background = Promise.withResolvers<CheckRecord>();
  let calls = 0;
  const w = run(f, { judge: { decide: async () => ++calls === 1 ? { choice: 'notify_agent' } : stopVerdict },
    recordAfterMs: 60_000, record: e => { if (e.phase === 'background') background.resolve(e); } }, { autoStop: true });
  assert.equal((await w.handoff).status, 'notify');
  const later = Date.now() + 30_100;
  t.mock.method(Date, 'now', () => later);
  try {
    const event = await Promise.race([background.promise, delay(500).then(() => { throw new Error('background check missing'); })]);
    assert.equal(event.action.kind, 'stop');
    assert.equal(f.stops(), 0);
  } finally { f.finish(); await w.ended; }
});

test('multi-megabyte unbroken output retains bounded evidence and reports truncation', async () => {
  const f = fixture(...Array.from({ length: 8 }, () => 'x'.repeat(256_000)), '\nfinal result\n');
  const records: CheckRecord[] = [];
  const w = run(f, { judge: always({ choice: 'check_600s' }), firstCheckMs: 300,
    record: e => { records.push(e); f.finish(); } });
  const result = await w.handoff;
  await w.ended;
  assert.ok(result.output.length <= 16_000);
  assert.equal(result.outputTruncated, true);
  assert.match(result.output, /final result/);
  assert.ok(records[0]!.state.mostRepeated!.line.length <= 16_000);
  assert.equal(records[0]!.state.lossy, true);
  assert.equal(records[0]!.state.newLines, 2);
});
