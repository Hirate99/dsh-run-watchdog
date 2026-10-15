import { setTimeout as delay } from 'node:timers/promises';
import { baseline, choices, decide, intervals, type Action, type Choice, type Judge, type Snapshot, type Task, type Verdict } from './decision.js';

export interface RunningJob {
  done: Promise<void>;
  running(): boolean;
  read(): { text: string; lossy: boolean };
  stop(reason: string): void;
}
export interface MonitorConfig {
  mode?: 'shadow' | 'enforce';
  firstCheckMs?: number;
  judgeTimeoutMs?: number;
  stopThreshold?: number;
  record?(event: CheckRecord): void;
}
export interface CheckRecord {
  state: Snapshot;
  baseline: string[];
  verdict?: Verdict;
  action: Action;
  error?: string;
}
export interface MonitorResult {
  status: 'finished' | 'notify' | 'detached' | 'stop-requested';
  output: string;
  decision?: Choice;
}

export async function monitor(job: RunningJob, task: Task, judge: Judge, config: MonitorConfig = {}, caller = new AbortController().signal): Promise<MonitorResult> {
  const lifetime = new AbortController();
  const signal = AbortSignal.any([caller, lifetime.signal]);
  void job.done.then(() => lifetime.abort());
  const started = Date.now();
  let waitMs = config.firstCheckMs ?? 10_000;
  let checks = 0;
  let output = '';
  let ready = false;
  let previousDecision: Choice | undefined;
  const read = () => {
    const chunk = job.read();
    output = (output + chunk.text).slice(-16_000);
    ready ||= !!task.readyPattern && output.includes(task.readyPattern);
    return chunk;
  };
  try {
    while (job.running()) {
      await delay(waitMs, undefined, { signal });
      if (!job.running()) break;
      const chunk = read();
      const lines = chunk.text.split(/\r?\n|\r/).filter(Boolean);
      const counts = new Map<string, number>();
      for (const line of lines) counts.set(line, (counts.get(line) ?? 0) + 1);
      const repeated = [...counts].sort((a, b) => b[1] - a[1])[0];
      const state: Snapshot = {
        task, elapsedSeconds: (Date.now() - started) / 1000, recentOutput: output,
        newLines: lines.length, outputChanged: chunk.text.length > 0,
        mostRepeated: repeated ? { line: repeated[0], count: repeated[1] } : null,
        lossy: chunk.lossy, ready, previousDecision,
      };
      const fallback = intervals[Math.min(++checks, intervals.length - 1)]!;
      let verdict: Verdict | undefined;
      let action: Action = { kind: 'wait', seconds: fallback };
      let error: string | undefined;
      try {
        verdict = await judge.decide(state, choices(state), AbortSignal.any([signal, AbortSignal.timeout(config.judgeTimeoutMs ?? 8_000)]));
        action = decide(verdict, state, fallback, config.stopThreshold);
      } catch (cause) {
        if (signal.aborted) break;
        error = cause instanceof Error ? cause.message : String(cause);
      }
      if (!job.running() || signal.aborted) break;
      config.record?.({ state, baseline: baseline(state), verdict, action, error });
      previousDecision = verdict?.choice;
      if (config.mode !== 'enforce') action = { kind: 'wait', seconds: action.kind === 'wait' ? action.seconds : fallback };
      if (action.kind === 'wait') { waitMs = action.seconds * 1000; continue; }
      if (action.kind === 'stop') {
        job.stop('watchdog: Jev stop probability reached configured threshold');
        return { status: 'stop-requested', output, decision: previousDecision };
      }
      return { status: action.kind === 'notify' ? 'notify' : 'detached', output, decision: previousDecision };
    }
    caller.throwIfAborted();
    read();
    return { status: 'finished', output };
  } catch (error) {
    if (caller.aborted) { job.stop('watchdog: caller cancelled'); throw error; }
    if (!lifetime.signal.aborted) throw error;
    read();
    return { status: 'finished', output };
  } finally {
    lifetime.abort();
  }
}
