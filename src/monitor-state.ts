import {
  decide,
  intervals,
  type Choice,
  type JudgeInput,
  type Task,
  type Verdict,
} from './decision';
import type { CheckRecord, MonitorStatus, RunningJob, WatchOptions } from './monitor';
import {
  appendOutput,
  emptyOutput,
  outputEvidence,
  resetEvidence,
  type OutputState,
} from './output';

export interface MonitorState {
  readonly started: number;
  readonly output: OutputState;
  readonly checks: number;
  readonly failures: number;
  readonly previous?: Choice;
  readonly nextCheck: number;
}

export function initialState(now: number, firstCheckMs: number): MonitorState {
  return {
    started: now,
    output: emptyOutput(),
    checks: 0,
    failures: 0,
    nextCheck: now + firstCheckMs,
  };
}

export function initialStatus(opts: WatchOptions, nextCheckAt: number): MonitorStatus {
  return {
    status: 'monitoring',
    mode: opts.mode,
    health: 'awaiting-output',
    outputSources: opts.outputSources ?? ['job stdout/stderr'],
    sourceErrors: [],
    checks: 0,
    consecutiveFailures: 0,
    lastCheckAt: null,
    nextCheckAt,
    lastCheck: null,
    error: null,
  };
}

export function receiveOutput(
  state: MonitorState,
  sample: ReturnType<RunningJob['read']>,
): MonitorState {
  return { ...state, output: appendOutput(state.output, sample) };
}

/** Capture the evidence before clearing counters for the next sampling window. */
export function beginCheck(state: MonitorState, task: Task, now: number) {
  const snapshot: JudgeInput = {
    purpose: task.purpose,
    command: task.command,
    successSignal: task.successSignal,
    elapsedSeconds: Math.round((now - state.started) / 1000),
    previousDecision: state.previous,
    ...outputEvidence(state.output),
  };
  const retryIndex = Math.min(state.failures + 1, intervals.length - 1);
  return {
    snapshot,
    fallback: intervals[retryIndex]!,
    state: {
      ...state,
      checks: state.checks + 1,
      output: resetEvidence(state.output),
    },
  };
}

/** An alert and its next check time are independent decisions. */
export function completeCheck(
  state: MonitorState,
  verdict: Verdict | undefined,
  task: Task,
  threshold: number,
  fallback: number,
  now: number,
) {
  const action = verdict
    ? decide(verdict, fallback, task.autoStop, threshold)
    : { kind: 'wait' as const, seconds: fallback };
  const seconds = verdict?.checkAfterSeconds ?? fallback;
  return {
    action,
    state: {
      ...state,
      failures: verdict ? 0 : state.failures + 1,
      previous: verdict?.choice ?? state.previous,
      nextCheck: now + seconds * 1000,
    },
  };
}

export function statusAfterCheck(
  status: MonitorStatus,
  state: MonitorState,
  record: CheckRecord,
  now: number,
): MonitorStatus {
  return {
    ...status,
    checks: state.checks,
    consecutiveFailures: state.failures,
    lastCheckAt: now,
    nextCheckAt: state.nextCheck,
    lastCheck: record,
    error: record.error ?? null,
  };
}

export function endMonitoring(
  status: MonitorStatus,
  outcome: MonitorStatus['status'],
  error: string | null = null,
): MonitorStatus {
  return {
    ...status,
    status: outcome,
    health: error ? 'degraded' : status.health,
    nextCheckAt: null,
    error: error ?? status.error,
  };
}

/** Missing evidence and a failed judge are monitoring problems, not task diagnoses. */
export function monitoringHealth(
  status: Pick<MonitorStatus, 'sourceErrors' | 'consecutiveFailures' | 'error'>,
  hasOutput: boolean,
) {
  if (status.sourceErrors.length) {
    return {
      health: 'degraded' as const,
      incident: 'source',
      message: status.sourceErrors.join('; '),
    };
  }
  if (status.consecutiveFailures >= 2) {
    return {
      health: 'degraded' as const,
      incident: 'judge',
      message: `Judge unavailable after ${status.consecutiveFailures} consecutive attempts: ${status.error}`,
    };
  }
  if (!hasOutput) {
    return {
      health: 'awaiting-output' as const,
      incident: 'empty',
      message:
        'No readable output yet. Task health cannot be established; it may be quiet or logging elsewhere.',
    };
  }
  return {
    health: 'ok' as const,
    incident: '',
    message: 'Output and judge checks are available again. Monitoring continues.',
  };
}
