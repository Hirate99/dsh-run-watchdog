import { test } from 'node:test';
import assert from 'node:assert/strict';
import { choices, decide, type Snapshot } from '../src/decision.js';

export const state: Snapshot = { task: { purpose: 'Collect all test failures', command: 'npm test', autoStop: true }, elapsedSeconds: 10, recentOutput: '', newLines: 0, outputChanged: false, mostRepeated: null, lossy: false, ready: false };

test('argmax stop is not sufficient; threshold is independent of confidence', () => {
  assert.deepEqual(decide({ provider: 'jev', choice: 'stop', probabilities: { stop: 0.3 }, confidence: 0.9 }, state, 30), { kind: 'notify' });
  assert.deepEqual(decide({ provider: 'jev', choice: 'stop', probabilities: { stop: 0.85 }, confidence: 0.4 }, state, 30), { kind: 'stop' });
  assert.deepEqual(decide({ provider: 'jev', choice: 'stop', probabilities: { stop: 0.85 }, confidence: 0.9 }, { ...state, task: { ...state.task, autoStop: false } }, 30), { kind: 'notify' });
});
test('DeepSeek cannot auto-stop; service detach needs a ready marker', () => {
  assert.deepEqual(decide({ provider: 'deepseek', choice: 'stop' }, state, 30), { kind: 'notify' });
  assert.equal('no_more_checks' in choices(state), false);
  const service = { ...state, task: { ...state.task, service: true }, ready: true };
  assert.equal('no_more_checks' in choices(service), true);
  assert.deepEqual(decide({ provider: 'deepseek', choice: 'no_more_checks' }, service, 30), { kind: 'detach' });
});
test('long interval and uncertainty mapping', () => {
  assert.deepEqual(decide({ provider: 'deepseek', choice: 'check_600s' }, state, 30), { kind: 'wait', seconds: 600 });
  assert.deepEqual(decide({ provider: 'jev', choice: 'check_10s', probabilities: {}, confidence: 0.2 }, state, 60), { kind: 'wait', seconds: 60 });
});
