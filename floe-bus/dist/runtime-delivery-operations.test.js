import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import YAML from "yaml";
import { BusStore } from "./store.js";
import { defaultConfig } from "./config.js";
import { registerExecutableActorFixture } from "./executable-actor-test-fixture.js";
import { CANCEL_RUNTIME_DELIVERY_OPERATION_ID as OP } from "./runtime-delivery-operations.js";
const WS = "workspace:stop-response";
const ACTOR = `actor:${WS}:floe`;
const noop = () => { };
describe("direct runtime response cancellation", () => {
    let root;
    let store;
    beforeEach(() => {
        root = mkdtempSync(join(tmpdir(), "floe-stop-response-"));
        const config = defaultConfig(root);
        const configPath = join(root, "config.yaml");
        writeFileSync(configPath, YAML.stringify(config));
        store = new BusStore(configPath, config);
        store.registerEndpoint({ endpoint_id: ACTOR, workspace_id: WS, name: "Floe", bridge_id: "bridge:test", status: "idle" }, noop);
        registerExecutableActorFixture(store, WS, ACTOR);
    });
    afterEach(() => { store.close(); rmSync(root, { recursive: true, force: true }); });
    function start(claim = true) {
        const contextId = store.contextStore.createContext({ workspace_id: WS, scope_id: null, participants: [ACTOR], created_by_endpoint_id: null });
        store.submitPrincipalContextCommunication({ workspace_id: WS, context_id: contextId, principal_id: "operator:test", type: "message",
            recipient_endpoint_id: ACTOR, content: { text: "Make a local brief" }, artefact_version_ids: [], attachment_ingress_ids: [],
            response_expected: true, idempotency_key: `message:${contextId}`, provenance: {
                cause_event_id: null, delivery_ids: [], execution_attempt_id: null, node_execution_id: null, scope_execution_id: null,
            } }, noop);
        const [delivery] = claim ? store.claimDeliveries("bridge:test", 1, noop) : store.listDeliveries({ workspace_id: WS });
        return { delivery, contextId };
    }
    function cancel(deliveryId) {
        return store.cancelRuntimeDelivery({ workspace_id: WS, delivery_id: deliveryId, principal_id: "operator:test", invocation_id: "stop:test" }, noop);
    }
    async function invoke(deliveryId, mode, grants = new Set([OP]), workspaceId = WS) {
        const authority = { principal_id: `principal:${mode}`, boundary: { kind: "workspace", workspace_id: workspaceId }, grants,
            interaction: { mode, session_id: mode, confirmed_prompts: new Set(), approval_refs: new Set() } };
        const request = { operation_id: OP, operation_version: "1", input_schema_version: "1",
            target: { kind: "runtime_delivery", id: deliveryId }, input: {}, idempotency_key: `stop:${mode}:${deliveryId}` };
        return store.operationRegistry.invoke({ authority,
            resolve_resource: target => store.resolveOperationResource(target, authority.boundary) }, request);
    }
    it.each(["interactive", "unattended"])("uses the same operation for %s authority and replays its receipt", async (mode) => {
        const { delivery, contextId } = start();
        const first = await invoke(delivery.delivery_id, mode);
        expect(first).toMatchObject({ kind: "receipt", receipt: { state: "completed", result: { cancelled: true, state: "cancelled", outcome_unknown: true } } });
        expect(await invoke(delivery.delivery_id, mode)).toEqual({ ...first, replayed: true });
        expect(store.getRuntimeDelivery(delivery.delivery_id)?.state).toBe("cancelled");
        expect(store.db.prepare("SELECT DISTINCT state FROM event_queue WHERE delivery_id = ?").all(delivery.delivery_id)).toEqual([{ state: "cancelled" }]);
        expect(store.db.prepare("SELECT count(*) AS n FROM events WHERE context_id = ? AND json_extract(metadata_json, '$.origin') = 'runtime_delivery_cancellation'").get(contextId)).toEqual({ n: 1 });
        expect(() => store.recordRuntimeTurnResult({ delivery_id: delivery.delivery_id, outcome: "completed", text: "Late success" }, noop)).toThrow("cancelled");
        store.reportDeliveryStatus({ bridge_id: "bridge:test", delivery_id: delivery.delivery_id, state: "acknowledged" }, noop);
        expect(store.getRuntimeDelivery(delivery.delivery_id)?.state).toBe("cancelled");
    });
    it("refuses missing grants and cross-workspace targets without stopping work", async () => {
        const { delivery } = start();
        expect(await invoke(delivery.delivery_id, "interactive", new Set())).toMatchObject({ kind: "receipt", receipt: { state: "refused" } });
        expect(await invoke(delivery.delivery_id, "unattended", new Set([OP]), "workspace:other")).toMatchObject({ kind: "receipt", receipt: { state: "refused" } });
        expect(store.getRuntimeDelivery(delivery.delivery_id)?.state).toBe("delivered_to_bridge");
    });
    it("preserves a completion that won the race and does not call it stopped", () => {
        const { delivery } = start();
        const result = store.recordRuntimeTurnResult({ delivery_id: delivery.delivery_id, outcome: "completed", text: "Saved" }, noop);
        expect(cancel(delivery.delivery_id)).toMatchObject({ cancelled: false, state: "completed" });
        store.reportDeliveryStatus({ bridge_id: "bridge:test", delivery_id: delivery.delivery_id, state: "acknowledged" }, noop);
        expect(cancel(delivery.delivery_id)).toMatchObject({ cancelled: false, state: "acknowledged" });
        expect(store.recordRuntimeTurnResult({ delivery_id: delivery.delivery_id, outcome: "completed", text: "Saved" }, noop).result_event.event_id).toBe(result.result_event.event_id);
    });
    it("keeps cancelled work stopped after reopening the database", () => {
        const { delivery } = start();
        cancel(delivery.delivery_id);
        store.close();
        store = new BusStore(join(root, "config.yaml"), defaultConfig(root));
        expect(store.getRuntimeDelivery(delivery.delivery_id)?.state).toBe("cancelled");
        expect(store.claimDeliveries("bridge:test", 10, noop)).toEqual([]);
    });
    it("stops a pushed reservation before claim without claiming uncertain effects", () => {
        const { delivery } = start(false);
        expect(cancel(delivery.delivery_id)).toMatchObject({ cancelled: true, outcome_unknown: false });
        expect(store.claimDeliveries("bridge:test", 10, noop)).toEqual([]);
    });
    it("revokes the cancelled runtime's authority atomically", () => {
        const { delivery } = start();
        const grant = store.capabilityGrantStore.issueGrant({ principal_id: ACTOR,
            boundary: { kind: "workspace", workspace_id: WS }, operation_ids: ["artefact.inspect"],
            expires_at: "2099-01-01T00:00:00.000Z", issuer_id: "principal:test-host", evidence: [{ kind: "test_fixture", ref: "stop" }] });
        const session = store.operationAuthoritySessions.issueSession({ principal_id: ACTOR, workspace_id: WS,
            grant_ids: [grant.grant_id], interaction: { mode: "unattended", session_id: delivery.delivery_id },
            provenance: { cause_event_id: null, delivery_ids: [], execution_attempt_id: null, node_execution_id: null, scope_execution_id: null },
            expires_at: "2099-01-01T00:00:00.000Z" });
        store.db.prepare("UPDATE delivery_bundles SET operation_authority_session_id = ? WHERE delivery_id = ?").run(session.session.authority_session_id, delivery.delivery_id);
        cancel(delivery.delivery_id);
        expect(store.db.prepare("SELECT revoked_at FROM operation_authority_sessions WHERE authority_session_id = ?").get(session.session.authority_session_id)).toMatchObject({ revoked_at: expect.any(String) });
    });
});
