import type { Judge } from './decision';
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
