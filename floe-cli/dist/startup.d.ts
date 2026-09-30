import type { LocalConfig } from "./config.js";
export declare class ForeignBusError extends Error {
    readonly url: string;
    readonly code: "E_FOREIGN_BUS";
    constructor(url: string, detail: string);
}
type BusHealth = {
    ok: boolean;
    instance_id: string | null;
    version: string | null;
};
export declare function fetchBusHealth(baseUrl: string): Promise<BusHealth | null>;
export declare function isHealthy(baseUrl: string): Promise<boolean>;
/** The version the bus serving at `baseUrl` reports; null if unreachable or it reports none. */
export declare function runningBusVersion(baseUrl: string): Promise<string | null>;
/**
 * Compare this copy's version with the serving bus. Connect-first means the
 * running substrate is the truth: a mismatch is stated, never "fixed" by
 * restarting someone else's Floe. Returns the message to show, or null.
 */
export declare function describeVersionMismatch(url: string, ownVersion: string | null, busVersion: string | null): string | null;
/** Numeric dotted-version comparison; pre-release tags are ignored. */
export declare function compareVersions(a: string, b: string): number;
/**
 * Classify what, if anything, is answering on the Bus URL.
 * - "absent": nothing healthy is there; we may start our own bus.
 * - "mine": the process we recorded is running and its /health instance id
 *    matches the record — proven to be our bus.
 * - "foreign": something healthy is answering, but we cannot prove it is the
 *    process we started (different install, or a stale predecessor). Refuse.
 */
export declare function classifyRunningBus(configPath: string, config: LocalConfig): Promise<{
    state: "absent";
} | {
    state: "mine";
} | {
    state: "foreign";
    detail: string;
}>;
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
 * `floe <surface>`. It runs as one start (start-lock.ts): a client that
 * arrives while another start is running waits for it, then connects.
 */
export declare function ensureSubstrateForClient(configPath: string, config: LocalConfig): Promise<SubstratePlan>;
export declare function floeHome(configPath: string, config: LocalConfig): string;
/**
 * Connect-first for the identity agent: if one already answers for this Floe
 * home (from this copy or another), use it. Otherwise start ours and wait until
 * it completes a real handshake, failing with its log if it exits first.
 */
export declare function ensureIdentityAgent(configPath: string, config: LocalConfig): Promise<void>;
/**
 * Start Floe for this home. Starts of the same home take turns (start-lock.ts),
 * so a second start waits for the first and then finds its services running.
 */
export declare function startAll(configPath: string, config: LocalConfig): Promise<void>;
/** Stop in reverse start order: nothing is left running that depends on a stopped service. */
export declare function stopAll(configPath: string, config: LocalConfig): void;
/**
 * Stop and start Floe as one start (start-lock.ts), so no other start runs in
 * between. `beforeStop` runs while the lock is held, immediately before
 * anything is stopped; returning false leaves everything running.
 */
export declare function restartAll(configPath: string, config: LocalConfig, beforeStop?: () => Promise<boolean>): Promise<boolean>;
/**
 * Connect-first for the Bridge: if its engine control answers for this Floe
 * home, use it. Otherwise start it with a fresh service credential, obtained
 * through the native broker and handed over in its environment only, and wait
 * until its engine control answers. Launching is not starting: a Bridge that
 * died on its first line must not be reported as started.
 */
export declare function ensureBridge(configPath: string, config: LocalConfig): Promise<void>;
export {};
