import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import YAML from "yaml";
import { defaultConfig } from "./config.js";
import { createBusServer } from "./server.js";
import { LEGACY_WORKSPACE_MODEL_ACTOR_OPERATION_IDS_V1 } from "./workspace-config-import.js";
import { localProductWorkspacePolicy, LOCAL_FLOE_ACTOR_OPERATIONS_V1 } from "./local-product-policy.js";
import { BridgeDaemon } from "../../floe-bridge/src/daemon.js";
import { BusClient } from "../../floe-bridge/src/bus-client.js";
import { defaultConfig as bridgeConfig } from "../../floe-bridge/src/config.js";
const LEGACY_WORKSPACE = "workspace:legacy-import";
const CREATED_WORKSPACE = "workspace:created-import";
const HOST_CONTROL_TOKEN = `workspace-import-host-${"h".repeat(40)}`;
describe("authenticated canonical Workspace configuration import", () => {
    const cleanups = [];
    afterEach(async () => {
        for (const cleanup of cleanups.splice(0).reverse())
            await cleanup();
    });
    async function fixture(options = {}) {
        const directory = mkdtempSync(join(tmpdir(), "floe-workspace-import-server-"));
        const configPath = join(directory, "config.yaml");
        const config = defaultConfig(directory);
        writeFileSync(configPath, YAML.stringify(config), "utf8");
        const handle = await createBusServer(configPath, config, {
            host_control_token: HOST_CONTROL_TOKEN,
            ...options,
        });
        await handle.app.ready();
        const timestamp = new Date().toISOString();
        for (const [workspaceId, creationKind] of [
            [LEGACY_WORKSPACE, "legacy_retained"],
            [CREATED_WORKSPACE, "created"],
        ]) {
            handle.store.workspaceIdentityStore.restoreWorkspace({
                snapshot: {
                    workspace_id: workspaceId,
                    name: workspaceId,
                    creation_kind: creationKind,
                    source_workspace_id: null,
                    created_at: timestamp,
                    updated_at: timestamp,
                },
                binding: {
                    host_id: handle.store.localHostId,
                    platform: "windows",
                    locator: join(directory, workspaceId.replaceAll(":", "-")),
                    init_authorized: true,
                },
            });
        }
        const bridge = handle.issueBridgeServiceCredential("bridge:workspace-import");
        cleanups.push(async () => {
            try {
                await handle.app.close();
            }
            catch { }
            rmSync(directory, { recursive: true, force: true });
        });
        return {
            handle,
            bridge_headers: { authorization: `Bearer ${bridge.bearer_token}` },
            binding_id: (workspaceId) => handle.store.workspaceIdentityStore.getCurrentBinding(workspaceId, handle.store.localHostId).binding_id,
        };
    }
    function inventory(bindingId, configHashCharacter = "a") {
        return {
            schema: "floe.workspace-configuration-inventory.v1",
            importer_version: "1",
            binding_id: bindingId,
            config_hash: `sha256:${configHashCharacter.repeat(64)}`,
            source: { kind: "workspace_files", manifest_ref: ".floe/floe.yaml" },
            validation: { ok: true, issues: [] },
            actors: [{
                    source_actor_id: "floe",
                    source: {
                        kind: "workspace_actor_file",
                        path: "agents/floe.md",
                        source_fingerprint: `sha256:${"b".repeat(64)}`,
                    },
                    definition: {
                        label: "Floe",
                        charter: "Help achieve the operator outcome.",
                        responsibilities: [],
                        instructions: "Work through the canonical substrate.",
                        knowledge_refs: [],
                        policy_refs: { budget: null, trust: null, approval: null },
                        escalation_rules: [],
                    },
                    runtime: {
                        label: "Floe runtime",
                        backing_kind: "model",
                        adapter_id: "pi-agent-core",
                        configuration: { model: "test-model" },
                        required_capability_ids: [],
                        checkpoint_policy: { mode: "none", schema_ref: null },
                        resource_policy: {},
                        credential_requirement: "none",
                        required_configuration_keys: ["model"],
                        credential_reference: null,
                    },
                }],
        };
    }
    it("imports a verified legacy Workspace with a closed renewable authority policy", async () => {
        const { handle, bridge_headers, binding_id } = await fixture();
        const bindingId = binding_id(LEGACY_WORKSPACE);
        const response = await handle.app.inject({
            method: "POST",
            url: `/v1/workspaces/${encodeURIComponent(LEGACY_WORKSPACE)}/import-config`,
            headers: bridge_headers,
            payload: inventory(bindingId),
        });
        expect(response.statusCode, response.body).toBe(200);
        const result = response.json();
        const imported = result.import_result.receipt.imported_actors[0];
        expect(imported).toMatchObject({
            source_actor_id: "floe",
            runtime_status: "resolved",
            unresolved_reasons: [],
            capability_grant_id: expect.any(String),
        });
        const grant = handle.store.capabilityGrantStore.getGrant(imported.capability_grant_id);
        expect(grant.operation_ids).toEqual(LEGACY_WORKSPACE_MODEL_ACTOR_OPERATION_IDS_V1
            .filter((operationId) => operationId !== "credential.use" && operationId !== "credential.refresh")
            .sort());
        expect(grant.operation_ids).not.toContain("connector.action.request");
        expect(Date.parse(grant.expires_at)).toBeGreaterThan(Date.now());
        expect(Date.parse(grant.expires_at)).toBeLessThan(Date.now() + 125 * 24 * 60 * 60 * 1_000);
        expect(handle.store.getWorkspace(LEGACY_WORKSPACE)?.active_config_hash).toBe(`sha256:${"a".repeat(64)}`);
    });
    it("keeps a new Workspace unavailable without explicit per-Actor operation policy", async () => {
        const { handle, bridge_headers, binding_id } = await fixture();
        const bindingId = binding_id(CREATED_WORKSPACE);
        const response = await handle.app.inject({
            method: "POST",
            url: `/v1/workspaces/${encodeURIComponent(CREATED_WORKSPACE)}/import-config`,
            headers: bridge_headers,
            payload: inventory(bindingId),
        });
        expect(response.statusCode, response.body).toBe(200);
        expect(response.json().import_result.receipt.imported_actors[0]).toMatchObject({
            capability_grant_id: null,
            runtime_status: "unresolved",
            unresolved_reasons: ["operation_authority_unmapped"],
        });
        expect(handle.store.capabilityGrantStore.listActiveGrantsForPrincipalBoundary(`actor:${CREATED_WORKSPACE}:floe`, { kind: "workspace", workspace_id: CREATED_WORKSPACE })).toEqual([]);
    });
    it("reattaches canonical runtime settings after a refused import and delivers the retained request", async () => {
        const { handle, bridge_headers, binding_id } = await fixture();
        const workspaceId = LEGACY_WORKSPACE;
        const bindingId = binding_id(workspaceId);
        const importUrl = `/v1/workspaces/${encodeURIComponent(workspaceId)}/import-config`;
        const first = await handle.app.inject({ method: "POST", url: importUrl, headers: bridge_headers, payload: inventory(bindingId) });
        const imported = first.json().import_result.receipt.imported_actors[0];
        const actors = handle.store.actorDefinitionStore;
        const profiles = handle.store.runtimeProfileStore;
        const definition = actors.createDraft({
            actor_id: imported.actor_id, created_by_principal_id: "principal:operator",
            definition: { ...actors.requireRevision(imported.actor_definition_revision_id).content,
                label: "Saved collaborator", instructions: "Use the saved instructions, never the older file." },
        });
        actors.publishDraft({ actor_definition_revision_id: definition.actor_definition_revision_id,
            expected_current_revision_id: imported.actor_definition_revision_id, changed_by_principal_id: "principal:operator" });
        const profile = profiles.createDraft({ runtime_profile_id: imported.runtime_profile_id,
            created_by_principal_id: "principal:operator", content: {
                ...profiles.requireRevision(imported.runtime_profile_revision_id).content,
                configuration: { provider: "saved-provider", model: "saved-model", thinking_level: "high" },
            } });
        profiles.publishDraft({ runtime_profile_revision_id: profile.runtime_profile_revision_id,
            expected_current_revision_id: imported.runtime_profile_revision_id, changed_by_principal_id: "principal:operator" });
        const currentBinding = profiles.bindActor({ actor_id: imported.actor_id,
            runtime_profile_revision_id: profile.runtime_profile_revision_id, endpoint_id: imported.actor_id,
            status: "resolved", expected_current_binding_id: imported.actor_runtime_binding_id,
            created_by_principal_id: "principal:operator" });
        const changedInventory = inventory(bindingId, "c");
        const refused = await handle.app.inject({ method: "POST", url: importUrl, headers: bridge_headers, payload: changedInventory });
        expect(refused.json().import_result.receipt).toMatchObject({ outcome: "refused", refusal: { code: "workspace_configuration_conflict" } });
        const replayed = await handle.app.inject({ method: "POST", url: importUrl, headers: bridge_headers, payload: changedInventory });
        expect(replayed.json().import_result).toMatchObject({ replayed: true, receipt: { import_receipt_id: refused.json().import_result.receipt.import_receipt_id } });
        const projectionUrl = `/v1/bridge/workspaces/${encodeURIComponent(workspaceId)}/runtime-endpoints?binding_id=${encodeURIComponent(bindingId)}`;
        const projection = await handle.app.inject({ method: "GET", url: projectionUrl, headers: bridge_headers });
        expect(projection.statusCode).toBe(200);
        expect(projection.json().endpoints).toEqual([expect.objectContaining({
                name: "Saved collaborator", actor_definition_revision_id: definition.actor_definition_revision_id,
                runtime_profile_revision_id: profile.runtime_profile_revision_id,
                actor_runtime_binding_id: currentBinding.actor_runtime_binding_id, runtime_status: "resolved",
            })]);
        expect((await handle.app.inject({ method: "GET", url: projectionUrl })).statusCode).toBe(401);
        expect((await handle.app.inject({ method: "GET", url: projectionUrl, headers: { authorization: `Bearer ${HOST_CONTROL_TOKEN}` } })).statusCode).toBe(401);
        expect((await handle.app.inject({ method: "GET", url: projectionUrl.replace(encodeURIComponent(bindingId), "stale"), headers: bridge_headers })).statusCode).toBe(409);
        handle.store.registerEndpoint({ endpoint_id: imported.actor_id, workspace_id: workspaceId, name: "Old label", status: "runtime_unconfigured" }, () => { });
        handle.store.registerEndpoint({ endpoint_id: "operator:test", workspace_id: workspaceId, name: "Operator" }, () => { });
        const sent = handle.store.submitEvent({ type: "message", workspace_id: workspaceId,
            source_endpoint_id: "operator:test", destination: { kind: "endpoint", endpoint_id: imported.actor_id },
            thread_id: "", correlation_id: null, metadata: {}, content: { text: "Finish the saved result." },
            idempotency_key: "retained-before-restart",
        }, () => { });
        expect(handle.store.db.prepare("SELECT delivery_id FROM delivery_bundles").all()).toHaveLength(0);
        const address = await handle.app.listen({ host: "127.0.0.1", port: 0 });
        const workspace = handle.store.workspaceIdentityStore.listLocalProjections(handle.store.localHostId)
            .find(item => item.workspace_id === workspaceId);
        mkdirSync(workspace.binding.locator, { recursive: true });
        const config = bridgeConfig(workspace.binding.locator);
        const daemon = new BridgeDaemon(join(config.home, "test-config.yaml"), config, {
            bridge_id: "bridge:workspace-import", transport_authority: { audience: "bridge_service", bearer_token: bridge_headers.authorization.slice(7) },
        });
        daemon.bus = new BusClient(address, { audience: "bridge_service", bearer_token: bridge_headers.authorization.slice(7) }, "bridge:workspace-import");
        await daemon.bus.registerBridge({ runtime_adapters: ["pi-agent-core"] });
        await daemon.attachWorkspace(workspace);
        expect(daemon.endpointRuntime.get(imported.actor_id)).toMatchObject({ config: {}, instructions: "" });
        expect(handle.store.getWorkspace(workspaceId)?.status).toBe("attached");
        const deliveries = await daemon.bus.claimDeliveries(1);
        expect(deliveries).toHaveLength(1);
        expect(deliveries[0]).toMatchObject({ trigger_event_id: sent.event.event_id,
            actor_definition_revision_id: definition.actor_definition_revision_id,
            runtime_profile_revision_id: profile.runtime_profile_revision_id,
            actor_runtime_binding_id: currentBinding.actor_runtime_binding_id,
        });
        const prepared = await daemon.bus.prepareRuntimeDelivery(deliveries[0].delivery_id);
        expect(prepared.processing_contract.runtime.profile.content.configuration).toEqual(profile.content.configuration);
        expect(prepared.processing_contract.actor.definition.content.instructions).toBe(definition.content.instructions);
        expect(actors.requireActor(imported.actor_id).current_definition_revision_id).toBe(definition.actor_definition_revision_id);
        expect(profiles.getCurrentActorBinding(imported.actor_id)).toEqual(currentBinding);
        expect(handle.store.getWorkspace(workspaceId)?.active_config_hash).toBe(`sha256:${"a".repeat(64)}`);
        await daemon.stop();
        profiles.bindActor({ actor_id: imported.actor_id, runtime_profile_revision_id: profile.runtime_profile_revision_id,
            endpoint_id: imported.actor_id, status: "disabled", expected_current_binding_id: currentBinding.actor_runtime_binding_id,
            created_by_principal_id: "principal:operator" });
        expect(handle.store.listRuntimeEndpoints(workspaceId)).toEqual([]);
    });
    it("installs local Floe permissions without granting unrelated Actors or depending on their backing", async () => {
        const { handle, bridge_headers, binding_id } = await fixture({ workspace_configuration_policy: localProductWorkspacePolicy });
        const payload = inventory(binding_id(CREATED_WORKSPACE));
        // Backing is deliberately different from the shipped model default.
        payload.actors[0].runtime.backing_kind = "human";
        payload.actors.push({ ...structuredClone(payload.actors[0]), source_actor_id: "another-actor" });
        const response = await handle.app.inject({ method: "POST", url: `/v1/workspaces/${encodeURIComponent(CREATED_WORKSPACE)}/import-config`, headers: bridge_headers, payload });
        expect(response.statusCode, response.body).toBe(200);
        const actors = response.json().import_result.receipt.imported_actors;
        const floe = actors.find(actor => actor.source_actor_id === "floe");
        expect(floe.runtime_status).toBe("resolved");
        const grant = handle.store.capabilityGrantStore.getGrant(floe.capability_grant_id);
        expect(grant.operation_ids).toEqual(LOCAL_FLOE_ACTOR_OPERATIONS_V1.filter(id => !["credential.use", "credential.refresh"].includes(id)).sort());
        expect(grant.issuer_id).toBe("policy:local-floe-actor:v1");
        expect(actors.find(actor => actor.source_actor_id === "another-actor")).toMatchObject({ capability_grant_id: null, runtime_status: "unresolved", unresolved_reasons: ["operation_authority_unmapped"] });
    });
    it("does not revive revoked authority when the local policy renews", async () => {
        let revision = "first";
        const { handle, bridge_headers, binding_id } = await fixture({ workspace_configuration_policy: input => {
                const policy = localProductWorkspacePolicy(input);
                return policy ? { ...policy, policy_revision: `${policy.policy_revision}:${revision}` } : null;
            } });
        const url = `/v1/workspaces/${encodeURIComponent(CREATED_WORKSPACE)}/import-config`;
        const first = await handle.app.inject({ method: "POST", url, headers: bridge_headers, payload: inventory(binding_id(CREATED_WORKSPACE)) });
        const imported = first.json().import_result.receipt.imported_actors[0];
        handle.store.capabilityGrantStore.revokeGrant(imported.capability_grant_id);
        revision = "renewed";
        const changed = await handle.app.inject({ method: "POST", url, headers: bridge_headers, payload: inventory(binding_id(CREATED_WORKSPACE), "c") });
        expect(changed.json().import_result.receipt).toMatchObject({ outcome: "refused", refusal: { message: expect.stringContaining("revoked Actor authority") } });
        expect(handle.store.actorDefinitionStore.getActor(imported.actor_id)?.current_definition_revision_id).toBe(imported.actor_definition_revision_id);
    });
    it("advances the active config hash only from an applied receipt and refuses a stale binding", async () => {
        const { handle, bridge_headers, binding_id } = await fixture();
        const originalBindingId = binding_id(LEGACY_WORKSPACE);
        const imported = await handle.app.inject({
            method: "POST",
            url: `/v1/workspaces/${encodeURIComponent(LEGACY_WORKSPACE)}/import-config`,
            headers: bridge_headers,
            payload: inventory(originalBindingId),
        });
        expect(imported.statusCode, imported.body).toBe(200);
        const attachment = await handle.app.inject({
            method: "POST",
            url: `/v1/workspaces/${encodeURIComponent(LEGACY_WORKSPACE)}/attachment-result`,
            headers: bridge_headers,
            payload: {
                binding_id: originalBindingId,
                status: "attached",
                config_hash: `sha256:${"f".repeat(64)}`,
            },
        });
        expect(attachment.statusCode, attachment.body).toBe(200);
        expect(handle.store.getWorkspace(LEGACY_WORKSPACE)?.active_config_hash).toBe(`sha256:${"a".repeat(64)}`);
        handle.store.workspaceIdentityStore.rebindLocator({
            workspace_id: LEGACY_WORKSPACE,
            host_id: handle.store.localHostId,
            platform: "windows",
            locator: "C:\\FloeTest\\rebound-workspace",
            expected_binding_id: originalBindingId,
            init_authorized: true,
        });
        const stale = await handle.app.inject({
            method: "POST",
            url: `/v1/workspaces/${encodeURIComponent(LEGACY_WORKSPACE)}/import-config`,
            headers: bridge_headers,
            payload: inventory(originalBindingId, "c"),
        });
        expect(stale.statusCode, stale.body).toBe(409);
        expect(stale.json()).toMatchObject({ error: "workspace_binding_mismatch", retryable: false });
        expect(handle.store.workspaceConfigurationImportStore.listReceipts(LEGACY_WORKSPACE)).toHaveLength(1);
    });
});
