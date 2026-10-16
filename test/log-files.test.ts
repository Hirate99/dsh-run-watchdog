import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { logFiles } from '../src/log-files';
import { appendOutput, emptyOutput, outputEvidence } from '../src/output';

test('file cursors handle missing files, utf8 splits, truncation and rotation', () => {
  const root = mkdtempSync(join(tmpdir(), 'watchdog-logs-'));
  const file = join(root, 'train.log');
  try {
    const read = logFiles([file]);
    assert.match(read().errors[0]!, /ENOENT/);
    const bytes = Buffer.from('训练完成\n');
    writeFileSync(file, bytes.subarray(0, 2));
    assert.equal(read().text, '');
    appendFileSync(file, bytes.subarray(2));
    assert.match(read().text, /训练完成/);
    assert.equal(read().text, '');
    writeFileSync(file, 'x');
    assert.match(read().text, /x$/);
    renameSync(file, join(root, 'old.log'));
    writeFileSync(file, 'new log\n');
    const rotated = read();
    assert.match(rotated.text, /new log/);
    assert.equal(rotated.lossy, true);
    writeFileSync(file, 'x'.repeat(2_000_000) + 'final evidence\n');
    const large = read();
    assert.ok(large.text.length < 65_000);
    assert.equal(large.lossy, true);
    assert.match(large.text, /final evidence/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('multi-megabyte unbroken output stays bounded and exposes incomplete evidence', () => {
  let state = emptyOutput();
  for (let i = 0; i < 8; i++)
    state = appendOutput(state, { text: 'x'.repeat(256_000), lossy: false });
  state = appendOutput(state, { text: '\nfinal result\n', lossy: false });
  assert.ok(state.text.length <= 16_000);
  assert.ok(state.tail.length <= 16_000);
  assert.ok(outputEvidence(state).mostRepeated!.line.length <= 16_000);
  assert.equal(outputEvidence(state).lossy, true);
  assert.match(state.text, /final result/);
});

test('source labels do not appear as repeated task output', () => {
  const text = Array.from(
    { length: 7 },
    (_, i) => `[log file: train.log]\nstep ${i}\n`,
  ).join('');
  const state = appendOutput(emptyOutput(), { text, lossy: false });
  assert.equal(outputEvidence(state).mostRepeated?.count, 1);
});
