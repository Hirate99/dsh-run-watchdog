// Opt-in paid checks using output from real, disposable local processes.
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { mkdirSync, writeFileSync } from 'node:fs';
import { decide, options, type JudgeInput } from '../src/decision';
import { createJudge } from '../src/providers';

const provider = process.env.WATCHDOG_PROVIDER === 'jev' ? 'jev' : 'deepseek';
const apiKey = process.env[provider === 'jev' ? 'TYPESAFE_API_KEY' : 'DEEPSEEK_API_KEY'];
if (!apiKey) throw new Error(`Provide the ${provider} API key through the environment`);
const judge = createJudge({ provider, apiKey, model: process.env.WATCHDOG_MODEL ?? (provider === 'jev' ? 'jev-latest' : 'deepseek-flash') });
const cases = [
  {
    name: 'tests-progress', expected: 'wait',
    purpose: 'Run all tests and collect their final summary.',
    code: `const {test}=require('node:test'); const assert=require('node:assert/strict'); for(let i=0;i<30;i++) test('case '+i,async()=>{await new Promise(r=>setTimeout(r,500));assert.equal(i===0?0:1,1);});`,
  },
  {
    name: 'http-401-retry', expected: 'notify',
    purpose: 'Download a required artifact.',
    code: `const http=require('node:http');const s=http.createServer((q,r)=>{r.writeHead(401);r.end('invalid credentials')});s.listen(0,'127.0.0.1',()=>{setInterval(async()=>{const r=await fetch('http://127.0.0.1:'+s.address().port);console.log('HTTP '+r.status+': '+await r.text()+'. Retrying...')},200)});`,
  },
  {
    name: 'waiting-input', expected: 'notify',
    purpose: 'Complete the setup wizard.',
    code: `require('node:readline').createInterface({input:process.stdin,output:process.stdout}).question('Continue? [y/N] ',()=>process.exit());`,
  },
] as const;

const records = [];
for (let round = 1; round <= 2; round++) {
  const results = await Promise.all(cases.map(async item => {
    const child = spawn(process.execPath, ['-e', item.code], { stdio: ['pipe', 'pipe', 'pipe'] });
    const closed = once(child, 'close');
    let output = '';
    child.stdout.on('data', data => { output += data; });
    child.stderr.on('data', data => { output += data; });
    try {
      await delay(2_000);
      const lines = output.split(/\r?\n/).filter(Boolean);
      const counts = new Map<string, number>();
      for (const line of lines) counts.set(line, (counts.get(line) ?? 0) + 1);
      const repeated = [...counts].sort((a, b) => b[1] - a[1])[0];
      const state: JudgeInput = {
        purpose: item.purpose, command: `node -e ${item.code}`,
        elapsedSeconds: 2, recentOutput: output, newLines: lines.length, outputChanged: !!output,
        mostRepeated: repeated ? { line: repeated[0], count: repeated[1] } : null, lossy: false,
      };
      const started = Date.now();
      try {
        const verdict = await judge.decide(state, options, AbortSignal.timeout(20_000));
        const action = decide(verdict, 30);
        return { round, name: item.name, expected: item.expected, verdict, action, matched: action.kind === item.expected, latencyMs: Date.now() - started, state };
      } catch (error) {
        return { round, name: item.name, expected: item.expected, error: error instanceof Error ? error.message : String(error), latencyMs: Date.now() - started, state };
      }
    } finally {
      if (child.exitCode === null) child.kill();
      await closed;
    }
  }));
  records.push(...results);
  for (const { state: _, ...summary } of results) console.log(JSON.stringify(summary));
}
mkdirSync('.integration', { recursive: true });
writeFileSync(`.integration/live-cases-${provider}.json`, JSON.stringify(records, null, 2));
if (records.some(record => 'error' in record || !record.matched)) process.exitCode = 1;
