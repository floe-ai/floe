import { ExtensionInstallationNotFoundError, ExtensionExecutionPackageConflictError, ExtensionNotFoundError, ExtensionPackageImmutableError, ExtensionPackageVersionNotFoundError, ExtensionRevisionConflictError, ExtensionValidationError, extensionIdentityRevision, extensionInstallationRevision, } from "./extensions.js";
import { ExtensionSandboxError } from "./isolated-extension-runtime.js";
import { refusal, requireWorkspaceAuthorityId, requiredAction, } from "./operations.js";
export const LIST_EXTENSIONS_OPERATION_ID = "extension.list";
export const INSPECT_EXTENSION_OPERATION_ID = "extension.inspect";
export const GET_EXTENSION_PACKAGE_OPERATION_ID = "extension.package.get";
export const DISCOVER_EXTENSION_SCHEMAS_OPERATION_ID = "extension.schema.discover";
export const LIST_ACTIVE_EXTENSION_CONTRIBUTIONS_OPERATION_ID = "extension.contributions.list-active";
export const CREATE_EXTENSION_OPERATION_ID = "extension.create";
export const REGISTER_EXTENSION_BUILD_EVIDENCE_OPERATION_ID = "extension.build-evidence.register";
export const INSTALL_EXTENSION_OPERATION_ID = "extension.install";
export const ENABLE_EXTENSION_OPERATION_ID = "extension.enable";
export const UPGRADE_EXTENSION_OPERATION_ID = "extension.upgrade";
export const DISABLE_EXTENSION_OPERATION_ID = "extension.disable";
export const ROLLBACK_EXTENSION_OPERATION_ID = "extension.rollback";
export const INVOKE_EXTENSION_ENTRY_POINT_OPERATION_ID = "extension.entry-point.invoke";
export class UnavailableExtensionEntryPointExecution {
    async invoke() {
        throw new ExtensionSandboxError("extension_host_unavailable", "No isolated Extension host is available for this invocation.");
    }
}
const nonEmptyString = { type: "string", minLength: 1 };
const nullableString = { oneOf: [nonEmptyString, { type: "null" }] };
const digestSchema = { type: "string", pattern: "^sha256:[0-9a-f]{64}$" };
const emptyInput = { type: "object", additionalProperties: false };
const resourceRefSchema = {
    type: "object",
    additionalProperties: false,
    required: ["kind", "id", "revision"],
    properties: { kind: nonEmptyString, id: nonEmptyString, revision: nullableString },
};
const sourceSchema = {
    type: "object",
    additionalProperties: false,
    required: ["kind", "canonical_ref", "revision"],
    properties: {
        kind: { enum: ["git", "package", "workspace_source"] },
        canonical_ref: nonEmptyString,
        revision: nonEmptyString,
    },
};
const trustEvidenceSchema = {
    type: "object",
    additionalProperties: false,
    required: ["kind", "evidence_ref", "subject_content_digest"],
    properties: {
        kind: { enum: ["signature", "attestation", "source_control"] },
        evidence_ref: resourceRefSchema,
        subject_content_digest: digestSchema,
    },
};
const provenanceSchema = {
    type: "object",
    additionalProperties: false,
    required: ["built_from_refs", "build_invocation_ref", "trust_evidence"],
    properties: {
        built_from_refs: { type: "array", items: resourceRefSchema },
        build_invocation_ref: resourceRefSchema,
        trust_evidence: { type: "array", items: trustEvidenceSchema },
    },
};
const compatibilitySchema = {
    type: "object",
    additionalProperties: false,
    required: ["floe_version_range", "operation_contract_versions"],
    properties: {
        floe_version_range: nonEmptyString,
        operation_contract_versions: { type: "array", items: nonEmptyString, uniqueItems: true },
    },
};
const networkPermissionSchema = {
    type: "object",
    additionalProperties: false,
    required: ["permission_id", "origin", "methods"],
    properties: {
        permission_id: nonEmptyString,
        origin: nonEmptyString,
        methods: {
            type: "array",
            items: { enum: ["GET", "POST", "PUT", "PATCH", "DELETE"] },
            uniqueItems: true,
        },
    },
};
const filesystemPermissionSchema = {
    type: "object",
    additionalProperties: false,
    required: ["permission_id", "scope", "relative_pattern", "access"],
    properties: {
        permission_id: nonEmptyString,
        scope: { enum: ["workspace", "extension_data", "temporary"] },
        relative_pattern: nonEmptyString,
        access: { enum: ["read", "write", "read_write"] },
    },
};
const secretPermissionSchema = {
    type: "object",
    additionalProperties: false,
    required: ["permission_id", "secret_ref_id", "purpose"],
    properties: {
        permission_id: nonEmptyString,
        secret_ref_id: nonEmptyString,
        purpose: nonEmptyString,
    },
};
const dataPermissionSchema = {
    type: "object",
    additionalProperties: false,
    required: ["permission_id", "data_class", "access"],
    properties: {
        permission_id: nonEmptyString,
        data_class: nonEmptyString,
        access: { enum: ["read", "write", "read_write"] },
    },
};
const actionPermissionSchema = {
    type: "object",
    additionalProperties: false,
    required: ["permission_id", "operation_id"],
    properties: { permission_id: nonEmptyString, operation_id: nonEmptyString },
};
const permissionsSchema = {
    type: "object",
    additionalProperties: false,
    required: ["network", "filesystem", "secrets", "data", "actions"],
    properties: {
        network: { type: "array", items: networkPermissionSchema },
        filesystem: { type: "array", items: filesystemPermissionSchema },
        secrets: { type: "array", items: secretPermissionSchema },
        data: { type: "array", items: dataPermissionSchema },
        actions: { type: "array", items: actionPermissionSchema },
    },
};
const capabilityContributionSchema = {
    type: "object",
    additionalProperties: false,
    required: ["capability_id", "operation_ids", "input_schema_ref", "result_schema_ref"],
    properties: {
        capability_id: nonEmptyString,
        operation_ids: { type: "array", items: nonEmptyString, uniqueItems: true },
        input_schema_ref: nullableString,
        result_schema_ref: nullableString,
    },
};
const connectorContributionSchema = {
    type: "object",
    additionalProperties: false,
    required: ["connector_id", "definition_schema_ref"],
    properties: { connector_id: nonEmptyString, definition_schema_ref: nonEmptyString },
};
export const EXTENSION_CONTRIBUTION_SCHEMA_SCHEMA = {
    type: "object",
    additionalProperties: false,
    required: ["schema_id", "schema_version", "schema_digest", "schema"],
    properties: {
        schema_id: nonEmptyString,
        schema_version: nonEmptyString,
        schema_digest: digestSchema,
        schema: { type: "object" },
    },
};
const productSurfaceSchema = {
    type: "object",
    additionalProperties: false,
    required: [
        "surface_id", "surface_version", "kind", "title", "projection_operation_id",
        "action_operation_ids", "presentation_schema_ref",
    ],
    properties: {
        surface_id: nonEmptyString,
        surface_version: nonEmptyString,
        kind: { enum: ["preview", "renderer", "lens", "dashboard"] },
        title: nonEmptyString,
        projection_operation_id: nonEmptyString,
        action_operation_ids: { type: "array", items: nonEmptyString, uniqueItems: true },
        presentation_schema_ref: nonEmptyString,
    },
};
const contributionsSchema = {
    type: "object",
    additionalProperties: false,
    required: ["capabilities", "connectors", "schemas", "product_surfaces"],
    properties: {
        capabilities: { type: "array", items: capabilityContributionSchema },
        connectors: { type: "array", items: connectorContributionSchema },
        schemas: { type: "array", items: EXTENSION_CONTRIBUTION_SCHEMA_SCHEMA },
        product_surfaces: { type: "array", items: productSurfaceSchema },
    },
};
const entryPointSchema = {
    type: "object",
    additionalProperties: false,
    required: ["entry_point_id", "kind", "package_path"],
    properties: {
        entry_point_id: nonEmptyString,
        kind: { enum: ["capability", "connector", "event_source", "command", "migration", "health_check"] },
        package_path: nonEmptyString,
    },
};
const testEvidenceSchema = {
    type: "object",
    additionalProperties: false,
    required: ["evidence_id", "kind", "result", "subject_content_digest", "report_ref"],
    properties: {
        evidence_id: nonEmptyString,
        kind: { enum: ["deterministic", "adversarial", "manual"] },
        result: { enum: ["passed", "failed"] },
        subject_content_digest: digestSchema,
        report_ref: resourceRefSchema,
    },
};
export const EXTENSION_PACKAGE_DEFINITION_SCHEMA = {
    type: "object",
    additionalProperties: false,
    required: [
        "package_version", "content_digest", "source", "provenance", "compatibility",
        "required_isolation_level", "permissions", "contributions", "entry_points", "test_evidence",
    ],
    properties: {
        package_version: nonEmptyString,
        content_digest: digestSchema,
        source: sourceSchema,
        provenance: provenanceSchema,
        compatibility: compatibilitySchema,
        required_isolation_level: { enum: ["process_sandbox", "container", "virtual_machine"] },
        permissions: permissionsSchema,
        contributions: contributionsSchema,
        entry_points: { type: "array", items: entryPointSchema },
        test_evidence: { type: "array", items: testEvidenceSchema },
    },
};
const extensionRecordSchema = {
    type: "object",
    additionalProperties: false,
    required: [
        "extension_id", "workspace_id", "label", "status", "current_package_version_id",
        "revision_number", "created_at", "updated_at", "retired_at",
    ],
    properties: {
        extension_id: nonEmptyString,
        workspace_id: nonEmptyString,
        label: nonEmptyString,
        status: { enum: ["active", "retired"] },
        current_package_version_id: nullableString,
        revision_number: { type: "integer", minimum: 0 },
        created_at: nonEmptyString,
        updated_at: nonEmptyString,
        retired_at: nullableString,
    },
};
const packageVersionSchema = {
    type: "object",
    additionalProperties: false,
    required: [
        "extension_package_version_id", "extension_id", "workspace_id", "package_version",
        "content_digest", "permission_digest", "record_digest", "definition",
        "registered_by_principal_id", "registered_at",
    ],
    properties: {
        extension_package_version_id: nonEmptyString,
        extension_id: nonEmptyString,
        workspace_id: nonEmptyString,
        package_version: nonEmptyString,
        content_digest: digestSchema,
        permission_digest: digestSchema,
        record_digest: digestSchema,
        definition: EXTENSION_PACKAGE_DEFINITION_SCHEMA,
        registered_by_principal_id: nonEmptyString,
        registered_at: nonEmptyString,
    },
};
const unresolvedBindingSchema = {
    type: "object",
    additionalProperties: false,
    required: ["kind", "binding_key", "reason_code", "message"],
    properties: {
        kind: { enum: ["permission_approval", "isolation_host", "compatibility", "secret", "capability", "connector"] },
        binding_key: nonEmptyString,
        reason_code: nonEmptyString,
        message: nonEmptyString,
    },
};
const rollbackTargetSchema = {
    oneOf: [
        { type: "object", additionalProperties: false, required: ["kind"], properties: { kind: { const: "disabled" } } },
        {
            type: "object",
            additionalProperties: false,
            required: ["kind", "extension_package_version_id"],
            properties: { kind: { const: "version" }, extension_package_version_id: nonEmptyString },
        },
    ],
};
const installationSchema = {
    type: "object",
    additionalProperties: false,
    required: [
        "extension_installation_id", "extension_id", "workspace_id", "installation_name",
        "installation_locator", "installed_package_version_id", "pending_package_version_id",
        "lifecycle", "rollback_target", "permission_approval_receipt_refs", "isolation_host_id",
        "isolation_level", "activation_receipt_ref", "deactivation_receipt_ref",
        "unresolved_bindings", "data_ref", "revision_number",
        "created_at", "updated_at", "disabled_at",
    ],
    properties: {
        extension_installation_id: nonEmptyString,
        extension_id: nonEmptyString,
        workspace_id: nonEmptyString,
        installation_name: nonEmptyString,
        installation_locator: nonEmptyString,
        installed_package_version_id: nullableString,
        pending_package_version_id: nullableString,
        lifecycle: { enum: ["unresolved", "installed", "enabled", "disabled", "quarantined", "failed", "rolled_back"] },
        rollback_target: rollbackTargetSchema,
        permission_approval_receipt_refs: { type: "array", items: nonEmptyString, uniqueItems: true },
        isolation_host_id: nullableString,
        isolation_level: { oneOf: [{ enum: ["process_sandbox", "container", "virtual_machine"] }, { type: "null" }] },
        activation_receipt_ref: nullableString,
        deactivation_receipt_ref: nullableString,
        unresolved_bindings: { type: "array", items: unresolvedBindingSchema },
        data_ref: { oneOf: [resourceRefSchema, { type: "null" }] },
        revision_number: { type: "integer", minimum: 1 },
        created_at: nonEmptyString,
        updated_at: nonEmptyString,
        disabled_at: nullableString,
    },
};
const installationChangeSchema = {
    type: "object",
    additionalProperties: false,
    required: [
        "extension_installation_change_id", "extension_installation_id", "workspace_id", "reason",
        "from_package_version_id", "to_package_version_id", "lifecycle", "changed_by_principal_id", "changed_at",
    ],
    properties: {
        extension_installation_change_id: nonEmptyString,
        extension_installation_id: nonEmptyString,
        workspace_id: nonEmptyString,
        reason: { enum: ["install", "enable", "upgrade", "disable", "rollback", "quarantine"] },
        from_package_version_id: nullableString,
        to_package_version_id: nullableString,
        lifecycle: { enum: ["unresolved", "installed", "enabled", "disabled", "quarantined", "failed", "rolled_back"] },
        changed_by_principal_id: nonEmptyString,
        changed_at: nonEmptyString,
    },
};
const extensionWithInstallationSchema = {
    type: "object",
    additionalProperties: false,
    required: ["extension", "installation"],
    properties: { extension: extensionRecordSchema, installation: { oneOf: [installationSchema, { type: "null" }] } },
};
const extensionListResultSchema = {
    type: "object",
    additionalProperties: false,
    required: ["extensions"],
    properties: { extensions: { type: "array", items: extensionWithInstallationSchema } },
};
const extensionInspectionSchema = {
    type: "object",
    additionalProperties: false,
    required: ["extension", "package_versions", "installation", "installation_changes"],
    properties: {
        extension: extensionRecordSchema,
        package_versions: { type: "array", items: packageVersionSchema },
        installation: { oneOf: [installationSchema, { type: "null" }] },
        installation_changes: { type: "array", items: installationChangeSchema },
    },
};
const packageResultSchema = {
    type: "object",
    additionalProperties: false,
    required: ["extension", "package_version"],
    properties: { extension: extensionRecordSchema, package_version: packageVersionSchema },
};
const installationResultSchema = {
    type: "object",
    additionalProperties: false,
    required: ["installation"],
    properties: { installation: installationSchema },
};
const schemasResultSchema = {
    type: "object",
    additionalProperties: false,
    required: ["package_version", "schemas"],
    properties: {
        package_version: packageVersionSchema,
        schemas: { type: "array", items: EXTENSION_CONTRIBUTION_SCHEMA_SCHEMA },
    },
};
const activeExtensionContributionsResultSchema = {
    type: "object",
    additionalProperties: false,
    required: ["active_extensions"],
    properties: {
        active_extensions: {
            type: "array",
            items: {
                type: "object",
                additionalProperties: false,
                required: [
                    "extension_installation_id", "extension_id", "extension_package_version_id",
                    "package_record_digest", "content_digest", "contributions",
                ],
                properties: {
                    extension_installation_id: nonEmptyString,
                    extension_id: nonEmptyString,
                    extension_package_version_id: nonEmptyString,
                    package_record_digest: digestSchema,
                    content_digest: digestSchema,
                    contributions: contributionsSchema,
                },
            },
        },
    },
};
const listInputSchema = {
    type: "object",
    additionalProperties: false,
    properties: { include_retired: { type: "boolean" } },
};
const createInputSchema = {
    type: "object",
    additionalProperties: false,
    required: ["label"],
    properties: { extension_id: nonEmptyString, label: nonEmptyString },
};
const registerBuildInputSchema = {
    type: "object",
    additionalProperties: false,
    required: ["label", "definition"],
    properties: { label: nonEmptyString, definition: EXTENSION_PACKAGE_DEFINITION_SCHEMA },
};
const installInputSchema = {
    type: "object",
    additionalProperties: false,
    required: ["installation_name", "activate"],
    properties: {
        installation_name: { type: "string", pattern: "^[a-z0-9][a-z0-9-]{0,62}$" },
        activate: { type: "boolean" },
        data_ref: { oneOf: [resourceRefSchema, { type: "null" }] },
    },
};
const upgradeInputSchema = {
    type: "object",
    additionalProperties: false,
    required: ["to_extension_package_version_id", "activate"],
    properties: { to_extension_package_version_id: nonEmptyString, activate: { type: "boolean" } },
};
const invokeEntryPointInputSchema = {
    type: "object",
    additionalProperties: false,
    required: ["entry_point_id", "request"],
    properties: {
        entry_point_id: nonEmptyString,
        request: {},
    },
};
const invokeEntryPointResultSchema = {
    type: "object",
    additionalProperties: false,
    required: ["extension_package_version_id", "entry_point_id", "result"],
    properties: {
        extension_package_version_id: nonEmptyString,
        entry_point_id: nonEmptyString,
        result: {},
    },
};
function workspaceId(context) {
    return requireWorkspaceAuthorityId(context.authority);
}
function extensionRef(extension) {
    return { kind: "extension", id: extension.extension_id, revision: extensionIdentityRevision(extension) };
}
function packageRef(packageVersion) {
    return {
        kind: "extension_package_version",
        id: packageVersion.extension_package_version_id,
        revision: packageVersion.record_digest,
    };
}
function installationRef(installation) {
    return {
        kind: "extension_installation",
        id: installation.extension_installation_id,
        revision: extensionInstallationRevision(installation),
    };
}
function auditRef(context) {
    return { kind: "operation_invocation", id: context.invocation_id, revision: null };
}
function extensionInWorkspace(store, id, workspace) {
    const extension = store.getExtension(id);
    return extension?.workspace_id === workspace ? extension : null;
}
function packageInWorkspace(store, id, workspace) {
    const version = store.getPackageVersion(id);
    return version?.workspace_id === workspace ? version : null;
}
function installationInWorkspace(store, id, workspace) {
    const installation = store.getInstallation(id);
    return installation?.workspace_id === workspace ? installation : null;
}
/** Resolve canonical Extension targets inside the transport-authenticated Workspace. */
export function resolveExtensionOperationResource(store, authority, target) {
    const boundary = "boundary" in authority ? authority.boundary : authority;
    if (boundary.kind !== "workspace")
        return null;
    const workspace = boundary.workspace_id;
    if (target.kind === "extension") {
        const value = extensionInWorkspace(store, target.id, workspace);
        return value
            ? { ref: { ...target, revision: extensionIdentityRevision(value) }, state: value }
            : null;
    }
    if (target.kind === "extension_package_version") {
        const value = packageInWorkspace(store, target.id, workspace);
        return value
            ? { ref: { ...target, revision: value.record_digest }, state: value }
            : null;
    }
    if (target.kind === "extension_installation") {
        const value = installationInWorkspace(store, target.id, workspace);
        return value
            ? { ref: { ...target, revision: extensionInstallationRevision(value) }, state: value }
            : null;
    }
    return null;
}
function targetAvailability(store, context, kind) {
    const target = context.target?.ref;
    const found = target?.kind === kind && (kind === "extension"
        ? extensionInWorkspace(store, target.id, workspaceId(context))
        : kind === "extension_package_version"
            ? packageInWorkspace(store, target.id, workspaceId(context))
            : installationInWorkspace(store, target.id, workspaceId(context)));
    return found
        ? { available: true }
        : {
            available: false,
            refusal: refusal("extension_resource_not_found", "This Extension resource is not available in the current Workspace.", false, requiredAction("refresh_extensions", "Refresh Extensions", "Refresh this Workspace and select an available exact Extension resource.")),
        };
}
function extensionRefusal(error) {
    if (error instanceof ExtensionSandboxError) {
        return refusal(error.code, error.message, error.code === "extension_host_busy", requiredAction("inspect_extension", "Inspect Extension", "Inspect the exact installation and isolated host state before deciding whether a retry is safe."));
    }
    if (error instanceof ExtensionExecutionPackageConflictError) {
        return refusal("extension_execution_package_conflict", error.message, false, requiredAction("redo_with_current_extension", "Start new work with the current Extension", "Keep this execution on its pinned package or explicitly start a new execution with the current package."));
    }
    if (error instanceof ExtensionRevisionConflictError) {
        return refusal("extension_revision_conflict", "The Extension changed before this operation completed.", true, requiredAction("refresh_extension", "Review the latest Extension", "Refresh the Extension and retry against its exact current revision."));
    }
    if (error instanceof ExtensionPackageImmutableError) {
        return refusal("extension_package_immutable", "An existing Extension package version cannot be rewritten.", false, requiredAction("register_new_extension_version", "Register a new version", "Build and register a new content-identified package version."));
    }
    if (error instanceof ExtensionNotFoundError
        || error instanceof ExtensionPackageVersionNotFoundError
        || error instanceof ExtensionInstallationNotFoundError) {
        return refusal("extension_resource_not_found", "The requested Extension resource was not found in this Workspace.", false, requiredAction("refresh_extensions", "Refresh Extensions", "Refresh retained Extension state and choose an available exact version."));
    }
    if (error instanceof ExtensionValidationError) {
        return refusal("extension_invalid", error.message, false, requiredAction("correct_extension", "Correct the Extension", "Use the exact discovered Extension contract and preserve source, package, and installation boundaries."));
    }
    return refusal("extension_operation_failed", "Floe could not prove that the Extension operation completed.", false, requiredAction("inspect_extension", "Inspect Extension", "Inspect retained Extension state before deciding whether a retry is safe."));
}
async function handle(work) {
    try {
        return await work();
    }
    catch (error) {
        return { state: "refused", refusal: extensionRefusal(error) };
    }
}
export function listExtensionsOperation(store, inspectRuntime = () => null) {
    return {
        operation_id: LIST_EXTENSIONS_OPERATION_ID,
        operation_version: "1",
        authority_boundary_kinds: ["workspace"],
        category: "extensions",
        title: "List Extensions",
        description: "List Extensions and inspect the configured host contract before preparing a package: supported code format, compatibility versions, and broker availability. A configured broker still requires grants and permissions; standalone Node tests do not prove Floe host compatibility.",
        effects: { mode: "read", reversibility: "none", external: false, secret_access: "none" },
        required_grants: [LIST_EXTENSIONS_OPERATION_ID],
        interaction_constraints: { allowed_modes: ["interactive", "unattended"] },
        target: { resource_kinds: [], expected_revision: "not_applicable" },
        input: { version: "1", schema: listInputSchema },
        result: { version: "1", schema: extensionListResultSchema },
        handler: (context, input) => handle(() => ({
            state: "completed",
            result: {
                runtime: inspectRuntime(),
                extensions: store.listExtensions(workspaceId(context), { include_retired: input.include_retired })
                    .map((extension) => ({ extension, installation: store.getInstallationForExtension(extension.extension_id) })),
            },
            audit_ref: auditRef(context),
        })),
    };
}
export function inspectExtensionOperation(store) {
    return {
        operation_id: INSPECT_EXTENSION_OPERATION_ID,
        operation_version: "1",
        authority_boundary_kinds: ["workspace"],
        category: "extensions",
        title: "Inspect Extension",
        description: "Inspect one Extension's exact packages, installation lifecycle, unresolved bindings, and retained changes.",
        effects: { mode: "read", reversibility: "none", external: false, secret_access: "none" },
        required_grants: [INSPECT_EXTENSION_OPERATION_ID],
        interaction_constraints: { allowed_modes: ["interactive", "unattended"] },
        target: { resource_kinds: ["extension"], expected_revision: "not_applicable" },
        input: { version: "1", schema: emptyInput },
        result: { version: "1", schema: extensionInspectionSchema },
        availability: (context) => targetAvailability(store, context, "extension"),
        handler: (context) => handle(() => {
            const extension = store.requireExtensionInWorkspace(context.target.ref.id, workspaceId(context));
            const installation = store.getInstallationForExtension(extension.extension_id);
            return {
                state: "completed",
                result: {
                    extension,
                    package_versions: store.listPackageVersions(extension.extension_id),
                    installation,
                    installation_changes: installation
                        ? store.listInstallationChanges(installation.extension_installation_id)
                        : [],
                },
                audit_ref: auditRef(context),
            };
        }),
    };
}
export function getExtensionPackageOperation(store) {
    return {
        operation_id: GET_EXTENSION_PACKAGE_OPERATION_ID,
        operation_version: "1",
        authority_boundary_kinds: ["workspace"],
        category: "extensions",
        title: "Get Extension package",
        description: "Get one immutable, content-identified Extension package version and its stable Extension identity.",
        effects: { mode: "read", reversibility: "none", external: false, secret_access: "none" },
        required_grants: [GET_EXTENSION_PACKAGE_OPERATION_ID],
        interaction_constraints: { allowed_modes: ["interactive", "unattended"] },
        target: { resource_kinds: ["extension_package_version"], expected_revision: "not_applicable" },
        input: { version: "1", schema: emptyInput },
        result: { version: "1", schema: packageResultSchema },
        availability: (context) => targetAvailability(store, context, "extension_package_version"),
        handler: (context) => handle(() => {
            const packageVersion = store.requirePackageInWorkspace(context.target.ref.id, workspaceId(context));
            return {
                state: "completed",
                result: { extension: store.requireExtension(packageVersion.extension_id), package_version: packageVersion },
                audit_ref: auditRef(context),
            };
        }),
    };
}
export function discoverExtensionSchemasOperation(store) {
    return {
        operation_id: DISCOVER_EXTENSION_SCHEMAS_OPERATION_ID,
        operation_version: "1",
        authority_boundary_kinds: ["workspace"],
        category: "extensions",
        title: "Discover Extension schemas",
        description: "Discover the exact domain schemas declared by one immutable Extension package version.",
        effects: { mode: "read", reversibility: "none", external: false, secret_access: "none" },
        required_grants: [DISCOVER_EXTENSION_SCHEMAS_OPERATION_ID],
        interaction_constraints: { allowed_modes: ["interactive", "unattended"] },
        target: { resource_kinds: ["extension_package_version"], expected_revision: "not_applicable" },
        input: { version: "1", schema: emptyInput },
        result: { version: "1", schema: schemasResultSchema },
        availability: (context) => targetAvailability(store, context, "extension_package_version"),
        handler: (context) => handle(() => {
            const packageVersion = store.requirePackageInWorkspace(context.target.ref.id, workspaceId(context));
            return {
                state: "completed",
                result: { package_version: packageVersion, schemas: packageVersion.definition.contributions.schemas },
                audit_ref: auditRef(context),
            };
        }),
    };
}
export function listActiveExtensionContributionsOperation(store) {
    return {
        operation_id: LIST_ACTIVE_EXTENSION_CONTRIBUTIONS_OPERATION_ID,
        operation_version: "1",
        authority_boundary_kinds: ["workspace"],
        category: "extensions",
        title: "List active Extension contributions",
        description: "List capabilities, connectors, schemas, and bounded product surfaces declared by each exact Extension package currently active in this Workspace.",
        effects: { mode: "read", reversibility: "none", external: false, secret_access: "none" },
        required_grants: [LIST_ACTIVE_EXTENSION_CONTRIBUTIONS_OPERATION_ID],
        interaction_constraints: { allowed_modes: ["interactive", "unattended"] },
        target: { resource_kinds: [], expected_revision: "not_applicable" },
        input: { version: "1", schema: emptyInput },
        result: { version: "1", schema: activeExtensionContributionsResultSchema },
        handler: (context) => handle(() => ({
            state: "completed",
            result: { active_extensions: store.listActiveContributions(workspaceId(context)) },
            audit_ref: auditRef(context),
        })),
    };
}
export function createExtensionOperation(store) {
    return {
        operation_id: CREATE_EXTENSION_OPERATION_ID,
        operation_version: "1",
        authority_boundary_kinds: ["workspace"],
        category: "extensions",
        title: "Create Extension identity",
        description: "Create a stable Workspace Extension identity without installing or activating code.",
        effects: { mode: "write", reversibility: "reversible", external: false, secret_access: "none" },
        required_grants: [CREATE_EXTENSION_OPERATION_ID],
        interaction_constraints: { allowed_modes: ["interactive", "unattended"] },
        target: { resource_kinds: [], expected_revision: "not_applicable" },
        input: { version: "1", schema: createInputSchema },
        result: {
            version: "1",
            schema: {
                type: "object",
                additionalProperties: false,
                required: ["extension"],
                properties: { extension: extensionRecordSchema },
            },
        },
        handler: (context, input) => handle(() => {
            const extension = store.createExtension({
                workspace_id: workspaceId(context),
                extension_id: input.extension_id,
                label: input.label,
            });
            return {
                state: "completed",
                result: { extension },
                changed_refs: [extensionRef(extension)],
                audit_ref: auditRef(context),
            };
        }),
    };
}
export function registerExtensionBuildEvidenceOperation(store) {
    return {
        operation_id: REGISTER_EXTENSION_BUILD_EVIDENCE_OPERATION_ID,
        operation_version: "1",
        authority_boundary_kinds: ["workspace"],
        category: "extensions",
        title: "Register Extension build evidence",
        description: "Register one immutable package version, its exact source and content digest, declarations, tests, and optional trust evidence without installing it.",
        effects: { mode: "write", reversibility: "none", external: false, secret_access: "reference" },
        required_grants: [REGISTER_EXTENSION_BUILD_EVIDENCE_OPERATION_ID],
        interaction_constraints: { allowed_modes: ["interactive", "unattended"] },
        target: { resource_kinds: ["extension"], expected_revision: "required" },
        input: { version: "1", schema: registerBuildInputSchema },
        result: { version: "1", schema: packageResultSchema },
        availability: (context) => targetAvailability(store, context, "extension"),
        handler: (context, input) => handle(() => {
            const extension = store.requireExtensionInWorkspace(context.target.ref.id, workspaceId(context));
            const registered = store.registerPackage({
                workspace_id: extension.workspace_id,
                extension_id: extension.extension_id,
                label: input.label,
                definition: input.definition,
                registered_by_principal_id: context.authority.principal_id,
                expected_extension_revision: context.expected_resource_revision,
            });
            return {
                state: "completed",
                result: registered,
                changed_refs: [extensionRef(registered.extension), packageRef(registered.package_version)],
                audit_ref: auditRef(context),
            };
        }),
    };
}
export function installExtensionOperation(store) {
    return {
        operation_id: INSTALL_EXTENSION_OPERATION_ID,
        operation_version: "1",
        authority_boundary_kinds: ["workspace"],
        category: "extensions",
        title: "Install Extension",
        description: "Install an exact package into this Workspace and activate it only when exact permissions and an isolated host are verified.",
        effects: { mode: "write", reversibility: "reversible", external: true, secret_access: "reference" },
        required_grants: [INSTALL_EXTENSION_OPERATION_ID],
        interaction_constraints: {
            allowed_modes: ["interactive", "brokered"],
            confirmation: {
                required: true,
                prompt_id: "extension.install.confirm",
                title: "Approve Extension installation",
                description: "Review this exact package version, its permissions, isolation requirement, and rollback target before installation.",
            },
        },
        target: { resource_kinds: ["extension_package_version"], expected_revision: "required" },
        input: { version: "1", schema: installInputSchema },
        result: { version: "1", schema: installationResultSchema },
        availability: (context) => targetAvailability(store, context, "extension_package_version"),
        handler: (context, input) => handle(async () => {
            const installation = await store.install({
                invocation_id: context.invocation_id,
                workspace_id: workspaceId(context),
                extension_package_version_id: context.target.ref.id,
                installation_name: input.installation_name,
                activate: input.activate,
                approval_receipt_refs: [...context.authority.interaction.approval_refs],
                data_ref: input.data_ref,
                changed_by_principal_id: context.authority.principal_id,
                capability_grant_ids: context.authority.capability_grant_ids ?? [],
                approval_policy_ref: null,
            });
            return {
                state: "completed",
                result: { installation },
                changed_refs: [installationRef(installation)],
                audit_ref: auditRef(context),
            };
        }),
    };
}
export function upgradeExtensionOperation(store) {
    return {
        operation_id: UPGRADE_EXTENSION_OPERATION_ID,
        operation_version: "1",
        authority_boundary_kinds: ["workspace"],
        category: "extensions",
        title: "Upgrade Extension",
        description: "Move an installation to an exact package version while retaining its prior version as the rollback target.",
        effects: { mode: "write", reversibility: "reversible", external: true, secret_access: "reference" },
        required_grants: [UPGRADE_EXTENSION_OPERATION_ID],
        interaction_constraints: {
            allowed_modes: ["interactive", "brokered"],
            confirmation: {
                required: true,
                prompt_id: "extension.upgrade.confirm",
                title: "Approve Extension upgrade",
                description: "Review the exact package and any permission changes before upgrading this installation.",
            },
        },
        target: { resource_kinds: ["extension_installation"], expected_revision: "required" },
        input: { version: "1", schema: upgradeInputSchema },
        result: { version: "1", schema: installationResultSchema },
        availability: (context) => targetAvailability(store, context, "extension_installation"),
        handler: (context, input) => handle(async () => {
            const installation = await store.upgrade({
                invocation_id: context.invocation_id,
                extension_installation_id: context.target.ref.id,
                workspace_id: workspaceId(context),
                to_extension_package_version_id: input.to_extension_package_version_id,
                expected_revision: context.expected_resource_revision,
                activate: input.activate,
                approval_receipt_refs: [...context.authority.interaction.approval_refs],
                changed_by_principal_id: context.authority.principal_id,
                capability_grant_ids: context.authority.capability_grant_ids ?? [],
                approval_policy_ref: null,
            });
            return {
                state: "completed",
                result: { installation },
                changed_refs: [installationRef(installation)],
                audit_ref: auditRef(context),
            };
        }),
    };
}
export function enableExtensionOperation(store) {
    return {
        operation_id: ENABLE_EXTENSION_OPERATION_ID,
        operation_version: "1",
        authority_boundary_kinds: ["workspace"],
        category: "extensions",
        title: "Enable Extension",
        description: "Activate the exact installed Extension package after rechecking its approval, compatibility, bytes, and isolated host.",
        effects: {
            mode: "write",
            reversibility: "reversible",
            external: true,
            secret_access: "reference",
            allowed_during_restore_hold: true,
        },
        required_grants: [ENABLE_EXTENSION_OPERATION_ID],
        interaction_constraints: {
            allowed_modes: ["interactive", "brokered"],
            confirmation: {
                required: true,
                prompt_id: "extension.enable.confirm",
                title: "Approve Extension activation",
                description: "Review this exact installed package and its permissions before starting it.",
            },
        },
        target: { resource_kinds: ["extension_installation"], expected_revision: "required" },
        input: { version: "1", schema: emptyInput },
        result: { version: "1", schema: installationResultSchema },
        availability: (context) => targetAvailability(store, context, "extension_installation"),
        handler: (context) => handle(async () => {
            const installation = await store.enable({
                invocation_id: context.invocation_id,
                extension_installation_id: context.target.ref.id,
                workspace_id: workspaceId(context),
                expected_revision: context.expected_resource_revision,
                approval_receipt_refs: [...context.authority.interaction.approval_refs],
                changed_by_principal_id: context.authority.principal_id,
                capability_grant_ids: context.authority.capability_grant_ids ?? [],
                approval_policy_ref: null,
            });
            return {
                state: "completed",
                result: { installation },
                changed_refs: [installationRef(installation)],
                audit_ref: auditRef(context),
            };
        }),
    };
}
export function disableExtensionOperation(store) {
    return {
        operation_id: DISABLE_EXTENSION_OPERATION_ID,
        operation_version: "1",
        authority_boundary_kinds: ["workspace"],
        category: "extensions",
        title: "Disable Extension",
        description: "Stop an Extension installation from active use while retaining its package history and data reference.",
        effects: { mode: "write", reversibility: "reversible", external: true, secret_access: "none" },
        required_grants: [DISABLE_EXTENSION_OPERATION_ID],
        interaction_constraints: { allowed_modes: ["interactive", "unattended", "brokered"] },
        target: { resource_kinds: ["extension_installation"], expected_revision: "required" },
        input: { version: "1", schema: emptyInput },
        result: { version: "1", schema: installationResultSchema },
        availability: (context) => targetAvailability(store, context, "extension_installation"),
        handler: (context) => handle(async () => {
            const installation = await store.disable({
                extension_installation_id: context.target.ref.id,
                workspace_id: workspaceId(context),
                expected_revision: context.expected_resource_revision,
                changed_by_principal_id: context.authority.principal_id,
            });
            return {
                state: "completed",
                result: { installation },
                changed_refs: [installationRef(installation)],
                audit_ref: auditRef(context),
            };
        }),
    };
}
export function rollbackExtensionOperation(store) {
    return {
        operation_id: ROLLBACK_EXTENSION_OPERATION_ID,
        operation_version: "1",
        authority_boundary_kinds: ["workspace"],
        category: "extensions",
        title: "Roll back Extension",
        description: "Return an installation to its exact retained rollback target without rewriting package history.",
        effects: { mode: "write", reversibility: "reversible", external: true, secret_access: "reference" },
        required_grants: [ROLLBACK_EXTENSION_OPERATION_ID],
        interaction_constraints: {
            allowed_modes: ["interactive", "brokered"],
            confirmation: {
                required: true,
                prompt_id: "extension.rollback.confirm",
                title: "Approve Extension rollback",
                description: "Review the exact retained rollback target before changing the active Extension version.",
            },
        },
        target: { resource_kinds: ["extension_installation"], expected_revision: "required" },
        input: { version: "1", schema: emptyInput },
        result: { version: "1", schema: installationResultSchema },
        availability: (context) => targetAvailability(store, context, "extension_installation"),
        handler: (context) => handle(async () => {
            const installation = await store.rollback({
                invocation_id: context.invocation_id,
                extension_installation_id: context.target.ref.id,
                workspace_id: workspaceId(context),
                expected_revision: context.expected_resource_revision,
                approval_receipt_refs: [...context.authority.interaction.approval_refs],
                changed_by_principal_id: context.authority.principal_id,
                capability_grant_ids: context.authority.capability_grant_ids ?? [],
                approval_policy_ref: null,
            });
            return {
                state: "completed",
                result: { installation },
                changed_refs: [installationRef(installation)],
                audit_ref: auditRef(context),
            };
        }),
    };
}
export function invokeExtensionEntryPointOperation(store, execution) {
    return {
        operation_id: INVOKE_EXTENSION_ENTRY_POINT_OPERATION_ID,
        operation_version: "1",
        authority_boundary_kinds: ["workspace"],
        category: "extensions",
        title: "Invoke Extension entry point",
        description: "Invoke one declared entry point from the exact package active for this Extension installation through its isolated host.",
        effects: { mode: "write", reversibility: "none", external: true, secret_access: "reference" },
        required_grants: [INVOKE_EXTENSION_ENTRY_POINT_OPERATION_ID],
        interaction_constraints: { allowed_modes: ["interactive", "unattended", "brokered"] },
        target: { resource_kinds: ["extension_installation"], expected_revision: "required" },
        input: { version: "1", schema: invokeEntryPointInputSchema },
        result: { version: "1", schema: invokeEntryPointResultSchema },
        availability: (context) => targetAvailability(store, context, "extension_installation"),
        handler: (context, input) => handle(async () => {
            const workspace = workspaceId(context);
            const installation = store.requireInstallationInWorkspace(context.target.ref.id, workspace);
            const active = installation.lifecycle === "enabled"
                || (installation.lifecycle === "rolled_back" && installation.deactivation_receipt_ref === null);
            if (!active || !installation.installed_package_version_id || !installation.isolation_host_id) {
                throw new ExtensionSandboxError("extension_not_active", "The Extension installation is not active.");
            }
            const packageVersion = store.requirePackageInWorkspace(installation.installed_package_version_id, workspace);
            const entryPoint = packageVersion.definition.entry_points.find((item) => item.entry_point_id === input.entry_point_id);
            if (!entryPoint) {
                throw new ExtensionSandboxError("extension_entry_point_not_declared", "The exact Extension package does not declare this entry point.");
            }
            if (context.provenance.execution_attempt_id) {
                store.pinPackageForExecution({
                    workspace_id: workspace,
                    execution_attempt_id: context.provenance.execution_attempt_id,
                    extension_installation_id: installation.extension_installation_id,
                    extension_package_version_id: packageVersion.extension_package_version_id,
                    invocation_id: context.invocation_id,
                });
            }
            const result = await execution.invoke({
                extension_installation_id: installation.extension_installation_id,
                extension_package_version_id: packageVersion.extension_package_version_id,
                entry_point_id: entryPoint.entry_point_id,
                request: input.request,
                context: {
                    workspace_id: workspace,
                    authorized_principal_id: context.authority.principal_id,
                    operation_invocation_id: context.invocation_id,
                    extension_id: packageVersion.extension_id,
                    extension_package_version_id: packageVersion.extension_package_version_id,
                    entry_point_id: entryPoint.entry_point_id,
                    execution_attempt_id: context.provenance.execution_attempt_id,
                    capability_grant_ids: context.authority.capability_grant_ids ?? [],
                },
            });
            return {
                state: "completed",
                result: {
                    extension_package_version_id: packageVersion.extension_package_version_id,
                    entry_point_id: entryPoint.entry_point_id,
                    result,
                },
                audit_ref: auditRef(context),
            };
        }),
    };
}
export function extensionOperationDefinitions(store, entryPointExecution = new UnavailableExtensionEntryPointExecution(), inspectRuntime = () => null) {
    return [
        listExtensionsOperation(store, inspectRuntime),
        inspectExtensionOperation(store),
        getExtensionPackageOperation(store),
        discoverExtensionSchemasOperation(store),
        listActiveExtensionContributionsOperation(store),
        createExtensionOperation(store),
        registerExtensionBuildEvidenceOperation(store),
        installExtensionOperation(store),
        enableExtensionOperation(store),
        upgradeExtensionOperation(store),
        disableExtensionOperation(store),
        rollbackExtensionOperation(store),
        invokeExtensionEntryPointOperation(store, entryPointExecution),
    ];
}
export function registerExtensionOperations(registry, store, entryPointExecution = new UnavailableExtensionEntryPointExecution(), inspectRuntime = () => null) {
    for (const definition of extensionOperationDefinitions(store, entryPointExecution, inspectRuntime))
        registry.register(definition);
    return registry;
}
