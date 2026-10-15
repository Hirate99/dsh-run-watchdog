import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Context } from '@deepseek-ai/cordis';
import Tools, { defineTool } from '@deepseek-ai/dsh-tools';
import Prompt from '@deepseek-ai/dsh-system-prompt';
import Jobs from '@deepseek-ai/dsh-jobs-local';
import { ToolCallId } from '@deepseek-ai/dsh-llm';
import * as plugin from '../src/index.js';

for (const shell of ['bash', 'pwsh']) test(`mounted plugin: nested ${shell} policy applies; purpose validated; finished job returned`, async () => {
  const ctx = new Context();
  const prompt = ctx.plugin(Prompt); await prompt;
  const tools = ctx.plugin(Tools); await tools;
  const jobs = ctx.plugin(Jobs); await jobs;
  const controller = ctx.jobs.attachController('test');
  let starts = 0;
  ctx.tools.register(defineTool({
    name: shell, description: 'test job producer',
    parameters: { command: { type: 'string', required: true }, run_in_background: { type: 'boolean' } },
    output: { schema: { type: 'object', additionalProperties: false, properties: { jobId: { type: 'string', required: true } } }, render: (_args, value) => [{ type: 'text', text: value.jobId }] },
    async execute() {
      starts++;
      const jobId = ctx.jobs.start({ kind: 'bash', label: 'test', run(handle) {
        handle.append('done\n');
        return { cancel() {}, done: Promise.resolve({ status: 'completed', detail: 'exit code: 0' }) };
      } });
      return { jobId };
    },
  }));
  process.env.WATCHDOG_TEST_KEY = 'unused-fixture-key';
  const watchdog = ctx.plugin(plugin, { apiKeyEnv: 'WATCHDOG_TEST_KEY' }); await watchdog;
  const run = (args: unknown) => ctx.tools.execute({ name: 'watch_run', callId: ToolCallId('fixture'), arguments: args, signal: new AbortController().signal });
  try {
    assert.equal((await run({ command: 'fixture' })).isError, true);
    const guard = ctx.tools.guard(exec => exec.name === shell ? 'fixture policy denial' : undefined);
    assert.equal((await run({ purpose: 'test', command: 'fixture' })).isError, true);
    assert.equal(starts, 0);
    guard();
    const result = await run({ purpose: 'test', command: 'fixture' });
    assert.equal(result.isError, false, JSON.stringify(result));
    if (!result.isError) {
      assert.match(JSON.stringify(result.value), /finished/);
      assert.match(JSON.stringify(result.value), /exit code: 0/);
    }
    assert.equal(starts, 1);
  } finally {
    delete process.env.WATCHDOG_TEST_KEY;
    await watchdog.dispose(); controller(); await jobs.dispose(); await tools.dispose(); await prompt.dispose();
  }
});
