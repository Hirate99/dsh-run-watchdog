import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendOutput, emptyOutput, outputEvidence, resetEvidence } from '../src/output';
import { beginCheck, initialState, planTick, scheduleNext } from '../src/monitor-state';

test('output evidence is independent of chunk boundaries and leaves prior state intact', () => {
  const initial = emptyOutput();
  Object.freeze(initial.lines);
  Object.freeze(initial);
  const chunks = ['loss=', '1\nloss=1', '\nloss=', '2\npartial'];
  const split = chunks.reduce((state, text) => appendOutput(state, { text, lossy: false }), initial);
  const whole = appendOutput(initial, { text: chunks.join(''), lossy: false });
  assert.deepEqual(split, whole);
  assert.deepEqual(initial, emptyOutput());
  assert.deepEqual(outputEvidence(split).mostRepeated, { line: 'loss=1', count: 2 });
});

test('a new check clears its evidence window but preserves an unfinished line', () => {
  const first = appendOutput(emptyOutput(), { text: 'done\npart', lossy: false });
  const next = appendOutput(resetEvidence(first), { text: 'ial\n', lossy: false });
  assert.equal(outputEvidence(first).newLines, 1);
  assert.equal(outputEvidence(next).newLines, 1);
  assert.deepEqual(outputEvidence(next).mostRepeated, { line: 'partial', count: 1 });
  assert.equal(next.text, 'done\npartial\n');
});

test('scheduling respects exact check, handoff and background expiry boundaries', () => {
  const task = { purpose: 'Train', command: 'train' };
  const opts = { maxWaitMs: 500, recordAfterMs: 100 };
  const initial = initialState(1000, 100);
  assert.equal(planTick(initial, task, opts, undefined, 1099).check, false);
  assert.equal(planTick(initial, task, opts, undefined, 1100).check, true);
  const check = beginCheck(initial, task, 1100);
  const scheduled = scheduleNext(check.state, { kind: 'wait', seconds: 60 }, check.fallback, 'check_60s', 1200);
  assert.equal(initial.checks, 0);
  assert.equal(scheduled.checks, 1);
  assert.equal(scheduled.nextCheck, 61200);
  assert.equal(planTick(scheduled, task, opts, undefined, 1499).handoff, undefined);
  assert.equal(planTick(scheduled, task, opts, undefined, 1500).handoff, 'still-running');
  assert.equal(planTick(scheduled, task, opts, 1500, 1599).end, false);
  assert.equal(planTick(scheduled, task, opts, 1500, 1600).end, true);
  assert.equal(planTick(scheduled, task, opts, 1500, 1600).handoff, undefined);
});
