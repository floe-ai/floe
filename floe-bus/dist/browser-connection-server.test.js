import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import YAML from "yaml";
import { afterEach, describe, expect, it } from "vitest";
import { defaultConfig } from "./config.js";
import { createBusServer } from "./server.js";
const HOST_TOKEN = `test-browser-host-${"h".repeat(48)}`;
const ORIGIN = "http://localhost:5379";
const hostHeaders = { authorization: `Bearer ${HOST_TOKEN}` };
const cookieHeader = (value) => String(Array.isArray(value) ? value[0] : value).split(";", 1)[0];
const cleanups = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse())
    await cleanup(); });
async function fixture(local = false) {
    const directory = mkdtempSync(join(tmpdir(), "floe-browser-session-"));
    const config = defaultConfig(directory);
    const path = join(directory, "config.yaml");
    writeFileSync(path, YAML.stringify(config));
    const handle = await createBusServer(path, config, { host_control_token: HOST_TOKEN, local_browser_access: local });
    await handle.app.ready();
    const now = new Date().toISOString();
    for (const id of ["workspace:one", "workspace:two"])
        handle.store.workspaceIdentityStore.restoreWorkspace({
            snapshot: { workspace_id: id, name: id, creation_kind: "created", source_workspace_id: null, created_at: now, updated_at: now },
            binding: { host_id: handle.store.localHostId, platform: "windows", locator: join(directory, id.replace(":", "-")), init_authorized: true },
        });
    cleanups.push(async () => { await handle.app.close(); rmSync(directory, { recursive: true, force: true }); });
    return handle;
}
async function connect(handle) {
    const start = await handle.app.inject({ method: "POST", url: "/v1/browser/connections", headers: { origin: ORIGIN } });
    expect(start.statusCode, start.body).toBe(201);
    const pending = cookieHeader(start.headers["set-cookie"]);
    const approve = await handle.app.inject({ method: "POST", url: `/v1/local/browser-connections/${start.json().code}/approve`, headers: hostHeaders, payload: { workspace_id: "workspace:one" } });
    expect(approve.statusCode, approve.body).toBe(200);
    expect(approve.body).not.toMatch(/bearer|token/);
    const claim = await handle.app.inject({ method: "POST", url: "/v1/browser/connections/claim", headers: { origin: ORIGIN, cookie: pending } });
    expect(claim.statusCode, claim.body).toBe(200);
    return { origin: ORIGIN, cookie: `${pending}; ${cookieHeader(claim.headers["set-cookie"])}` };
}
describe("browser authority through the canonical contract", () => {
    it("opens the local workspace without pairing and supports independent workspace requests", async () => {
        const handle = await fixture(true);
        for (const workspace of ["one", "two"])
            handle.store.upsertRuntimeBinding({
                scope: "workspace_default", workspace_id: `workspace:${workspace}`,
                auth_profile: `profile:${workspace}`, provider: "test-provider", model: `model:${workspace}`,
            }, () => { });
        const headers = { origin: ORIGIN, host: "localhost:5379", "sec-fetch-site": "same-origin" };
        const local = await handle.app.inject({ method: "POST", url: "/v1/browser/session/local", headers });
        expect(local.statusCode, local.body).toBe(200);
        expect(local.body).not.toMatch(/bearer|token|principal/);
        const connected = { ...headers, cookie: cookieHeader(local.headers["set-cookie"]) };
        const bootstrap = await handle.app.inject({ url: "/v1/browser/session", headers: connected });
        expect(bootstrap.statusCode, bootstrap.body).toBe(200);
        expect(bootstrap.json().mode).toBe("local");
        expect(bootstrap.json().workspaces).toHaveLength(2);
        expect(bootstrap.json().bindings.map((binding) => binding.model).sort()).toEqual(["model:one", "model:two"]);
        expect(bootstrap.body).not.toMatch(/bearer_token|authority_session_id|locator|principal_id/);
        for (const workspace of ["one", "two", "one"]) {
            const result = await handle.app.inject({ url: `/v1/workspaces/workspace%3A${workspace}/operations`, headers: connected });
            expect(result.statusCode, result.body).toBe(200);
        }
        expect((await handle.app.inject({ url: "/v1/local/workspaces", headers: connected })).statusCode).toBe(401);
        expect((await handle.app.inject({ url: "/v1/local/browser-connections", headers: hostHeaders })).json().connections).toEqual([]);
        const reload = await handle.app.inject({ method: "POST", url: "/v1/browser/session/local", headers: connected });
        expect(cookieHeader(reload.headers["set-cookie"])).toBe(connected.cookie);
    });
    it("keeps remote, forwarded and other-origin connections on the pairing path", async () => {
        const handle = await fixture(true);
        const headers = { origin: ORIGIN, host: "localhost:5379" };
        for (const request of [
            { headers, remoteAddress: "192.168.1.20" },
            { headers: { ...headers, "x-forwarded-for": "192.168.1.20" } },
            { headers: { ...headers, host: "attacker.example" } },
            { headers: { ...headers, origin: "https://attacker.example" } },
            { headers: { ...headers, "sec-fetch-site": "cross-site" } },
        ]) {
            const result = await handle.app.inject({ method: "POST", url: "/v1/browser/session/local", ...request });
            expect(result.statusCode, result.body).toBe(403);
            expect(result.headers["set-cookie"]).toBeUndefined();
        }
        const spoof = await handle.app.inject({ method: "POST", url: "/v1/browser/session/local", headers, payload: { principal_id: "other", grants: ["*"] } });
        expect(spoof.statusCode).toBe(400);
        const disabled = await fixture();
        expect((await disabled.app.inject({ method: "POST", url: "/v1/browser/session/local", headers })).statusCode).toBe(403);
        const remote = await connect(handle);
        expect((await handle.app.inject({ url: "/v1/browser/session", headers: remote })).json().mode).toBe("remote");
        expect((await handle.app.inject({ url: "/v1/workspaces/workspace%3Atwo/operations", headers: remote })).statusCode).toBe(401);
    });
    it("opens only the approved workspace, keeps host control private, and applies revocation immediately", async () => {
        const handle = await fixture();
        const unauth = await handle.app.inject({ url: "/v1/browser/session" });
        expect(unauth.statusCode).toBe(401);
        const spoof = await handle.app.inject({ method: "POST", url: "/v1/browser/connections", headers: { origin: ORIGIN }, payload: { workspace_id: "workspace:two", grants: ["*"] } });
        expect(spoof.statusCode).toBe(400);
        const headers = await connect(handle);
        const bootstrap = await handle.app.inject({ url: "/v1/browser/session", headers });
        expect(bootstrap.statusCode, bootstrap.body).toBe(200);
        expect(bootstrap.json().workspaces.map((item) => item.workspace_id)).toEqual(["workspace:one"]);
        expect(bootstrap.body).not.toMatch(/bearer_token|authority_session_id|locator|principal_id/);
        const own = await handle.app.inject({ url: "/v1/workspaces/workspace%3Aone/operations", headers });
        expect(own.statusCode, own.body).toBe(200);
        const other = await handle.app.inject({ url: "/v1/workspaces/workspace%3Atwo/operations", headers });
        expect(other.statusCode).toBe(401);
        for (const url of ["/v1/local/workspaces", "/v1/local/browser-connections", "/v1/auth/profiles"]) {
            expect((await handle.app.inject({ url, headers })).statusCode).toBe(401);
        }
        const crossOrigin = await handle.app.inject({ url: "/v1/workspaces/workspace%3Aone/operations", headers: { ...headers, origin: "https://attacker.example" } });
        expect(crossOrigin.statusCode).toBe(403);
        const sessions = handle.store.db.prepare("SELECT authority_session_id FROM operation_authority_sessions WHERE interaction_session_id LIKE 'browser:%'").all();
        expect(sessions).toHaveLength(1);
        handle.store.operationAuthoritySessions.revokeSession(sessions[0].authority_session_id);
        expect((await handle.app.inject({ url: "/v1/browser/session", headers })).statusCode).toBe(401);
        expect((await handle.app.inject({ url: "/v1/workspaces/workspace%3Aone/operations", headers })).statusCode).toBe(401);
    });
    it("authenticates the first WebSocket frame and filters workspace updates", async () => {
        const handle = await fixture();
        const headers = await connect(handle);
        const address = await handle.app.listen({ host: "127.0.0.1", port: 0 });
        const { WebSocket } = await import("ws");
        const ws = new WebSocket(address.replace(/^http/, "ws") + "/v1/events/stream", { headers });
        cleanups.push(async () => { ws.terminate(); });
        const messages = [];
        ws.on("message", (data) => messages.push(JSON.parse(String(data))));
        await new Promise((resolve, reject) => { ws.once("open", resolve); ws.once("error", reject); });
        expect(messages).toEqual([]);
        ws.send(JSON.stringify({ type: "authenticate", browser_session: true, workspace_id: "workspace:one" }));
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error("No authenticated stream")), 2_000);
            ws.on("message", (data) => { if (JSON.parse(String(data)).type === "caught_up") {
                clearTimeout(timeout);
                resolve();
            } });
        });
        expect(messages[0]?.type).toBe("authenticated");
        handle.broadcast("browser-proof", { workspace_id: "workspace:two" });
        handle.broadcast("browser-proof", { workspace_id: "workspace:one" });
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error("No workspace update")), 2_000);
            ws.on("message", (data) => { if (JSON.parse(String(data)).type === "browser-proof") {
                clearTimeout(timeout);
                resolve();
            } });
        });
        expect(messages.filter(item => item.type === "browser-proof").map(item => item.payload?.workspace_id)).toEqual(["workspace:one"]);
    });
});
