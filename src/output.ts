const outputLimit = 16_000;
const repeatWindow = 2_000;

export interface OutputEvidence {
  recentOutput: string;
  newLines: number;
  outputChanged: boolean;
  mostRepeated: { line: string; count: number } | null;
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

export const emptyOutput = (): OutputState => ({
  text: '', truncated: false, lines: [], newLines: 0,
  tail: '', tailLossy: false, changed: false, lossy: false,
});

/** Return new state; neither the previous state nor its line window is mutated. */
export function appendOutput(state: OutputState, chunk: { text: string; lossy: boolean }): OutputState {
  const truncated = state.truncated || chunk.lossy || state.text.length + chunk.text.length > outputLimit;
  const lossy = state.lossy || chunk.lossy;
  if (!chunk.text) return { ...state, truncated, lossy };

  const parts = (state.tail + chunk.text).split(/\r?\n|\r/);
  const unfinished = parts.pop()!;
  const complete = parts.filter(Boolean);
  return {
    text: (state.text + chunk.text).slice(-outputLimit),
    truncated,
    lines: [...state.lines, ...complete.slice(-repeatWindow).map(line => line.slice(-outputLimit))].slice(-repeatWindow),
    newLines: state.newLines + complete.length,
    tail: unfinished.slice(-outputLimit),
    tailLossy: unfinished.length > outputLimit || (parts.length === 0 && state.tailLossy),
    changed: true,
    lossy: lossy || state.tailLossy || unfinished.length > outputLimit || parts.some(line => line.length > outputLimit),
  };
}

export function outputEvidence(state: OutputState): OutputEvidence {
  const counts = new Map<string, number>();
  let mostRepeated: OutputEvidence['mostRepeated'] = null;
  for (const line of state.lines) counts.set(line, (counts.get(line) ?? 0) + 1);
  for (const [line, count] of counts) {
    if (!mostRepeated || count > mostRepeated.count) mostRepeated = { line, count };
  }
  return {
    recentOutput: state.text,
    newLines: state.newLines,
    outputChanged: state.changed,
    mostRepeated,
    lossy: state.lossy,
  };
}

/** Start a new evidence window, retaining output and the unfinished line. */
export const resetEvidence = (state: OutputState): OutputState => ({
  ...state, lines: [], newLines: 0, changed: false, lossy: false,
});
