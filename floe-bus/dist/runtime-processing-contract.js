export class RuntimeProcessingContractError extends Error {
    reason;
    code = "E_RUNTIME_PROCESSING_CONTRACT_UNAVAILABLE";
    constructor(reason) {
        super(`Runtime processing contract unavailable: ${reason}`);
        this.reason = reason;
        this.name = "RuntimeProcessingContractError";
    }
}
export class RuntimeProcessingContractResolver {
    sources;
    constructor(sources) {
        this.sources = sources;
    }
    resolve(attemptId) {
        const attempt = this.sources.executions.getAttempt(attemptId);
        if (!attempt)
            throw unavailable(`ExecutionAttempt '${attemptId}' does not exist`);
        if (attempt.status !== "pending" && attempt.status !== "running") {
            throw unavailable(`ExecutionAttempt '${attemptId}' is '${attempt.status}', not executable`);
        }
        const nodeExecution = this.sources.executions.getNodeExecution(attempt.node_execution_id);
        if (!nodeExecution) {
            throw unavailable(`NodeExecution '${attempt.node_execution_id}' does not exist`);
        }
        const scopeExecution = this.sources.executions.getExecution(nodeExecution.execution_id);
        if (!scopeExecution) {
            throw unavailable(`ScopeExecution '${nodeExecution.execution_id}' does not exist`);
        }
        if (scopeExecution.workspace_id.trim().length === 0 || nodeExecution.context_id.trim().length === 0) {
            throw unavailable("the execution has no exact Workspace or Context relationship");
        }
        if (nodeExecution.revision_id !== scopeExecution.revision_id) {
            throw unavailable("the NodeExecution and ScopeExecution pin different composition revisions");
        }
        const revision = this.sources.compositions.getRevision(scopeExecution.revision_id);
        if (!revision
            || revision.workspace_id !== scopeExecution.workspace_id
            || revision.scope_id !== scopeExecution.scope_id) {
            throw unavailable(`pinned ScopeCompositionRevision '${scopeExecution.revision_id}' is unavailable`);
        }
        const placement = revision.nodes.find((candidate) => candidate.node_id === nodeExecution.node_id);
        if (!placement || placement.kind !== "actor" || !placement.resource_id) {
            throw unavailable(`Node '${nodeExecution.node_id}' is not a pinned Actor placement`);
        }
        const actorDefinition = this.requireActorDefinition(attempt, nodeExecution, placement, scopeExecution.workspace_id);
        const runtimeProfile = this.requireRuntimeProfile(attempt, nodeExecution);
        const runtimeBinding = this.requireRuntimeBinding(attempt, nodeExecution, actorDefinition, runtimeProfile);
        const inputs = this.sources.executions.listReceivedInputs(nodeExecution.node_execution_id)
            .map((input) => this.resolveInput(input, revision.ports, scopeExecution.workspace_id));
        const outputPorts = revision.ports
            .filter((port) => port.node_id === nodeExecution.node_id && port.direction === "output")
            .map(copyPort);
        return Object.freeze({
            contract_kind: "scope_node",
            contract_version: 1,
            processing_contract_id: `runtime-processing-contract:v1:${attempt.attempt_id}`,
            workspace_id: scopeExecution.workspace_id,
            scope_execution: scopeExecution,
            node_execution: nodeExecution,
            execution_attempt: attempt,
            placement: Object.freeze({
                ...placement,
                bindings: placement.bindings ? [...placement.bindings] : undefined,
            }),
            context: Object.freeze({
                context_id: nodeExecution.context_id,
                inspect_operation_id: "context.inspect",
            }),
            actor: Object.freeze({
                actor_id: actorDefinition.actor_id,
                definition: actorDefinition,
            }),
            runtime: Object.freeze({
                binding: runtimeBinding,
                profile: runtimeProfile,
            }),
            operation_authority: Object.freeze({
                principal_id: actorDefinition.actor_id,
                capability_grant_ids: Object.freeze([...actorDefinition.content.capability_grant_ids]),
                authority_session_required: true,
            }),
            inputs: Object.freeze(inputs),
            outputs: Object.freeze({
                publish_operation_id: "scope.node-output.publish",
                ports: Object.freeze(outputPorts),
            }),
        });
    }
    resolveDirect(input) {
        if (!input.context_id.trim())
            throw unavailable("a direct Delivery has no exact Context relationship");
        const definition = this.sources.actors.getRevision(input.actor_definition_revision_id);
        if (!definition || definition.workspace_id !== input.workspace_id || !definition.published_at) {
            throw unavailable(`pinned Actor definition '${input.actor_definition_revision_id}' is unavailable`);
        }
        const profile = this.sources.runtimes.getRevision(input.runtime_profile_revision_id);
        if (!profile || !profile.published_at) {
            throw unavailable(`pinned runtime profile '${input.runtime_profile_revision_id}' is unavailable`);
        }
        let binding;
        try {
            binding = this.sources.runtimes.requireActorBinding(input.actor_runtime_binding_id);
        }
        catch {
            throw unavailable(`pinned Actor runtime binding '${input.actor_runtime_binding_id}' is unavailable`);
        }
        if (binding.actor_id !== definition.actor_id
            || binding.workspace_id !== input.workspace_id
            || binding.endpoint_id !== input.endpoint_id
            || binding.runtime_profile_revision_id !== profile.runtime_profile_revision_id) {
            throw unavailable("the direct Delivery pins do not describe one Actor/runtime/Endpoint relationship");
        }
        if (input.events.length === 0 || input.events.some((event) => event.workspace_id !== input.workspace_id)) {
            throw unavailable("the direct Delivery Events are absent or belong to another Workspace");
        }
        return Object.freeze({
            contract_kind: "direct_context",
            contract_version: 1,
            processing_contract_id: `runtime-processing-contract:v1:delivery:${input.delivery_id}`,
            workspace_id: input.workspace_id,
            delivery: Object.freeze({
                delivery_id: input.delivery_id,
                stable_delivery_ids: Object.freeze([...input.stable_delivery_ids]),
                endpoint_id: input.endpoint_id,
                context_id: input.context_id,
            }),
            context: Object.freeze({
                context_id: input.context_id,
                inspect_operation_id: "context.inspect",
            }),
            actor: Object.freeze({ actor_id: definition.actor_id, definition }),
            runtime: Object.freeze({ binding, profile }),
            operation_authority: Object.freeze({
                principal_id: definition.actor_id,
                capability_grant_ids: Object.freeze([...definition.content.capability_grant_ids]),
                authority_session_required: true,
            }),
            events: Object.freeze([...input.events]),
            outputs: Object.freeze({
                publish_operation_id: null,
                ports: Object.freeze([]),
            }),
        });
    }
    requireActorDefinition(attempt, node, placement, workspaceId) {
        if (!node.actor_definition_revision_id) {
            throw unavailable(`NodeExecution '${node.node_execution_id}' has no Actor definition pin`);
        }
        const definition = this.sources.actors.getRevision(node.actor_definition_revision_id);
        if (!definition
            || definition.workspace_id !== workspaceId
            || definition.actor_id !== placement.resource_id
            || !definition.published_at) {
            throw unavailable(`pinned Actor definition '${node.actor_definition_revision_id}' is unavailable`);
        }
        if (!node.assigned_actor_ids.includes(definition.actor_id)) {
            throw unavailable(`NodeExecution '${node.node_execution_id}' is not assigned to its pinned Actor`);
        }
        if (attempt.node_execution_id !== node.node_execution_id
            || node.actor_definition_revision_id !== attempt.actor_definition_revision_id) {
            throw unavailable("the ExecutionAttempt and NodeExecution pin different Actor definitions");
        }
        return definition;
    }
    requireRuntimeProfile(attempt, node) {
        if (!node.runtime_profile_revision_id) {
            throw unavailable(`NodeExecution '${node.node_execution_id}' has no runtime profile pin`);
        }
        const profile = this.sources.runtimes.getRevision(node.runtime_profile_revision_id);
        if (!profile || !profile.published_at) {
            throw unavailable(`pinned runtime profile '${node.runtime_profile_revision_id}' is unavailable`);
        }
        if (attempt.node_execution_id !== node.node_execution_id
            || node.runtime_profile_revision_id !== attempt.runtime_profile_revision_id) {
            throw unavailable("the ExecutionAttempt and NodeExecution pin different runtime profiles");
        }
        return profile;
    }
    requireRuntimeBinding(attempt, node, definition, profile) {
        if (!node.actor_runtime_binding_id) {
            throw unavailable(`NodeExecution '${node.node_execution_id}' has no Actor runtime binding pin`);
        }
        let binding;
        try {
            binding = this.sources.runtimes.requireActorBinding(node.actor_runtime_binding_id);
        }
        catch {
            throw unavailable(`pinned Actor runtime binding '${node.actor_runtime_binding_id}' is unavailable`);
        }
        if (binding.actor_id !== definition.actor_id
            || binding.workspace_id !== definition.workspace_id
            || binding.runtime_profile_revision_id !== profile.runtime_profile_revision_id) {
            throw unavailable("the pinned Actor runtime binding does not match the pinned Actor and runtime profile");
        }
        if (attempt.node_execution_id !== node.node_execution_id
            || attempt.actor_runtime_binding_id !== binding.actor_runtime_binding_id) {
            throw unavailable("the ExecutionAttempt and NodeExecution pin different Actor runtime bindings");
        }
        return binding;
    }
    resolveInput(input, ports, workspaceId) {
        const port = ports.find((candidate) => candidate.port_id === input.port_id);
        if (!port || port.direction !== "input") {
            throw unavailable(`input '${input.input_id}' does not reference an input Port in the pinned composition`);
        }
        const event = this.sources.get_event(input.event_id);
        if (!event || event.workspace_id !== workspaceId) {
            throw unavailable(`input Event '${input.event_id}' is unavailable in the execution Workspace`);
        }
        let artefact = null;
        if (input.artefact_version_id) {
            const version = this.sources.artefacts.getVersion(input.artefact_version_id);
            const identity = version ? this.sources.artefacts.getArtefact(version.artefact_id) : null;
            if (!version || !identity || identity.workspace_id !== workspaceId) {
                throw unavailable(`input ArtefactVersion '${input.artefact_version_id}' is unavailable in the execution Workspace`);
            }
            artefact = Object.freeze({ identity, version });
        }
        return Object.freeze({
            input_id: input.input_id,
            port: copyPort(port),
            delivery_id: input.delivery_id,
            member_key: input.member_key,
            event,
            artefact,
        });
    }
}
function unavailable(reason) {
    return new RuntimeProcessingContractError(reason);
}
function copyPort(port) {
    return {
        ...port,
        event_types: port.event_types ? [...port.event_types] : undefined,
        artefact_types: port.artefact_types ? [...port.artefact_types] : undefined,
    };
}
