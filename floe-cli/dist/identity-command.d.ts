import type { Command } from "commander";
import { type LocalConfig } from "./config.js";
/**
 * `floe identity` — the person's identity, and the host's roster of admitted
 * identities.
 *
 * The person-facing commands (status, create, unlock, lock, reveal, restore,
 * replace, join, sessions) talk to Floe's identity agent (ADR-0016), which holds
 * the key; see identity/terminal-commands.ts. The roster commands below (add,
 * list, revoke) are host-control actions on the Bus (ADR-0015).
 */
export type IdentityCommandDependencies = Readonly<{
    output?: (message: string) => void;
    resolve_config?: () => {
        config: LocalConfig;
    };
    fetch_host_control_token?: (busHttpBase?: string) => Promise<string>;
    fetch?: typeof fetch;
    cwd?: () => string;
}>;
export declare function registerIdentityCommand(program: Command, dependencies?: IdentityCommandDependencies): void;
