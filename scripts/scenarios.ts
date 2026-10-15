import type { JudgeInput } from '../src/decision.js';

// Authored replay fixtures, not claims of an actual GPU training run.
export interface Scenario {
  id: string;
  purpose: string;
  checks: { at: number; log: string; expected: 'wait' | 'notify'; reason: string }[];
}
const train = 'Train the model for 10 epochs, evaluate each epoch, and save the best checkpoint.';
export const scenarios: Scenario[] = [
  { id: 'requested-alert-on-expected-nan', purpose: 'Run both training modes. Divergence is intentional, but the user explicitly requests notification on Infinity or NaN. Keep training running.', checks: [
    { at: 40, log: 'step=24 loss=Infinity grad_norm=Infinity\nstep=26 loss=NaN grad_norm=NaN\nstep=40 checkpoint rejected: nonfinite weights', expected: 'notify', reason: 'An explicit alert condition takes precedence over the failure being expected; notification does not stop the run.' },
  ] },
  { id: 'training-plateau', purpose: train, checks: [
    { at: 120, log: 'epoch=2 step=200/1000 loss=1.82 grad_norm=0.9 lr=0.0003 tokens/s=4200\nepoch=2 step=300/1000 loss=1.87 grad_norm=1.1 tokens/s=4190', expected: 'wait', reason: 'Loss fluctuates but steps and throughput advance.' },
    { at: 600, log: 'epoch=3 step=900/1000 loss=1.84 grad_norm=0.8 tokens/s=4210\nepoch=3 validation_loss=1.79 best=1.78 patience=1/5\ncheckpoint saved\nepoch=4 step=100/1000 loss=1.81 tokens/s=4195', expected: 'wait', reason: 'A plateau alone does not invalidate a scheduled training run.' },
  ] },
  { id: 'mixed-precision-recovery', purpose: train, checks: [
    { at: 90, log: 'step=100 loss=2.1 scale=65536\nGradient overflow at step=101; skipped update; scale=32768\nstep=102 loss=2.04 grad_norm=1.2 optimizer_updates=101', expected: 'wait', reason: 'AMP detected overflow and recovered with finite subsequent updates.' },
    { at: 180, log: 'step=180 loss=1.91 scale=32768 optimizer_updates=179\nstep=200 loss=1.86 scale=32768 optimizer_updates=199\nvalidation_loss=1.90', expected: 'wait', reason: 'Progress resumed; do not stop for a historical warning.' },
  ] },
  { id: 'training-diverged', purpose: train, checks: [
    { at: 90, log: 'step=100 loss=2.1 grad_norm=1.2\nstep=110 loss=80 grad_norm=250\nstep=120 loss=nan grad_norm=nan\nstep=130 loss=nan grad_norm=nan', expected: 'notify', reason: 'Repeated nonfinite updates require intervention.' },
    { at: 240, log: 'step=200 loss=nan grad_norm=nan\nvalidation_loss=nan\ncheckpoint rejected: nonfinite weights\nstep=300 loss=nan grad_norm=nan', expected: 'notify', reason: 'Neither training nor checkpointing is producing usable output.' },
  ] },
  { id: 'oom-restart-loop', purpose: train, checks: [
    { at: 120, log: 'attempt=1 batch_size=64 CUDA out of memory at step=0\nRestarting with batch_size=64\nattempt=2 batch_size=64 CUDA out of memory at step=0\nRestarting with batch_size=64', expected: 'notify', reason: 'Restarting unchanged configuration cannot clear a deterministic capacity error.' },
    { at: 600, log: 'attempt=9 batch_size=64 CUDA out of memory at step=0\nattempt=10 batch_size=64 CUDA out of memory at step=0\ncompleted_updates=0', expected: 'notify', reason: 'Repeated attempts have made no progress.' },
  ] },
  { id: 'checkpoint-disk-full', purpose: train, checks: [
    { at: 600, log: 'epoch=2 validation_loss=1.5 best=1.7\ncheckpoint write failed: OSError [Errno 28] No space left on device\ncheckpoint retry 1/5\nepoch=3 step=100 loss=1.4', expected: 'notify', reason: 'Training advances but its required durable artifact cannot be saved.' },
    { at: 900, log: 'checkpoint retry 5/5: No space left on device\nlast_valid_checkpoint=none\nepoch=3 step=900 loss=1.3', expected: 'notify', reason: 'Do not confuse improving loss with achievement of the complete task.' },
  ] },
  { id: 'distributed-barrier', purpose: 'Train using four workers and save a synchronized checkpoint.', checks: [
    { at: 120, log: 'rank0 step=500 checkpoint barrier entered\nrank1 step=500 writing shard 64/128 MB\nrank2 step=500 writing shard 96/128 MB\nrank3 step=500 writing shard 32/128 MB', expected: 'wait', reason: 'A barrier is expected while checkpoint shards are being written.' },
    { at: 900, log: 'rank3 exited with code 137\nrank0 NCCL collective timeout after 600s\nrank1 waiting for rank3\nrank2 waiting for rank3\nlauncher retries barrier; rank3 is not restarted', expected: 'notify', reason: 'A missing worker prevents collective completion.' },
  ] },
  { id: 'download-recovery', purpose: 'Download all dataset shards and verify their checksums.', checks: [
    { at: 60, log: 'shard 1/8 checksum OK\nshard 2 HTTP 503 retry in 2s\nshard 2/8 checksum OK\nshard 3/8 received 40/100 MB', expected: 'wait', reason: 'Transient retries recover and bytes continue advancing.' },
    { at: 180, log: 'shard 4/8 checksum OK\nshard 5/8 checksum OK\nshard 6/8 received 75/100 MB', expected: 'wait', reason: 'No intervention is needed.' },
  ] },
  { id: 'test-suite-progress', purpose: 'Run the full integration suite and produce its failure report.', checks: [
    { at: 60, log: 'FAIL login-expired-token expected 401 got 500\nPASS upload\nPASS download\ncompleted=35/200 failures=1', expected: 'wait', reason: 'One failed test is evidence to collect, not an excuse to abandon the suite.' },
    { at: 180, log: 'completed=140/200 failures=3\nPASS migration-rollback\nwriting junit report; remaining=60', expected: 'wait', reason: 'The suite continues toward its requested final report.' },
  ] },
];

export function snapshot(scenario: Scenario, index: number): JudgeInput {
  const check = scenario.checks[index]!;
  const lines = check.log.split('\n').filter(Boolean);
  const counts = new Map<string, number>();
  for (const line of lines) counts.set(line, (counts.get(line) ?? 0) + 1);
  const top = [...counts].sort((a, b) => b[1] - a[1])[0];
  return { purpose: scenario.purpose, command: `replay ${scenario.id}`, elapsedSeconds: check.at,
    recentOutput: scenario.checks.slice(0, index + 1).map(c => c.log).join('\n'),
    newLines: lines.length, outputChanged: !!check.log, mostRepeated: top ? { line: top[0], count: top[1] } : null, lossy: false };
}
