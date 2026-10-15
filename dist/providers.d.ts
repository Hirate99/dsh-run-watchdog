import type { Judge } from './decision';
import { type LlmRuntime } from '@deepseek-ai/dsh-llm';
export interface ProviderConfig {
    provider: 'jev' | 'deepseek';
    apiKey: string;
    model: string;
    baseURL?: string;
}
export declare const defaultBaseURL: {
    readonly jev: 'https://api.typesafe.ai/v1';
    readonly deepseek: 'https://api.deepseek.com';
};
export declare const createJudge: (config: ProviderConfig) => Judge;
/** Let DSH own account authentication and transport. */
export declare function accountJudge(llm: LlmRuntime, model: string): Judge;
