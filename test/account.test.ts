import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Context } from '@deepseek-ai/cordis';
import type { GenerateOptions, LlmRuntime } from '@deepseek-ai/dsh-llm';
import { Config, readConfig } from '../src/index';
import { options } from '../src/decision';
import { probe, resolveJudge, usesAccount } from '../src/settings';

function fixture(signedIn = true) {
  const requests: GenerateOptions[] = [];
  const llm: Pick<LlmRuntime, 'listProviders' | 'stream'> = {
    listProviders: () => [{ id: 'deepseek-account', name: 'DeepSeek' }],
    async *stream(request: GenerateOptions) {
      requests.push(request);
      yield { type: 'reasoning-delta', index: 0, text: 'not part of the answer' };
      yield { type: 'text-delta', index: 1, text: '{"choice":' };
      yield { type: 'text-delta', index: 1, text: '"notify_agent"}' };
    },
  };
  const account = {
    getState: async () => ({ status: signedIn ? 'credential-stored' : 'signed-out' }),
  };
  const ctx = {
    llm,
    get: (name: string) =>
      name === 'llm' ? llm : name === 'deepseekAccount' ? account : undefined,
  } as unknown as Context;
  return { ctx, requests };
}

test('DeepSeek reuses the host account without resolving or copying an API key', async () => {
  const { ctx, requests } = fixture();
  const config = readConfig(Config({}));
  const judge = await resolveJudge(ctx, config);
  const signal = new AbortController().signal;
  assert.deepEqual(await judge.decide(probe, options, signal), {
    choice: 'notify_agent',
    probabilities: undefined,
  });
  assert.equal(requests[0]?.provider, 'deepseek-account');
  assert.equal(requests[0]?.model, config.model);
  assert.equal(requests[0]?.reasoningEffort, 'off');
  assert.equal(requests[0]?.signal, signal);
});

test('account reuse respects sign-out, custom endpoints, explicit keys and Jev isolation', async () => {
  const config = readConfig(Config({}));
  const { ctx } = fixture();
  assert.equal(await usesAccount(fixture(false).ctx, config), false);
  assert.equal(await usesAccount(ctx, { ...config, provider: 'jev' }), false);
  assert.equal(
    await usesAccount(ctx, { ...config, baseURL: 'https://example.invalid' }),
    false,
  );
  assert.equal(await usesAccount(ctx, { ...config, apiKeyEnv: 'CUSTOM_KEY' }), false);
});

test('account judge works inside a Cordis plugin without undeclared service access', async () => {
  const services = fixture();
  const root = new Context();
  const releaseLlm = root.provide('llm', services.ctx.get('llm'));
  const releaseAccount = root.provide(
    'deepseekAccount',
    services.ctx.get('deepseekAccount'),
  );
  const result = Promise.withResolvers<unknown>();
  const plugin = root.plugin({
    apply(ctx: Context) {
      void resolveJudge(ctx, readConfig(Config({})))
        .then((judge) => judge.decide(probe, options, new AbortController().signal))
        .then(result.resolve, result.reject);
    },
  });
  try {
    await plugin;
    assert.deepEqual(await result.promise, {
      choice: 'notify_agent',
      probabilities: undefined,
    });
  } finally {
    await plugin.dispose();
    releaseAccount();
    releaseLlm();
  }
});
