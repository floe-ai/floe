import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import YAML from "yaml";
import { DECIDE_APPROVAL_OPERATION_ID, INSPECT_APPROVAL_OPERATION_ID, LIST_APPROVALS_OPERATION_ID, REQUEST_APPROVAL_OPERATION_ID, } from "./approval-operations.js";
import { approvalReceiptStateRevision, } from "./approvals.js";
import { defaultConfig } from "./config.js";
import { registerExecutableActorFixture } from "./executable-actor-test-fixture.js";
import { createOperationAuthorityContext, } from "./operations.js";
import { BusStore } from "./store.js";
const APPROVAL_GRANTS = new Set([
    LIST_APPROVALS_OPERATION_ID,
    INSPECT_APPROVAL_OPERATION_ID,
    REQUEST_APPROVAL_OPERATION_ID,
    DECIDE_APPROVAL_OPERATION_ID,
]);
function action() {
    return {
        operation_id: "connector.worker.action.execute",
        authorized_principal_id: "worker:connector-host",
        target: { kind: "connector_binding", id: "connector-binding:publish", revision: "binding-revision:2" },
        input_digest: "b".repeat(64),
        artefact_version_ids: ["artefact-version:site"],
        composition_revision_id: null,
        node_placement_id: null,
        scope_execution_id: null,
        node_execution_id: null,
        connector_binding_revision_id: "connector-binding-revision:publish-2",
        extension_package_version_id: "extension-package-version:publisher-3",
        approval_policy_ref: { kind: "policy", id: "policy:publish", revision: "3" },
        capability_grant_ids: ["capability-grant:publisher"],
        expected_effect: {
            summary: "Publish the exact reviewed website to the production target.",
            external: true,
            reversibility: "reversible",
            resource_refs: [{ kind: "external_target", id: "site:campaign", revision: "production" }],
        },
    };
}
function receipt(response) {
    expect(response.kind).toBe("receipt");
    if (response.kind !== "receipt")
        throw new Error("Expected operation receipt");
    return response.receipt;
}
describe("Approval canonical Bus integration", () => {
    let temp;
    let store;
    let workspaceId;
    let contextId;
    const broadcasts = [];
    beforeEach(() => {
        temp = mkdtempSync(join(tmpdir(), "floe-approval-integration-"));
        const configPath = join(temp, "config.yaml");
        const config = defaultConfig(temp);
        writeFileSync(configPath, YAML.stringify(config), "utf8");
        store = new BusStore(configPath, config);
        broadcasts.length = 0;
        const broadcast = (type, payload) => broadcasts.push({ type, payload });
        store.setBroadcast(broadcast);
        const workspace = store.registerWorkspace({
            locator: join(temp, "workspace"),
            name: "Campaign",
            init_authorized: true,
        }, broadcast);
        workspaceId = workspace.workspace_id;
        const scope = store.createScope({
            workspace_id: workspaceId,
            scope_id: "campaign-publishing",
            title: "Campaign publishing",
        }, broadcast);
        contextId = store.contextStore.createContext({
            context_id: "context:publish-approval",
            workspace_id: workspaceId,
            scope_id: scope.scope_id,
            created_by_endpoint_id: null,
            created_by_principal_id: store.localOperatorPrincipalId,
            participants: [],
            title: "Approve campaign publication",
        });
        store.artefactStore.createArtefact({
            artefact_id: "artefact:site",
            workspace_id: workspaceId,
            type_ref: "core:website-tree",
            idempotency_key: "approval-test-site",
        });
        store.artefactStore.publishVersion({
            artefact_id: "artefact:site",
            artefact_version_id: "artefact-version:site",
            idempotency_key: "approval-test-site-v1",
            content_ref: {
                kind: "content-addressed",
                resolver_id: "test-content",
                digest: { algorithm: "sha256", value: "a".repeat(64) },
                media_type: "application/vnd.floe.website-tree+json",
            },
        });
        store.capabilityGrantStore.issueGrant({
            grant_id: "capability-grant:operator-approvals",
            principal_id: store.localOperatorPrincipalId,
            boundary: { kind: "workspace", workspace_id: workspaceId },
            operation_ids: [DECIDE_APPROVAL_OPERATION_ID],
            expires_at: "2099-09-04T01:00:00.000Z",
            issuer_id: "system:test-authority",
            evidence: [{ kind: "test", ref: "approval-bus.integration" }],
        });
    });
    afterEach(() => {
        try {
            store.close();
        }
        catch { }
        rmSync(temp, { recursive: true, force: true });
    });
    function environment(principalId = store.localOperatorPrincipalId, sessionId = "session:operator") {
        const authority = createOperationAuthorityContext({
            principal_id: principalId,
            boundary: { kind: "workspace", workspace_id: workspaceId },
            grants: APPROVAL_GRANTS,
            interaction: {
                mode: "interactive",
                session_id: sessionId,
                confirmed_prompts: new Set(),
                approval_refs: new Set(),
            },
        });
        return {
            authority,
            resolve_resource: (target) => store.resolveOperationResource(target, authority.boundary),
        };
    }
    function operation(operationId, input, idempotencyKey, target, expectedRevision) {
        return {
            operation_id: operationId,
            operation_version: "1",
            input_schema_version: "1",
            input,
            idempotency_key: idempotencyKey,
            ...(target ? { target } : {}),
            ...(expectedRevision === undefined ? {} : { expected_resource_revision: expectedRevision }),
        };
    }
    function registerActor(name) {
        const endpointId = `actor:${workspaceId}:${name}`;
        store.registerEndpoint({
            endpoint_id: endpointId,
            workspace_id: workspaceId,
            name,
            bridge_id: null,
            status: "idle",
        }, () => { });
        registerExecutableActorFixture(store, workspaceId, endpointId);
        return endpointId;
    }
    function prepareApprovalGate() {
        const gate = registerActor("release-gate");
        const targets = {
            approved: registerActor("publisher"),
            rejected: registerActor("closer"),
            changes_requested: registerActor("reworker"),
        };
        const draft = store.createScopeCompositionDraft({
            workspace_id: workspaceId,
            scope_id: "campaign-publishing",
            content: {
                nodes: [
                    {
                        node_id: "ingress",
                        kind: "event",
                        context_policy: { mode: "fixed", context_id: contextId },
                        config: { event_type: "release.ready" },
                    },
                    {
                        node_id: "release-gate",
                        kind: "actor",
                        resource_id: gate,
                        activation: { mode: "per_delivery" },
                        context_policy: { mode: "fixed", context_id: contextId },
                    },
                    ...Object.entries(targets).map(([decision, endpointId]) => ({
                        node_id: `after-${decision}`,
                        kind: "actor",
                        resource_id: endpointId,
                        activation: { mode: "per_delivery" },
                        context_policy: { mode: "new_per_execution" },
                    })),
                ],
                ports: [
                    { port_id: "ingress:out", node_id: "ingress", name: "ready", direction: "output", event_types: ["release.ready"] },
                    { port_id: "release-gate:in", node_id: "release-gate", name: "candidate", direction: "input", event_types: ["release.ready"], min_count: 1 },
                    ...["approved", "rejected", "changes_requested"].flatMap((decision) => [
                        {
                            port_id: `release-gate:${decision}`,
                            node_id: "release-gate",
                            name: decision,
                            direction: "output",
                            event_types: [`approval.${decision}`],
                            artefact_types: ["core:website-tree"],
                            min_count: 1,
                            max_count: 1,
                        },
                        {
                            port_id: `after-${decision}:in`,
                            node_id: `after-${decision}`,
                            name: "decision",
                            direction: "input",
                            event_types: [`approval.${decision}`],
                            artefact_types: ["core:website-tree"],
                            min_count: 1,
                            max_count: 1,
                        },
                    ]),
                ],
                edges: [
                    { edge_id: "ingress-to-gate", source_port_id: "ingress:out", target_port_id: "release-gate:in" },
                    ...["approved", "rejected", "changes_requested"].map((decision) => ({
                        edge_id: `gate-${decision}`,
                        source_port_id: `release-gate:${decision}`,
                        target_port_id: `after-${decision}:in`,
                    })),
                ],
            },
        }, () => { });
        const revision = store.publishScopeComposition({
            revision_id: draft.revision_id,
            expected_published_revision_id: null,
        }, () => { });
        const started = store.startScopeExecution({
            workspace_id: workspaceId,
            scope_id: "campaign-publishing",
            ingress_node_id: "ingress",
            output_port_id: "ingress:out",
            content: { candidate: "campaign-site" },
            idempotency_key: "release-candidate",
        }, () => { });
        const gateExecution = store.getScopeExecutionProjection(started.execution.execution_id)
            .node_executions.find((node) => node.node_id === "release-gate");
        const waiting = store.scopeExecutionStore.setNodeExecutionStatus(gateExecution.node_execution_id, "waiting_human");
        store.scopeExecutionStore.setExecutionStatus(started.execution.execution_id, "waiting_human");
        const binding = {
            scope_execution_id: started.execution.execution_id,
            composition_revision_id: revision.revision_id,
            node_execution_id: waiting.node_execution_id,
            node_placement_id: waiting.node_id,
            node_execution_state_revision: waiting.state_revision,
            outcome_port_ids: {
                approved: "release-gate:approved",
                rejected: "release-gate:rejected",
                changes_requested: "release-gate:changes_requested",
            },
        };
        return {
            binding,
            action: {
                ...action(),
                target: { kind: "node_execution", id: binding.node_execution_id, revision: String(binding.node_execution_state_revision) },
                composition_revision_id: binding.composition_revision_id,
                node_placement_id: binding.node_placement_id,
                scope_execution_id: binding.scope_execution_id,
                node_execution_id: binding.node_execution_id,
                connector_binding_revision_id: null,
                extension_package_version_id: null,
                approval_policy_ref: null,
                capability_grant_ids: [],
            },
            gate_actor_id: gate,
            targets,
            expected_edges: {
                approved: "gate-approved",
                rejected: "gate-rejected",
                changes_requested: "gate-changes_requested",
            },
        };
    }
    function createDecisionPolicy(prepared, approvers = {
        mode: "any",
        principal_ids: [store.localOperatorPrincipalId],
        roles: [],
    }) {
        const policy = store.policyStore.createPolicy({
            workspace_id: workspaceId,
            policy_id: "policy:release-gate",
            category: "approval",
            content: {
                label: "Release decision",
                description: "Requires an exact decision before a release gate advances.",
                rules: [{
                        rule_id: "approve-release-gate",
                        priority: 100,
                        match: {
                            operation_ids: [prepared.action.operation_id],
                            scope_composition_revision_ids: [prepared.binding.composition_revision_id],
                            node_placement_ids: [prepared.binding.node_placement_id],
                        },
                        effect: {
                            kind: "require_approval",
                            reason: "The release gate requires the configured decision policy.",
                            approvers,
                        },
                    }],
            },
            created_by_principal_id: store.localOperatorPrincipalId,
        });
        const published = store.policyStore.publishRevision({
            workspace_id: workspaceId,
            policy_revision_id: policy.draft.policy_revision_id,
            expected_current_revision_id: null,
        });
        store.policyStore.bindRevision({
            workspace_id: workspaceId,
            policy_revision_id: published.revision.policy_revision_id,
            subject: { kind: "workspace", id: workspaceId },
            bound_by_principal_id: store.localOperatorPrincipalId,
        });
        const facts = {
            authority_boundary: { kind: "workspace", workspace_id: workspaceId },
            workspace_id: workspaceId,
            principal_id: prepared.action.authorized_principal_id,
            principal_roles: [],
            actor_role_evidence: [],
            interaction_mode: "unattended",
            provenance: {
                cause_event_id: null,
                delivery_ids: [],
                execution_attempt_id: null,
                node_execution_id: prepared.action.node_execution_id,
                scope_execution_id: prepared.action.scope_execution_id,
            },
            operation_id: prepared.action.operation_id,
            target: prepared.action.target,
            effects: {
                mode: "write",
                reversibility: prepared.action.expected_effect.reversibility,
                external: prepared.action.expected_effect.external,
                secret_access: "none",
            },
            scope_id: "campaign-publishing",
            actor_id: prepared.gate_actor_id,
            scope_composition_revision_id: prepared.binding.composition_revision_id,
            node_placement_id: prepared.binding.node_placement_id,
            connector_binding_id: null,
            extension_installation_id: null,
            extension_package_version_id: null,
            data_classes: [],
            worker_trust_level: null,
        };
        const evaluation = store.policyStore.evaluate(facts);
        expect(evaluation.decision).toBe("require_approval");
        return {
            policy_evaluation_id: evaluation.evaluation_id,
            policy_revision_id: published.revision.policy_revision_id,
            rule_id: "approve-release-gate",
        };
    }
    it("stores one decision Event and one exact receipt through the shared operation registry", async () => {
        const requestResult = receipt(await store.operationRegistry.invoke(environment(), operation(REQUEST_APPROVAL_OPERATION_ID, {
            action: action(),
            context_id: contextId,
            reason: "The exact tested site is ready for a publication decision.",
            expires_at: "2099-09-04T01:00:00.000Z",
            maximum_uses: 1,
        }, "request:publish-site")));
        expect(requestResult.state, JSON.stringify(requestResult.refusal)).toBe("completed");
        const request = requestResult.result.request;
        expect(store.resolveOperationResource({ kind: "approval_request", id: request.approval_request_id }, { kind: "workspace", workspace_id: workspaceId })?.ref.revision).toBe("1");
        const decisionInvocation = operation(DECIDE_APPROVAL_OPERATION_ID, { decision: "approved", reason: "Approve only this exact site and production target." }, "decide:publish-site", { kind: "approval_request", id: request.approval_request_id });
        const decisionResult = receipt(await store.operationRegistry.invoke(environment(), decisionInvocation));
        expect(decisionResult.state, JSON.stringify(decisionResult.refusal)).toBe("completed");
        const approvalReceipt = decisionResult.result.receipt;
        expect(approvalReceipt).toMatchObject({
            action: action(),
            context_id: contextId,
            requested_by_principal_id: store.localOperatorPrincipalId,
            approved_by_principal_id: store.localOperatorPrincipalId,
            maximum_uses: 1,
        });
        const decisionEvents = store.db.prepare(`
      SELECT event_id, context_id, type, content_json, metadata_json
      FROM events WHERE context_id = ? AND type = 'approval.decision'
    `).all(contextId);
        expect(decisionEvents).toHaveLength(1);
        expect(decisionEvents[0]).toMatchObject({
            event_id: approvalReceipt.decision_event_id,
            context_id: contextId,
            type: "approval.decision",
        });
        expect(JSON.parse(String(decisionEvents[0].content_json))).toMatchObject({
            approval_request_id: request.approval_request_id,
            decision: "approved",
            action_digest: approvalReceipt.action_digest,
            action: action(),
        });
        expect(JSON.parse(String(decisionEvents[0].metadata_json))).toMatchObject({
            source_principal_id: store.localOperatorPrincipalId,
            semantic_operation_id: DECIDE_APPROVAL_OPERATION_ID,
        });
        expect(store.artefactStore.listAssociations("artefact-version:site")).toEqual(expect.arrayContaining([
            expect.objectContaining({ target_kind: "event", target_id: approvalReceipt.decision_event_id, role: "evidence" }),
            expect.objectContaining({ target_kind: "context", target_id: contextId, role: "evidence" }),
        ]));
        expect(store.resolveOperationResource({ kind: "approval_receipt", id: approvalReceipt.approval_receipt_id }, { kind: "workspace", workspace_id: workspaceId })?.ref.revision).toBe(approvalReceiptStateRevision(approvalReceipt));
        expect(store.contextOperationBackend.listRetainedReferences(workspaceId, contextId))
            .toContainEqual(expect.objectContaining({
            kind: "approval_request",
            id: request.approval_request_id,
            relationship: "approval_context:approved",
        }));
        const replay = await store.operationRegistry.invoke(environment(), decisionInvocation);
        expect(replay).toMatchObject({ kind: "receipt", replayed: true });
        expect(store.db.prepare("SELECT count(*) AS count FROM events WHERE type = 'approval.decision'").get())
            .toMatchObject({ count: 1 });
        expect(broadcasts.some((item) => item.type === "approval_decided")).toBe(true);
    });
    it.each(["approved", "rejected", "changes_requested"])("advances the pinned Scope exactly once when the operator decides %s", async (decision) => {
        const prepared = prepareApprovalGate();
        const decisionPolicyRef = createDecisionPolicy(prepared);
        const requestResult = receipt(await store.operationRegistry.invoke(environment(), operation(REQUEST_APPROVAL_OPERATION_ID, {
            action: prepared.action,
            context_id: contextId,
            decision_binding: prepared.binding,
            decision_policy_ref: decisionPolicyRef,
            reason: "The exact candidate is waiting for one explicit release decision.",
            expires_at: "2099-09-04T01:00:00.000Z",
            maximum_uses: 1,
        }, `request:gate:${decision}`)));
        expect(requestResult.state, JSON.stringify(requestResult.refusal)).toBe("completed");
        const request = requestResult.result.request;
        expect(request.decision_binding).toEqual(prepared.binding);
        const invocationId = `decision:gate:${decision}`;
        const decisionInvocation = operation(DECIDE_APPROVAL_OPERATION_ID, { decision, reason: `The operator selected ${decision} for this exact candidate.` }, invocationId, { kind: "approval_request", id: request.approval_request_id });
        const decided = receipt(await store.operationRegistry.invoke(environment(), decisionInvocation));
        expect(decided.state, JSON.stringify(decided.refusal)).toBe("completed");
        expect(decided.result.request.status).toBe(decision === "approved" ? "approved" : "rejected");
        expect(decided.result.request.decision).toBe(decision);
        expect(decided.result.receipt === null).toBe(decision !== "approved");
        const retainedRequest = store.approvalStore.requireRequest(request.approval_request_id);
        const event = store.getEvent(retainedRequest.decision_event_id);
        expect(event).toMatchObject({
            type: `approval.${decision}`,
            context_id: contextId,
            artefact_version_ids: ["artefact-version:site"],
            metadata: {
                origin: "scope_approval_decision",
                composition_revision_id: prepared.binding.composition_revision_id,
                scope_execution_id: prepared.binding.scope_execution_id,
                node_execution_id: prepared.binding.node_execution_id,
                candidate_output_port_id: prepared.binding.outcome_port_ids[decision],
            },
        });
        const publication = store.scopeExecutionStore.getPublicationByIdempotencyKey(`approval-decision-publication:${request.approval_request_id}`);
        expect(publication).toMatchObject({
            node_execution_id: prepared.binding.node_execution_id,
            port_id: prepared.binding.outcome_port_ids[decision],
            event_id: event.event_id,
            outputs: [{ artefact_version_id: "artefact-version:site", member_key: "" }],
        });
        const traversal = store.scopeExecutionStore.listTraversals(prepared.binding.scope_execution_id)
            .find((candidate) => candidate.publication_id === publication.publication_id);
        expect(traversal).toMatchObject({ edge_id: prepared.expected_edges[decision] });
        const delivery = store.db.prepare("SELECT * FROM event_queue WHERE queue_id = ?")
            .get(traversal.delivery_id);
        expect(delivery).toMatchObject({
            event_id: event.event_id,
            destination_endpoint_id: prepared.targets[decision],
            composition_revision_id: prepared.binding.composition_revision_id,
            source_node_id: prepared.binding.node_placement_id,
            source_port_id: prepared.binding.outcome_port_ids[decision],
            edge_id: prepared.expected_edges[decision],
        });
        expect(store.scopeExecutionStore.getNodeExecution(prepared.binding.node_execution_id)?.status)
            .toBe("completed");
        expect(store.scopeExecutionStore.getExecution(prepared.binding.scope_execution_id)?.status)
            .toBe("active");
        expect(store.artefactStore.listAssociations("artefact-version:site")).toEqual(expect.arrayContaining([
            expect.objectContaining({ target_kind: "event", target_id: event.event_id, role: "evidence" }),
            expect.objectContaining({ target_kind: "context", target_id: contextId, role: "evidence" }),
            expect.objectContaining({ target_kind: "scope_execution", target_id: prepared.binding.scope_execution_id, role: "output" }),
            expect.objectContaining({ target_kind: "node_execution", target_id: prepared.binding.node_execution_id, role: "output" }),
        ]));
        const countsBeforeReplay = {
            events: store.db.prepare("SELECT count(*) AS count FROM events").get(),
            publications: store.db.prepare("SELECT count(*) AS count FROM scope_output_publications").get(),
            traversals: store.db.prepare("SELECT count(*) AS count FROM scope_edge_traversals").get(),
            deliveries: store.db.prepare("SELECT count(*) AS count FROM event_queue").get(),
        };
        const directReplay = store.decideApprovalRequest({
            workspace_id: workspaceId,
            approval_request_id: request.approval_request_id,
            expected_state_revision: request.state_revision,
            decision,
            decided_by_principal_id: store.localOperatorPrincipalId,
            decision_reason: `The operator selected ${decision} for this exact candidate.`,
            operation_invocation_id: `transport-retry:${decision}`,
        });
        expect(directReplay.request.decision_event_id).toBe(event.event_id);
        expect({
            events: store.db.prepare("SELECT count(*) AS count FROM events").get(),
            publications: store.db.prepare("SELECT count(*) AS count FROM scope_output_publications").get(),
            traversals: store.db.prepare("SELECT count(*) AS count FROM scope_edge_traversals").get(),
            deliveries: store.db.prepare("SELECT count(*) AS count FROM event_queue").get(),
        }).toEqual(countsBeforeReplay);
        const operationReplay = await store.operationRegistry.invoke(environment(), decisionInvocation);
        expect(operationReplay).toMatchObject({ kind: "receipt", replayed: true });
    });
    it("keeps a Scope gate waiting until a named-plus-role quorum resolves, then routes the resolving Event once", async () => {
        const prepared = prepareApprovalGate();
        const reviewerPrincipal = "principal:release-reviewer";
        const reviewerActor = registerActor("human-release-reviewer");
        store.actorRoleAuthorityStore.bindPrincipal({
            workspace_id: workspaceId,
            principal_id: reviewerPrincipal,
            actor_id: reviewerActor,
            bound_by_principal_id: store.localOperatorPrincipalId,
            evidence_refs: [{
                    kind: "operation_invocation",
                    id: "test:bind-release-reviewer",
                    revision: null,
                }],
        });
        store.actorRoleAuthorityStore.assignRole({
            workspace_id: workspaceId,
            actor_id: reviewerActor,
            role: "release-reviewer",
            boundary: { kind: "workspace", workspace_id: workspaceId },
            assigned_by_principal_id: store.localOperatorPrincipalId,
        });
        store.capabilityGrantStore.issueGrant({
            grant_id: "capability-grant:release-reviewer-approvals",
            principal_id: reviewerPrincipal,
            boundary: { kind: "workspace", workspace_id: workspaceId },
            operation_ids: [DECIDE_APPROVAL_OPERATION_ID],
            expires_at: "2099-09-04T01:00:00.000Z",
            issuer_id: "system:test-authority",
            evidence: [{ kind: "test", ref: "collective-scope-gate" }],
        });
        const policyRef = createDecisionPolicy(prepared, {
            mode: "quorum",
            principal_ids: [store.localOperatorPrincipalId],
            roles: ["release-reviewer"],
            quorum: 2,
        });
        const requested = receipt(await store.operationRegistry.invoke(environment(), operation(REQUEST_APPROVAL_OPERATION_ID, {
            action: prepared.action,
            context_id: contextId,
            decision_binding: prepared.binding,
            decision_policy_ref: policyRef,
            reason: "Both configured perspectives must accept this exact candidate.",
            expires_at: "2099-09-04T01:00:00.000Z",
        }, "request:collective-gate")));
        const request = requested.result.request;
        const firstInvocation = operation(DECIDE_APPROVAL_OPERATION_ID, { decision: "approved", reason: "The named operator accepts the exact candidate." }, "decision:collective-operator", { kind: "approval_request", id: request.approval_request_id });
        const first = receipt(await store.operationRegistry.invoke(environment(), firstInvocation));
        expect(first.state, JSON.stringify(first.refusal)).toBe("completed");
        expect(first.result.request).toMatchObject({
            status: "pending",
            progress: { approvals_received: 1, approvals_required: 2, resolution: null },
        });
        expect(first.result.receipt).toBeNull();
        expect(store.scopeExecutionStore.getNodeExecution(prepared.binding.node_execution_id)?.status)
            .toBe("waiting_human");
        expect(store.scopeExecutionStore.getPublicationByIdempotencyKey(`approval-decision-publication:${request.approval_request_id}`)).toBeNull();
        const secondReason = "The canonically assigned release reviewer accepts the exact candidate.";
        const second = receipt(await store.operationRegistry.invoke(environment(reviewerPrincipal, "session:release-reviewer"), operation(DECIDE_APPROVAL_OPERATION_ID, { decision: "approved", reason: secondReason }, "decision:collective-reviewer", { kind: "approval_request", id: request.approval_request_id })));
        expect(second.state, JSON.stringify(second.refusal)).toBe("completed");
        expect(second.result.request).toMatchObject({
            status: "approved",
            progress: { approvals_received: 2, approvals_required: 2, resolution: "approved" },
        });
        const resolvingDecision = second.result.individual_decision;
        expect(resolvingDecision.role_evidence).toEqual([
            expect.objectContaining({ role: "release-reviewer" }),
        ]);
        const publication = store.scopeExecutionStore.getPublicationByIdempotencyKey(`approval-decision-publication:${request.approval_request_id}`);
        expect(publication).toMatchObject({
            event_id: resolvingDecision.decision_event_id,
            port_id: prepared.binding.outcome_port_ids.approved,
        });
        expect(store.scopeExecutionStore.getNodeExecution(prepared.binding.node_execution_id)?.status)
            .toBe("completed");
        const counts = {
            events: store.db.prepare("SELECT count(*) AS count FROM events WHERE correlation_id = ?")
                .get(request.approval_request_id),
            publications: store.db.prepare("SELECT count(*) AS count FROM scope_output_publications").get(),
            traversals: store.db.prepare("SELECT count(*) AS count FROM scope_edge_traversals").get(),
        };
        const replay = store.decideApprovalRequest({
            workspace_id: workspaceId,
            approval_request_id: request.approval_request_id,
            expected_state_revision: request.state_revision,
            decision: "approved",
            decided_by_principal_id: reviewerPrincipal,
            decision_reason: secondReason,
            operation_invocation_id: "decision:collective-reviewer-transport-retry",
        });
        expect(replay.individual_decision.approval_decision_id)
            .toBe(resolvingDecision.approval_decision_id);
        expect({
            events: store.db.prepare("SELECT count(*) AS count FROM events WHERE correlation_id = ?")
                .get(request.approval_request_id),
            publications: store.db.prepare("SELECT count(*) AS count FROM scope_output_publications").get(),
            traversals: store.db.prepare("SELECT count(*) AS count FROM scope_edge_traversals").get(),
        }).toEqual(counts);
    });
    it("refuses stale, wrong-Context, and wrong-Port decision bindings before retaining a request", () => {
        const prepared = prepareApprovalGate();
        const decisionPolicyRef = createDecisionPolicy(prepared);
        const otherContextId = store.contextStore.createContext({
            context_id: "context:other-approval",
            workspace_id: workspaceId,
            scope_id: "campaign-publishing",
            created_by_endpoint_id: null,
            created_by_principal_id: store.localOperatorPrincipalId,
            participants: [],
            title: "Wrong approval Context",
        });
        const attempt = (id, context_id, decision_binding) => store.createApprovalRequest({
            workspace_id: workspaceId,
            context_id,
            decision_binding,
            decision_policy_ref: decisionPolicyRef,
            action: prepared.action,
            requested_by_principal_id: store.localOperatorPrincipalId,
            reason: "This invalid binding must not become operator attention.",
            expires_at: "2099-09-04T01:00:00.000Z",
            idempotency_key: id,
        });
        expect(() => attempt("stale", contextId, {
            ...prepared.binding,
            node_execution_state_revision: prepared.binding.node_execution_state_revision - 1,
        })).toThrow(/changed after the decision binding was prepared/);
        expect(() => attempt("wrong-context", otherContextId, prepared.binding))
            .toThrow(/must use the ApprovalRequest Context/);
        expect(() => attempt("wrong-port", contextId, {
            ...prepared.binding,
            outcome_port_ids: { ...prepared.binding.outcome_port_ids, rejected: "ingress:out" },
        })).toThrow(/must identify an output Port owned by NodePlacement/);
        expect(store.approvalStore.listRequests(workspaceId)).toEqual([]);
    });
    it("invalidates a pending request when its waiting NodeExecution changes after the request", () => {
        const prepared = prepareApprovalGate();
        const decisionPolicyRef = createDecisionPolicy(prepared);
        const request = store.createApprovalRequest({
            workspace_id: workspaceId,
            context_id: contextId,
            decision_binding: prepared.binding,
            decision_policy_ref: decisionPolicyRef,
            action: prepared.action,
            requested_by_principal_id: store.localOperatorPrincipalId,
            reason: "This exact waiting state is the only state the operator may decide.",
            expires_at: "2099-09-04T01:00:00.000Z",
            idempotency_key: "request:gate:changed-after-request",
        });
        store.scopeExecutionStore.setNodeExecutionStatus(prepared.binding.node_execution_id, "active");
        store.scopeExecutionStore.setNodeExecutionStatus(prepared.binding.node_execution_id, "waiting_human");
        expect(() => store.decideApprovalRequest({
            workspace_id: workspaceId,
            approval_request_id: request.approval_request_id,
            expected_state_revision: request.state_revision,
            decision: "approved",
            decided_by_principal_id: store.localOperatorPrincipalId,
            decision_reason: "This decision must not apply to a changed execution state.",
            operation_invocation_id: "decision:gate:changed-after-request",
        })).toThrow(/Scope decision binding is no longer current/);
        expect(store.approvalStore.requireRequest(request.approval_request_id)).toMatchObject({
            status: "invalidated",
            decided_by_principal_id: "system:approval-validity",
        });
        expect(store.db.prepare("SELECT count(*) AS count FROM events WHERE correlation_id = ?")
            .get(request.approval_request_id)).toMatchObject({ count: 0 });
    });
    it("rolls the decision Event back when the approval already resolved", async () => {
        const request = store.approvalStore.createRequest({
            workspace_id: workspaceId,
            context_id: contextId,
            action: action(),
            requested_by_principal_id: store.localOperatorPrincipalId,
            reason: "Test atomic decision rollback against stale state.",
            expires_at: "2099-09-04T01:00:00.000Z",
            maximum_uses: 1,
            idempotency_key: "request:atomic-rollback",
        });
        store.approvalStore.cancelRequest({
            workspace_id: workspaceId,
            approval_request_id: request.approval_request_id,
            expected_state_revision: request.state_revision,
            cancelled_by_principal_id: store.localOperatorPrincipalId,
            reason: "The request was cancelled before a late decision arrived.",
        });
        expect(() => store.decideApprovalRequest({
            workspace_id: workspaceId,
            approval_request_id: request.approval_request_id,
            expected_state_revision: request.state_revision,
            decision: "approved",
            decided_by_principal_id: store.localOperatorPrincipalId,
            decision_reason: "This late decision must fail atomically.",
            operation_invocation_id: "invocation:stale-decision",
        })).toThrow();
        expect(store.approvalStore.requireRequest(request.approval_request_id).status).toBe("cancelled");
        expect(store.db.prepare("SELECT count(*) AS count FROM events WHERE type = 'approval.decision'").get())
            .toMatchObject({ count: 0 });
    });
});
