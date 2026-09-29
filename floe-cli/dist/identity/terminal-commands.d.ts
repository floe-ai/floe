/**
 * @invariant Cell: floe-cli.cli-process-manager
 * @invariant Module: floe-cli.cli-process-manager.main
 * @invariant Owns person-facing identity command registration, not terminal failure policy.
 * @invariant Identity failures escape to the shared CLI terminal boundary after cleanup.
 * @invariant The identity agent remains the only holder of unlocked identity keys.
 * @invariant Do not print or suppress unexpected command failures here.
 * @invariant Update this block in the same turn when the structural contract changes.
 *
 * `floe identity status|create|unlock|lock|reveal|restore|replace|join|sessions|held|delete`
 *
 * The person's identity from a terminal. Every command is a client of the
 * identity agent, exactly like any surface: the terminal never holds the key.
 * Passphrases and phrases are read with the echo hidden.
 */
import type { Command } from "commander";
import { IdentityError } from "./client.js";
export declare function registerPersonIdentityCommands(identity: Command, configPath: () => string | undefined): void;
export { IdentityError };
