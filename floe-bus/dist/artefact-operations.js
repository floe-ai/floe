import { ArtefactIdempotencyConflictError, ArtefactNotFoundError, ArtefactValidationError, ArtefactVersionNotFoundError, ArtefactWorkspaceMismatchError, } from "./artefacts.js";
import { ArtefactContentMismatchError, ArtefactContentNotFoundError, ArtefactContentTooLargeError, } from "./artefact-content-resolver.js";
import { refusal, requireWorkspaceAuthorityId, requiredAction, } from "./operations.js";
function authorityWorkspaceId(context) {
    return requireWorkspaceAuthorityId(context.authority);
}
export const CREATE_ARTEFACT_OPERATION_ID = "artefact.create";
export const PUBLISH_ARTEFACT_VERSION_OPERATION_ID = "artefact.version.publish";
export const INSPECT_ARTEFACT_OPERATION_ID = "artefact.inspect";
export const SEARCH_ARTEFACTS_OPERATION_ID = "artefact.search";
const nonEmptyStringSchema = { type: "string", minLength: 1 };
const nullableStringSchema = { oneOf: [nonEmptyStringSchema, { type: "null" }] };
const digestSchema = {
    type: "object",
    additionalProperties: false,
    required: ["algorithm", "value"],
    properties: {
        algorithm: { const: "sha256" },
        value: { type: "string", pattern: "^[A-Fa-f0-9]{64}$" },
    },
};
const optionalContentMetadata = {
    media_type: nullableStringSchema,
    size_bytes: { oneOf: [{ type: "integer", minimum: 0 }, { type: "null" }] },
};
const workspaceRelativeContentRefSchema = {
    type: "object",
    additionalProperties: false,
    required: ["kind", "path", "digest"],
    properties: {
        kind: { const: "workspace-relative" },
        path: {
            type: "string",
            minLength: 1,
            description: "Workspace-relative resolver hint. The digest, not this mutable path, pins content identity.",
            pattern: "^(?![A-Za-z]:)(?![/\\\\])(?![Ff][Ii][Ll][Ee]:)(?!.*(?:^|[/\\\\])\\.\\.(?:[/\\\\]|$)).+",
        },
        digest: digestSchema,
        ...optionalContentMetadata,
    },
};
const contentAddressedContentRefSchema = {
    type: "object",
    additionalProperties: false,
    required: ["kind", "resolver_id", "digest"],
    properties: {
        kind: { const: "content-addressed" },
        resolver_id: nonEmptyStringSchema,
        digest: digestSchema,
        ...optionalContentMetadata,
    },
};
const externalRevisionContentRefSchema = {
    type: "object",
    additionalProperties: false,
    required: ["kind", "resolver_id", "external_id", "revision"],
    properties: {
        kind: { const: "external-revision" },
        resolver_id: nonEmptyStringSchema,
        external_id: {
            type: "string",
            minLength: 1,
            description: "Opaque external identity resolved by the named resolver; absolute file paths are not accepted.",
            pattern: "^(?![A-Za-z]:)(?![/\\\\])(?![Ff][Ii][Ll][Ee]:).+",
        },
        revision: nonEmptyStringSchema,
        digest: { oneOf: [digestSchema, { type: "null" }] },
        ...optionalContentMetadata,
    },
};
export const CONTENT_REF_SCHEMA = {
    oneOf: [
        workspaceRelativeContentRefSchema,
        contentAddressedContentRefSchema,
        externalRevisionContentRefSchema,
    ],
};
const artefactSchema = {
    type: "object",
    additionalProperties: false,
    required: ["artefact_id", "workspace_id", "type_ref", "created_at"],
    properties: {
        artefact_id: nonEmptyStringSchema,
        workspace_id: nonEmptyStringSchema,
        type_ref: nonEmptyStringSchema,
        created_at: nonEmptyStringSchema,
    },
};
const artefactVersionSchema = {
    type: "object",
    additionalProperties: false,
    required: ["artefact_version_id", "artefact_id", "ordinal", "schema_ref", "content_ref", "created_at"],
    properties: {
        artefact_version_id: nonEmptyStringSchema,
        artefact_id: nonEmptyStringSchema,
        ordinal: { type: "integer", minimum: 1 },
        schema_ref: nullableStringSchema,
        content_ref: CONTENT_REF_SCHEMA,
        created_at: nonEmptyStringSchema,
    },
};
const lineageTypeSchema = {
    oneOf: [
        {
            enum: [
                "core:derived-from",
                "core:supersedes",
                "core:test-of",
                "core:decision-about",
                "core:deployment-of",
            ],
        },
        {
            type: "string",
            pattern: "^extension:[A-Za-z0-9][A-Za-z0-9._/-]*/[A-Za-z0-9][A-Za-z0-9._-]*$",
        },
    ],
};
const lineageSchema = {
    type: "object",
    additionalProperties: false,
    required: ["lineage_id", "workspace_id", "subject_version_id", "relation_type", "object_version_id", "created_at"],
    properties: {
        lineage_id: nonEmptyStringSchema,
        workspace_id: nonEmptyStringSchema,
        subject_version_id: nonEmptyStringSchema,
        relation_type: lineageTypeSchema,
        object_version_id: nonEmptyStringSchema,
        created_at: nonEmptyStringSchema,
    },
};
const collectionMemberSchema = {
    type: "object",
    additionalProperties: false,
    required: ["collection_version_id", "member_key", "member_version_id", "position", "created_at"],
    properties: {
        collection_version_id: nonEmptyStringSchema,
        member_key: nonEmptyStringSchema,
        member_version_id: nonEmptyStringSchema,
        position: { oneOf: [{ type: "integer", minimum: 0 }, { type: "null" }] },
        created_at: nonEmptyStringSchema,
    },
};
const associationTargetKindSchema = {
    enum: ["event", "context", "scope_execution", "node_execution", "delivery", "connector_receipt"],
};
const associationRoleSchema = {
    enum: ["input", "output", "evidence", "attachment", "observation"],
};
const associationSchema = {
    type: "object",
    additionalProperties: false,
    required: ["association_id", "artefact_version_id", "target_kind", "target_id", "role", "created_at"],
    properties: {
        association_id: nonEmptyStringSchema,
        artefact_version_id: nonEmptyStringSchema,
        target_kind: associationTargetKindSchema,
        target_id: nonEmptyStringSchema,
        role: associationRoleSchema,
        created_at: nonEmptyStringSchema,
    },
};
const extensionNamespaceSchema = {
    type: "string",
    pattern: "^extension:[A-Za-z0-9][A-Za-z0-9._/-]*$",
};
const annotationSchema = {
    type: "object",
    additionalProperties: false,
    required: [
        "annotation_id",
        "artefact_version_id",
        "namespace",
        "key",
        "extension_package_version_ref",
        "schema_ref",
        "value",
        "created_at",
    ],
    properties: {
        annotation_id: nonEmptyStringSchema,
        artefact_version_id: nonEmptyStringSchema,
        namespace: extensionNamespaceSchema,
        key: nonEmptyStringSchema,
        extension_package_version_ref: nonEmptyStringSchema,
        schema_ref: nullableStringSchema,
        value: {},
        created_at: nonEmptyStringSchema,
    },
};
const versionEvidenceSchema = {
    type: "object",
    additionalProperties: false,
    required: ["version", "lineage_from", "lineage_to", "members", "associations", "annotations"],
    properties: {
        version: artefactVersionSchema,
        lineage_from: { type: "array", items: lineageSchema },
        lineage_to: { type: "array", items: lineageSchema },
        members: { type: "array", items: collectionMemberSchema },
        associations: { type: "array", items: associationSchema },
        annotations: { type: "array", items: annotationSchema },
    },
};
export const CREATE_ARTEFACT_INPUT_SCHEMA = {
    type: "object",
    additionalProperties: false,
    required: ["type_ref"],
    properties: {
        type_ref: nonEmptyStringSchema,
        artefact_id: nonEmptyStringSchema,
    },
};
export const CREATE_ARTEFACT_RESULT_SCHEMA = {
    type: "object",
    additionalProperties: false,
    required: ["artefact"],
    properties: { artefact: artefactSchema },
};
const lineageInputSchema = {
    type: "object",
    additionalProperties: false,
    required: ["relation_type", "object_version_id"],
    properties: {
        relation_type: lineageTypeSchema,
        object_version_id: nonEmptyStringSchema,
    },
};
const memberInputSchema = {
    type: "object",
    additionalProperties: false,
    required: ["member_key", "member_version_id"],
    properties: {
        member_key: nonEmptyStringSchema,
        member_version_id: nonEmptyStringSchema,
        position: { oneOf: [{ type: "integer", minimum: 0 }, { type: "null" }] },
    },
};
const associationInputSchema = {
    type: "object",
    additionalProperties: false,
    required: ["target_kind", "target_id", "role"],
    properties: {
        target_kind: associationTargetKindSchema,
        target_id: nonEmptyStringSchema,
        role: associationRoleSchema,
    },
};
const annotationInputSchema = {
    type: "object",
    additionalProperties: false,
    required: ["namespace", "key", "extension_package_version_ref", "value"],
    properties: {
        namespace: extensionNamespaceSchema,
        key: nonEmptyStringSchema,
        extension_package_version_ref: nonEmptyStringSchema,
        schema_ref: nullableStringSchema,
        value: {},
    },
};
export const PUBLISH_ARTEFACT_VERSION_INPUT_SCHEMA = {
    type: "object",
    additionalProperties: false,
    required: ["content_ref"],
    properties: {
        artefact_version_id: nonEmptyStringSchema,
        schema_ref: nullableStringSchema,
        content_ref: CONTENT_REF_SCHEMA,
        lineage: { type: "array", items: lineageInputSchema },
        members: { type: "array", items: memberInputSchema },
        associations: { type: "array", items: associationInputSchema },
        annotations: { type: "array", items: annotationInputSchema },
    },
};
export const PUBLISH_ARTEFACT_VERSION_RESULT_SCHEMA = versionEvidenceSchema;
export const INSPECT_ARTEFACT_INPUT_SCHEMA = {
    type: "object",
    additionalProperties: false,
    properties: {
        artefact_version_id: nonEmptyStringSchema,
        include_history: { type: "boolean" },
    },
};
export const INSPECT_ARTEFACT_RESULT_SCHEMA = {
    type: "object",
    additionalProperties: false,
    required: ["artefact", "heads", "history_complete", "versions", "selected"],
    properties: {
        artefact: artefactSchema,
        heads: { type: "array", items: artefactVersionSchema },
        history_complete: { type: "boolean" },
        versions: { type: "array", items: artefactVersionSchema },
        selected: { oneOf: [versionEvidenceSchema, { type: "null" }] },
    },
};
export const SEARCH_ARTEFACTS_INPUT_SCHEMA = {
    type: "object",
    additionalProperties: false,
    properties: {
        query: { type: "string", minLength: 1, maxLength: 512 },
        type_ref: nonEmptyStringSchema,
        association: {
            type: "object",
            additionalProperties: false,
            required: ["target_kind", "target_id"],
            properties: {
                target_kind: associationTargetKindSchema,
                target_id: nonEmptyStringSchema,
                role: associationRoleSchema,
            },
        },
        limit: { type: "integer", minimum: 1, maximum: 100 },
        after: nonEmptyStringSchema,
    },
};
export const SEARCH_ARTEFACTS_RESULT_SCHEMA = {
    type: "object",
    additionalProperties: false,
    required: ["items", "next_cursor"],
    properties: {
        items: {
            type: "array",
            items: {
                type: "object",
                additionalProperties: false,
                required: ["artefact", "heads"],
                properties: {
                    artefact: artefactSchema,
                    heads: { type: "array", items: artefactVersionSchema },
                },
            },
        },
        next_cursor: { oneOf: [nonEmptyStringSchema, { type: "null" }] },
    },
};
function targetUnavailable(store, context) {
    const target = context.target?.ref;
    if (!target)
        return null;
    let artefact = null;
    if (target.kind === "artefact") {
        artefact = store.getArtefact(target.id);
    }
    else if (target.kind === "artefact_version") {
        const version = store.getVersion(target.id);
        artefact = version ? store.getArtefact(version.artefact_id) : null;
    }
    if (!artefact || artefact.workspace_id !== authorityWorkspaceId(context)) {
        return refusal("artefact_not_found", "This Artefact is not available in the current Workspace.", false, requiredAction("refresh_artefacts", "Refresh Artefacts", "Refresh this Workspace and select an available Artefact."));
    }
    return null;
}
function availability(store, context) {
    const unavailable = targetUnavailable(store, context);
    return unavailable ? { available: false, refusal: unavailable } : { available: true };
}
function operationRefusal(error) {
    if (error instanceof ArtefactContentMismatchError || error instanceof ArtefactContentNotFoundError
        || error instanceof ArtefactContentTooLargeError) {
        return refusal(error.code, error.message, false, requiredAction("verify_content", "Verify the file", "Read the existing file and provide its exact digest and size before publishing."));
    }
    if (error instanceof ArtefactIdempotencyConflictError) {
        return refusal("artefact_idempotency_conflict", "This idempotency key already identifies different Artefact data.", false, requiredAction("new_idempotency_key", "Use a new idempotency key", "Keep the existing key for its original intent and use a new key for this different change."));
    }
    if (error instanceof ArtefactValidationError || error instanceof ArtefactWorkspaceMismatchError) {
        return refusal("artefact_input_invalid", error.message, false, requiredAction("correct_input", "Correct the Artefact data", "Use the exact discovered contract and references from this Workspace."));
    }
    if (error instanceof ArtefactNotFoundError || error instanceof ArtefactVersionNotFoundError) {
        return refusal("artefact_not_found", "The requested Artefact or exact ArtefactVersion was not found in this Workspace.", false, requiredAction("refresh_artefacts", "Refresh Artefacts", "Refresh retained Artefacts and choose an available exact version."));
    }
    return refusal("artefact_operation_failed", "Floe could not prove that the Artefact operation completed.", false, requiredAction("inspect_artefacts", "Inspect Artefacts", "Inspect retained Artefact state before deciding whether a retry is safe."));
}
function exactEvidence(store, version) {
    return {
        version,
        lineage_from: store.listLineageFrom(version.artefact_version_id),
        lineage_to: store.listLineageTo(version.artefact_version_id),
        members: store.listCollectionMembers(version.artefact_version_id),
        associations: store.listAssociations(version.artefact_version_id),
        annotations: store.listAnnotations(version.artefact_version_id),
    };
}
export function createArtefactOperation(store) {
    return {
        operation_id: CREATE_ARTEFACT_OPERATION_ID,
        operation_version: "1",
        authority_boundary_kinds: ["workspace"],
        category: "artefacts",
        title: "Create Artefact",
        description: "Create stable identity for a Workspace output without treating its mutable location as identity.",
        effects: { mode: "write", reversibility: "irreversible", external: false, secret_access: "none" },
        required_grants: [CREATE_ARTEFACT_OPERATION_ID],
        interaction_constraints: { allowed_modes: ["interactive", "unattended"] },
        target: { resource_kinds: [], expected_revision: "not_applicable" },
        input: { version: "1", schema: CREATE_ARTEFACT_INPUT_SCHEMA },
        result: { version: "1", schema: CREATE_ARTEFACT_RESULT_SCHEMA },
        handler: async (context, input) => {
            try {
                const artefact = store.createArtefact({
                    workspace_id: authorityWorkspaceId(context),
                    type_ref: input.type_ref,
                    idempotency_key: context.idempotency_key,
                    ...(input.artefact_id ? { artefact_id: input.artefact_id } : {}),
                });
                return {
                    state: "completed",
                    result: { artefact },
                    changed_refs: [{ kind: "artefact", id: artefact.artefact_id, revision: null }],
                };
            }
            catch (error) {
                return { state: "refused", refusal: operationRefusal(error) };
            }
        },
    };
}
export function publishArtefactVersionOperation(store, publishVersion) {
    return {
        operation_id: PUBLISH_ARTEFACT_VERSION_OPERATION_ID,
        operation_version: "1",
        authority_boundary_kinds: ["workspace"],
        category: "artefacts",
        title: "Publish exact Artefact version",
        description: "Publish immutable content, exact lineage, collection membership, execution references, and extension-owned annotations. Workspace files are verified against the supplied digest and retained before publication; later source edits do not change the published version.",
        effects: { mode: "write", reversibility: "irreversible", external: false, secret_access: "none" },
        required_grants: [PUBLISH_ARTEFACT_VERSION_OPERATION_ID],
        interaction_constraints: { allowed_modes: ["interactive", "unattended"] },
        target: { resource_kinds: ["artefact"], expected_revision: "not_applicable" },
        input: { version: "1", schema: PUBLISH_ARTEFACT_VERSION_INPUT_SCHEMA },
        result: { version: "1", schema: PUBLISH_ARTEFACT_VERSION_RESULT_SCHEMA },
        availability: (context) => availability(store, context),
        handler: async (context, input) => {
            try {
                const unavailable = targetUnavailable(store, context);
                if (unavailable)
                    return { state: "refused", refusal: unavailable };
                const artefactId = context.target?.ref.id;
                if (!artefactId)
                    throw new ArtefactNotFoundError("missing-target");
                const version = publishVersion({
                    ...input,
                    artefact_id: artefactId,
                    idempotency_key: context.idempotency_key,
                });
                return {
                    state: "completed",
                    result: exactEvidence(store, version),
                    changed_refs: [
                        { kind: "artefact", id: artefactId, revision: version.artefact_version_id },
                        { kind: "artefact_version", id: version.artefact_version_id, revision: version.artefact_version_id },
                    ],
                };
            }
            catch (error) {
                return { state: "refused", refusal: operationRefusal(error) };
            }
        },
    };
}
export function inspectArtefactOperation(store) {
    return {
        operation_id: INSPECT_ARTEFACT_OPERATION_ID,
        operation_version: "1",
        authority_boundary_kinds: ["workspace"],
        category: "artefacts",
        title: "Inspect Artefact versions",
        description: "Inspect branch heads, retained history, or one exact ArtefactVersion without inventing a universal current version.",
        effects: { mode: "read", reversibility: "none", external: false, secret_access: "none" },
        required_grants: [INSPECT_ARTEFACT_OPERATION_ID],
        interaction_constraints: { allowed_modes: ["interactive", "unattended"] },
        target: { resource_kinds: ["artefact", "artefact_version"], expected_revision: "not_applicable" },
        input: { version: "1", schema: INSPECT_ARTEFACT_INPUT_SCHEMA },
        result: { version: "1", schema: INSPECT_ARTEFACT_RESULT_SCHEMA },
        availability: (context) => availability(store, context),
        handler: async (context, input) => {
            try {
                const unavailable = targetUnavailable(store, context);
                if (unavailable)
                    return { state: "refused", refusal: unavailable };
                const target = context.target?.ref;
                if (!target)
                    throw new ArtefactNotFoundError("missing-target");
                let selectedVersionId = input.artefact_version_id ?? null;
                let artefact;
                if (target.kind === "artefact_version") {
                    if (selectedVersionId && selectedVersionId !== target.id) {
                        return {
                            state: "refused",
                            refusal: refusal("artefact_version_target_conflict", "The requested exact version does not match the selected ArtefactVersion.", false, requiredAction("select_exact_version", "Select one exact version", "Use either the selected ArtefactVersion or a matching exact version reference.")),
                        };
                    }
                    selectedVersionId = target.id;
                    const targetVersion = store.getVersion(target.id);
                    artefact = targetVersion ? store.getArtefact(targetVersion.artefact_id) : null;
                }
                else {
                    artefact = store.getArtefact(target.id);
                }
                if (!artefact || artefact.workspace_id !== authorityWorkspaceId(context)) {
                    throw new ArtefactNotFoundError(target.id);
                }
                let selected = null;
                if (selectedVersionId) {
                    const version = store.getVersion(selectedVersionId);
                    if (!version || version.artefact_id !== artefact.artefact_id) {
                        throw new ArtefactVersionNotFoundError(selectedVersionId);
                    }
                    selected = exactEvidence(store, version);
                }
                const includeHistory = input.include_history === true;
                return {
                    state: "completed",
                    result: {
                        artefact,
                        heads: store.listHeads(artefact.artefact_id),
                        history_complete: includeHistory,
                        versions: includeHistory ? store.listVersions(artefact.artefact_id) : [],
                        selected,
                    },
                };
            }
            catch (error) {
                return { state: "refused", refusal: operationRefusal(error) };
            }
        },
    };
}
export function searchArtefactsOperation(store) {
    return {
        operation_id: SEARCH_ARTEFACTS_OPERATION_ID,
        operation_version: "1",
        authority_boundary_kinds: ["workspace"],
        category: "artefacts",
        title: "Find Artefacts",
        description: "Find a bounded page of canonical Workspace Artefacts and their exact branch heads.",
        effects: { mode: "read", reversibility: "none", external: false, secret_access: "none" },
        required_grants: [SEARCH_ARTEFACTS_OPERATION_ID],
        interaction_constraints: { allowed_modes: ["interactive", "unattended"] },
        target: { resource_kinds: [], expected_revision: "not_applicable" },
        input: { version: "1", schema: SEARCH_ARTEFACTS_INPUT_SCHEMA },
        result: { version: "1", schema: SEARCH_ARTEFACTS_RESULT_SCHEMA },
        handler: async (context, input) => {
            try {
                const page = store.searchArtefacts({
                    workspace_id: authorityWorkspaceId(context),
                    ...(input.query === undefined ? {} : { query: input.query }),
                    ...(input.type_ref === undefined ? {} : { type_ref: input.type_ref }),
                    ...(input.association === undefined ? {} : { association: input.association }),
                    ...(input.limit === undefined ? {} : { limit: input.limit }),
                    ...(input.after === undefined ? {} : { after: input.after }),
                });
                return {
                    state: "completed",
                    result: {
                        items: page.artefacts.map((artefact) => ({
                            artefact,
                            heads: store.listHeads(artefact.artefact_id),
                        })),
                        next_cursor: page.next_cursor,
                    },
                };
            }
            catch (error) {
                return { state: "refused", refusal: operationRefusal(error) };
            }
        },
    };
}
export function artefactOperationDefinitions(store, publishVersion) {
    return [
        createArtefactOperation(store),
        publishArtefactVersionOperation(store, publishVersion),
        inspectArtefactOperation(store),
        searchArtefactsOperation(store),
    ];
}
export function registerArtefactOperations(registry, store, publishVersion) {
    const [create, publish, inspect, search] = artefactOperationDefinitions(store, publishVersion);
    registry.register(create);
    registry.register(publish);
    registry.register(inspect);
    registry.register(search);
    return registry;
}
