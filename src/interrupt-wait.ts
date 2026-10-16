import type { Context } from '@deepseek-ai/cordis';
import type { SessionId } from '@deepseek-ai/dsh-session';
import type {} from '@deepseek-ai/dsh-tools';

/** Release only output waits in the alerted session, never the agent or its jobs. */
export function interruptibleOutputWaits(ctx: Context) {
  const waits = new Map<SessionId, Set<AbortController>>();
  const pendingAlerts = new Set<SessionId>();
  // Keep the interrupt armed while a model response is still in flight.
  ctx.on('session/event', (session, event) => {
    if (event.type === 'user/message' && event.data.source?.kind === 'run-watchdog')
      pendingAlerts.delete(session.id);
  });
  ctx.on('session/disposed', (session) => {
    pendingAlerts.delete(session.id);
  });
  ctx.on('tools/execute', async (exec, next) => {
    if (exec.name !== 'job_output' || !exec.agent) return next();
    if ((exec.arguments as { wait?: boolean }).wait !== true) return next();
    const owner = exec.agent.session.id;
    const original = exec.signal;
    const interrupt = new AbortController();
    const pending = waits.get(owner) ?? new Set<AbortController>();
    waits.set(owner, pending);
    pending.add(interrupt);
    exec.signal = AbortSignal.any([original, interrupt.signal]);
    if (pendingAlerts.has(owner)) interrupt.abort(interruptionReason());
    try {
      return await next();
    } finally {
      exec.signal = original;
      pending.delete(interrupt);
      if (!pending.size) waits.delete(owner);
    }
  });
  return (owner: SessionId) => {
    pendingAlerts.add(owner);
    for (const wait of waits.get(owner) ?? []) {
      wait.abort(interruptionReason());
    }
  };
}

function interruptionReason(): Error {
  return new Error(
    'Watchdog alert: output wait interrupted; background jobs continue running.',
  );
}
