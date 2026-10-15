import { type Action, type Choice, type Judge, type JudgeInput, type Task, type Verdict } from './decision';
export interface RunningJob {
    done: Promise<void>;
    running(): boolean;
    read(): {
        text: string;
        lossy: boolean;
    };
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
export declare function watch(job: RunningJob, task: Task, opts: WatchOptions, caller: AbortSignal, lifetime: AbortSignal): {
    handoff: Promise<Handoff>;
    ended: Promise<void>;
};
