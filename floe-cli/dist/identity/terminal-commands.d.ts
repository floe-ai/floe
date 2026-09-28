/**
 * `floe identity status|create|unlock|lock|reveal|restore|replace|join|sessions`
 *
 * The person's identity from a terminal. Every command is a client of the
 * identity agent, exactly like any surface: the terminal never holds the key.
 * Passphrases and phrases are read with the echo hidden.
 */
import type { Command } from "commander";
import { IdentityError } from "./client.js";
export declare function registerPersonIdentityCommands(identity: Command, configPath: () => string | undefined): void;
export { IdentityError };
