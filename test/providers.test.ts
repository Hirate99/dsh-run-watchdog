import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createJudge } from '../src/providers';
import { options, type JudgeInput } from '../src/decision';

const state: JudgeInput = {
  purpose: 'Build',
  command: 'build',
  elapsedSeconds: 10,
  recentOutput: 'compiling',
  newLines: 1,
  outputChanged: true,
  mostRepeated: null,
  lossy: false,
};
test('HTTP contracts: Jev typed question and DeepSeek JSON; unknown choices rejected', async () => {
  let invalid = false;
  const server = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);
    assert.equal(req.headers.authorization, 'Bearer test-key');
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/systemone') {
      assert.equal(body.questions.next_step.type, 'choice');
      assert.equal(body.state.purpose, 'Build');
      const probabilities = Object.fromEntries(
        Object.keys(body.questions.next_step.criteria).map((key) => [
          key,
          key === 'continue' ? 1 : 0,
        ]),
      );
      res.end(
        JSON.stringify({
          answers: {
            next_step: {
              type: 'choice',
              choice: invalid ? 'no_more_checks' : 'continue',
              confidence: 1,
              probabilities,
            },
            interval: { choice: 'check_60s' },
          },
        }),
      );
    } else {
      assert.equal(req.url, '/chat/completions');
      assert.deepEqual(body.response_format, { type: 'json_object' });
      assert.deepEqual(body.thinking, { type: 'disabled' });
      res.end(
        JSON.stringify({
          choices: [{ message: { content: '{"choice":"notify_agent"}' } }],
        }),
      );
    }
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const baseURL = `http://127.0.0.1:${address.port}`;
  try {
    const jev = createJudge({
      provider: 'jev',
      model: 'jev-latest',
      apiKey: 'test-key',
      baseURL,
    });
    const verdict = await jev.decide(state, options, AbortSignal.timeout(1000));
    assert.equal(verdict.choice, 'continue');
    assert.equal(verdict.probabilities?.continue, 1);
    invalid = true;
    await assert.rejects(
      jev.decide(state, options, AbortSignal.timeout(1000)),
      /unknown choice/,
    );
    const ds = createJudge({
      provider: 'deepseek',
      model: 'deepseek-chat',
      apiKey: 'test-key',
      baseURL,
    });
    assert.deepEqual(await ds.decide(state, options, AbortSignal.timeout(1000)), {
      choice: 'notify_agent',
      probabilities: undefined,
    });
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
