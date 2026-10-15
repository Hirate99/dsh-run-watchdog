import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { Context } from '@deepseek-ai/cordis';
import Tools, { defineTool, type ToolExecutionInput } from '@deepseek-ai/dsh-tools';
import Jobs from '@deepseek-ai/dsh-jobs-local';
import Prompt from '@deepseek-ai/dsh-system-prompt';
import { ToolCallId } from '@deepseek-ai/dsh-llm';
import type { SessionId } from '@deepseek-ai/dsh-session';
import { interruptibleOutputWaits } from '../src/interrupt-wait';

test('alert releases only that session output wait without stopping jobs or cancelling the caller', { timeout: 5000 }, async () => {
  const ctx = new Context();
  const prompt = ctx.plugin(Prompt); await prompt;
  const tools = ctx.plugin(Tools); await tools;
  const jobs = ctx.plugin(Jobs); await jobs;
  const controller = ctx.jobs.attachController('fixture');
  const finished = Promise.withResolvers<{ status: 'completed' }>();
  let kills = 0;
  const id = ctx.jobs.start({ kind: 'bash', label: 'training', run(handle) {
    handle.append('step 1\n');
    return { done: finished.promise, cancel() { kills++; } };
  } });
  const entered: string[] = [];
  ctx.tools.register(defineTool({
    name: 'job_output', description: 'Real registry wait followed by an output read',
    parameters: { wait: { type: 'boolean' } },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    async execute(args, exec) {
      entered.push(exec.agent!.session.id);
      if (args.wait) await ctx.jobs.wait(id, 3000, undefined, exec.signal);
      return ctx.jobs.readAt(id, 0).chunks.map(c => c.text).join('');
    },
  }));
  const interrupt = interruptibleOutputWaits(ctx);
  const caller = new AbortController();
  const run = (owner: string, wait = true) => ctx.tools.execute({
    name: 'job_output', callId: ToolCallId(owner), arguments: { wait }, signal: caller.signal,
    agent: { session: { id: owner }, ctx } as ToolExecutionInput['agent'],
  });
  try {
    const first = run('first');
    let otherReturned = false;
    const other = run('other').then(result => { otherReturned = true; return result; });
    while (entered.length < 2) await delay(1);
    interrupt('first' as SessionId);
    const result = await first;
    assert.equal(result.isError, true); // A cancelled wait must not masquerade as completion.
    assert.equal(otherReturned, false);
    assert.equal(caller.signal.aborted, false);
    assert.equal(kills, 0);
    assert.equal(ctx.jobs.get(id).status, 'running');
    assert.equal((await run('first', false)).isError, false); // Output is still readable.
    interrupt('later' as SessionId); // Alert arrives during generation, before a wait exists.
    const before = entered.length;
    assert.equal((await run('later')).isError, true);
    assert.equal(entered.length, before); // Stale model response cannot start a new wait.
    ctx.emit('session/event', { id: 'later' } as never, {
      type: 'user/message', data: { source: { kind: 'run-watchdog' } },
    } as never);
    let laterReturned = false;
    const later = run('later').then(result => { laterReturned = true; return result; });
    while (entered.length === before) await delay(1);
    assert.equal(laterReturned, false); // Delivery disarms the interrupt.
    finished.resolve({ status: 'completed' });
    assert.equal((await later).isError, false);
    assert.equal((await other).isError, false);
    assert.equal(ctx.jobs.get(id).status, 'completed');
    assert.equal(kills, 0);
  } finally {
    finished.resolve({ status: 'completed' });
    controller(); await jobs.dispose(); await tools.dispose(); await prompt.dispose();
  }
});

