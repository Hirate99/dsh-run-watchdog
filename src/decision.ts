import type { OutputEvidence } from './output';

export const intervals = [10, 30, 60, 120, 300, 600] as const;
export type Choice = `check_${typeof intervals[number]}s` | 'notify_agent' | 'stop' | 'uncertain';

export interface Task {
  purpose: string;
  command: string;
  successSignal?: string;
  /** Literal readiness marker for standalone observation-loop callers. */
  readyPattern?: string;
  autoStop?: boolean;
}

/** What the judge sees at one check. Output is evidence, never instructions. */
export interface JudgeInput extends OutputEvidence {
  purpose: string;
  command: string;
  successSignal?: string;
  elapsedSeconds: number;
  previousDecision?: Choice;
}

/** Only Jev returns probabilities; without them a verdict can never authorize a stop. */
export interface Verdict {
  choice: Choice;
  probabilities?: Partial<Record<Choice, number>>;
}

export interface Judge {
  decide(state: JudgeInput, options: Record<Choice, string>, signal: AbortSignal): Promise<Verdict>;
}

export type Action = { kind: 'wait'; seconds: number } | { kind: 'notify' } | { kind: 'stop' };

export const options = {
  ...Object.fromEntries(intervals.map(s => [`check_${s}s`, `Continue running; check again in ${s} seconds. Prefer longer intervals for stable long tasks, shorter intervals for emerging problems.`])),
  notify_agent: 'Notify the main agent when a user-requested alert condition occurs, even if expected or deliberately produced. Also notify when input, investigation, or outside changes are needed. Notification keeps the process running.',
  stop: 'Clear evidence shows continuing cannot advance the stated purpose.',
  uncertain: 'Insufficient evidence to choose a next step.',
} as Record<Choice, string>;

/** Probability on stop + notify that hands control back. Provisional; calibrate on recorded checks. */
const attentionThreshold = 0.4;

export function decide(verdict: Verdict, fallback: number, autoStop = false, stopThreshold = 0.8): Action {
  const { choice, probabilities } = verdict;
  const stopProbability = probabilities?.stop ?? 0;
  const notifyProbability = probabilities?.notify_agent ?? 0;

  if (probabilities && stopProbability >= stopThreshold) {
    return { kind: autoStop ? 'stop' : 'notify' };
  }
  if (choice === 'stop' || choice === 'notify_agent') {
    return { kind: 'notify' };
  }
  if (!probabilities) {
    const seconds = intervals.find(seconds => choice === `check_${seconds}s`);
    return { kind: 'wait', seconds: seconds ?? fallback };
  }
  if (stopProbability + notifyProbability >= attentionThreshold) {
    return { kind: 'notify' };
  }
  return { kind: 'wait', seconds: chooseInterval(probabilities, fallback) };
}

function chooseInterval(probabilities: NonNullable<Verdict['probabilities']>, fallback: number): number {
  let totalProbability = 0;
  let highestProbability = -1;
  let selectedSeconds: number = intervals[0];

  // Compare all "continue" choices together against uncertainty.
  // Equal probabilities keep the shorter interval.
  for (const seconds of intervals) {
    const probability = probabilities[`check_${seconds}s`] ?? 0;
    totalProbability += probability;
    if (probability > highestProbability) {
      highestProbability = probability;
      selectedSeconds = seconds;
    }
  }
  const uncertainProbability = probabilities.uncertain ?? 0;
  return totalProbability < uncertainProbability ? fallback : selectedSeconds;
}

const inputPrompt = /\[y\/n\]|password:|press (enter|any key)/i;

/** Comparison signals only; these rules never trigger an action. */
export function baseline(output: OutputEvidence): string[] {
  const signals = {
    'unchanged-output': !output.outputChanged,
    'repeated-line': (output.mostRepeated?.count ?? 0) >= 5,
    'possible-input-prompt': inputPrompt.test(output.recentOutput),
  };
  return Object.entries(signals).filter(([, matched]) => matched).map(([name]) => name);
}
