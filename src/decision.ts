export const intervals = [10, 30, 60, 120, 300, 600] as const;
export type Choice = `check_${typeof intervals[number]}s` | 'notify_agent' | 'no_more_checks' | 'stop' | 'uncertain';
export interface Task {
  purpose: string;
  command: string;
  successSignal?: string;
  service?: boolean;
  readyPattern?: string;
  autoStop?: boolean;
}
export interface Snapshot {
  task: Task;
  elapsedSeconds: number;
  recentOutput: string;
  newLines: number;
  outputChanged: boolean;
  mostRepeated: { line: string; count: number } | null;
  lossy: boolean;
  ready: boolean;
  previousDecision?: Choice;
}
export type Verdict =
  | { provider: 'jev'; choice: Choice; probabilities: Partial<Record<Choice, number>>; confidence: number }
  | { provider: 'deepseek'; choice: Choice };
export interface Judge {
  decide(state: Snapshot, options: Record<string, string>, signal: AbortSignal): Promise<Verdict>;
}
export type Action = { kind: 'wait'; seconds: number } | { kind: 'notify' | 'detach' | 'stop' };

export function choices(state: Snapshot): Record<string, string> {
  return {
    ...Object.fromEntries(intervals.map(seconds => [`check_${seconds}s`, `Continue running; check again in ${seconds} seconds. Prefer longer intervals for stable long tasks, shorter intervals for emerging problems.`])),
    notify_agent: 'Return control to the main agent: input, investigation, or changed external conditions are needed. Keep the process running.',
    stop: 'Clear evidence shows continuing cannot advance the stated purpose.',
    uncertain: 'Insufficient evidence to choose a next step.',
    ...(state.ready && state.task.service ? { no_more_checks: 'The persistent service is ready. Keep it running without further model checks.' } : {}),
  };
}

export function decide(verdict: Verdict, state: Snapshot, fallback: number, stopThreshold = 0.8): Action {
  if (verdict.provider === 'jev') {
    const stop = verdict.probabilities.stop ?? 0;
    if (stop >= stopThreshold) return { kind: state.task.autoStop ? 'stop' : 'notify' };
    if (stop >= 0.4 || verdict.choice === 'stop') return { kind: 'notify' };
    if (verdict.confidence < 0.5) return { kind: 'wait', seconds: fallback };
  }
  switch (verdict.choice) {
    case 'stop':
    case 'notify_agent': return { kind: 'notify' };
    case 'no_more_checks': return state.task.service && state.ready ? { kind: 'detach' } : { kind: 'wait', seconds: fallback };
    case 'uncertain': return { kind: 'wait', seconds: fallback };
    default: return { kind: 'wait', seconds: Number(verdict.choice.slice(6, -1)) };
  }
}

/** Baseline signals are observations, never authorization to kill. */
export function baseline(state: Snapshot): string[] {
  const signals: string[] = [];
  if (!state.outputChanged) signals.push('unchanged-output');
  if ((state.mostRepeated?.count ?? 0) >= 5) signals.push('repeated-line');
  if (/\[y\/n\]|password:|press (enter|any key)/i.test(state.recentOutput)) signals.push('possible-input-prompt');
  return signals;
}
