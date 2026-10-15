import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { Context } from '@deepseek-ai/cordis';
import Jobs from '@deepseek-ai/dsh-jobs-local';
import { observeJob } from '../src/index.js';
import { monitor } from '../src/monitor.js';

test('real DSH job + real child: observer preserves agent cursor and stops owned process', { timeout: 10_000 }, async () => {
  const ctx = new Context();
  const fiber = ctx.plugin(Jobs);
  await fiber;
  const detach = ctx.jobs.attachController('watchdog-test');
  let child: ReturnType<typeof spawn> | undefined;
  try {
    let ready!: () => void;
    const outputReady = new Promise<void>(r => { ready = r; });
    const id = ctx.jobs.start({ kind: 'bash', label: 'fixture', run(handle) {
      child = spawn(process.execPath, ['-e', "console.log('authentication failed'); setInterval(()=>{},1000)"], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
      child.stdout!.on('data', data => { handle.append(data.toString()); ready(); });
      return { cancel() { child!.kill(); }, done: new Promise(resolve => { child!.once('close', code => resolve({ status: code === 0 ? 'completed' : 'killed' })); child!.once('error', () => resolve({ status: 'failed' })); }) };
    } });
    const observer = observeJob(ctx.jobs, id);
    try {
      await outputReady;
      const result = await monitor(observer, { purpose: 'Download', command: 'fixture', autoStop: true }, { decide: async () => ({ provider: 'jev', choice: 'stop', probabilities: { stop: 0.9 }, confidence: 0.9 }) }, { firstCheckMs: 1, mode: 'enforce' });
      assert.equal(result.status, 'stop-requested');
      await observer.done;
      assert.equal(ctx.jobs.get(id).status, 'killed');
      assert.match(ctx.jobs.read(id).chunks.map(c => c.text).join(''), /authentication failed/);
      assert.equal(ctx.jobs.read(id).chunks.length, 0);
    } finally { observer.dispose(); }
  } finally { child?.kill(); detach(); await fiber.dispose(); }
});
