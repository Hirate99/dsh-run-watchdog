import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
export { observeJob } from './jobs';
declare module '@deepseek-ai/dsh-llm' {
    interface MessageSourceMap {
        'run-watchdog': {
            kind: 'run-watchdog';
        };
    }
}
export declare const name = "run-watchdog";
export declare const inject: string[];
export declare const Config: z<Schemastery.ObjectS<NoInfer<{
    provider: z<"deepseek" | "jev", "deepseek" | "jev", "volatile-defined">;
    model: z<string, string, "volatile-defined">;
    apiKeyEnv: z<string, string, "defined">;
    baseURL: z<string, string, "plain">;
    mode: z<"enforce" | "shadow", "enforce" | "shadow", "volatile-defined">;
    firstCheckMs: z<number, number, "volatile-defined">;
    judgeTimeoutMs: z<number, number, "volatile-defined">;
    stopThreshold: z<number, number, "volatile-defined">;
    allowAutoStop: z<boolean, boolean, "defined">;
    recordPath: z<string, string, "plain">;
    recordAfterMs: z<number, number, "defined">;
}>>, Schemastery.ObjectT<NoInfer<{
    provider: z<"deepseek" | "jev", "deepseek" | "jev", "volatile-defined">;
    model: z<string, string, "volatile-defined">;
    apiKeyEnv: z<string, string, "defined">;
    baseURL: z<string, string, "plain">;
    mode: z<"enforce" | "shadow", "enforce" | "shadow", "volatile-defined">;
    firstCheckMs: z<number, number, "volatile-defined">;
    judgeTimeoutMs: z<number, number, "volatile-defined">;
    stopThreshold: z<number, number, "volatile-defined">;
    allowAutoStop: z<boolean, boolean, "defined">;
    recordPath: z<string, string, "plain">;
    recordAfterMs: z<number, number, "defined">;
}>>, "plain">;
type RawConfig = ReturnType<typeof Config>;
export type Config = {
    [K in keyof RawConfig]: RawConfig[K] extends {
        get(): infer V;
    } ? V : RawConfig[K];
};
/** Snapshot every volatile field for one operation. */
export declare const readConfig: (raw: RawConfig) => Config;
export declare function apply(ctx: Context, runtime: RawConfig): void;
