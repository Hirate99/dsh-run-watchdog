import type { Context } from '@deepseek-ai/cordis';
import type { Config } from './index';
import { type JudgeInput } from './decision';
/** Jev has its own key; DeepSeek reuses whatever reference the DSH model settings use. */
export declare const keyReference: (config: Pick<Config, 'provider' | 'apiKeyEnv'>) => string;
export declare function resolveKey(ctx: Context, config: Pick<Config, 'provider' | 'apiKeyEnv'>): Promise<string>;
export declare function usesAccount(ctx: Context, config: Config): Promise<boolean>;
export declare function resolveJudge(ctx: Context, config: Config): Promise<import("./decision").Judge>;
/** A synthetic "waiting for input" case: a working judge should answer notify_agent. Never runs a command. */
export declare const probe: JudgeInput;
export declare function testConnection(ctx: Context, config: Config, signal: AbortSignal): Promise<{
    choice: import("./decision").Choice;
    latencyMs: number;
}>;
export declare function registerConnectionTest(ctx: Context, currentConfig: () => Config): void;
