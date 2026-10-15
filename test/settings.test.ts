import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Context } from '@deepseek-ai/cordis';
import Credentials from '@deepseek-ai/dsh-credentials-local';
import { credentialRef } from '@deepseek-ai/dsh-credentials';
import { Config, readConfig } from '../src/index';
import { resolveKey, testConnection } from '../src/settings';

test('UI credentials: separate Jev key, stored DS key, real test request and timeout', async () => {
  const home = mkdtempSync(join(tmpdir(), 'watchdog-ui-'));
  const ctx = new Context();
  const store = ctx.plugin(Credentials, { dshHome: home, watch: false }); await store;
  const server = createServer(async (req, res) => {
    assert.equal(req.headers.authorization, 'Bearer fixture-ds');
    let body = ''; for await (const chunk of req) body += chunk;
    const json = JSON.parse(body);
    assert.equal(json.model, 'deepseek-flash');
    assert.match(json.messages[1].content, /Continue\?/);
    if (req.url === '/slow/chat/completions') return;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ choices: [{ message: { content: '{"choice":"notify_agent"}' } }] }));
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const config = readConfig(Config({ apiKeyEnv: 'WATCHDOG_UI_DS', baseURL: `http://127.0.0.1:${address.port}` }));
  try {
    assert.equal(config.judgeTimeoutMs, 8000); // Volatile references must be dereferenced.
    await ctx.credentials.set(credentialRef('WATCHDOG_UI_DS'), 'fixture-ds');
    assert.equal(await resolveKey(ctx, config), 'fixture-ds');
    // An absent Jev key must never inherit the configured DeepSeek key.
    const old = process.env.TYPESAFE_API_KEY;
    delete process.env.TYPESAFE_API_KEY;
    try {
      await assert.rejects(resolveKey(ctx, { ...config, provider: 'jev' }), /Jev/);
      await ctx.credentials.set(credentialRef('TYPESAFE_API_KEY'), 'fixture-jev');
      assert.equal(await resolveKey(ctx, { ...config, provider: 'jev' }), 'fixture-jev');
    } finally { if (old !== undefined) process.env.TYPESAFE_API_KEY = old; }
    const result = await testConnection(ctx, config, new AbortController().signal);
    assert.equal(result.choice, 'notify_agent');
    assert.ok(result.latencyMs >= 0);
    await assert.rejects(testConnection(ctx, { ...config, baseURL: config.baseURL + '/slow', judgeTimeoutMs: 20 }, new AbortController().signal), { name: 'TimeoutError' });
  } finally {
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    await store.dispose(); rmSync(home, { recursive: true, force: true });
  }
});
