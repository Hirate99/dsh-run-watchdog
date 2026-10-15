import { createJudge } from '../src/providers.js';
import { options, type JudgeInput } from '../src/decision.js';

const provider = process.argv[2] === 'jev' ? 'jev' : 'deepseek';
const keyName = provider === 'jev' ? 'TYPESAFE_API_KEY' : 'DEEPSEEK_API_KEY';
const apiKey = process.env[keyName];
if (!apiKey) throw new Error(`Set ${keyName} before running this opt-in paid API check`);
const state: JudgeInput = { purpose: 'Download a public test artifact', command: 'synthetic-download', elapsedSeconds: 60, recentOutput: 'HTTP 401: invalid credentials. Retrying...', newLines: 20, outputChanged: true, mostRepeated: { line: 'HTTP 401: invalid credentials. Retrying...', count: 20 }, lossy: false };
const judge = createJudge({ provider, apiKey, model: process.env.WATCHDOG_MODEL ?? (provider === 'jev' ? 'jev-latest' : 'deepseek-flash') });
console.log(JSON.stringify(await judge.decide(state, options, AbortSignal.timeout(15_000)), null, 2));
