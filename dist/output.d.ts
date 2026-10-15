export interface OutputEvidence {
    recentOutput: string;
    newLines: number;
    outputChanged: boolean;
    mostRepeated: {
        line: string;
        count: number;
    } | null;
    lossy: boolean;
}
export interface OutputState {
    readonly text: string;
    readonly truncated: boolean;
    readonly lines: readonly string[];
    readonly newLines: number;
    readonly tail: string;
    readonly tailLossy: boolean;
    readonly changed: boolean;
    readonly lossy: boolean;
}
export declare const emptyOutput: () => OutputState;
/** Return new state; neither the previous state nor its line window is mutated. */
export declare function appendOutput(state: OutputState, chunk: {
    text: string;
    lossy: boolean;
}): OutputState;
export declare function outputEvidence(state: OutputState): OutputEvidence;
/** Start a new evidence window, retaining output and the unfinished line. */
export declare const resetEvidence: (state: OutputState) => OutputState;
