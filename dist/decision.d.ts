import type { OutputEvidence } from './output';
export declare const intervals: readonly [10, 30, 60, 120, 300, 600];
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
export type Action = {
    kind: 'wait';
    seconds: number;
} | {
    kind: 'notify';
} | {
    kind: 'stop';
};
export declare const options: Record<Choice, string>;
export declare function decide(verdict: Verdict, fallback: number, autoStop?: boolean, stopThreshold?: number): Action;
/** Comparison signals only; these rules never trigger an action. */
export declare function baseline(output: OutputEvidence): string[];
