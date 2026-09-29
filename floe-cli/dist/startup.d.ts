import type { LocalConfig } from "./config.js";
export declare class ForeignBusError extends Error {
    readonly url: string;
    readonly code: "E_FOREIGN_BUS";
    constructor(url: string, detail: string);
}
export declare function isHealthy(baseUrl: string): Promise<boolean>;
/** The version the bus serving at `baseUrl` reports; null if unreachable or it reports none. */
export declare function runningBusVersion(baseUrl: string): Promise<string | null>;
/**
 * Compare this copy's version with the serving bus. Connect-first means the
 * running substrate is the truth: a mismatch is stated, never "fixed" by
 * restarting someone else's Floe. Returns the message to show, or null.
 */
export declare function describeVersionMismatch(url: string, ownVersion: string | null, busVersion: string | null): string | null;
/**
 * Wait for the Bus to become healthy, but stay honest about failure. A silent
 * "did not become healthy" with an empty log is exactly the false-signal this
 * project keeps hitting, so this checks two things each loop: is the Bus
 * answering /health, and is the process we started still alive? If the process
 * has exited, we stop waiting immediately and raise with the tail of its log,
 * so the person is told what actually happened instead of watching a spawned-
 * but-dead process time out. This is startup synchronisation against a real
 * readiness signal (/health), not architectural polling of ongoing state.
 */
export declare function waitForBusHealth(configPath: string, config: LocalConfig): Promise<void>;
/**
 * What a client should do about the substrate before using it. A surface (and
 * the launcher) depends on a reachable bus endpoint, not on a process being
 * spawned for it, so the first question is always "is it already serving?".
 *
 * - "connect": something is already serving on the bus URL; use it, spawn
 *    nothing. This is the normal case once Floe has been started once.
 * - "start":  nothing is serving and this machine's policy allows a client to
 *    start the substrate itself (a personal machine).
 * - "blocked": nothing is serving and policy forbids self-start. Floe here is a
 *    managed service; a client must not start a rogue copy and should say so.
 */
export type SubstratePlan = "connect" | "start" | "blocked";
export declare function planSubstrateStart(reachable: boolean, startOnDemand: boolean): SubstratePlan;
/**
 * Connect-first: if the bus is already serving, do nothing and report
 * "connect". Otherwise consult the machine's start_on_demand policy — start the
 * substrate ("start") or refuse and report "blocked". This is the single
 * client-side readiness path shared by the launcher, `floe up`, and
 * `floe <surface>`.
 */
export declare function ensureSubstrateForClient(configPath: string, config: LocalConfig): Promise<SubstratePlan>;
export declare function floeHome(configPath: string, config: LocalConfig): string;
/**
 * Connect-first for the identity agent: if one already answers for this Floe
 * home (from this copy or another), use it. Otherwise start ours and wait until
 * it completes a real handshake, failing with its log if it exits first.
 */
export declare function ensureIdentityAgent(configPath: string, config: LocalConfig): Promise<void>;
export declare function startAll(configPath: string, config: LocalConfig): Promise<void>;
/**
 * Connect-first for the Bridge: if its engine control answers for this Floe
 * home, use it. Otherwise start it with a fresh service credential, obtained
 * through the native broker and handed over in its environment only, and wait
 * until its engine control answers. Launching is not starting: a Bridge that
 * died on its first line must not be reported as started.
 */
export declare function ensureBridge(configPath: string, config: LocalConfig): Promise<void>;
