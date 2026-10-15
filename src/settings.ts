import type { Context } from '@deepseek-ai/cordis';
import { credentialRef } from '@deepseek-ai/dsh-credentials';
import type {} from '@deepseek-ai/dsh-client-connection';
import type {} from '@deepseek-ai/dsh-deepseek-account';
import type { Config } from './index';
import { options, type JudgeInput } from './decision';
import { accountJudge, createJudge } from './providers';

/** Jev has its own key; DeepSeek reuses whatever reference the DSH model settings use. */
export const keyReference = (config: Pick<Config, 'provider' | 'apiKeyEnv'>) =>
  config.provider === 'jev' ? 'TYPESAFE_API_KEY' : config.apiKeyEnv;

export async function resolveKey(ctx: Context, config: Pick<Config, 'provider' | 'apiKeyEnv'>): Promise<string> {
  const ref = keyReference(config);
  const key = (await ctx.get('credentials')?.resolve(credentialRef(ref)))?.value ?? process.env[ref];
  if (!key) throw new Error(config.provider === 'jev' ? 'Jev API key is not configured' : 'DeepSeek API key is not configured (DSH Settings → Models → DeepSeek)');
  return key;
}

export async function usesAccount(ctx: Context, config: Config): Promise<boolean> {
  if (config.provider !== 'deepseek' || config.baseURL || config.apiKeyEnv !== 'DEEPSEEK_API_KEY') return false;
  if (!ctx.get('llm')?.listProviders().some(provider => provider.id === 'deepseek-account')) return false;
  return (await ctx.get('deepseekAccount')?.getState())?.status === 'credential-stored';
}

export async function resolveJudge(ctx: Context, config: Config) {
  if (await usesAccount(ctx, config)) return accountJudge(ctx.llm, config.model);
  return createJudge({ ...config, apiKey: await resolveKey(ctx, config) });
}

/** A synthetic "waiting for input" case: a working judge should answer notify_agent. Never runs a command. */
export const probe: JudgeInput = {
  purpose: 'Run setup; hand interactive prompts to the main agent.', command: 'connection-test (synthetic)',
  elapsedSeconds: 30, recentOutput: 'Continue? [y/N]', newLines: 1, outputChanged: true,
  mostRepeated: null, lossy: false,
};

export async function testConnection(ctx: Context, config: Config, signal: AbortSignal) {
  const started = Date.now();
  const judge = await resolveJudge(ctx, config);
  const verdict = await judge.decide(probe, options, AbortSignal.any([signal, AbortSignal.timeout(config.judgeTimeoutMs)]));
  return { choice: verdict.choice, latencyMs: Date.now() - started };
}

export function registerConnectionTest(ctx: Context, currentConfig: () => Config) {
  ctx.inject(['connection'], ctx => {
    ctx.connection.fetch.register({
      path: '/api/run-watchdog/account', methods: ['GET'], requestBody: 'buffered',
      async fetch() {
        return Response.json({ available: await usesAccount(ctx, { ...currentConfig(), provider: 'deepseek' }) });
      },
    });
    ctx.connection.fetch.register({
      path: '/api/run-watchdog/test', methods: ['POST'], requestBody: 'buffered',
      async fetch(request) {
        try {
          return Response.json(await testConnection(ctx, currentConfig(), request.signal));
        } catch (error) {
          // Report the kind of failure only: vendor bodies may echo request details.
          const reason = error instanceof Error && error.name === 'TimeoutError' ? 'timeout'
            : error instanceof Error && /not configured/.test(error.message) ? 'no-key'
            : error instanceof Error && /^HTTP \d+$/.test(error.message) ? error.message : 'failed';
          return Response.json({ error: reason }, { status: 502 });
        }
      },
    });
  });
}
