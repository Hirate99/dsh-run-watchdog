import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Context } from '@deepseek-ai/cordis';
import Tools, { defineTool } from '@deepseek-ai/dsh-tools';
import Prompt from '@deepseek-ai/dsh-system-prompt';
import Jobs from '@deepseek-ai/dsh-jobs-local';
import { ToolCallId } from '@deepseek-ai/dsh-llm';
import * as plugin from '../src/index';
import Credentials from '@deepseek-ai/dsh-credentials-local';
import { credentialRef } from '@deepseek-ai/dsh-credentials';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

for (const shell of ['bash', 'pwsh'])
  test(`mounted plugin: attach to existing ${shell} job without starting another process`, async () => {
    const ctx = new Context();
    const prompt = ctx.plugin(Prompt);
    await prompt;
    const tools = ctx.plugin(Tools);
    await tools;
    const jobs = ctx.plugin(Jobs);
    await jobs;
    const controller = ctx.jobs.attachController('test');
    let starts = 0;
    ctx.tools.register(
      defineTool({
        name: shell,
        description: 'test job producer',
        parameters: {
          command: { type: 'string', required: true },
          run_in_background: { type: 'boolean' },
        },
        output: {
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: { jobId: { type: 'string', required: true } },
          },
          render: (_args, value) => [{ type: 'text', text: value.jobId }],
        },
        async execute(args) {
          starts++;
          const jobId = ctx.jobs.start({
            kind: 'bash',
            label: 'test',
            run(handle) {
              if (args.command === 'forever') {
                const { promise, resolve } = Promise.withResolvers<{
                  status: 'killed';
                }>();
                return {
                  cancel() {
                    resolve({ status: 'killed' });
                  },
                  done: promise,
                };
              }
              handle.append('done\n');
              return {
                cancel() {},
                done: Promise.resolve({ status: 'completed', detail: 'exit code: 0' }),
              };
            },
          });
          return { jobId };
        },
      }),
    );
    const home = mkdtempSync(join(tmpdir(), 'watchdog-credentials-'));
    const credentials = ctx.plugin(Credentials, { dshHome: home, watch: false });
    await credentials;
    if (shell === 'bash') process.env.WATCHDOG_TEST_KEY = 'unused-fixture-key';
    else
      await ctx.credentials.set(
        credentialRef('WATCHDOG_TEST_KEY'),
        'unused-ui-saved-key',
      );
    const watchdog = ctx.plugin(plugin, { apiKeyEnv: 'WATCHDOG_TEST_KEY' });
    await watchdog;
    const run = (args: unknown) =>
      ctx.tools.execute({
        name: 'watch_job',
        callId: ToolCallId('fixture'),
        arguments: args,
        signal: new AbortController().signal,
      });
    try {
      assert.equal(ctx.tools.get('watch_run'), undefined);
      assert.equal((await run({ jobId: 'missing' })).isError, true);
      assert.equal((await run({ purpose: 'test', jobId: 'missing' })).isError, true);
      assert.equal(starts, 0);
      const start = (command: string) =>
        ctx.tools.execute({
          name: shell,
          callId: ToolCallId('start'),
          arguments: { command, run_in_background: true },
          signal: new AbortController().signal,
        });
      const started = await start('fixture');
      assert.equal(started.isError, false);
      const id = (started.value as { jobId: string }).jobId;
      const guard = ctx.tools.guard((exec) =>
        exec.name === shell ? 'no more shell execution' : undefined,
      );
      const result = await run({ purpose: 'test', jobId: id });
      guard();
      assert.equal(result.isError, false, JSON.stringify(result));
      if (!result.isError) {
        assert.match(JSON.stringify(result.value), /finished/);
        assert.match(JSON.stringify(result.value), /exit code: 0/);
      }
      assert.equal(starts, 1);
      // Attachment returns while the job is still running.
      const running = await start('forever');
      const long = await run({
        purpose: 'test',
        jobId: (running.value as { jobId: string }).jobId,
      });
      assert.equal(long.isError, false, JSON.stringify(long));
      if (!long.isError) {
        const value = long.value as { status: string; jobId: string; jobStatus: string };
        assert.deepEqual([value.status, value.jobStatus], ['monitoring', 'running']);
        ctx.jobs.kill(value.jobId as never);
      }
    } finally {
      delete process.env.WATCHDOG_TEST_KEY;
      await watchdog.dispose();
      controller();
      await jobs.dispose();
      await tools.dispose();
      await prompt.dispose();
      await credentials.dispose();
      rmSync(home, { recursive: true, force: true });
    }
  });
