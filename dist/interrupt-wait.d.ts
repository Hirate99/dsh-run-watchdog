import type { Context } from '@deepseek-ai/cordis';
import type { SessionId } from '@deepseek-ai/dsh-session';
/** Release only output waits in the alerted session, never the agent or its jobs. */
export declare function interruptibleOutputWaits(ctx: Context): (owner: SessionId) => void;
