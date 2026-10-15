import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { monitor, type CheckRecord, type RunningJob } from '../src/monitor.js';
import type { Judge } from '../src/decision.js';

function fixture(text = '') {
  let running = true;
  let stopCalls = 0;
  let finish!: () => void;
  const done = new Promise<void>(resolve => { finish = () => { running = false; resolve(); }; });
  const job: RunningJob = { done, running: () => running, read: () => { const value = text; text = ''; return { text: value, lossy: false }; }, stop: () => { stopCalls++; finish(); } };
  return { job, finish, stops: () => stopCalls };
}
const task = { purpose: 'Run complete tests', command: 'test' };

test('notification returns immediately without killing, with repetition evidence', async () => {
  const f = fixture('Continue? [y/N]\n'.repeat(7));
  const records: CheckRecord[] = [];
  const result = await monitor(f.job, task, { decide: async () => ({ provider: 'deepseek', choice: 'notify_agent' }) }, { mode: 'enforce', firstCheckMs: 1, record: e => records.push(e) });
  assert.equal(result.status, 'notify');
  assert.equal(f.stops(), 0);
  assert.equal(records[0]?.state.mostRepeated?.count, 7);
  assert.deepEqual(records[0]?.baseline, ['repeated-line', 'possible-input-prompt']);
  f.finish();
});
test('completion aborts an in-flight judge and prevents a stale stop', async () => {
  const f = fixture();
  let aborted = false;
  const judge: Judge = { decide: async (_state, _options, signal) => {
    f.finish();
    try { await delay(60_000, undefined, { signal }); } catch { aborted = true; throw new Error('aborted'); }
    return { provider: 'deepseek', choice: 'stop' };
  } };
  assert.equal((await monitor(f.job, task, judge, { firstCheckMs: 1, mode: 'enforce' })).status, 'finished');
  assert.equal(aborted, true);
  assert.equal(f.stops(), 0);
});
test('shadow records a stop but does not execute it or loop rapidly', async () => {
  const f = fixture();
  let calls = 0;
  const records: CheckRecord[] = [];
  const judge: Judge = { decide: async () => { calls++; setTimeout(f.finish, 15); return { provider: 'jev', choice: 'stop', confidence: 0.9, probabilities: { stop: 0.9 } }; } };
  await monitor(f.job, { ...task, autoStop: true }, judge, { firstCheckMs: 1, record: e => records.push(e) });
  assert.equal(records[0]?.action.kind, 'stop');
  assert.equal(f.stops(), 0);
  assert.equal(calls, 1);
});
test('provider failure falls back; normal completion cancels the long timer', async () => {
  const f = fixture();
  const records: CheckRecord[] = [];
  await monitor(f.job, task, { decide: async () => { setTimeout(f.finish, 10); throw new Error('offline'); } }, { firstCheckMs: 1, record: e => records.push(e) });
  assert.deepEqual(records[0]?.action, { kind: 'wait', seconds: 30 });
  assert.equal(records[0]?.error, 'offline');
});
test('caller cancellation stops its job', async () => {
  const f = fixture();
  const controller = new AbortController();
  const result = monitor(f.job, task, { decide: async () => ({ provider: 'deepseek', choice: 'uncertain' }) }, {}, controller.signal);
  controller.abort();
  await assert.rejects(result);
  assert.equal(f.stops(), 1);
});

test('ready service can turn off checks without stopping', async () => {
  const f = fixture('Server ready on port 3000');
  const result = await monitor(f.job, { ...task, service: true, readyPattern: 'Server ready' }, {
    decide: async (_state, options) => {
      assert.ok(options.no_more_checks);
      return { provider: 'deepseek', choice: 'no_more_checks' };
    },
  }, { firstCheckMs: 1, mode: 'enforce' });
  assert.equal(result.status, 'detached');
  assert.equal(f.job.running(), true);
  f.finish();
});

test('slow judge is aborted at its deadline and falls back', async () => {
  const f = fixture();
  let aborted = false;
  await monitor(f.job, task, { decide: async (_state, _options, signal) => {
    try { await delay(60_000, undefined, { signal }); } catch (error) { aborted = true; throw error; }
    return { provider: 'deepseek', choice: 'stop' };
  } }, { firstCheckMs: 1, judgeTimeoutMs: 5, record: event => {
    assert.deepEqual(event.action, { kind: 'wait', seconds: 30 });
    f.finish();
  } });
  assert.equal(aborted, true);
  assert.equal(f.stops(), 0);
});
