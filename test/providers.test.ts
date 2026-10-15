import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createJudge } from '../src/providers.js';
import { choices, type Snapshot } from '../src/decision.js';

const state: Snapshot = { task: { purpose: 'Build', command: 'build' }, elapsedSeconds: 10, recentOutput: 'compiling', newLines: 1, outputChanged: true, mostRepeated: null, lossy: false, ready: false };
test('HTTP contracts: Jev typed question and DeepSeek JSON, invalid probability rejected', async () => {
  let invalid = false;
  const server = createServer(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);
    assert.equal(req.headers.authorization, 'Bearer test-key');
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/systemone') {
      assert.equal(body.questions.next_step.type, 'choice');
      assert.equal(body.state.task.purpose, 'Build');
      const probabilities = Object.fromEntries(Object.keys(body.questions.next_step.criteria).map(key => [key, key === 'check_60s' ? 1 : 0]));
      if (invalid) probabilities.stop = 2;
      res.end(JSON.stringify({ answers: { next_step: { type: 'choice', choice: 'check_60s', confidence: 1, probabilities } } }));
    } else {
      assert.equal(req.url, '/chat/completions');
      assert.deepEqual(body.response_format, { type: 'json_object' });
      assert.deepEqual(body.thinking, { type: 'disabled' });
      res.end(JSON.stringify({ choices: [{ message: { content: '{"choice":"notify_agent"}' } }] }));
    }
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const baseURL = `http://127.0.0.1:${address.port}`;
  try {
    const jev = createJudge({ provider: 'jev', model: 'jev-latest', apiKey: 'test-key', baseURL });
    assert.equal((await jev.decide(state, choices(state), AbortSignal.timeout(1000))).choice, 'check_60s');
    invalid = true;
    await assert.rejects(jev.decide(state, choices(state), AbortSignal.timeout(1000)), /probability/);
    const ds = createJudge({ provider: 'deepseek', model: 'deepseek-chat', apiKey: 'test-key', baseURL });
    assert.deepEqual(await ds.decide(state, choices(state), AbortSignal.timeout(1000)), { provider: 'deepseek', choice: 'notify_agent' });
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
