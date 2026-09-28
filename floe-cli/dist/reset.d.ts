/**
 * Factory reset logic for Floe.
 *
 * Wipes all runtime/state data back to a first-run experience while preserving
 * provider credentials and service configuration.
 *
 * Preserved:
 *   - ~/.floe/config.yaml          (service settings: ports, listen addresses)
 *   - ~/.floe/auth/                (provider credentials: OAuth tokens, API keys, profiles)
 *   - ~/.floe/identity/            (the person's identity, unless includeIdentity is set)
 *
 * Wiped (all configured data directories):
 *   - bus data + log dirs          (floe-bus.sqlite — workspaces, contexts, scopes, agents)
 *   - bridge data + log dirs       (bridge runtime state)
 *   - library dirs                 (configs, skills, extensions, mcp, templates)
 *   - services.json                (stale PID/process-manager records)
 *   - run/ and identity agent logs (the agent's per-start secret and log)
 *   - runtime/                     (staged service files; rebuilt on next start)
 */
import type { LocalConfig } from "./config.js";
export interface ResetTarget {
    path: string;
    label: string;
}
export interface ResetPlan {
    wipe: ResetTarget[];
    preserve: ResetTarget[];
}
/**
 * Build the set of paths that will be wiped vs preserved.
 * Does NOT mutate anything on disk.
 */
export type ResetOptions = {
    /** Also remove the person's identity. Off by default: reset keeps who you are. */
    includeIdentity?: boolean;
};
export declare function buildResetPlan(configPath: string, config: LocalConfig, options?: ResetOptions): ResetPlan;
/**
 * Execute the reset: delete all wipeable paths, then recreate the empty
 * directory structure so Floe can start cleanly without re-running setup.
 *
 * Safe to call multiple times (idempotent).
 */
export declare function executeReset(configPath: string, config: LocalConfig, options?: ResetOptions): void;
