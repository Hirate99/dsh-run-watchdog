import { intervals, type Action, type Choice, type JudgeInput, type Task } from './decision';
import { emptyOutput, outputEvidence, resetEvidence, type OutputState } from './output';
import type { WatchOptions } from './monitor';

export interface MonitorState {
  readonly started: number;
  readonly output: OutputState;
  readonly checks: number;
  readonly failures: number;
  readonly previous?: Choice;
  readonly nextCheck: number;
}

export const initialState = (now: number, firstCheckMs: number): MonitorState => ({
  started: now, output: emptyOutput(), checks: 0, failures: 0, nextCheck: now + firstCheckMs,
});

/** Time is an input, so scheduling can be tested without timers. */
export function planTick(state: MonitorState, task: Task, opts: Pick<WatchOptions, 'maxWaitMs' | 'recordAfterMs'>, handedOffAt: number | undefined, now: number) {
  const ready = !!task.readyPattern && state.output.text.includes(task.readyPattern);
  let handoff: 'ready' | 'still-running' | undefined;
  if (handedOffAt === undefined) {
    if (ready) handoff = 'ready';
    else if (now - state.started >= opts.maxWaitMs) handoff = 'still-running';
  }
  const backgroundSince = handedOffAt ?? (handoff ? now : undefined);
  return {
    handoff,
    end: backgroundSince !== undefined && now - backgroundSince >= opts.recordAfterMs,
    check: now >= state.nextCheck,
  } as const;
}

export function beginCheck(state: MonitorState, task: Task, now: number) {
  const snapshot: JudgeInput = {
    purpose: task.purpose,
    command: task.command,
    successSignal: task.successSignal,
    elapsedSeconds: Math.round((now - state.started) / 1000),
    previousDecision: state.previous,
    ...outputEvidence(state.output),
  };
  const checks = state.checks + 1;
  return {
    snapshot,
    fallback: intervals[Math.min(checks, intervals.length - 1)]!,
    state: { ...state, checks, output: resetEvidence(state.output) },
  };
}

export const scheduleNext = (state: MonitorState, action: Action, fallback: number, choice: Choice | undefined, now: number): MonitorState => ({
  ...state,
  previous: choice ?? state.previous,
  nextCheck: now + (action.kind === 'wait' ? action.seconds : fallback) * 1000,
});
