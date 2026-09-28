import { type LocalConfig } from "./config.js";
export type PromptKey = "start_at_login";
export declare function hasBeenAsked(configPath: string, config: LocalConfig, key: PromptKey): boolean;
export declare function markAsked(configPath: string, config: LocalConfig, key: PromptKey): void;
