import { type JobId, type JobRegistry } from '@deepseek-ai/dsh-jobs';
import type { SessionId } from '@deepseek-ai/dsh-session';
import type { RunningJob } from './monitor';

/** Independent ring cursor: monitoring never consumes the agent's output. */
export function observeJob(jobs: JobRegistry, id: JobId, owner?: SessionId): RunningJob & { dispose(): void } {
  let cursor = 0;
  const { promise: done, resolve } = Promise.withResolvers<void>();
  const running = () => ['running', 'stopping'].includes(jobs.get(id, owner).status);
  const dispose = jobs.events.subscribe(owner ? { owner } : { owners: 'scope' }, event => {
    if (event.type === 'settled' && event.job.id === id) resolve();
  });
  if (!running()) resolve();
  return {
    done, running, dispose,
    read() {
      const read = jobs.readAt(id, cursor, owner);
      cursor = read.next;
      return { text: read.chunks.map(chunk => chunk.text).join(''), lossy: read.lossy };
    },
    stop(reason) { jobs.kill(id, owner, reason); },
  };
}

export function jobSnapshot(jobs: JobRegistry, id: JobId, owner: SessionId | undefined, status: string) {
  const view = jobs.get(id, owner);
  const read = jobs.readAt(id, 0, owner);
  const text = read.chunks.map(chunk => chunk.text).join('');
  return {
    status, jobId: id, jobStatus: view.status, detail: view.detail ?? '',
    output: text.slice(-16_000), outputTruncated: read.lossy || text.length > 16_000,
    outputFiles: [...(view.output.spillPaths ?? [])], decision: '', note: '',
  };
}
