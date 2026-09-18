import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import YAML from "yaml";
import { createBusServer } from "./server.js";
import { defaultConfig } from "./config.js";
import { START_SCOPE_EXECUTION_OPERATION_ID, STOP_SCOPE_EXECUTION_OPERATION_ID, scopeExecutionStateRevision, } from "./scope-operations.js";
import { registerExecutableActorFixture } from "./executable-actor-test-fixture.js";
const BRIDGE_ID = "bridge:scope-operation-backend";
const ALL_GRANTS = new Set([
    "artefact.create",
    "artefact.inspect",
    "artefact.version.publish",
    "scope.plan.inspect",
    "scope.composition.draft.create",
    "scope.composition.draft.replace",
    "scope.composition.publish",
    "scope.execution.inspect",
    "scope.execution.start",
    "scope.node-output.publish",
    "scope.execution.stop",
]);
describe("Bus Scope operation backend", () => {
    let handle;
    let temp;
    let workspaceId;
    let actorId;
    let ingressContextId;
    beforeEach(async () => {
        temp = mkdtempSync(join(tmpdir(), "floe-scope-operation-backend-"));
        const configPath = join(temp, "config.yaml");
        const config = defaultConfig(temp);
        writeFileSync(configPath, YAML.stringify(config), "utf8");
        handle = await createBusServer(configPath, config, { allow_unauthenticated_test_requests: true });
        await handle.app.ready();
        const locator = join(temp, "workspace");
        mkdirSync(locator, { recursive: true });
        const registered = await handle.app.inject({
            method: "POST",
            url: "/v1/workspaces/register",
            headers: { authorization: `Bearer ${handle.localControlToken}` },
            payload: { locator, name: "Scope operation backend" },
        });
        workspaceId = registered.json().workspace.workspace_id;
        actorId = `actor:${workspaceId}:worker`;
        handle.store.createScope({
            workspace_id: workspaceId,
            scope_id: "pipeline",
            title: "Pipeline",
        }, handle.broadcast);
        handle.store.registerEndpoint({
            endpoint_id: actorId,
            workspace_id: workspaceId,
            name: "Worker",
            bridge_id: BRIDGE_ID,
            status: "idle",
        }, handle.broadcast);
        registerExecutableActorFixture(handle.store, workspaceId, actorId);
        ingressContextId = handle.store.contextStore.createContext({
            workspace_id: workspaceId,
            scope_id: "pipeline",
            created_by_endpoint_id: null,
            participants: [],
            title: "Operator input",
        });
    });
    afterEach(async () => {
        try {
            await handle.app.close();
        }
        catch { }
        rmSync(temp, { recursive: true, force: true });
    });
    function authority() {
        return {
            principal_id: "principal:desktop",
            boundary: { kind: "workspace", workspace_id: workspaceId },
            grants: ALL_GRANTS,
            interaction: {
                mode: "interactive",
                session_id: "session:desktop",
                confirmed_prompts: new Set(),
                approval_refs: new Set(),
            },
        };
    }
    function environment(causeEventId = null) {
        const principal = authority();
        return {
            authority: principal,
            provenance: {
                cause_event_id: causeEventId,
                delivery_ids: [],
                execution_attempt_id: null,
                node_execution_id: null,
                scope_execution_id: null,
            },
            resolve_resource: (target) => handle.store.resolveOperationResource(target, principal.boundary),
        };
    }
    function cause(contextId, key) {
        return handle.store.appendContextEvent({
            type: "message",
            workspace_id: workspaceId,
            context_id: contextId,
            content: { text: key },
            metadata: { origin: "operator" },
            idempotency_key: `cause:${key}`,
        }, handle.broadcast).event_id;
    }
    function request(operationId, target, input, idempotencyKey, expectedResourceRevision) {
        return {
            operation_id: operationId,
            operation_version: "1",
            input_schema_version: "1",
            target,
            input,
            idempotency_key: idempotencyKey,
            expected_resource_revision: expectedResourceRevision,
        };
    }
    function receipt(value) {
        expect(value.kind).toBe("receipt");
        if (value.kind !== "receipt")
            throw new Error("Expected receipt");
        return value.receipt;
    }
    function publishPlan() {
        const draft = handle.store.createScopeCompositionDraft({
            workspace_id: workspaceId,
            scope_id: "pipeline",
            content: {
                nodes: [
                    {
                        node_id: "ingress",
                        kind: "event",
                        config: { event_type: "work.requested" },
                        context_policy: { mode: "fixed", context_id: ingressContextId },
                    },
                    {
                        node_id: "worker",
                        kind: "actor",
                        resource_id: actorId,
                        activation: { mode: "per_delivery" },
                        context_policy: { mode: "new_per_execution" },
                    },
                ],
                ports: [
                    { port_id: "ingress:out", node_id: "ingress", name: "work", direction: "output", event_types: ["work.requested"] },
                    { port_id: "worker:in", node_id: "worker", name: "work", direction: "input", event_types: ["work.requested"], min_count: 1 },
                ],
                edges: [
                    { edge_id: "ingress-to-worker", source_port_id: "ingress:out", target_port_id: "worker:in" },
                ],
            },
        }, handle.broadcast);
        return handle.store.publishScopeComposition({
            revision_id: draft.revision_id,
            expected_published_revision_id: null,
        }, handle.broadcast);
    }
    it("registers Scope and Artefact operations in the same Bus registry", async () => {
        const projected = await handle.store.operationRegistry.project({ authority: authority() });
        expect(projected.map((operation) => operation.operation_id)).toEqual(expect.arrayContaining([
            "artefact.create",
            "artefact.version.publish",
            "artefact.inspect",
            "scope.composition.draft.create",
            "scope.composition.publish",
            "scope.execution.start",
            "scope.node-output.publish",
            "scope.execution.stop",
        ]));
    });
    it("carries exact ArtefactVersions from ingress Event through the pinned execution", async () => {
        const published = publishPlan();
        handle.store.artefactStore.createArtefact({
            artefact_id: "artefact:concept",
            workspace_id: workspaceId,
            type_ref: "image/concept",
            idempotency_key: "concept",
        });
        handle.store.artefactStore.publishVersion({
            artefact_id: "artefact:concept",
            artefact_version_id: "artefact-version:concept:1",
            idempotency_key: "concept-v1",
            content_ref: {
                kind: "content-addressed",
                resolver_id: "test-content",
                digest: { algorithm: "sha256", value: "c".repeat(64) },
                media_type: "image/png",
            },
        });
        const startedReceipt = receipt(await handle.store.operationRegistry.invoke(environment(cause(ingressContextId, "exact-artefact-ingress")), request(START_SCOPE_EXECUTION_OPERATION_ID, { kind: "scope", id: "pipeline" }, {
            ingress_node_id: "ingress",
            output_port_id: "ingress:out",
            content: { outcome: "analyse concept" },
            artefact_version_ids: ["artefact-version:concept:1"],
        }, "start-exact-artefact", published.revision_id)));
        expect(startedReceipt.state, JSON.stringify(startedReceipt.refusal)).toBe("accepted");
        const started = startedReceipt.result;
        expect(handle.store.getEvent(started.root_event_id)?.artefact_version_ids)
            .toEqual(["artefact-version:concept:1"]);
        const projection = handle.store.getScopeExecutionProjection(started.execution.execution_id);
        const ingress = projection.node_executions.find((node) => node.node_id === "ingress");
        expect(ingress.publications[0]?.outputs).toEqual([
            { artefact_version_id: "artefact-version:concept:1", member_key: "" },
        ]);
        expect(handle.store.artefactStore.listAssociations("artefact-version:concept:1"))
            .toEqual(expect.arrayContaining([
            expect.objectContaining({ target_kind: "event", target_id: started.root_event_id, role: "attachment" }),
            expect.objectContaining({ target_kind: "scope_execution", target_id: started.execution.execution_id, role: "input" }),
            expect.objectContaining({ target_kind: "node_execution", target_id: ingress.node_execution_id, role: "output" }),
        ]));
    });
    it("stops queued work before a worker owns it", async () => {
        handle.store.db.prepare(`UPDATE endpoints SET bridge_id = NULL WHERE endpoint_id = ?`).run(actorId);
        const published = publishPlan();
        const startedReceipt = receipt(await handle.store.operationRegistry.invoke(environment(cause(ingressContextId, "queued-stop")), request(START_SCOPE_EXECUTION_OPERATION_ID, { kind: "scope", id: "pipeline" }, { ingress_node_id: "ingress", output_port_id: "ingress:out", content: {} }, "start-queued-stop", published.revision_id)));
        const execution = startedReceipt.result.execution;
        const current = handle.store.getScopeExecution(execution.execution_id);
        expect(handle.store.db.prepare(`
      SELECT state FROM event_queue WHERE scope_execution_id = ?
    `).get(current.execution_id).state).toBe("queued");
        const stopped = receipt(await handle.store.operationRegistry.invoke(environment(), request(STOP_SCOPE_EXECUTION_OPERATION_ID, { kind: "scope_execution", id: current.execution_id }, { reason: "No longer needed" }, "stop-queued-stop", scopeExecutionStateRevision(current))));
        expect(stopped.result).toMatchObject({
            stopped: { pending_deliveries: 1, active_deliveries: 0, node_executions: 1, workers: 0 },
            uncertain_external_effects: [],
        });
        expect(handle.store.db.prepare(`
      SELECT state FROM event_queue WHERE scope_execution_id = ?
    `).get(current.execution_id).state).toBe("cancelled");
    });
    it("cancels a reserved Delivery without inventing an ExecutionAttempt", async () => {
        const published = publishPlan();
        const startedReceipt = receipt(await handle.store.operationRegistry.invoke(environment(cause(ingressContextId, "reserved-stop")), request(START_SCOPE_EXECUTION_OPERATION_ID, { kind: "scope", id: "pipeline" }, { ingress_node_id: "ingress", output_port_id: "ingress:out", content: {} }, "start-reserved-stop", published.revision_id)));
        const execution = startedReceipt.result.execution;
        const current = handle.store.getScopeExecution(execution.execution_id);
        const bundle = handle.store.db.prepare(`
      SELECT delivery_id, state FROM delivery_bundles
      WHERE delivery_id IN (
        SELECT delivery_id FROM event_queue WHERE scope_execution_id = ?
      )
    `).get(current.execution_id);
        expect(bundle.state).toBe("reserved");
        const stopped = receipt(await handle.store.operationRegistry.invoke(environment(), request(STOP_SCOPE_EXECUTION_OPERATION_ID, { kind: "scope_execution", id: current.execution_id }, {}, "stop-reserved-stop", scopeExecutionStateRevision(current))));
        expect(stopped.result).toMatchObject({
            stopped: { pending_deliveries: 0, active_deliveries: 1, node_executions: 1, workers: 1 },
            uncertain_external_effects: [],
        });
        expect(handle.store.db.prepare(`
      SELECT state FROM delivery_bundles WHERE delivery_id = ?
    `).get(bundle.delivery_id).state).toBe("cancelled");
        expect(Number(handle.store.db.prepare(`
      SELECT COUNT(*) AS count FROM execution_attempts
    `).get().count)).toBe(0);
    });
    it("uses trusted provenance and reports uncertain effects when stopping injected work", async () => {
        const published = publishPlan();
        const cause = handle.store.appendContextEvent({
            type: "message",
            workspace_id: workspaceId,
            context_id: ingressContextId,
            content: { text: "Build the requested outcome" },
            metadata: { origin: "operator" },
        }, handle.broadcast);
        const startedReceipt = receipt(await handle.store.operationRegistry.invoke(environment(cause.event_id), request(START_SCOPE_EXECUTION_OPERATION_ID, { kind: "scope", id: "pipeline" }, {
            ingress_node_id: "ingress",
            output_port_id: "ingress:out",
            content: { outcome: "proof" },
        }, "start-through-shared-registry", published.revision_id)));
        expect(startedReceipt.state, JSON.stringify(startedReceipt.refusal)).toBe("accepted");
        const started = startedReceipt.result;
        expect(started.execution.cause_event_id).toBe(cause.event_id);
        const claimed = handle.store.claimDeliveries(BRIDGE_ID, 1, handle.broadcast)[0];
        handle.store.reportDeliveryStatus({
            bridge_id: BRIDGE_ID,
            delivery_id: claimed.delivery_id,
            state: "injected_to_runtime",
        }, handle.broadcast);
        const running = handle.store.getScopeExecution(started.execution.execution_id);
        const eventCountBefore = Number(handle.store.db.prepare(`
      SELECT COUNT(*) AS count FROM events WHERE workspace_id = ?
    `).get(workspaceId).count);
        const stoppedReceipt = receipt(await handle.store.operationRegistry.invoke(environment(), request(STOP_SCOPE_EXECUTION_OPERATION_ID, { kind: "scope_execution", id: running.execution_id }, { reason: "Operator stopped this execution" }, "stop-through-shared-registry", scopeExecutionStateRevision(running))));
        expect(stoppedReceipt.state, JSON.stringify(stoppedReceipt.refusal)).toBe("completed");
        expect(stoppedReceipt.result).toMatchObject({
            execution: { status: "cancelled" },
            stopped: {
                active_deliveries: 1,
                node_executions: 1,
                workers: 1,
            },
            uncertain_external_effects: [
                { kind: "runtime_delivery", id: claimed.delivery_id },
            ],
        });
        expect(handle.store.db.prepare(`
      SELECT state FROM delivery_bundles WHERE delivery_id = ?
    `).get(claimed.delivery_id).state).toBe("cancelled");
        expect(handle.store.db.prepare(`
      SELECT status FROM execution_attempts WHERE delivery_bundle_id = ?
    `).get(claimed.delivery_id).status).toBe("outcome_unknown");
        expect(Number(handle.store.db.prepare(`
      SELECT COUNT(*) AS count FROM events WHERE workspace_id = ?
    `).get(workspaceId).count)).toBe(eventCountBefore);
        expect(handle.store.getScopeExecutionProjection(running.execution_id)).toMatchObject({
            execution: {
                status: "cancelled",
                terminal: { uncertain_external_effects: [{ id: claimed.delivery_id }] },
            },
            node_executions: expect.arrayContaining([
                expect.objectContaining({ node_id: "worker", status: "cancelled" }),
            ]),
        });
    });
    it("resolves operation resources only inside verified Workspace authority", () => {
        const published = publishPlan();
        const scope = handle.store.resolveOperationResource({ kind: "scope", id: "pipeline" }, { kind: "workspace", workspace_id: workspaceId });
        const revision = handle.store.resolveOperationResource({ kind: "scope_composition_revision", id: published.revision_id }, { kind: "workspace", workspace_id: workspaceId });
        expect(scope?.ref.revision).toBe(published.revision_id);
        expect(revision?.ref.revision).toBe(published.semantic_digest);
        expect(handle.store.resolveOperationResource({ kind: "scope", id: "pipeline" }, { kind: "workspace", workspace_id: "workspace:other" })).toBeNull();
    });
});
