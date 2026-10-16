import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type ServerResponse } from 'node:http';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { Context } from '@deepseek-ai/cordis';
import Tools, { type ToolRunContext } from '@deepseek-ai/dsh-tools';
import Prompt from '@deepseek-ai/dsh-system-prompt';
import Jobs from '@deepseek-ai/dsh-jobs-local';
import * as plugin from '../src/index';

test(
  'attachments return immediately, check concurrently and expose last checks and deliver one alert per incident',
  { timeout: 8000 },
  async () => {
    const responses: ServerResponse[] = [];
    const server = createServer(async (req, res) => {
      for await (const _ of req) {
        /* drain request */
      }
      responses.push(res);
      // Neither judge can finish until both jobs are being checked.
      if (responses.length === 2)
        for (const response of responses)
          response.end(
            JSON.stringify({
              choices: [{ message: { content: '{"choice":"notify_agent"}' } }],
            }),
          );
    }).listen(0, '127.0.0.1');
    await once(server, 'listening');
    const ctx = new Context();
    const prompt = ctx.plugin(Prompt);
    await prompt;
    const tools = ctx.plugin(Tools);
    await tools;
    const jobs = ctx.plugin(Jobs);
    await jobs;
    const detach = ctx.jobs.attachController('test');
    const owner = undefined;
    const alerts: unknown[] = [];
    const delivered = Promise.withResolvers<void>();
    const caller = new AbortController();
    const exec = {
      signal: caller.signal,
      agent: {
        session: { id: owner },
        steer(message: unknown) {
          alerts.push(message);
          if (alerts.length === 2) delivered.resolve();
        },
      },
    } as unknown as ToolRunContext;
    let stops = 0;
    const ids = [1, 2].map((n) =>
      ctx.jobs.start({
        owner,
        kind: 'bash',
        label: `training ${n}`,
        run(handle) {
          handle.append('loss=NaN\n');
          const done = Promise.withResolvers<{ status: 'killed' }>();
          return {
            done: done.promise,
            cancel() {
              stops++;
              done.resolve({ status: 'killed' });
            },
          };
        },
      }),
    );
    process.env.WATCHDOG_CONCURRENT_KEY = 'fixture';
    const address = server.address() as { port: number };
    const watchdog = ctx.plugin(plugin, {
      mode: 'enforce',
      apiKeyEnv: 'WATCHDOG_CONCURRENT_KEY',
      baseURL: `http://127.0.0.1:${address.port}`,
      firstCheckMs: 1,
      judgeTimeoutMs: 3000,
    });
    await watchdog;
    try {
      const attach = (id: string) =>
        ctx.tools
          .get('watch_job')!
          .execute({ jobId: id, purpose: 'Train a model' }, exec) as Promise<{
          status: string;
        }>;
      for (const id of ids)
        assert.equal(
          (
            await Promise.race([
              attach(id),
              delay(500).then(() => {
                throw new Error('attachment blocked');
              }),
            ])
          ).status,
          'monitoring',
        );
      assert.equal((await attach(ids[0]!)).status, 'already-monitoring');
      caller.abort(); // Tool lifetime must not own the background monitors.
      await Promise.race([
        delivered.promise,
        delay(5000).then(() => {
          throw new Error('missing concurrent alerts');
        }),
      ]);
      assert.equal(responses.length, 2);
      assert.equal(stops, 0);
      const status = (await ctx.tools
        .get('watch_status')!
        .execute({ jobId: ids[0]! }, exec)) as {
        status: string;
        checks: number;
        lastCheck: { verdict: { choice: string } };
        nextCheckAt: number;
      };
      assert.equal(status.status, 'monitoring');
      assert.equal(status.checks, 1);
      assert.equal(status.lastCheck.verdict.choice, 'notify_agent');
      assert.ok(status.nextCheckAt > Date.now());
      for (const id of ids)
        assert.ok(alerts.some((message) => JSON.stringify(message).includes(id)));
      await watchdog.dispose();
      assert.equal(alerts.length, 2);
      assert.equal(stops, 0);
    } finally {
      await watchdog.dispose();
      for (const id of ids) ctx.jobs.kill(id, owner);
      detach();
      await jobs.dispose();
      await tools.dispose();
      await prompt.dispose();
      delete process.env.WATCHDOG_CONCURRENT_KEY;
      server.closeAllConnections();
      server.close();
    }
  },
);
