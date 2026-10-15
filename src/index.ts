import type { Context } from '@deepseek-ai/cordis';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { JobId, type JobRegistry } from '@deepseek-ai/dsh-jobs';
import { ToolCallId } from '@deepseek-ai/dsh-llm';
import type { SessionId } from '@deepseek-ai/dsh-session';
import { credentialRef } from '@deepseek-ai/dsh-credentials';
import type {} from '@deepseek-ai/dsh-system-prompt';
import z from '@deepseek-ai/schemastery';
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { monitor, type MonitorConfig, type RunningJob } from './monitor.js';
import { createJudge } from './providers.js';

export const name = 'run-watchdog';
export const inject = ['tools', 'jobs', 'systemPrompt'];
export interface Config {
  provider: 'deepseek' | 'jev';
  model: string;
  apiKeyEnv: string;
  baseURL?: string;
  mode: 'shadow' | 'enforce';
  firstCheckMs: number;
  judgeTimeoutMs: number;
  stopThreshold: number;
  allowAutoStop: boolean;
  recordPath?: string;
  shellTool: 'auto' | 'bash' | 'pwsh';
}
export const Config = z.object({
  provider: z.union(['deepseek', 'jev']).default('deepseek'),
  model: z.string().default('deepseek-flash'),
  apiKeyEnv: z.string().default('DEEPSEEK_API_KEY'),
  baseURL: z.string(),
  mode: z.union(['shadow', 'enforce']).default('shadow'),
  firstCheckMs: z.number().min(1).default(10_000),
  judgeTimeoutMs: z.number().min(1).default(8_000),
  stopThreshold: z.number().min(0.5).max(1).default(0.8),
  allowAutoStop: z.boolean().default(false),
  recordPath: z.string(),
  shellTool: z.union(['auto', 'bash', 'pwsh']).default('auto'),
});

/** Independent ring cursor: monitoring never consumes the agent's output. */
export function observeJob(jobs: JobRegistry, id: JobId, owner?: SessionId): RunningJob & { dispose(): void } {
  let cursor = 0;
  const running = () => ['running', 'stopping'].includes(jobs.get(id, owner).status);
  let finish!: () => void;
  const done = new Promise<void>(resolve => { finish = resolve; });
  const dispose = jobs.events.subscribe(owner ? { owner } : { owners: 'scope' }, event => {
    if (event.type === 'settled' && event.job.id === id) finish();
  });
  if (!running()) finish();
  return {
    done, running, dispose,
    read() {
      const read = jobs.readAt(id, cursor, owner);
      cursor = read.next;
      return { text: read.chunks.map(chunk => chunk.text).join(''), lossy: read.lossy };
    },
    stop(reason) { jobs.kill(id, owner, reason); },
  };
}

export function apply(ctx: Context, config: Config): void {
  const resolveKey = async () => {
    const stored = await ctx.get('credentials')?.resolve(credentialRef(config.apiKeyEnv));
    const apiKey = stored?.value ?? process.env[config.apiKeyEnv];
    if (!apiKey) throw new Error(`Missing ${config.apiKeyEnv}; configure a judge before starting watched commands`);
    return apiKey;
  };
  ctx.systemPrompt.section({
    name: 'tool:watch-run', order: 95,
    text: 'Use watch_run for commands expected to take more than 10 seconds. Supply purpose (what the command must achieve), and optionally success_signal. Use the same native shell syntax as the shell tool. Keep ordinary shell tools for short commands. When watch_run returns notify, inspect its evidence and existing jobId; do not blindly launch the same command again. Use job_output or job_kill to manage a live returned job. detached means monitoring ended, not that the process stopped. Never set auto_stop for deployment or migration commands.',
  });
  if (config.recordPath) mkdirSync(dirname(config.recordPath), { recursive: true });
  ctx.tools.register(defineTool({
    name: 'watch_run',
    description: 'Run a long command with purpose-aware monitoring. Delegates to the native bash/pwsh tool and its existing permission policy. Returns on completion or when your attention is needed; a returned live job remains controllable through job_output/job_kill. Logs and purpose are sent to the configured judge.',
    parameters: {
      purpose: { type: 'string', required: true, description: 'Why this command runs and what useful progress means.' },
      command: { type: 'string', required: true },
      workdir: { type: 'string' },
      success_signal: { type: 'string' },
      service: { type: 'boolean', description: 'True only for an intentionally persistent service.' },
      ready_pattern: { type: 'string', description: 'Literal ready marker for a persistent service.' },
      auto_stop: { type: 'boolean', description: 'Only for safely restartable commands. Deployment config must also permit it.' },
    },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: {
        status: { type: 'string', required: true },
        jobId: { type: 'string', required: true },
        jobStatus: { type: 'string', required: true },
        detail: { type: 'string', required: true },
        output: { type: 'string', required: true },
        decision: { type: 'string', required: true },
      } },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    async execute(args, exec) {
      if (!args.purpose.trim() || !args.command.trim()) throw new Error('purpose and command must be nonempty');
      const apiKey = await resolveKey();
      const judge = createJudge({ ...config, apiKey });
      const preferred = process.platform === 'win32' ? ['pwsh', 'bash'] : ['bash', 'pwsh'];
      const toolName = config.shellTool === 'auto' ? preferred.find(name => ctx.tools.get(name, exec.agent)) : config.shellTool;
      const shell = toolName && ctx.tools.get(toolName, exec.agent);
      if (!shell || !Object.hasOwn(shell.parameters.properties ?? {}, 'run_in_background')) throw new Error('watch_run requires a native shell tool with background jobs enabled');
      const result = await ctx.tools.execute({
        name: toolName!, callId: ToolCallId(`${exec.callId}:watchdog`), rootCallId: exec.rootCallId,
        parent: exec.token, agent: exec.agent, signal: exec.signal,
        arguments: { command: args.command, description: args.purpose, run_in_background: true, ...(args.workdir ? { workdir: args.workdir } : {}) },
      });
      for (const context of result.additionalContexts ?? []) exec.deferContext(context);
      if (result.isError) throw new Error(result.content.filter(b => b.type === 'text').map(b => b.text).join('\n'));
      if (result.concludesTurn) exec.concludeTurn();
      const value = result.value;
      if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.jobId !== 'string') throw new Error('shell did not return a background job id');
      const id = JobId(value.jobId);
      const owner = exec.agent?.session.id;
      const job = observeJob(ctx.jobs, id, owner);
      const disposed = new AbortController();
      const release = ctx.effect(() => () => disposed.abort());
      const signal = AbortSignal.any([exec.signal, disposed.signal]);
      const options: MonitorConfig = {
        ...config,
        record: config.recordPath ? event => appendFileSync(config.recordPath!, JSON.stringify({ jobId: id, time: new Date().toISOString(), ...event }) + '\n', { mode: 0o600 }) : undefined,
      };
      try {
        const outcome = await monitor(job, {
          purpose: args.purpose, command: args.command, successSignal: args.success_signal,
          service: args.service, readyPattern: args.ready_pattern, autoStop: config.allowAutoStop && args.auto_stop,
        }, judge, options, signal);
        if (outcome.status === 'stop-requested') await ctx.jobs.wait(id, 5_000, owner, signal);
        const view = ctx.jobs.get(id, owner);
        return { status: outcome.status, jobId: id, jobStatus: view.status, detail: view.detail ?? '', output: outcome.output, decision: outcome.decision ?? '' };
      } catch (error) {
        // Caller/unload cancellation is a process cancellation, not just a timer cancellation.
        if (signal.aborted && job.running()) await ctx.jobs.wait(id, 5_000, owner);
        throw error;
      } finally { job.dispose(); release(); }
    },
  }));
}
