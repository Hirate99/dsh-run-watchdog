import { setTimeout as delay } from 'node:timers/promises';
import {
  beginCheck,
  completeCheck,
  initialState,
  initialStatus,
  monitoringHealth,
  receiveOutput,
  statusAfterCheck,
  endMonitoring,
} from './monitor-state';
import {
  baseline,
  options,
  type Action,
  type Judge,
  type JudgeInput,
  type Task,
  type Verdict,
} from './decision';

export interface RunningJob {
  done: Promise<void>;
  running(): boolean;
  read(): { text: string; lossy: boolean; errors?: string[] };
  stop(reason: string): void;
}
export interface CheckRecord {
  state: JudgeInput;
  baseline: string[];
  verdict?: Verdict;
  action: Action;
  error?: string;
}
export interface MonitorStatus {
  status: 'monitoring' | 'finished' | 'detached' | 'failed';
  mode: 'shadow' | 'enforce';
  health: 'awaiting-output' | 'ok' | 'degraded';
  outputSources: string[];
  sourceErrors: string[];
  checks: number;
  consecutiveFailures: number;
  lastCheckAt: number | null;
  nextCheckAt: number | null;
  lastCheck: CheckRecord | null;
  error: string | null;
}
export interface MonitorEvent {
  kind:
    | 'attention'
    | 'stop-requested'
    | 'monitor-degraded'
    | 'monitor-recovered'
    | 'monitor-failed';
  message: string;
  monitoring: MonitorStatus;
  output: string;
  outputTruncated: boolean;
}
export interface WatchOptions {
  judge: Judge;
  mode: 'shadow' | 'enforce';
  firstCheckMs: number;
  judgeTimeoutMs: number;
  stopThreshold: number;
  outputSources?: string[];
  record?(event: CheckRecord): void;
  notify?(event: MonitorEvent): void;
  tickMs?: number;
}

/** One continuous attachment. Sending an alert never ends this loop. */
export function watch(
  job: RunningJob,
  task: Task,
  opts: WatchOptions,
  lifetime: AbortSignal,
) {
  const completed = new AbortController();
  const signal = AbortSignal.any([completed.signal, lifetime]);
  void job.done.then(() => completed.abort());

  let state = initialState(Date.now(), opts.firstCheckMs);
  let status = initialStatus(opts, state.nextCheck);
  let attentionReported = false;
  let reportedHealthIssue = '';

  function snapshot(): MonitorStatus {
    return structuredClone(status);
  }

  function sendEvent(kind: MonitorEvent['kind'], message: string) {
    opts.notify?.({
      kind,
      message,
      monitoring: snapshot(),
      output: state.output.text,
      outputTruncated: state.output.truncated,
    });
  }

  function collectOutput() {
    const sample = job.read();
    state = receiveOutput(state, sample);
    status = { ...status, sourceErrors: sample.errors ?? [] };
  }

  function reportMonitoringHealth() {
    const current = monitoringHealth(status, Boolean(state.output.text.trim()));
    status = { ...status, health: current.health };

    if (current.incident && current.incident !== reportedHealthIssue) {
      sendEvent('monitor-degraded', current.message);
    } else if (!current.incident && reportedHealthIssue) {
      sendEvent('monitor-recovered', current.message);
    }
    reportedHealthIssue = current.incident;
  }

  function handleTaskDecision(record: CheckRecord) {
    const { verdict, action } = record;
    if (!verdict || opts.mode === 'shadow') return;

    if (canStopJob(record)) {
      job.stop(
        'watchdog: authorized stop recommendation reached the configured threshold',
      );
      sendEvent(
        'stop-requested',
        'Requested job stop. Confirm final job status with job_output.',
      );
      return;
    }

    if (action.kind !== 'wait') {
      if (!attentionReported) sendEvent('attention', describeDecision(verdict));
      attentionReported = true;
    } else if (verdict.choice === 'continue') {
      attentionReported = false;
    }
  }

  async function checkTask() {
    const pending = beginCheck(state, task, Date.now());
    state = pending.state;
    const input: JudgeInput = {
      ...pending.snapshot,
      outputSources: status.outputSources,
      sourceErrors: status.sourceErrors,
    };
    const result = await askJudge(opts, input, signal);
    if (signal.aborted || !job.running()) return;

    const now = Date.now();
    const checked = completeCheck(
      state,
      result.verdict,
      task,
      opts.stopThreshold,
      pending.fallback,
      now,
    );
    const record: CheckRecord = {
      state: input,
      baseline: baseline(input),
      verdict: result.verdict,
      error: result.error,
      action: checked.action,
    };
    state = checked.state;
    status = statusAfterCheck(status, state, record, now);

    reportMonitoringHealth();
    opts.record?.(record);
    handleTaskDecision(record);
  }

  async function run() {
    while (!signal.aborted && job.running()) {
      await waitForPoll(opts.tickMs ?? 1000, signal);
      if (signal.aborted || !job.running()) break;

      collectOutput();
      if (Date.now() >= state.nextCheck) await checkTask();
    }
    status = endMonitoring(status, job.running() ? 'detached' : 'finished');
  }

  function reportFailure(error: unknown) {
    status = endMonitoring(status, 'failed', errorMessage(error));
    sendEvent(
      'monitor-failed',
      `Monitoring ended unexpectedly: ${status.error}. The job may still be running.`,
    );
  }

  const ended = run()
    .catch(reportFailure)
    .finally(() => completed.abort());
  return { ended, snapshot };
}

async function waitForPoll(milliseconds: number, signal: AbortSignal) {
  try {
    await delay(milliseconds, undefined, { signal });
  } catch (error) {
    if (!signal.aborted) throw error;
  }
}

async function askJudge(opts: WatchOptions, input: JudgeInput, lifetime: AbortSignal) {
  const signal = AbortSignal.any([lifetime, AbortSignal.timeout(opts.judgeTimeoutMs)]);
  try {
    const verdict = await opts.judge.decide(input, options, signal);
    return { verdict, error: undefined };
  } catch (error) {
    return { verdict: undefined, error: errorMessage(error) };
  }
}

function canStopJob(record: CheckRecord): boolean {
  return (
    record.action.kind === 'stop' &&
    !record.state.sourceErrors?.length &&
    Boolean(record.state.recentOutput.trim())
  );
}

function describeDecision(verdict: Verdict): string {
  return (
    verdict.reason ??
    `Judge selected ${verdict.choice}. Review the attached evidence; the provider did not supply an explanation.`
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
