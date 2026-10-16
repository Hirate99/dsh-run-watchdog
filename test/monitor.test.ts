import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import {
  watch,
  type MonitorEvent,
  type RunningJob,
  type WatchOptions,
} from '../src/monitor';
import type { Verdict } from '../src/decision';

function fixture() {
  let running = true;
  const done = Promise.withResolvers<void>();
  const finish = () => {
    running = false;
    done.resolve();
  };
  let stops = 0;
  const job: RunningJob = {
    done: done.promise,
    running: () => running,
    read: () => ({ text: 'processed batch\n', lossy: false }),
    stop: () => {
      stops++;
      finish();
    },
  };
  return { job, finish, stops: () => stops };
}
const defaultOptions = {
  mode: 'enforce' as const,
  firstCheckMs: 1,
  judgeTimeoutMs: 100,
  stopThreshold: 0.8,
  tickMs: 2,
};

test('continuous monitoring: notify, suppress duplicate, recover, notify again; model schedules every check', async (t) => {
  const f = fixture();
  let now = 1000;
  t.mock.method(Date, 'now', () => now);
  const choices: Verdict['choice'][] = [
    'notify_agent',
    'notify_agent',
    'continue',
    'notify_agent',
  ];
  const events: MonitorEvent[] = [];
  const w = watch(
    f.job,
    { purpose: 'Process batches', command: 'batch' },
    {
      ...defaultOptions,
      judge: {
        decide: async () => ({ choice: choices.shift()!, checkAfterSeconds: 10 }),
      },
      notify: (e) => events.push(e),
      record: () => {
        now += 10_001;
        if (!choices.length) f.finish();
      },
    },
    new AbortController().signal,
  );
  now += 2;
  await w.ended;
  assert.equal(w.snapshot().checks, 4);
  assert.equal(events.filter((e) => e.kind === 'attention').length, 2);
  assert.equal(
    events[0]?.monitoring.nextCheckAt,
    events[0]!.monitoring.lastCheckAt! + 10_000,
  );
  assert.equal(w.snapshot().status, 'finished');
  assert.equal(f.stops(), 0);
});

test('judge failures notify even in shadow mode, stay queryable and recover', async (t) => {
  const f = fixture();
  let now = 1000;
  t.mock.method(Date, 'now', () => now);
  let calls = 0;
  const events: MonitorEvent[] = [];
  const w = watch(
    f.job,
    { purpose: 'Process', command: 'batch' },
    {
      ...defaultOptions,
      mode: 'shadow',
      judge: {
        decide: async () => {
          if (++calls < 4) throw new Error('HTTP 503');
          return { choice: 'continue', checkAfterSeconds: 60 };
        },
      },
      notify: (e) => events.push(e),
      record: () => {
        now += 601_000;
        if (calls === 4) f.finish();
      },
    },
    new AbortController().signal,
  );
  now += 2;
  await w.ended;
  assert.deepEqual(
    events.map((e) => e.kind),
    ['monitor-degraded', 'monitor-recovered'],
  );
  assert.equal(events[0]?.monitoring.consecutiveFailures, 2);
  assert.equal(w.snapshot().consecutiveFailures, 0);
});

test('unreadable output is distinct from quiet output and never authorizes stop', async () => {
  const f = fixture();
  f.job.read = () => ({ text: '', lossy: false, errors: ['log: ENOENT'] });
  const events: MonitorEvent[] = [];
  const w = watch(
    f.job,
    { purpose: 'Process', command: 'batch', autoStop: true },
    {
      ...defaultOptions,
      judge: { decide: async () => ({ choice: 'stop', probabilities: { stop: 0.99 } }) },
      notify: (e) => events.push(e),
      record: () => {
        setTimeout(f.finish, 5);
      },
    },
    new AbortController().signal,
  );
  await w.ended;
  assert.equal(f.stops(), 0);
  assert.equal(events[0]?.kind, 'monitor-degraded');
  assert.deepEqual(w.snapshot().sourceErrors, ['log: ENOENT']);
});

test('completion cancels in-flight judgment; unload leaves the job running', async () => {
  const f = fixture();
  const w = watch(
    f.job,
    { purpose: 'Process', command: 'batch', autoStop: true },
    {
      ...defaultOptions,
      judge: {
        decide: async (_input, _opts, signal) => {
          f.finish();
          await delay(1000, undefined, { signal });
          return { choice: 'stop' };
        },
      },
      notify: () => assert.fail('stale notification'),
    },
    new AbortController().signal,
  );
  await w.ended;
  assert.equal(w.snapshot().status, 'finished');
  const other = fixture();
  const unload = new AbortController();
  const pending = watch(
    other.job,
    { purpose: 'Process', command: 'batch' },
    {
      ...defaultOptions,
      judge: { decide: async () => ({ choice: 'continue' }) },
    },
    unload.signal,
  );
  unload.abort();
  await pending.ended;
  assert.equal(other.job.running(), true);
  assert.equal(pending.snapshot().status, 'detached');
  other.finish();
});

test('a broken observation loop reports loss of monitoring', async () => {
  const f = fixture();
  f.job.read = () => {
    throw new Error('job output unavailable');
  };
  const events: MonitorEvent[] = [];
  const w = watch(
    f.job,
    { purpose: 'Process', command: 'batch' },
    {
      ...defaultOptions,
      judge: { decide: async () => ({ choice: 'continue' }) },
      notify: (e) => events.push(e),
    },
    new AbortController().signal,
  );
  await w.ended;
  assert.equal(events[0]?.kind, 'monitor-failed');
  assert.equal(w.snapshot().status, 'failed');
  f.finish();
});
