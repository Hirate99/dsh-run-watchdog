// Opt-in paid evaluation. Expected actions and reasons are never sent to the model.
import { mkdirSync, writeFileSync } from 'node:fs';
import { createJudge } from '../src/providers';
import { decide, options, type Choice } from '../src/decision';
import { scenarios, snapshot } from './scenarios';
const provider = process.env.WATCHDOG_PROVIDER === 'deepseek' ? 'deepseek' : 'jev';
const key = process.env[provider === 'jev' ? 'TYPESAFE_API_KEY' : 'DEEPSEEK_API_KEY'];
if (!key) throw new Error('Configure the provider API key in the environment');
const model = process.env.WATCHDOG_MODEL ?? (provider === 'jev' ? 'jev-latest' : 'deepseek-flash');
const judge = createJudge({ provider, model, apiKey: key });
const results = [];
for (const scenario of scenarios) {
  let previous: Choice | undefined;
  for (let i = 0; i < scenario.checks.length; i++) {
    const state = { ...snapshot(scenario, i), previousDecision: previous };
    const check = scenario.checks[i]!;
    const started = Date.now();
    try {
      const verdict = await judge.decide(state, options, AbortSignal.timeout(8000));
      previous = verdict.choice;
      const action = decide(verdict, 30);
      const result = { scenario: scenario.id, checkpoint: i + 1, expected: check.expected, action, matched: action.kind === check.expected,
        latencyMs: Date.now() - started, verdict, state };
      results.push(result);
      console.log(JSON.stringify({ scenario: result.scenario, checkpoint: result.checkpoint, expected: result.expected, action, matched: result.matched, latencyMs: result.latencyMs }));
    } catch (error) {
      results.push({ scenario: scenario.id, checkpoint: i + 1, matched: false, error: error instanceof Error ? error.message : String(error), state });
    }
  }
}
mkdirSync('.integration', { recursive: true });
writeFileSync(`.integration/scenarios-${provider}.json`, JSON.stringify({ kind: 'authored-log-replay', time: new Date().toISOString(), provider, model, results }, null, 2));
console.log(`${results.filter(r => r.matched).length}/${results.length} expected actions`);
if (results.some(r => !r.matched)) process.exitCode = 1;
