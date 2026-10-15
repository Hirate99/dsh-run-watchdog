import type { Context } from '@deepseek-ai/cordis';
import { credentialRef } from '@deepseek-ai/dsh-credentials';
import type {} from '@deepseek-ai/dsh-client-connection';
import type { Config } from './index.js';
import { choices, type Snapshot } from './decision.js';
import { createJudge } from './providers.js';

export const keyReference = (config: Pick<Config, 'provider' | 'apiKeyEnv'>) =>
  config.provider === 'jev' ? 'TYPESAFE_API_KEY' : config.apiKeyEnv;

export async function resolveKey(ctx: Context, config: Pick<Config, 'provider' | 'apiKeyEnv'>): Promise<string> {
  const ref = keyReference(config);
  const stored = await ctx.get('credentials')?.resolve(credentialRef(ref));
  const key = stored?.value ?? process.env[ref];
  if (!key) throw new Error(config.provider === 'jev' ? '请先保存 Jev API Key' : '请在 DSH 设置 → 模型 → DeepSeek 中配置 API Key');
  return key;
}

/** Uses saved settings and a fixed synthetic prompt; never executes a command. */
export async function testConnection(ctx: Context, config: Config, signal: AbortSignal) {
  const started = Date.now();
  const state: Snapshot = {
    task: { purpose: 'Run setup; ask the main agent to answer interactive prompts.', command: 'connection-test (synthetic)' },
    elapsedSeconds: 30, recentOutput: 'Continue? [y/N]', newLines: 1, outputChanged: true,
    mostRepeated: null, lossy: false, ready: false,
  };
  const judge = createJudge({ ...config, apiKey: await resolveKey(ctx, config) });
  const verdict = await judge.decide(state, choices(state), AbortSignal.any([signal, AbortSignal.timeout(config.judgeTimeoutMs)]));
  return { choice: verdict.choice, latencyMs: Date.now() - started };
}

export function registerConnectionTest(ctx: Context, currentConfig: () => Config) {
  ctx.inject(['connection'], ctx => {
    const disposed = new AbortController();
    ctx.effect(() => () => disposed.abort());
    ctx.connection.fetch.register({
      path: '/api/run-watchdog/test', methods: ['GET', 'POST'], requestBody: 'buffered',
      async fetch(request) {
        const config = currentConfig();
        try {
          if (request.method === 'GET') {
            const describe = async (provider: Config['provider']) => {
              const ref = keyReference({ ...config, provider });
              const info = await ctx.get('credentials')?.describe(credentialRef(ref));
              return { configured: info?.configured ?? !!process.env[ref] };
            };
            return Response.json({ deepseek: await describe('deepseek'), jev: await describe('jev') });
          }
          return Response.json(await testConnection(ctx, config, AbortSignal.any([request.signal, disposed.signal])));
        } catch (error) {
          // Never forward vendor bodies, URLs, or credentials to diagnostics.
          const message = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
            ? '请求超时或已取消；这不代表密钥无效。' : '连接测试失败，请检查密钥、模型和服务状态。';
          return Response.json({ error: message }, { status: 502 });
        }
      },
    });
  });
}
