// Opt-in paid probe: load only in a disposable DSH profile.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ToolCallId } from '@deepseek-ai/dsh-llm';

export const inject = ['tools', 'jobs', 'credentials'];
export function apply(ctx) {
  let started = false;
  const run = () => {
    const native = process.platform === 'win32' ? 'pwsh' : 'bash';
    if (started || !ctx.tools.get('watch_job') || !ctx.tools.get(native)) return;
    started = true;
    mkdirSync('.integration', { recursive: true });
    const training = process.env.WATCHDOG_SUITE === 'training';
    const cases = training ? ['stable', 'diverge'].map(mode => ({
      name: `training-${mode}`, purpose: 'Train a linear regression model for 100 steps and save checkpoints.',
      code: `process.argv[2]=${JSON.stringify(mode)};import(${JSON.stringify(pathToFileURL(resolve('scripts/training-demo.mjs')).href)});`,
    })) : [
      { name: 'progress', purpose: 'Complete all 25 work items and collect the final summary.',
        code: `let n=0;const t=setInterval(()=>{console.log('Completed item '+ ++n+'/25');if(n===25){clearInterval(t);console.log('All items complete')}},1000);` },
      { name: 'retry', purpose: 'Download an artifact from a local test server.',
        code: `const http=require('node:http');const s=http.createServer((q,r)=>{r.writeHead(401);r.end('invalid credentials')});s.listen(0,'127.0.0.1',()=>{const t=setInterval(async()=>{const r=await fetch('http://127.0.0.1:'+s.address().port);console.log('HTTP '+r.status+': '+await r.text()+'. Retrying...')},1000);setTimeout(()=>{clearInterval(t);s.close();process.exitCode=1},25000)});` },
      { name: 'input', purpose: 'Complete the setup wizard.',
        // Background jobs have no interactive stdin: use an open test stream.
        code: `const input=new(require('node:stream').PassThrough)();const rl=require('node:readline').createInterface({input,output:process.stdout});rl.question('Continue? [y/N] ',()=>rl.close());setTimeout(()=>{rl.close();input.end()},25000);` },
    ];
    void Promise.all(cases.map(async item => {
      const file = resolve('.integration', `live-${item.name}.cjs`);
      writeFileSync(file, item.code);
      const begin = Date.now();
      const started = await ctx.tools.execute({
        name: native, callId: ToolCallId(`start-${item.name}`),
        arguments: { command: `node '${file.replaceAll("'", "''")}'`, run_in_background: true },
        signal: AbortSignal.timeout(45_000),
      });
      if (started.isError || !started.value?.jobId) throw new Error(JSON.stringify(started));
      const result = await ctx.tools.execute({
        name: 'watch_job', callId: ToolCallId(`live-${item.name}`),
        arguments: { purpose: item.purpose, jobId: started.value.jobId },
        signal: AbortSignal.timeout(45_000),
      });
      // Standalone shadow-mode probe: attachment is immediate, then let the job finish.
      // Agent wake-up is exercised by the Desktop conversation, not this root tool call.
      const id = started.value.jobId;
      await ctx.jobs.wait(id, 35_000);
      const output = ctx.jobs.readAt(id, 0);
      if (['running', 'stopping'].includes(ctx.jobs.get(id).status)) {
        ctx.jobs.kill(id, undefined, 'live probe cleanup');
        await ctx.jobs.wait(id, 5_000);
      }
      return { name: item.name, elapsedMs: Date.now() - begin, result, finalStatus: ctx.jobs.get(id).status, output: output.chunks.map(c => c.text).join('') };
    })).then(results => {
      writeFileSync(`.integration/dsh-${training ? 'training' : 'live'}-probe.json`, JSON.stringify(results, null, 2));
      for (const item of results) console.log('[watchdog live probe]', JSON.stringify(item));
    }).catch(error => console.error('[watchdog live probe failed]', error.message));
  };
  ctx.on('tools/change', run);
  run();
}
