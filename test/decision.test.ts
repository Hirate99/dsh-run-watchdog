import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decide } from '../src/decision';

// Distributions recorded from jev-latest on real local processes (.integration/live-cases-jev.json).
const progress = { check_10s: 0.52, check_30s: 0.27, check_60s: 0.12, check_120s: 0.05, check_300s: 0.02, check_600s: 0.02, notify_agent: 0, stop: 0, uncertain: 0 };
const retry401 = { check_10s: 0.37, check_30s: 0.08, check_60s: 0.04, check_120s: 0.01, check_300s: 0.01, check_600s: 0, notify_agent: 0.32, stop: 0.16, uncertain: 0.01 };

test('recorded Jev cases: progress keeps going, a hopeless retry hands back control', () => {
  assert.deepEqual(decide({ choice: 'check_10s', probabilities: progress }, 30), { kind: 'wait', seconds: 10 });
  // check_10s is the argmax, but stop + notify carry 0.48 of the mass.
  assert.deepEqual(decide({ choice: 'check_10s', probabilities: retry401 }, 30), { kind: 'notify' });
  // A notify that wins with only 0.38 is still a notify; the old confidence gate dropped it.
  assert.deepEqual(decide({ choice: 'notify_agent', probabilities: { ...retry401, check_10s: 0.31, notify_agent: 0.38, stop: 0.14 } }, 30), { kind: 'notify' });
});

test('only a calibrated stop probability may stop, and only when auto-stop is allowed', () => {
  assert.deepEqual(decide({ choice: 'stop', probabilities: { stop: 0.3, check_10s: 0.25, check_30s: 0.25, uncertain: 0.2 } }, 30, true), { kind: 'notify' });
  assert.deepEqual(decide({ choice: 'stop', probabilities: { stop: 0.85 } }, 30, true), { kind: 'stop' });
  assert.deepEqual(decide({ choice: 'stop', probabilities: { stop: 0.85 } }, 30, false), { kind: 'notify' });
  assert.deepEqual(decide({ choice: 'stop' }, 30, true), { kind: 'notify' }); // DeepSeek has no probabilities
});

test('split continue mass is weighed as a group against uncertainty', () => {
  const spread = { check_10s: 0.15, check_60s: 0.25, check_120s: 0.2, uncertain: 0.3, notify_agent: 0.1 };
  assert.deepEqual(decide({ choice: 'uncertain', probabilities: spread }, 30), { kind: 'wait', seconds: 60 });
  assert.deepEqual(decide({ choice: 'uncertain', probabilities: { uncertain: 0.7, check_30s: 0.3 } }, 120), { kind: 'wait', seconds: 120 });
});

test('DeepSeek choices map directly', () => {
  assert.deepEqual(decide({ choice: 'check_600s' }, 30), { kind: 'wait', seconds: 600 });
  assert.deepEqual(decide({ choice: 'uncertain' }, 60), { kind: 'wait', seconds: 60 });
  assert.deepEqual(decide({ choice: 'notify_agent' }, 60), { kind: 'notify' });
});
