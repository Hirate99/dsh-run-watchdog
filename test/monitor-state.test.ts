import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendOutput, emptyOutput, outputEvidence, resetEvidence } from '../src/output';
import { beginCheck, initialState } from '../src/monitor-state';

test('output evidence is independent of chunk boundaries and leaves prior state intact', () => {
  const initial = emptyOutput();
  Object.freeze(initial.lines);
  Object.freeze(initial);
  const chunks = ['loss=', '1\nloss=1', '\nloss=', '2\npartial'];
  const split = chunks.reduce(
    (state, text) => appendOutput(state, { text, lossy: false }),
    initial,
  );
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

test('check snapshots preserve evidence and use failure count for fallback', () => {
  const state = initialState(1000, 100);
  const check = beginCheck(state, { purpose: 'Train', command: 'train' }, 1100);
  assert.equal(state.checks, 0);
  assert.equal(check.state.checks, 1);
  assert.equal(check.fallback, 30);
});
