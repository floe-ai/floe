/**
 * Runtime-neutral substrate write-back tools (emit / request).
 *
 * These are the canonical implementations of the two ways an actor writes back
 * into Floe from inside a turn. They are extracted from the tool bodies so that
 * every runtime shares ONE implementation:
 *   - pi-agent-core exposes them as native AgentTools that call these directly;
 *   - floe-runtime (which drives an external vendor CLI) exposes them as
 *     direct SDK tools.
 *
 * The functions take a neutral turn anchor plus the raw tool params and perform
 * the bus.emit. They never resolve credentials: emit authority belongs to the
 * authenticated Bridge BusClient passed in, never to the runtime or vendor CLI.
 */
import { randomUUID } from "node:crypto";
import { fromNeutralRef } from "./neutral-ref.js";
/**
 * Execute the `emit` tool against the bus, anchored to a runtime turn.
 * Payload construction is identical across runtimes bar the identity strings.
 */
export async function executeEmit(bus, turn, params, identity) {
    const destinationRef = String(params?.destination ?? "");
    let destination;
    let destinationLabel = destinationRef;
    if (destinationRef === "current_context") {
        if (!turn.context_id) {
            return {
                result: {
                    content: [{ type: "text", text: "emit: this turn has no current Context." }],
                    details: { ok: false, error: "context_unavailable" },
                },
            };
        }
        destination = { kind: "context", context_id: turn.context_id };
    }
    else {
        let targetEndpoint = destinationRef;
        if (!targetEndpoint.startsWith("actor:")) {
            const ref = targetEndpoint;
            const endpoints = await bus.listEndpoints(turn.workspace_id);
            const resolved = fromNeutralRef(ref, endpoints);
            if (!resolved) {
                return {
                    result: {
                        content: [{ type: "text", text: `emit: destination '${ref}' did not resolve to a known actor. Use list_endpoints when actor discovery is needed.` }],
                        details: { ok: false, error: "unknown_destination", ref },
                    },
                };
            }
            targetEndpoint = resolved;
        }
        destination = { kind: "endpoint", endpoint_id: targetEndpoint };
        destinationLabel = targetEndpoint;
    }
    const attachments = Array.isArray(params?.attachments)
        ? params.attachments.map((attachment) => ({
            artefact_version_id: attachment.artefact_version_id, name: attachment.name,
        })) : [];
    const versionIds = [...new Set([
            ...(Array.isArray(params?.artefact_version_ids) ? params.artefact_version_ids : []),
            ...attachments.map(attachment => attachment.artefact_version_id),
        ])];
    const receipt = await bus.emit({
        type: String(params?.type ?? "message"),
        workspace_id: turn.workspace_id,
        source_endpoint_id: turn.endpoint_id,
        destination,
        thread_id: turn.thread_id,
        context_id: destination.kind === "context" ? turn.context_id : null,
        current_delivery_context_id: turn.context_id,
        correlation_id: null,
        artefact_version_ids: versionIds,
        content: {
            text: String(params?.text ?? ""),
            ...(Array.isArray(params?.references) && params.references.length ? { references: params.references } : {}),
            ...(attachments.length ? { attachments } : {}),
            data: {
                ...(params?.data && typeof params.data === "object" && !Array.isArray(params.data)
                    ? params.data
                    : {}),
                origin: identity.emitOrigin,
                runtime_turn_id: turn.runtime_turn_id,
                delivery_id: turn.delivery_id,
                execution_attempt_id: turn.execution_attempt_id,
            },
        },
        response: { expected: false },
        metadata: {
            runtime: identity.runtimeName,
            origin: identity.emitOrigin,
            runtime_turn_id: turn.runtime_turn_id,
            delivery_id: turn.delivery_id,
            execution_attempt_id: turn.execution_attempt_id,
        },
    });
    const accepted = {
        ok: true,
        event_id: receipt?.event_id ?? null,
        accepted_at: receipt?.accepted_at ?? null,
        artefact_version_ids: receipt?.event?.artefact_version_ids ?? null,
    };
    return {
        result: { content: [{ type: "text", text: JSON.stringify(accepted) }], details: accepted },
        emitted: {
            type: String(params?.type ?? "message"),
            destination: destinationLabel,
            text_preview: String(params?.text ?? "").slice(0, 120),
            response_expected: false,
        },
    };
}
/**
 * Execute the `request` tool against the bus, anchored to a runtime turn.
 * `alreadyRequested` guards the one-dependency-per-cycle rule; the caller owns
 * the flag on its own turn state and passes its current value in.
 */
export async function executeRequest(bus, turn, params, identity, alreadyRequested) {
    if (alreadyRequested) {
        return {
            result: {
                content: [{ type: "text", text: "request: this processing cycle already has a pending actor dependency" }],
                details: { ok: false, error: "dependency_already_requested" },
            },
            dependencyRequested: false,
        };
    }
    const actorRef = String(params?.actor ?? "");
    let targetEndpoint = actorRef;
    if (!targetEndpoint.startsWith("actor:")) {
        const endpoints = await bus.listEndpoints(turn.workspace_id);
        const resolved = fromNeutralRef(actorRef, endpoints);
        if (!resolved) {
            return {
                result: {
                    content: [{ type: "text", text: `request: actor '${actorRef}' did not resolve. Use list_endpoints when actor discovery is needed.` }],
                    details: { ok: false, error: "unknown_actor", actor: actorRef },
                },
                dependencyRequested: false,
            };
        }
        targetEndpoint = resolved;
    }
    const requestId = `req_${randomUUID()}`;
    const receipt = await bus.emit({
        type: "request",
        workspace_id: turn.workspace_id,
        source_endpoint_id: turn.endpoint_id,
        destination: { kind: "endpoint", endpoint_id: targetEndpoint },
        thread_id: turn.thread_id,
        context_id: null,
        current_delivery_context_id: turn.context_id,
        correlation_id: requestId,
        artefact_version_ids: [...new Set(params?.artefact_version_ids ?? [])],
        content: {
            text: String(params?.work ?? ""),
            data: {
                origin: identity.requestOrigin,
                runtime_turn_id: turn.runtime_turn_id,
                delivery_id: turn.delivery_id,
                execution_attempt_id: turn.execution_attempt_id,
            },
        },
        response: {
            expected: true,
            mode: "correlated",
            correlation_id: requestId,
        },
        metadata: {
            runtime: identity.runtimeName,
            origin: identity.requestOrigin,
            request_return_context_id: turn.context_id,
            request_parent_delivery_id: turn.delivery_id,
            // A direct Actor request is not a graph Edge. When it is made
            // during a NodeExecution, these exact references let the result
            // resume that same logical execution under its pinned revision.
            request_parent_scope_execution_id: turn.scope_execution_id,
            request_parent_composition_revision_id: turn.composition_revision_id,
            request_parent_node_execution_id: turn.node_execution_id,
            request_parent_target_node_id: turn.target_node_id,
            request_parent_execution_attempt_id: turn.execution_attempt_id,
            request_continuation_event_id: turn.invocation_request_event_id,
            runtime_turn_id: turn.runtime_turn_id,
            delivery_id: turn.delivery_id,
            execution_attempt_id: turn.execution_attempt_id,
        },
    });
    const accepted = {
        ok: true, actor: actorRef, event_id: receipt?.event_id ?? null,
        artefact_version_ids: receipt?.event?.artefact_version_ids ?? null,
        message: "request accepted; Floe will resume you with this actor's result",
    };
    return {
        result: { content: [{ type: "text", text: JSON.stringify(accepted) }], details: accepted },
        emitted: {
            type: "request",
            destination: String(targetEndpoint),
            text_preview: String(params?.work ?? "").slice(0, 120),
            response_expected: true,
        },
        dependencyRequested: true,
    };
}
