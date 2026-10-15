// Opt-in probe loaded into a disposable DSH profile. No model call is needed
// for this short command; this checks the real host, shell and job wiring.
import { writeFileSync, mkdirSync } from 'node:fs';
import { ToolCallId } from '@deepseek-ai/dsh-llm';

export const inject = ['tools', 'jobs'];
export function apply(ctx) {
  let started = false;
  const run = () => {
    const native = process.platform === 'win32' ? 'pwsh' : 'bash';
    if (started || !ctx.tools.get('watch_job') || !ctx.tools.get(native)) return;
    started = true;
    void ctx.tools.execute({
      name: native, callId: ToolCallId('watchdog-native-probe'),
      arguments: {
        run_in_background: true,
        command: native === 'pwsh' ? "Write-Output 'watchdog-native-ok'; Start-Sleep -Milliseconds 200" : "printf 'watchdog-native-ok\\n'; sleep 0.2",
      },
      signal: AbortSignal.timeout(20_000),
    }).then(async started => {
      if (started.isError || !started.value?.jobId) throw new Error(JSON.stringify(started));
      return ctx.tools.execute({ name: 'watch_job', callId: ToolCallId('attach-probe'),
        arguments: { jobId: started.value.jobId, purpose: 'Verify the native task completes with its marker' },
        signal: AbortSignal.timeout(20_000) });
    }).then(result => {
      mkdirSync('.integration', { recursive: true });
      writeFileSync('.integration/native-probe.json', JSON.stringify(result, null, 2));
      console.log('[watchdog probe]', result.isError ? 'FAILED' : JSON.stringify(result.value));
    });
  };
  ctx.on('tools/change', run);
  run();
}
