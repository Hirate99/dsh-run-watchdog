import type { Context } from '@deepseek-ai/cordis';
import { type Key } from './client-locales';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        runWatchdog: Key;
    }
}
export declare const inject: string[];
export declare function apply(ctx: Context): void;
