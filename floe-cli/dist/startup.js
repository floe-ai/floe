/**
 * startup — the single reusable Floe start sequence.
 *
 * This is the exact path `floe start` runs: obtain the Bus host-control
 * credential from the native broker, start the Bus with it, wait for health,
 * then mint the Bridge service credential on the same broker trust path and
 * start the Bridge with it. It is extracted here (rather than living privately
 * in the CLI entrypoint) so anything that must bring up a real Floe instance —
 * including the vertical-slice test harness — reuses the product path instead
 * of hand-assembling a divergent one.
 *
 * The Bus has one name: config.bus.http_base_url. "Already running" is never
 * decided by whether *something* answers /health on that URL — only by whether
 * the process answering is the exact bus this install started. A different
 * install (or a stale predecessor) answering on the same URL is a foreign bus:
 * we refuse to register or seed into it and fail loudly, because seeding into
 * someone else's live bus while reporting success is the defect this guards.
 */
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolveLocalPath } from "./config.js";
import { readRecords, isPidRunning, startService, serviceLogPath } from "./process-manager.js";
import { probeAgent } from "./identity/connection.js";
import { canonicalHome } from "./identity/protocol.js";
import { fetchHostControlToken, fetchBridgeServiceToken } from "./operation-client.js";
export class ForeignBusError extends Error {
    url;
    code = "E_FOREIGN_BUS";
    constructor(url, detail) {
        super(`Something is already answering at ${url}, but it is not this install's Floe bus (${detail}). `
            + `Refusing to register or seed into it. If this is a stale Floe process, stop it and retry; `
            + `if another Floe install owns this URL, change bus.http_base_url in your config.`);
        this.url = url;
        this.name = "ForeignBusError";
    }
}
async function fetchBusHealth(baseUrl) {
    try {
        const response = await fetch(`${baseUrl.replace(/\/$/, "")}/health`);
        if (!response.ok)
            return null;
        const body = (await response.json());
        return { ok: body.ok === true, instance_id: body.instance_id ?? null, version: body.version ?? null };
    }
    catch {
        return null;
    }
}
export async function isHealthy(baseUrl) {
    return (await fetchBusHealth(baseUrl)) !== null;
}
/** The version the bus serving at `baseUrl` reports; null if unreachable or it reports none. */
export async function runningBusVersion(baseUrl) {
    return (await fetchBusHealth(baseUrl))?.version ?? null;
}
/**
 * Compare this copy's version with the serving bus. Connect-first means the
 * running substrate is the truth: a mismatch is stated, never "fixed" by
 * restarting someone else's Floe. Returns the message to show, or null.
 */
export function describeVersionMismatch(url, ownVersion, busVersion) {
    if (!ownVersion || busVersion === ownVersion)
        return null;
    const serving = busVersion ? `Floe ${busVersion}` : "an older Floe that does not report its version";
    return (`Note: connected to ${serving} at ${url}, but this copy is Floe ${ownVersion}.\n`
        + `It was already running, so it is left as is. To run this version instead, stop it\n`
        + `(\`floe stop\`) and start again.`);
}
/**
 * Classify what, if anything, is answering on the Bus URL.
 * - "absent": nothing healthy is there; we may start our own bus.
 * - "mine": the process we recorded is running and its /health instance id
 *    matches the record — proven to be our bus.
 * - "foreign": something healthy is answering, but we cannot prove it is the
 *    process we started (different install, or a stale predecessor). Refuse.
 */
async function classifyRunningBus(configPath, config) {
    const health = await fetchBusHealth(config.bus.http_base_url);
    if (!health)
        return { state: "absent" };
    const record = readRecords(configPath, config).bus;
    if (record
        && record.instance_id
        && isPidRunning(record.pid)
        && health.instance_id === record.instance_id) {
        return { state: "mine" };
    }
    const detail = !record
        ? "no local record shows this install started it"
        : health.instance_id !== record.instance_id
            ? "its instance id does not match the bus this install started"
            : "the bus process this install started is no longer running";
    return { state: "foreign", detail };
}
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
export async function waitForBusHealth(configPath, config) {
    const baseUrl = config.bus.http_base_url;
    const started = Date.now();
    while (Date.now() - started < 30_000) {
        if (await isHealthy(baseUrl))
            return;
        const record = readRecords(configPath, config).bus;
        if (record && record.pid && !isPidRunning(record.pid)) {
            const logPath = record.log_file ?? serviceLogPath(configPath, config, "bus");
            throw new Error(`floe-bus started but exited before becoming healthy (pid ${record.pid}). `
                + `Last lines of ${logPath}:\n${readLogTail(logPath)}`);
        }
        await sleep(500);
    }
    const record = readRecords(configPath, config).bus;
    const logPath = record?.log_file ?? serviceLogPath(configPath, config, "bus");
    const running = record ? isPidRunning(record.pid) : false;
    throw new Error(`floe-bus did not become healthy at ${baseUrl} within 30s `
        + `(process ${running ? "is still running but not answering" : "is not running"}). `
        + `Last lines of ${logPath}:\n${readLogTail(logPath)}`);
}
function readLogTail(path, lines = 25) {
    try {
        if (!existsSync(path))
            return "(no log output was written)";
        const text = readFileSync(path, "utf8").trimEnd();
        if (!text)
            return "(log file is empty)";
        return text.split(/\r?\n/).slice(-lines).join("\n");
    }
    catch {
        return "(log file could not be read)";
    }
}
export function planSubstrateStart(reachable, startOnDemand) {
    if (reachable)
        return "connect";
    return startOnDemand ? "start" : "blocked";
}
/**
 * Connect-first: if the bus is already serving, do nothing and report
 * "connect". Otherwise consult the machine's start_on_demand policy — start the
 * substrate ("start") or refuse and report "blocked". This is the single
 * client-side readiness path shared by the launcher, `floe up`, and
 * `floe <surface>`.
 */
export async function ensureSubstrateForClient(configPath, config) {
    const reachable = await isHealthy(config.bus.http_base_url);
    const plan = planSubstrateStart(reachable, config.services.start_on_demand);
    if (plan === "start")
        await startAll(configPath, config);
    // The identity agent is a service of its own: a bus that is already serving
    // does not mean an agent is. It shares the Floe home, so any copy may start it.
    if (plan === "connect" && config.services.start_on_demand)
        await ensureIdentityAgent(configPath, config);
    return plan;
}
export function floeHome(configPath, config) {
    return canonicalHome(resolveLocalPath(configPath, config.home, "."));
}
/**
 * Connect-first for the identity agent: if one already answers for this Floe
 * home (from this copy or another), use it. Otherwise start ours and wait until
 * it completes a real handshake, failing with its log if it exits first.
 */
export async function ensureIdentityAgent(configPath, config) {
    const home = floeHome(configPath, config);
    if (await probeAgent(home))
        return;
    const record = await startService(configPath, config, "identity");
    const started = Date.now();
    while (Date.now() - started < 15_000) {
        if (await probeAgent(home))
            return;
        if (record.pid && !isPidRunning(record.pid)) {
            throw new Error(`Floe's identity agent exited before it was ready (pid ${record.pid}). `
                + `Last lines of ${record.log_file}:\n${readLogTail(record.log_file)}`);
        }
        await sleep(200);
    }
    throw new Error(`Floe's identity agent did not become ready within 15s. Last lines of ${record.log_file}:\n${readLogTail(record.log_file)}`);
}
export async function startAll(configPath, config) {
    const busUrl = config.bus.http_base_url;
    const before = await classifyRunningBus(configPath, config);
    if (before.state === "foreign")
        throw new ForeignBusError(busUrl, before.detail);
    if (before.state === "absent") {
        // The Bus refuses to start without the host-control credential owned by the
        // native broker. Obtain it and hand it to the Bus via its environment only;
        // it is never logged or written to disk. Mint a fresh instance id so that,
        // once healthy, we can prove the process answering is the one we launched.
        const instanceId = randomUUID();
        const hostControlToken = await fetchHostControlToken(busUrl);
        await startService(configPath, config, "bus", { FLOE_HOST_CONTROL_TOKEN: hostControlToken }, instanceId);
        await waitForBusHealth(configPath, config);
        // Re-verify: the healthy bus must be the one we just started. If a foreign
        // process raced onto the URL, or ours died and a stale one answers, fail
        // loudly rather than seed into it.
        const after = await classifyRunningBus(configPath, config);
        if (after.state !== "mine") {
            throw new ForeignBusError(busUrl, after.state === "foreign" ? after.detail : "it stopped answering immediately after start");
        }
    }
    // The Bridge authenticates to the Bus as a transport peer. Its ephemeral
    // service credential is minted by the Bus and obtained through the native
    // broker on the same trust path as the host-control token, then handed to the
    // Bridge process environment only — never set by the operator, never on disk.
    const bridgeServiceToken = await fetchBridgeServiceToken("bridge:local", busUrl);
    await startService(configPath, config, "bridge", { FLOE_BRIDGE_SERVICE_TOKEN: bridgeServiceToken });
    await ensureIdentityAgent(configPath, config);
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
