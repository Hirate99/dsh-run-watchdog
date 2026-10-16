import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decide } from '../src/decision';

test('action is independent of interval probabilities and does not sum attention mass', () => {
  assert.deepEqual(
    decide(
      {
        choice: 'continue',
        checkAfterSeconds: 120,
        probabilities: { continue: 0.5, notify_agent: 0.3, stop: 0.2 },
      },
      30,
    ),
    { kind: 'wait', seconds: 120 },
  );
  assert.deepEqual(decide({ choice: 'notify_agent', checkAfterSeconds: 10 }, 30), {
    kind: 'notify',
  });
  assert.deepEqual(decide({ choice: 'uncertain', checkAfterSeconds: 60 }, 30), {
    kind: 'wait',
    seconds: 60,
  });
});
test('stop requires a stop choice, separate probability threshold and authorization', () => {
  assert.deepEqual(decide({ choice: 'stop', probabilities: { stop: 0.85 } }, 30, true), {
    kind: 'stop',
  });
  for (const [verdict, authorized] of [
    [{ choice: 'stop', probabilities: { stop: 0.3 } }, true],
    [{ choice: 'stop', probabilities: { stop: 0.85 } }, false],
    [{ choice: 'stop' }, true],
  ] as const)
    assert.deepEqual(decide(verdict, 30, authorized), { kind: 'notify' });
  assert.deepEqual(
    decide({ choice: 'continue', probabilities: { stop: 0.9 } }, 30, true),
    { kind: 'wait', seconds: 30 },
  );
});
