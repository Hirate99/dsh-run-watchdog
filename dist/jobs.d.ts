import { type JobId, type JobRegistry } from '@deepseek-ai/dsh-jobs';
import type { SessionId } from '@deepseek-ai/dsh-session';
import type { RunningJob } from './monitor';
/** Independent ring cursor: monitoring never consumes the agent's output. */
export declare function observeJob(jobs: JobRegistry, id: JobId, owner?: SessionId): RunningJob & {
    dispose(): void;
};
export declare function jobSnapshot(jobs: JobRegistry, id: JobId, owner: SessionId | undefined, status: string): {
    status: string;
    jobId: JobId;
    jobStatus: import("@deepseek-ai/dsh-jobs").JobStatus;
    detail: string;
    output: string;
    outputTruncated: boolean;
    outputFiles: string[];
    decision: string;
    note: string;
};
