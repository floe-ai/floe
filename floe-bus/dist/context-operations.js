import { ContextLifecycleConflictError, ContextNotFoundError, ContextParticipantRequiredError, ContextRevisionConflictError, } from "./contexts/store.js";
import { refusal, requireWorkspaceAuthorityId, requiredAction, } from "./operations.js";
/** Context is collaboration and retained understanding. It never advances Scope routing. */
export const LIST_CONTEXTS_OPERATION_ID = "context.list";
export const GET_CONTEXT_OPERATION_ID = "context.get";
export const INSPECT_CONTEXT_OPERATION_ID = "context.inspect";
export const CREATE_CONTEXT_OPERATION_ID = "context.create";
export const ARCHIVE_CONTEXT_OPERATION_ID = "context.archive";
export const RESTORE_CONTEXT_OPERATION_ID = "context.restore";
export const SET_CONTEXT_PARTICIPANT_ACCESS_OPERATION_ID = "context.participant.set_access";
export const REMOVE_CONTEXT_PARTICIPANT_OPERATION_ID = "context.participant.remove";
export const EMIT_CONTEXT_COMMUNICATION_OPERATION_ID = "context.communication.emit";
export const DESTROY_CONTEXT_PERMANENTLY_OPERATION_ID = "context.destroy_permanently";
const nonEmptyString = { type: "string", minLength: 1 };
const nullableString = { oneOf: [nonEmptyString, { type: "null" }] };
const emptyInput = { type: "object", additionalProperties: false };
const accessSchema = { enum: ["read", "contribute", "manage"] };
const resourceRefSchema = {
    type: "object",
    additionalProperties: false,
    required: ["kind", "id", "revision"],
    properties: { kind: nonEmptyString, id: nonEmptyString, revision: nullableString },
};
const retainedReferenceSchema = {
    type: "object",
    additionalProperties: false,
    required: ["kind", "id", "revision", "relationship"],
    properties: {
        kind: nonEmptyString,
        id: nonEmptyString,
        revision: nullableString,
        relationship: nonEmptyString,
    },
};
const contextSchema = {
    type: "object",
    additionalProperties: false,
    required: [
        "context_id", "workspace_id", "scope_id", "parent_context_id",
        "created_by_endpoint_id", "created_by_principal_id", "created_at", "updated_at",
        "title", "state_revision", "lifecycle_state", "archived_at",
        "archived_by_principal_id", "archive_reason", "restored_at",
        "restored_by_principal_id", "content_state", "redacted_at",
        "redacted_by_principal_id", "redaction_reason", "tombstoned_at",
        "tombstoned_by_principal_id", "tombstone_reason",
    ],
    properties: {
        context_id: nonEmptyString,
        workspace_id: nonEmptyString,
        scope_id: nullableString,
        parent_context_id: nullableString,
        created_by_endpoint_id: nullableString,
        created_by_principal_id: nullableString,
        created_at: nonEmptyString,
        updated_at: nonEmptyString,
        title: nullableString,
        state_revision: { type: "integer", minimum: 1 },
        lifecycle_state: { enum: ["active", "archived", "tombstoned"] },
        archived_at: nullableString,
        archived_by_principal_id: nullableString,
        archive_reason: nullableString,
        restored_at: nullableString,
        restored_by_principal_id: nullableString,
        content_state: { enum: ["available", "redacted", "destroyed"] },
        redacted_at: nullableString,
        redacted_by_principal_id: nullableString,
        redaction_reason: nullableString,
        tombstoned_at: nullableString,
        tombstoned_by_principal_id: nullableString,
        tombstone_reason: nullableString,
    },
};
const participantSchema = {
    type: "object",
    additionalProperties: false,
    required: [
        "participant_id", "role", "access", "actor_role_assignment_id", "joined_at", "updated_at",
    ],
    properties: {
        participant_id: nonEmptyString,
        role: nonEmptyString,
        access: accessSchema,
        actor_role_assignment_id: nullableString,
        joined_at: nonEmptyString,
        updated_at: nonEmptyString,
    },
};
const contextListRowSchema = {
    ...contextSchema,
    required: [
        ...contextSchema.required,
        "participants", "last_event_at", "activity_at", "topic",
    ],
    properties: {
        ...contextSchema.properties,
        participants: { type: "array", items: nonEmptyString, uniqueItems: true },
        last_event_at: nullableString,
        activity_at: nonEmptyString,
        topic: nullableString,
    },
};
const contextOnlyResultSchema = {
    type: "object",
    additionalProperties: false,
    required: ["context"],
    properties: { context: contextSchema },
};
const listInputSchema = {
    type: "object",
    additionalProperties: false,
    properties: {
        participant_id: nonEmptyString,
        scope_id: nonEmptyString,
        include_archived: { type: "boolean" },
        include_tombstoned: { type: "boolean" },
        limit: { type: "integer", minimum: 1, maximum: 500 },
    },
};
const listResultSchema = {
    type: "object",
    additionalProperties: false,
    required: ["contexts"],
    properties: { contexts: { type: "array", items: contextListRowSchema } },
};
const inspectResultSchema = {
    type: "object",
    additionalProperties: false,
    required: ["context", "participants", "retained_references"],
    properties: {
        context: contextSchema,
        participants: { type: "array", items: participantSchema },
        retained_references: { type: "array", items: retainedReferenceSchema },
    },
};
const participantInputSchema = {
    type: "object",
    additionalProperties: false,
    required: ["participant_id"],
    properties: {
        participant_id: nonEmptyString,
        role: nonEmptyString,
        access: accessSchema,
    },
};
const createInputSchema = {
    type: "object",
    additionalProperties: false,
    properties: {
        context_id: nonEmptyString,
        title: nullableString,
        scope_id: nullableString,
        parent_context_id: nullableString,
        participants: { type: "array", items: participantInputSchema, uniqueItems: true },
    },
};
const reasonInputSchema = {
    type: "object",
    additionalProperties: false,
    properties: { reason: nullableString },
};
const destroyInputSchema = {
    type: "object",
    additionalProperties: false,
    required: ["reason"],
    properties: { reason: nonEmptyString },
};
const setParticipantInputSchema = {
    type: "object",
    additionalProperties: false,
    required: ["participant_id", "role", "access"],
    properties: {
        participant_id: nonEmptyString,
        role: nonEmptyString,
        access: accessSchema,
    },
};
const removeParticipantInputSchema = {
    type: "object",
    additionalProperties: false,
    required: ["participant_id"],
    properties: { participant_id: nonEmptyString },
};
const participantMutationResultSchema = {
    type: "object",
    additionalProperties: false,
    required: ["context", "participant", "changed"],
    properties: { context: contextSchema, participant: participantSchema, changed: { type: "boolean" } },
};
const participantRemovalResultSchema = {
    type: "object",
    additionalProperties: false,
    required: ["context", "participant_id", "removed"],
    properties: { context: contextSchema, participant_id: nonEmptyString, removed: { type: "boolean" } },
};
const communicationInputSchema = {
    type: "object",
    additionalProperties: false,
    required: ["event_type", "content", "response_expected"],
    properties: {
        event_type: nonEmptyString,
        recipient_participant_id: nullableString,
        content: { type: "object", properties: {
                references: { type: "array", description: "Optional named navigation references for clients. They do not assert record state, grant access or execute an action.", items: {
                        type: "object", required: ["name", "resource_ref"], additionalProperties: false,
                        properties: { name: nonEmptyString, resource_ref: resourceRefSchema },
                    } },
            } },
        artefact_version_ids: { type: "array", items: nonEmptyString, uniqueItems: true },
        attachment_ingress_ids: { type: "array", items: nonEmptyString, uniqueItems: true, maxItems: 5 },
        response_expected: { type: "boolean" },
    },
};
const communicationResultSchema = {
    type: "object",
    additionalProperties: false,
    required: ["event_ref", "artefact_version_refs"],
    properties: {
        event_ref: resourceRefSchema,
        artefact_version_refs: { type: "array", items: resourceRefSchema, uniqueItems: true },
    },
};
const destructionResultSchema = {
    type: "object",
    additionalProperties: false,
    required: ["context", "events_deleted"],
    properties: { context: contextSchema, events_deleted: { type: "integer", minimum: 0 } },
};
function contextRevision(context) {
    return String(context.state_revision);
}
function contextRef(context) {
    return { kind: "context", id: context.context_id, revision: contextRevision(context) };
}
function participantRef(contextId, participantId) {
    return { kind: "context_participant", id: `${contextId}:${participantId}`, revision: null };
}
function auditRef(context) {
    return { kind: "operation_invocation", id: context.invocation_id, revision: null };
}
function workspaceId(context) {
    return requireWorkspaceAuthorityId(context.authority);
}
function contextInWorkspace(store, workspaceId, contextId) {
    const context = store.getContext(contextId);
    return context?.workspace_id === workspaceId ? context : null;
}
export function resolveContextOperationResource(store, workspaceId, target) {
    if (target.kind !== "context")
        return null;
    const context = contextInWorkspace(store, workspaceId, target.id);
    return context ? { ref: contextRef(context), state: context } : null;
}
function contextAvailability(backend, workspaceId, contextId, expectedState) {
    const context = contextInWorkspace(backend.contexts, workspaceId, contextId);
    if (!context) {
        return {
            available: false,
            refusal: refusal("context_not_found", "This Context is not available in the current Workspace.", false, requiredAction("refresh_contexts", "Refresh Contexts", "Refresh this Workspace and select an available Context.")),
        };
    }
    if (expectedState && context.lifecycle_state !== expectedState) {
        return {
            available: false,
            refusal: lifecycleRefusal(context.lifecycle_state),
        };
    }
    return { available: true };
}
function lifecycleRefusal(state) {
    if (state === "tombstoned") {
        return refusal("context_tombstoned", "This Context has been permanently destroyed. Its retained tombstone is read-only.", false, requiredAction("inspect_context", "Inspect tombstone", "Inspect the retained Context identity and destruction metadata."));
    }
    return refusal(state === "archived" ? "context_archived" : "context_already_active", state === "archived" ? "This Context is archived." : "This Context is already active.", false, requiredAction("inspect_context", "Inspect Context", "Inspect the Context's current lifecycle state."));
}
function contextOperationRefusal(error) {
    if (error instanceof ContextRevisionConflictError) {
        return refusal("context_revision_conflict", "The Context changed before this operation completed.", true, requiredAction("refresh_context", "Review the latest Context", "Refresh the Context and retry against its exact revision."), { expected_revision: error.expected_revision, current_revision: error.current_revision });
    }
    if (error instanceof ContextLifecycleConflictError)
        return lifecycleRefusal(error.lifecycle_state);
    if (error instanceof ContextParticipantRequiredError) {
        return refusal("context_participant_required", "An unscoped active Context must retain at least one participant.", false, requiredAction("archive_context", "Archive Context", "Archive the Context before removing its final participant."));
    }
    if (error instanceof ContextNotFoundError) {
        return refusal("context_not_found", "This Context is not available in the current Workspace.", false, requiredAction("refresh_contexts", "Refresh Contexts", "Refresh this Workspace and select an available Context."));
    }
    return refusal("context_change_failed", error instanceof Error ? error.message : "The Context could not be changed.", false, requiredAction("inspect_context", "Inspect Context", "Inspect current Context state before trying another change."));
}
async function handle(work) {
    try {
        return await work();
    }
    catch (error) {
        return { state: "refused", refusal: contextOperationRefusal(error) };
    }
}
function requireExpectedRevision(context) {
    const value = Number(context.expected_resource_revision);
    if (!Number.isInteger(value) || value < 1) {
        throw new ContextRevisionConflictError(context.target.ref.id, value, Number(context.target.ref.revision));
    }
    return value;
}
export function listContextsOperation(backend) {
    return {
        operation_id: LIST_CONTEXTS_OPERATION_ID,
        operation_version: "1",
        authority_boundary_kinds: ["workspace"],
        category: "contexts",
        title: "List Contexts",
        description: "List collaboration Contexts in this Workspace. Archived and tombstoned Contexts are hidden unless requested.",
        effects: { mode: "read", reversibility: "none", external: false, secret_access: "none" },
        required_grants: [LIST_CONTEXTS_OPERATION_ID],
        interaction_constraints: { allowed_modes: ["interactive", "unattended"] },
        target: { resource_kinds: [], expected_revision: "not_applicable" },
        input: { version: "1", schema: listInputSchema },
        result: { version: "1", schema: listResultSchema },
        handler: (context, input) => handle(() => ({
            state: "completed",
            result: {
                contexts: input.participant_id
                    ? backend.contexts.listContextsForParticipant(input.participant_id, {
                        workspace_id: workspaceId(context),
                        scope_id: input.scope_id,
                        include_archived: input.include_archived,
                        include_tombstoned: input.include_tombstoned,
                        limit: input.limit,
                    })
                    : backend.contexts.listContextsForWorkspace(workspaceId(context), {
                        scope_id: input.scope_id,
                        include_archived: input.include_archived,
                        include_tombstoned: input.include_tombstoned,
                        limit: input.limit,
                    }),
            },
            audit_ref: auditRef(context),
        })),
    };
}
export function getContextOperation(backend) {
    return {
        operation_id: GET_CONTEXT_OPERATION_ID,
        operation_version: "1",
        authority_boundary_kinds: ["workspace"],
        category: "contexts",
        title: "Get Context",
        description: "Get one exact Context identity and its lifecycle metadata from this Workspace.",
        effects: { mode: "read", reversibility: "none", external: false, secret_access: "none" },
        required_grants: [GET_CONTEXT_OPERATION_ID],
        interaction_constraints: { allowed_modes: ["interactive", "unattended"] },
        target: { resource_kinds: ["context"], expected_revision: "not_applicable" },
        input: { version: "1", schema: emptyInput },
        result: { version: "1", schema: contextOnlyResultSchema },
        availability: (context) => contextAvailability(backend, workspaceId(context), context.target.ref.id),
        handler: (context) => handle(() => {
            const value = contextInWorkspace(backend.contexts, workspaceId(context), context.target.ref.id);
            if (!value)
                throw new ContextNotFoundError(context.target.ref.id);
            return { state: "completed", result: { context: value }, audit_ref: auditRef(context) };
        }),
    };
}
export function inspectContextOperation(backend) {
    return {
        operation_id: INSPECT_CONTEXT_OPERATION_ID,
        operation_version: "1",
        authority_boundary_kinds: ["workspace"],
        category: "contexts",
        title: "Inspect Context",
        description: "Inspect a Context's participants, access, lifecycle, and canonical records that require its evidence to be retained.",
        effects: { mode: "read", reversibility: "none", external: false, secret_access: "none" },
        required_grants: [INSPECT_CONTEXT_OPERATION_ID],
        interaction_constraints: { allowed_modes: ["interactive", "unattended"] },
        target: { resource_kinds: ["context"], expected_revision: "not_applicable" },
        input: { version: "1", schema: emptyInput },
        result: { version: "1", schema: inspectResultSchema },
        availability: (context) => contextAvailability(backend, workspaceId(context), context.target.ref.id),
        handler: (context) => handle(() => {
            const value = contextInWorkspace(backend.contexts, workspaceId(context), context.target.ref.id);
            if (!value)
                throw new ContextNotFoundError(context.target.ref.id);
            return {
                state: "completed",
                result: {
                    context: value,
                    participants: backend.contexts.getContextParticipantRecords(value.context_id),
                    retained_references: [...backend.listRetainedReferences(value.workspace_id, value.context_id)],
                },
                audit_ref: auditRef(context),
            };
        }),
    };
}
export function createContextOperation(backend) {
    return {
        operation_id: CREATE_CONTEXT_OPERATION_ID,
        operation_version: "1",
        authority_boundary_kinds: ["workspace"],
        category: "contexts",
        title: "Create Context",
        description: "Create a durable collaboration Context. Membership grants access and understanding; it never defines Scope routing.",
        effects: { mode: "write", reversibility: "reversible", external: false, secret_access: "none" },
        required_grants: [CREATE_CONTEXT_OPERATION_ID],
        interaction_constraints: { allowed_modes: ["interactive", "unattended"] },
        target: { resource_kinds: [], expected_revision: "not_applicable" },
        input: { version: "1", schema: createInputSchema },
        result: { version: "1", schema: contextOnlyResultSchema },
        handler: (context, input) => handle(() => {
            const participants = input.participants ?? [];
            if (!input.scope_id && participants.length === 0) {
                return {
                    state: "refused",
                    refusal: refusal("context_anchor_required", "A Context requires at least one participant or an owning Scope reference.", false, requiredAction("supply_context_anchor", "Choose participants", "Choose at least one participant or a Scope for this Context.")),
                };
            }
            if (input.scope_id && !backend.scopeExists(workspaceId(context), input.scope_id)) {
                return {
                    state: "refused",
                    refusal: refusal("context_scope_not_found", "The selected Scope is not available in this Workspace.", false, requiredAction("select_scope", "Select a Scope", "Select a Scope from the current Workspace.")),
                };
            }
            if (input.parent_context_id) {
                if (input.context_id
                    && (input.parent_context_id === input.context_id
                        || backend.contexts.wouldCreateCycle(input.parent_context_id, input.context_id))) {
                    return {
                        state: "refused",
                        refusal: refusal("context_parent_cycle", "The selected parent would create a Context cycle.", false, requiredAction("select_context", "Select another parent", "Select a Context outside this Context's descendant chain.")),
                    };
                }
                const parent = contextInWorkspace(backend.contexts, workspaceId(context), input.parent_context_id);
                if (!parent || parent.lifecycle_state === "tombstoned") {
                    return {
                        state: "refused",
                        refusal: refusal("context_parent_not_found", "The parent Context is not available in this Workspace.", false, requiredAction("select_context", "Select a parent Context", "Select an available parent Context from this Workspace.")),
                    };
                }
            }
            const missing = participants.find((participant) => !backend.participantExists(workspaceId(context), participant.participant_id));
            if (missing) {
                return {
                    state: "refused",
                    refusal: refusal("context_participant_not_found", "A selected participant is not available in this Workspace.", false, requiredAction("select_participant", "Select a participant", "Select participants from the current Workspace."), { participant_id: missing.participant_id }),
                };
            }
            const id = backend.contexts.createContext({
                workspace_id: workspaceId(context),
                scope_id: input.scope_id ?? null,
                parent_context_id: input.parent_context_id ?? null,
                created_by_endpoint_id: null,
                created_by_principal_id: context.authority.principal_id,
                participants,
                ...(input.context_id ? { context_id: input.context_id } : {}),
                title: input.title ?? null,
            });
            const created = backend.contexts.requireContext(id);
            backend.publishContextChange("created", created);
            return {
                state: "completed",
                result: { context: created },
                changed_refs: [contextRef(created)],
                audit_ref: auditRef(context),
            };
        }),
    };
}
function contextLifecycleOperation(backend, lifecycle) {
    const archive = lifecycle === "archive";
    const operationId = archive ? ARCHIVE_CONTEXT_OPERATION_ID : RESTORE_CONTEXT_OPERATION_ID;
    return {
        operation_id: operationId,
        operation_version: "1",
        authority_boundary_kinds: ["workspace"],
        category: "contexts",
        title: archive ? "Archive Context" : "Restore Context",
        description: archive
            ? "Hide a Context from normal active collaboration while retaining its identity, content, and evidence."
            : "Return an archived Context to active collaboration without replacing its retained identity or history.",
        effects: { mode: "write", reversibility: "reversible", external: false, secret_access: "none" },
        required_grants: [operationId],
        interaction_constraints: { allowed_modes: ["interactive", "unattended"] },
        target: { resource_kinds: ["context"], expected_revision: "required" },
        input: { version: "1", schema: reasonInputSchema },
        result: { version: "1", schema: contextOnlyResultSchema },
        availability: (context) => contextAvailability(backend, workspaceId(context), context.target.ref.id, archive ? "active" : "archived"),
        handler: (context, input) => handle(() => {
            const expectedRevision = requireExpectedRevision(context);
            const changed = archive
                ? backend.contexts.archiveContext({
                    context_id: context.target.ref.id,
                    expected_revision: expectedRevision,
                    archived_by_principal_id: context.authority.principal_id,
                    reason: input.reason ?? null,
                })
                : backend.contexts.restoreContext({
                    context_id: context.target.ref.id,
                    expected_revision: expectedRevision,
                    restored_by_principal_id: context.authority.principal_id,
                });
            backend.publishContextChange(archive ? "archived" : "restored", changed);
            return {
                state: "completed",
                result: { context: changed },
                changed_refs: [contextRef(changed)],
                audit_ref: auditRef(context),
            };
        }),
    };
}
export function setContextParticipantAccessOperation(backend) {
    return {
        operation_id: SET_CONTEXT_PARTICIPANT_ACCESS_OPERATION_ID,
        operation_version: "1",
        authority_boundary_kinds: ["workspace"],
        category: "contexts",
        title: "Set Context participant access",
        description: "Add a participant or change their role and access in a Context. This changes collaboration only, never Scope routing.",
        effects: { mode: "write", reversibility: "reversible", external: false, secret_access: "none" },
        required_grants: [SET_CONTEXT_PARTICIPANT_ACCESS_OPERATION_ID],
        interaction_constraints: { allowed_modes: ["interactive", "unattended"] },
        target: { resource_kinds: ["context"], expected_revision: "required" },
        input: { version: "1", schema: setParticipantInputSchema },
        result: { version: "1", schema: participantMutationResultSchema },
        availability: (context) => contextAvailability(backend, workspaceId(context), context.target.ref.id, "active"),
        handler: (context, input) => handle(() => {
            if (!backend.participantExists(workspaceId(context), input.participant_id)) {
                return {
                    state: "refused",
                    refusal: refusal("context_participant_not_found", "The selected participant is not available in this Workspace.", false, requiredAction("select_participant", "Select a participant", "Select a participant from the current Workspace.")),
                };
            }
            const result = backend.contexts.setParticipantAccess({
                context_id: context.target.ref.id,
                participant_id: input.participant_id,
                role: input.role,
                access: input.access,
                expected_revision: requireExpectedRevision(context),
                changed_by_principal_id: context.authority.principal_id,
            });
            if (result.changed) {
                backend.publishContextChange("participant_changed", result.context, {
                    participant_id: input.participant_id,
                    change: "set_access",
                });
            }
            return {
                state: "completed",
                result,
                changed_refs: result.changed
                    ? [contextRef(result.context), participantRef(result.context.context_id, input.participant_id)]
                    : [],
                audit_ref: auditRef(context),
            };
        }),
    };
}
export function removeContextParticipantOperation(backend) {
    return {
        operation_id: REMOVE_CONTEXT_PARTICIPANT_OPERATION_ID,
        operation_version: "1",
        authority_boundary_kinds: ["workspace"],
        category: "contexts",
        title: "Remove Context participant",
        description: "Remove one participant's Context access without changing Scope routing or deleting retained history.",
        effects: { mode: "write", reversibility: "reversible", external: false, secret_access: "none" },
        required_grants: [REMOVE_CONTEXT_PARTICIPANT_OPERATION_ID],
        interaction_constraints: { allowed_modes: ["interactive", "unattended"] },
        target: { resource_kinds: ["context"], expected_revision: "required" },
        input: { version: "1", schema: removeParticipantInputSchema },
        result: { version: "1", schema: participantRemovalResultSchema },
        availability: (context) => contextAvailability(backend, workspaceId(context), context.target.ref.id, "active"),
        handler: (context, input) => handle(() => {
            const result = backend.contexts.removeParticipantAccess({
                context_id: context.target.ref.id,
                participant_id: input.participant_id,
                expected_revision: requireExpectedRevision(context),
                changed_by_principal_id: context.authority.principal_id,
            });
            if (result.removed) {
                backend.publishContextChange("participant_changed", result.context, {
                    participant_id: input.participant_id,
                    change: "removed",
                });
            }
            return {
                state: "completed",
                result,
                changed_refs: result.removed
                    ? [contextRef(result.context), participantRef(result.context.context_id, input.participant_id)]
                    : [],
                audit_ref: auditRef(context),
            };
        }),
    };
}
export function emitContextCommunicationOperation(backend) {
    return {
        operation_id: EMIT_CONTEXT_COMMUNICATION_OPERATION_ID,
        operation_version: "1",
        authority_boundary_kinds: ["workspace"],
        category: "contexts",
        title: "Communicate in Context",
        description: "Emit deliberate direct communication in a Context through the canonical Event path. This never traverses Scope Edges.",
        effects: { mode: "write", reversibility: "irreversible", external: false, secret_access: "none" },
        required_grants: [EMIT_CONTEXT_COMMUNICATION_OPERATION_ID],
        interaction_constraints: { allowed_modes: ["interactive", "unattended"] },
        target: { resource_kinds: ["context"], expected_revision: "required" },
        input: { version: "2", schema: communicationInputSchema },
        result: { version: "1", schema: communicationResultSchema },
        availability: (context) => contextAvailability(backend, workspaceId(context), context.target.ref.id, "active"),
        handler: (context, input) => handle(async () => {
            const value = contextInWorkspace(backend.contexts, workspaceId(context), context.target.ref.id);
            if (!value)
                throw new ContextNotFoundError(context.target.ref.id);
            requireExpectedRevision(context);
            if (input.recipient_participant_id && !backend.contexts.isParticipant(value.context_id, input.recipient_participant_id)) {
                return {
                    state: "refused",
                    refusal: refusal("context_recipient_not_found", "The selected recipient does not participate in this Context.", false, requiredAction("select_participant", "Select a participant", "Select a current Context participant or address all participants.")),
                };
            }
            const outcome = await backend.emitDirectContextCommunication({
                workspace_id: value.workspace_id,
                context_id: value.context_id,
                principal_id: context.authority.principal_id,
                event_type: input.event_type,
                recipient_participant_id: input.recipient_participant_id ?? null,
                content: input.content,
                artefact_version_ids: input.artefact_version_ids ?? [],
                attachment_ingress_ids: input.attachment_ingress_ids ?? [],
                response_expected: input.response_expected,
                invocation_id: context.invocation_id,
                provenance: context.provenance,
            });
            if (!outcome.emitted) {
                return {
                    state: "refused",
                    refusal: refusal(outcome.code, outcome.message, outcome.retryable, requiredAction("inspect_context", "Inspect Context", "Inspect participant access and current Context state."), outcome.details ?? {}),
                };
            }
            return {
                state: "completed",
                result: {
                    event_ref: outcome.event_ref,
                    artefact_version_refs: outcome.artefact_version_refs,
                },
                changed_refs: [outcome.event_ref, ...outcome.artefact_version_refs],
                audit_ref: auditRef(context),
            };
        }),
    };
}
export function destroyContextPermanentlyOperation(backend) {
    return {
        operation_id: DESTROY_CONTEXT_PERMANENTLY_OPERATION_ID,
        operation_version: "1",
        authority_boundary_kinds: ["workspace"],
        category: "contexts",
        title: "Permanently destroy Context content",
        description: "Irreversibly remove unreferenced Context content while retaining a redacted identity tombstone for audit references.",
        effects: { mode: "write", reversibility: "irreversible", external: false, secret_access: "none" },
        required_grants: [DESTROY_CONTEXT_PERMANENTLY_OPERATION_ID],
        interaction_constraints: {
            allowed_modes: ["interactive"],
            confirmation: {
                required: true,
                prompt_id: "context.destroy_permanently",
                title: "Permanently destroy Context content",
                description: "This permanently removes the Context's content and cannot be undone.",
            },
        },
        target: { resource_kinds: ["context"], expected_revision: "required" },
        input: { version: "1", schema: destroyInputSchema },
        result: { version: "1", schema: destructionResultSchema },
        availability: (context) => {
            const base = contextAvailability(backend, workspaceId(context), context.target.ref.id);
            if (!base.available)
                return base;
            const value = contextInWorkspace(backend.contexts, workspaceId(context), context.target.ref.id);
            if (value.lifecycle_state === "tombstoned")
                return { available: false, refusal: lifecycleRefusal("tombstoned") };
            // The invocation ledger records the attempt before availability is
            // evaluated. Retained evidence is therefore decided only by the atomic
            // destruction handler, which can exclude that exact current invocation
            // and re-check every other canonical reference without a race.
            return { available: true };
        },
        handler: (context, input) => handle(async () => {
            const outcome = await backend.destroyContextPermanently({
                workspace_id: workspaceId(context),
                context_id: context.target.ref.id,
                expected_revision: requireExpectedRevision(context),
                principal_id: context.authority.principal_id,
                reason: input.reason,
                invocation_id: context.invocation_id,
            });
            if (!outcome.destroyed) {
                return { state: "refused", refusal: retainedReferencesRefusal(outcome.retained_references) };
            }
            backend.publishContextChange("tombstoned", outcome.context, {
                events_deleted: outcome.events_deleted,
            });
            return {
                state: "completed",
                result: { context: outcome.context, events_deleted: outcome.events_deleted },
                changed_refs: [contextRef(outcome.context)],
                audit_ref: auditRef(context),
            };
        }),
    };
}
function retainedReferencesRefusal(references) {
    return refusal("context_retained_references_exist", "This Context is retained by canonical evidence and cannot be permanently destroyed.", false, requiredAction("inspect_context", "Inspect retained evidence", "Inspect the Context to see the records that require its evidence."), { retained_references: references });
}
export function contextOperationDefinitions(backend) {
    return [
        listContextsOperation(backend),
        getContextOperation(backend),
        inspectContextOperation(backend),
        createContextOperation(backend),
        contextLifecycleOperation(backend, "archive"),
        contextLifecycleOperation(backend, "restore"),
        setContextParticipantAccessOperation(backend),
        removeContextParticipantOperation(backend),
        emitContextCommunicationOperation(backend),
        destroyContextPermanentlyOperation(backend),
    ];
}
export function registerContextOperations(registry, backend) {
    for (const definition of contextOperationDefinitions(backend))
        registry.register(definition);
    return registry;
}
