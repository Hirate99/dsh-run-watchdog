import { type Action, type Choice, type JudgeInput, type Task } from './decision';
import { type OutputState } from './output';
import type { WatchOptions } from './monitor';
export interface MonitorState {
    readonly started: number;
    readonly output: OutputState;
    readonly checks: number;
    readonly failures: number;
    readonly previous?: Choice;
    readonly nextCheck: number;
}
export declare const initialState: (now: number, firstCheckMs: number) => MonitorState;
/** Time is an input, so scheduling can be tested without timers. */
export declare function planTick(state: MonitorState, task: Task, opts: Pick<WatchOptions, 'maxWaitMs' | 'recordAfterMs'>, handedOffAt: number | undefined, now: number): {
    readonly handoff: "ready" | "still-running" | undefined;
    readonly end: boolean;
    readonly check: boolean;
};
export declare function beginCheck(state: MonitorState, task: Task, now: number): {
    snapshot: JudgeInput;
    fallback: 10 | 30 | 60 | 120 | 300 | 600;
    state: {
        started: number;
        failures: number;
        previous?: Choice;
        nextCheck: number;
        checks: number;
        output: OutputState;
    };
};
export declare const scheduleNext: (state: MonitorState, action: Action, fallback: number, choice: Choice | undefined, now: number) => MonitorState;
