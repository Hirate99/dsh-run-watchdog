import type { OutputEvidence } from './output';

export const intervals = [10, 30, 60, 120, 300, 600] as const;
export type Choice = 'continue' | 'notify_agent' | 'stop' | 'uncertain';

export interface Task {
  purpose: string;
  command: string;
  successSignal?: string;
  autoStop?: boolean;
}

/** What the judge sees at one check. Output is evidence, never instructions. */
export interface JudgeInput extends OutputEvidence {
  purpose: string;
  command: string;
  successSignal?: string;
  elapsedSeconds: number;
  previousDecision?: Choice;
  outputSources?: string[];
  sourceErrors?: string[];
}

/** Only Jev returns probabilities; without them a verdict can never authorize a stop. */
export interface Verdict {
  choice: Choice;
  probabilities?: Partial<Record<Choice, number>>;
  checkAfterSeconds?: (typeof intervals)[number];
  reason?: string;
}

export interface Judge {
  decide(
    state: JudgeInput,
    options: Record<Choice, string>,
    signal: AbortSignal,
  ): Promise<Verdict>;
}

export type Action =
  { kind: 'wait'; seconds: number } | { kind: 'notify' } | { kind: 'stop' };

export const options = {
  continue:
    'The task is making useful progress or legitimately waiting. No intervention is needed.',
  notify_agent:
    'Notify the main agent when a user-requested alert condition occurs, even if expected or deliberately produced. Also notify when input, investigation, or outside changes are needed. Notification keeps the process running.',
  stop: 'Clear evidence shows continuing cannot advance the stated purpose.',
  uncertain: 'Insufficient evidence to choose a next step.',
} as Record<Choice, string>;

export function decide(
  verdict: Verdict,
  fallback: number,
  autoStop = false,
  stopThreshold = 0.8,
): Action {
  const { choice, probabilities } = verdict;
  const stopProbability = probabilities?.stop ?? 0;
  if (choice === 'stop' && probabilities && stopProbability >= stopThreshold) {
    return { kind: autoStop ? 'stop' : 'notify' };
  }
  if (choice === 'stop' || choice === 'notify_agent') {
    return { kind: 'notify' };
  }
  return { kind: 'wait', seconds: verdict.checkAfterSeconds ?? fallback };
}

const inputPrompt = /\[y\/n\]|password:|press (enter|any key)/i;

/** Comparison signals only; these rules never trigger an action. */
export function baseline(output: OutputEvidence): string[] {
  const signals = {
    'unchanged-output': !output.outputChanged,
    'repeated-line': (output.mostRepeated?.count ?? 0) >= 5,
    'possible-input-prompt': inputPrompt.test(output.recentOutput),
  };
  return Object.entries(signals)
    .filter(([, matched]) => matched)
    .map(([name]) => name);
}
