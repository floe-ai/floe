/**
 * The identity agent's local channel: where it listens, how each side proves it
 * runs as the same OS user, and how messages are framed.
 *
 * Address: fixed by the Floe home, so nothing has to be looked up. Windows uses
 * a named pipe; macOS and Linux use a Unix socket inside the Floe home.
 *
 * Proof: on every start the agent writes a fresh secret to a file in the Floe
 * home that only this OS user can read. Each side proves knowledge of it with
 * an HMAC over the other side's nonce; the secret itself never crosses the
 * channel. The client proves itself so another OS user cannot use the agent.
 * The agent proves itself so a process squatting the pipe name (a Windows pipe
 * name is machine-wide) cannot pose as it and collect passphrases.
 *
 * Framing: one JSON object per line, capped in size.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
export const PROTOCOL_VERSION = 1;
export const MAX_LINE_BYTES = 1024 * 1024;
/** The home as the vault and the pipe name see it: absolute, case-folded on Windows. */
export function canonicalHome(home) {
    const absolute = resolve(home);
    return process.platform === "win32" ? absolute.toLowerCase() : absolute;
}
export function agentAddress(home) {
    if (process.platform === "win32") {
        const digest = createHash("sha256").update(canonicalHome(home)).digest("hex").slice(0, 24);
        return `\\\\.\\pipe\\floe-identity-${digest}`;
    }
    return join(home, "run", "identity.sock");
}
export function runDir(home) {
    return join(home, "run");
}
export function runFilePath(home) {
    return join(runDir(home), "identity-agent.json");
}
export function newAgentSecret() {
    return randomBytes(32).toString("hex");
}
export function writeRunFile(home, run) {
    const dir = runDir(home);
    mkdirSync(dir, { recursive: true });
    try {
        chmodSync(dir, 0o700);
    }
    catch { /* Windows: profile ACL */ }
    const path = runFilePath(home);
    const temporary = `${path}.${process.pid}.tmp`;
    writeFileSync(temporary, JSON.stringify(run, null, 2) + "\n", { encoding: "utf8", mode: 0o600 });
    renameSync(temporary, path);
}
export function readRunFile(home) {
    const path = runFilePath(home);
    if (!existsSync(path))
        return null;
    try {
        const value = JSON.parse(readFileSync(path, "utf8"));
        if (typeof value.secret !== "string" || typeof value.address !== "string" || typeof value.pid !== "number")
            return null;
        return value;
    }
    catch {
        return null;
    }
}
export function newNonce() {
    return randomBytes(16).toString("hex");
}
export function proof(secret, role, nonce) {
    return createHmac("sha256", Buffer.from(secret, "hex")).update(`floe-identity:${role}:${nonce}`).digest("hex");
}
export function proofMatches(expected, received) {
    if (typeof received !== "string" || received.length !== expected.length)
        return false;
    return timingSafeEqual(Buffer.from(expected), Buffer.from(received));
}
/** Split a byte stream into JSON messages. Calls onError for oversize or bad JSON. */
export function lineReader(onMessage, onError) {
    let buffer = "";
    return (chunk) => {
        buffer += chunk.toString();
        if (Buffer.byteLength(buffer) > MAX_LINE_BYTES && !buffer.includes("\n")) {
            buffer = "";
            onError("message too large");
            return;
        }
        let index;
        while ((index = buffer.indexOf("\n")) >= 0) {
            const line = buffer.slice(0, index).trim();
            buffer = buffer.slice(index + 1);
            if (!line)
                continue;
            let parsed;
            try {
                parsed = JSON.parse(line);
            }
            catch {
                onError("invalid JSON");
                return;
            }
            if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
                onError("message is not an object");
                return;
            }
            onMessage(parsed);
        }
    };
}
export function frame(message) {
    return JSON.stringify(message) + "\n";
}
