import { CredentialBrokerOperationError, SecretAccessDeniedError, SecretBindingConflictError, } from "./credential-broker.js";
import { LegacyCredentialSourceError, } from "./legacy-auth-credential-source.js";
import { CredentialIngressError, } from "./credential-ingress.js";
import { refusal, requiredAction, } from "./operations.js";
export const BIND_CREDENTIAL_OPERATION_ID = "credential.bind";
export const HEALTH_CREDENTIAL_OPERATION_ID = "credential.health";
export const ROTATE_CREDENTIAL_OPERATION_ID = "credential.rotate";
export const REVOKE_CREDENTIAL_OPERATION_ID = "credential.revoke";
export const USE_CREDENTIAL_OPERATION_ID = "credential.use";
export const REFRESH_CREDENTIAL_OPERATION_ID = "credential.refresh";
export const RUNTIME_CREDENTIAL_PURPOSE = "runtime-provider-authentication";
export const ACCOUNT_CONNECTION_PURPOSE = "account-connection";
export const CREDENTIAL_MAINTENANCE_PURPOSE = "credential-maintenance";
const text = { type: "string", minLength: 1 };
const emptyInput = { type: "object", additionalProperties: false };
const authorityBoundarySchema = {
    oneOf: [
        { type: "object", additionalProperties: false, required: ["kind", "workspace_id"], properties: { kind: { const: "workspace" }, workspace_id: text } },
        { type: "object", additionalProperties: false, required: ["kind", "host_id"], properties: { kind: { const: "host" }, host_id: text } },
    ],
};
const legacySourceSchema = {
    type: "object",
    additionalProperties: false,
    required: ["kind", "profile_id", "source_fingerprint"],
    properties: {
        kind: { const: "legacy_auth_profile" },
        profile_id: text,
        source_fingerprint: { type: "string", pattern: "^sha256:[a-f0-9]{64}$" },
    },
};
const ingressSourceSchema = {
    type: "object",
    additionalProperties: false,
    required: ["kind", "ingress_session_id"],
    properties: {
        kind: { const: "credential_ingress" },
        ingress_session_id: text,
    },
};
const credentialSourceInput = {
    type: "object",
    additionalProperties: false,
    required: ["source"],
    properties: { source: { oneOf: [legacySourceSchema, ingressSourceSchema] } },
};
const publicStatusSchema = {
    type: "object",
    additionalProperties: false,
    required: ["secret_ref_id", "owner", "resource", "secret_kind", "label", "resolution", "generation"],
    properties: {
        secret_ref_id: text,
        owner: authorityBoundarySchema,
        resource: {
            type: "object",
            additionalProperties: false,
            required: ["kind", "id"],
            properties: { kind: text, id: text },
        },
        secret_kind: text,
        label: text,
        resolution: { enum: ["unresolved", "resolved"] },
        generation: { type: "integer", minimum: 0 },
    },
};
const healthSchema = {
    type: "object",
    additionalProperties: false,
    required: ["secret_ref_id", "owner", "resolution", "material", "generation"],
    properties: {
        secret_ref_id: text,
        owner: authorityBoundarySchema,
        resolution: { enum: ["unresolved", "resolved"] },
        material: { enum: ["unavailable", "available", "missing"] },
        generation: { type: "integer", minimum: 0 },
    },
};
const runtimeBoundaryResultSchema = {
    type: "object",
    additionalProperties: false,
    required: ["secret_ref_id", "runtime_boundary_required"],
    properties: { secret_ref_id: text, runtime_boundary_required: { const: true } },
};
function publicStatus(ref) {
    return {
        secret_ref_id: ref.secret_ref_id,
        owner: ref.owner,
        resource: ref.resource,
        secret_kind: ref.secret_kind,
        label: ref.label,
        resolution: ref.resolution,
        generation: ref.generation,
    };
}
function auditRef(context) {
    return { kind: "operation_invocation", id: context.invocation_id, revision: null };
}
function refRevision(ref) {
    return `generation:${ref.generation}:${ref.resolution}`;
}
function refChanged(ref) {
    return { kind: "secret_ref", id: ref.secret_ref_id, revision: refRevision(ref) };
}
function requireRef(dependencies, context) {
    const secretRefId = context.target?.ref.kind === "secret_ref" ? context.target.ref.id : "";
    const ref = dependencies.secret_refs.getSecretRef(secretRefId);
    if (!ref)
        throw new SecretAccessDeniedError("secret_ref_not_found");
    return ref;
}
function requestFor(dependencies, context, operationId, purpose) {
    const ref = requireRef(dependencies, context);
    const candidateIds = context.authority.capability_grant_ids ?? [];
    const activeIds = new Set(dependencies.capability_grants.inspectSessionGrantIds({
        principal_id: context.authority.principal_id,
        boundary: context.authority.boundary,
        grant_ids: candidateIds,
    }).active_grants.map((grant) => grant.grant_id));
    const grantId = candidateIds.find((candidateId) => {
        const grant = dependencies.capability_grants.getGrant(candidateId);
        const constraint = dependencies.secret_refs.getGrantConstraint(candidateId);
        return Boolean(grant
            && activeIds.has(candidateId)
            && grant.principal_id === context.authority.principal_id
            && grant.operation_ids.includes(operationId)
            && grant.targets.some((target) => target.kind === "secret_ref" && target.id === ref.secret_ref_id)
            && grant.targets.some((target) => target.kind === ref.resource.kind && target.id === ref.resource.id)
            && constraint?.secret_ref_id === ref.secret_ref_id
            && sameAuthorityBoundary(constraint.authority_boundary, context.authority.boundary)
            && constraint.purposes.includes(purpose));
    });
    if (!grantId)
        throw new SecretAccessDeniedError("grant_constraint_not_found");
    return {
        secret_ref_id: ref.secret_ref_id,
        grant_id: grantId,
        principal_id: context.authority.principal_id,
        authority_boundary: context.authority.boundary,
        resource: ref.resource,
        purpose,
        operation_id: operationId,
    };
}
async function sourceMaterial(dependencies, context, ref, source, purpose) {
    const expectedProvider = dependencies.expected_provider(ref);
    if (!expectedProvider)
        throw new LegacyCredentialSourceError("legacy_credential_invalid");
    if (source.kind === "credential_ingress") {
        return dependencies.ingress.consume({
            ingress_session_id: source.ingress_session_id,
            secret_ref_id: ref.secret_ref_id,
            authority_boundary: context.authority.boundary,
            principal_id: context.authority.principal_id,
            provider_id: expectedProvider,
            audience: `provider-auth:${expectedProvider}`,
            purpose,
        });
    }
    const selected = await dependencies.legacy_source.read(source);
    if (expectedProvider !== selected.provider_id) {
        selected.material.fill(0);
        throw new LegacyCredentialSourceError("legacy_credential_invalid");
    }
    return selected.material;
}
function availability(dependencies, context) {
    if (context.target?.ref.kind !== "secret_ref") {
        return { available: false, refusal: notFound() };
    }
    const ref = dependencies.secret_refs.getSecretRef(context.target.ref.id);
    const visible = ref && (ref.owner.kind === "host"
        || sameAuthorityBoundary(ref.owner, context.authority.boundary));
    return visible ? { available: true } : { available: false, refusal: notFound() };
}
function notFound() {
    return refusal("credential_reference_not_found", "This credential reference is not available in the current Workspace.", false, requiredAction("refresh_credentials", "Refresh credentials", "Refresh this Workspace and select an available credential reference."));
}
function credentialRefusal(error) {
    if (error instanceof SecretAccessDeniedError) {
        const missing = error.reason_code === "secret_ref_unresolved" || error.reason_code === "broker_secret_missing";
        return refusal(missing ? "credential_unresolved" : "credential_access_denied", missing
            ? "This credential is not connected on this host."
            : "The current authority does not permit this exact credential use and purpose.", false, requiredAction(missing ? "connect_credential" : "review_credential_authority", missing ? "Connect credential" : "Review credential access", missing
            ? "Connect this account before retrying the blocked work."
            : "Review the exact SecretRef, resource, purpose, and CapabilityGrant."));
    }
    if (error instanceof SecretBindingConflictError) {
        return refusal("credential_generation_conflict", "The credential changed before this operation completed.", true, requiredAction("refresh_credential", "Refresh credential", "Inspect the current credential generation before retrying."));
    }
    if (error instanceof LegacyCredentialSourceError) {
        return refusal(error.code, error.code === "legacy_source_changed"
            ? "The legacy credential source changed after it was selected."
            : "The selected legacy credential could not be verified for migration.", error.code === "legacy_source_changed", requiredAction("select_credential_again", "Select account again", "Refresh provider settings and select the account again."));
    }
    if (error instanceof CredentialIngressError) {
        return refusal(error.code, "The one-time credential transfer is unavailable or does not match this account connection.", false, requiredAction("authenticate_again", "Authenticate again", "Start provider authentication again."));
    }
    if (error instanceof CredentialBrokerOperationError) {
        return refusal("credential_broker_failed", "The protected credential store could not prove that the operation completed.", true, requiredAction("inspect_credential_health", "Check credential health", "Check this credential before retrying."));
    }
    return refusal("credential_operation_failed", "Floe could not prove that the credential operation completed.", false, requiredAction("inspect_credential_health", "Check credential health", "Check this credential before retrying."));
}
async function handle(work) {
    try {
        return await work();
    }
    catch (error) {
        return { state: "refused", refusal: credentialRefusal(error) };
    }
}
function bindOperation(dependencies) {
    return {
        operation_id: BIND_CREDENTIAL_OPERATION_ID,
        operation_version: "1",
        authority_boundary_kinds: ["workspace", "host"],
        category: "credentials",
        title: "Connect Credential",
        description: "Move one explicitly selected legacy provider credential into the protected host broker after fingerprint and round-trip verification. The source is preserved.",
        effects: {
            mode: "write",
            reversibility: "reversible",
            external: false,
            secret_access: "brokered",
            allowed_during_restore_hold: true,
        },
        required_grants: [BIND_CREDENTIAL_OPERATION_ID],
        interaction_constraints: { allowed_modes: ["interactive"], broker: { broker_id: dependencies.broker_id, purpose: ACCOUNT_CONNECTION_PURPOSE } },
        target: { resource_kinds: ["secret_ref"], expected_revision: "required" },
        input: { version: "1", schema: credentialSourceInput },
        result: { version: "1", schema: { type: "object", additionalProperties: false, required: ["credential"], properties: { credential: publicStatusSchema } } },
        availability: (context) => availability(dependencies, context),
        handler: (context, input) => handle(async () => {
            const ref = requireRef(dependencies, context);
            if (refRevision(ref) !== context.expected_resource_revision)
                throw new SecretBindingConflictError(ref.secret_ref_id);
            const accessRequest = requestFor(dependencies, context, BIND_CREDENTIAL_OPERATION_ID, ACCOUNT_CONNECTION_PURPOSE);
            const material = await sourceMaterial(dependencies, context, ref, input.source, ACCOUNT_CONNECTION_PURPOSE);
            try {
                const changed = await dependencies.broker.bindSecretRef({
                    request: accessRequest,
                    broker_id: dependencies.broker_id,
                    material,
                });
                dependencies.binding_changed?.(changed, context.authority.principal_id);
                return { state: "completed", result: { credential: publicStatus(changed) }, changed_refs: [refChanged(changed)], audit_ref: auditRef(context) };
            }
            finally {
                material.fill(0);
            }
        }),
    };
}
function healthOperation(dependencies) {
    return {
        operation_id: HEALTH_CREDENTIAL_OPERATION_ID,
        operation_version: "1",
        authority_boundary_kinds: ["workspace", "host"],
        category: "credentials",
        title: "Check Credential",
        description: "Check whether the exact credential reference and protected host binding are available without exposing credential material.",
        effects: { mode: "read", reversibility: "none", external: false, secret_access: "brokered" },
        required_grants: [HEALTH_CREDENTIAL_OPERATION_ID],
        interaction_constraints: { allowed_modes: ["interactive", "unattended"], broker: { broker_id: dependencies.broker_id, purpose: CREDENTIAL_MAINTENANCE_PURPOSE } },
        target: { resource_kinds: ["secret_ref"], expected_revision: "not_applicable" },
        input: { version: "1", schema: emptyInput },
        result: { version: "1", schema: { type: "object", additionalProperties: false, required: ["health"], properties: { health: healthSchema } } },
        availability: (context) => availability(dependencies, context),
        handler: (context) => handle(async () => ({
            state: "completed",
            result: { health: await dependencies.broker.inspectHealth(requestFor(dependencies, context, HEALTH_CREDENTIAL_OPERATION_ID, CREDENTIAL_MAINTENANCE_PURPOSE)) },
            audit_ref: auditRef(context),
        })),
    };
}
function rotateOperation(dependencies) {
    return {
        operation_id: ROTATE_CREDENTIAL_OPERATION_ID,
        operation_version: "1",
        authority_boundary_kinds: ["workspace", "host"],
        category: "credentials",
        title: "Replace Credential",
        description: "Atomically replace one protected credential from an explicitly selected and fingerprint-verified legacy source while retaining its stable SecretRef.",
        effects: { mode: "write", reversibility: "irreversible", external: false, secret_access: "brokered" },
        required_grants: [ROTATE_CREDENTIAL_OPERATION_ID],
        interaction_constraints: {
            allowed_modes: ["interactive"],
            broker: { broker_id: dependencies.broker_id, purpose: CREDENTIAL_MAINTENANCE_PURPOSE },
            confirmation: {
                required: true,
                prompt_id: "credential.rotate.confirm",
                title: "Replace this credential?",
                description: "The current protected credential will be replaced after the selected source is verified.",
            },
        },
        target: { resource_kinds: ["secret_ref"], expected_revision: "required" },
        input: { version: "1", schema: credentialSourceInput },
        result: { version: "1", schema: { type: "object", additionalProperties: false, required: ["credential"], properties: { credential: publicStatusSchema } } },
        availability: (context) => availability(dependencies, context),
        handler: (context, input) => handle(async () => {
            const ref = requireRef(dependencies, context);
            if (refRevision(ref) !== context.expected_resource_revision)
                throw new SecretBindingConflictError(ref.secret_ref_id);
            const accessRequest = requestFor(dependencies, context, ROTATE_CREDENTIAL_OPERATION_ID, CREDENTIAL_MAINTENANCE_PURPOSE);
            const material = await sourceMaterial(dependencies, context, ref, input.source, CREDENTIAL_MAINTENANCE_PURPOSE);
            try {
                const changed = await dependencies.broker.rotateSecretRef({
                    request: accessRequest,
                    material,
                });
                dependencies.binding_changed?.(changed, context.authority.principal_id);
                return { state: "completed", result: { credential: publicStatus(changed) }, changed_refs: [refChanged(changed)], audit_ref: auditRef(context) };
            }
            finally {
                material.fill(0);
            }
        }),
    };
}
function revokeOperation(dependencies) {
    return {
        operation_id: REVOKE_CREDENTIAL_OPERATION_ID,
        operation_version: "1",
        authority_boundary_kinds: ["workspace", "host"],
        category: "credentials",
        title: "Disconnect Credential",
        description: "Remove the protected host credential while retaining its unresolved SecretRef and all non-secret audit evidence.",
        effects: { mode: "write", reversibility: "irreversible", external: false, secret_access: "brokered" },
        required_grants: [REVOKE_CREDENTIAL_OPERATION_ID],
        interaction_constraints: {
            allowed_modes: ["interactive"],
            broker: { broker_id: dependencies.broker_id, purpose: CREDENTIAL_MAINTENANCE_PURPOSE },
            confirmation: {
                required: true,
                prompt_id: "credential.revoke.confirm",
                title: "Disconnect this credential?",
                description: "Work using this credential will remain blocked until it is connected again.",
            },
        },
        target: { resource_kinds: ["secret_ref"], expected_revision: "required" },
        input: { version: "1", schema: emptyInput },
        result: { version: "1", schema: { type: "object", additionalProperties: false, required: ["credential"], properties: { credential: publicStatusSchema } } },
        availability: (context) => availability(dependencies, context),
        handler: (context) => handle(async () => {
            const ref = requireRef(dependencies, context);
            if (refRevision(ref) !== context.expected_resource_revision)
                throw new SecretBindingConflictError(ref.secret_ref_id);
            const changed = await dependencies.broker.revokeSecretRef(requestFor(dependencies, context, REVOKE_CREDENTIAL_OPERATION_ID, CREDENTIAL_MAINTENANCE_PURPOSE));
            dependencies.binding_changed?.(changed, context.authority.principal_id);
            return { state: "completed", result: { credential: publicStatus(changed) }, changed_refs: [refChanged(changed)], audit_ref: auditRef(context) };
        }),
    };
}
function runtimeBoundaryOperation(operationId, dependencies) {
    return {
        operation_id: operationId,
        operation_version: "1",
        authority_boundary_kinds: ["workspace"],
        category: "credentials",
        title: operationId === USE_CREDENTIAL_OPERATION_ID ? "Use Credential" : "Refresh Credential",
        description: "Authorise point-of-use credential access for an isolated runtime execution. Credential material is available only through the authenticated execution boundary.",
        effects: { mode: operationId === USE_CREDENTIAL_OPERATION_ID ? "read" : "write", reversibility: operationId === USE_CREDENTIAL_OPERATION_ID ? "none" : "irreversible", external: false, secret_access: "brokered" },
        required_grants: [operationId],
        interaction_constraints: { allowed_modes: ["unattended", "brokered"], broker: { broker_id: dependencies.broker_id, purpose: RUNTIME_CREDENTIAL_PURPOSE } },
        target: { resource_kinds: ["secret_ref"], expected_revision: "not_applicable" },
        input: { version: "1", schema: emptyInput },
        result: { version: "1", schema: runtimeBoundaryResultSchema },
        availability: (context) => availability(dependencies, context),
        handler: (context) => handle(async () => {
            const ref = requireRef(dependencies, context);
            // Validate the exact grant without opening the secret. The private,
            // authenticated runtime channel performs the actual point-of-use access.
            requestFor(dependencies, context, operationId, RUNTIME_CREDENTIAL_PURPOSE);
            return {
                state: "completed",
                result: { secret_ref_id: ref.secret_ref_id, runtime_boundary_required: true },
                audit_ref: auditRef(context),
            };
        }),
    };
}
export function credentialOperationDefinitions(dependencies) {
    return [
        bindOperation(dependencies),
        healthOperation(dependencies),
        rotateOperation(dependencies),
        revokeOperation(dependencies),
        runtimeBoundaryOperation(USE_CREDENTIAL_OPERATION_ID, dependencies),
        runtimeBoundaryOperation(REFRESH_CREDENTIAL_OPERATION_ID, dependencies),
    ];
}
export function registerCredentialOperations(registry, dependencies) {
    registry.register(bindOperation(dependencies));
    registry.register(healthOperation(dependencies));
    registry.register(rotateOperation(dependencies));
    registry.register(revokeOperation(dependencies));
    registry.register(runtimeBoundaryOperation(USE_CREDENTIAL_OPERATION_ID, dependencies));
    registry.register(runtimeBoundaryOperation(REFRESH_CREDENTIAL_OPERATION_ID, dependencies));
    return registry;
}
function sameAuthorityBoundary(left, right) {
    if (left.kind !== right.kind)
        return false;
    return left.kind === "workspace"
        ? left.workspace_id === right.workspace_id
        : left.host_id === right.host_id;
}
