import { setTimeout as delay } from 'node:timers/promises';
import { appendOutput } from './output';
import { beginCheck, initialState, planTick, scheduleNext } from './monitor-state';
import { baseline, decide, options, type Action, type Choice, type Judge, type JudgeInput, type Task, type Verdict } from './decision';

export interface RunningJob {
  done: Promise<void>;
  running(): boolean;
  read(): { text: string; lossy: boolean };
  stop(reason: string): void;
}

export interface WatchOptions {
  judge: Judge;
  mode: 'shadow' | 'enforce';
  firstCheckMs: number;
  judgeTimeoutMs: number;
  stopThreshold: number;
  /** Longest the caller waits. The process keeps running afterwards. */
  maxWaitMs: number;
  /** How long checks keep being recorded after handoff; 0 ends monitoring there. */
  recordAfterMs: number;
  record?(event: CheckRecord): void;
  /** Local polling period for output, readiness and the wait limit. */
  tickMs?: number;
}

export interface CheckRecord {
  phase: 'foreground' | 'background';
  state: JudgeInput;
  baseline: string[];
  verdict?: Verdict;
  action: Action;
  error?: string;
}

export type HandoffStatus = 'finished' | 'still-running' | 'ready' | 'notify' | 'stop-requested' | 'detached';

export interface Handoff {
  status: HandoffStatus;
  output: string;
  outputTruncated: boolean;
  decision?: Choice;
  checks: number;
  judgeFailures: number;
}

/**
 * Watch one job. `handoff` settles when the caller should have control back: completion, a ready
 * service, an enforced decision, or the wait limit. Only actions before handoff are executed; later
 * checks are recorded until `ended`. Cancelling `caller` before handoff detaches monitoring; `lifetime`
 * (plugin unload) ends monitoring and leaves the job running.
 */
export function watch(job: RunningJob, task: Task, opts: WatchOptions, caller: AbortSignal, lifetime: AbortSignal) {
  const { promise: handoff, resolve, reject } = Promise.withResolvers<Handoff>();
  const over = new AbortController();
  const signal = AbortSignal.any([over.signal, lifetime]);
  void job.done.then(() => over.abort());

  let state = initialState(Date.now(), opts.firstCheckMs);
  let handedOffAt: number | undefined;

  const settle = (status: HandoffStatus) => {
    if (handedOffAt !== undefined) return;
    handedOffAt = Date.now();
    resolve({
      status,
      output: state.output.text,
      outputTruncated: state.output.truncated,
      decision: state.previous,
      checks: state.checks,
      judgeFailures: state.failures,
    });
  };
  const cancel = () => {
    if (handedOffAt !== undefined) return;
    handedOffAt = Date.now();
    reject(caller.reason);
    over.abort();
  };
  if (caller.aborted) cancel();
  else caller.addEventListener('abort', cancel, { once: true });

  async function check(phase: CheckRecord['phase']): Promise<Action | undefined> {
    const pending = beginCheck(state, task, Date.now());
    state = pending.state;
    const { snapshot, fallback } = pending;
    let verdict: Verdict | undefined;
    let action: Action = { kind: 'wait', seconds: fallback };
    let error: string | undefined;
    try {
      verdict = await opts.judge.decide(snapshot, options, AbortSignal.any([signal, AbortSignal.timeout(opts.judgeTimeoutMs)]));
      action = decide(verdict, fallback, task.autoStop, opts.stopThreshold);
    } catch (cause) {
      state = { ...state, failures: state.failures + 1 };
      error = cause instanceof Error ? cause.message : String(cause);
    }
    // A job that settled while the judge was thinking makes the verdict stale.
    if (signal.aborted) return;
    opts.record?.({ phase, state: snapshot, baseline: baseline(snapshot), verdict, action, error });
    state = scheduleNext(state, action, fallback, verdict?.choice, Date.now());
    return verdict && action;
  }

  async function loop() {
    for (;;) {
      await delay(opts.tickMs ?? 1_000, undefined, { signal }).catch(() => {});
      state = { ...state, output: appendOutput(state.output, job.read()) };
      if (signal.aborted || !job.running()) return;
      const plan = planTick(state, task, opts, handedOffAt, Date.now());
      if (plan.handoff) settle(plan.handoff);
      if (plan.end) return;
      if (!plan.check) continue;
      const action = await check(handedOffAt === undefined ? 'foreground' : 'background');
      if (!action || handedOffAt !== undefined || opts.mode !== 'enforce' || action.kind === 'wait') continue;
      if (action.kind === 'stop') {
        job.stop('watchdog: stop probability reached the configured threshold');
        settle('stop-requested');
        return;
      }
      settle('notify');
    }
  }

  const ended = loop().then(
    () => {
      if (handedOffAt === undefined) settle(job.running() ? 'detached' : 'finished');
    },
    error => {
      if (handedOffAt !== undefined) return;
      handedOffAt = Date.now();
      reject(error);
    },
  ).finally(() => {
    caller.removeEventListener('abort', cancel);
    over.abort();
  });
  return { handoff, ended };
}
