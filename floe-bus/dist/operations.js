import { createHash, randomUUID } from "node:crypto";
export function operationAuthorityBoundaryId(boundary) {
    return boundary.kind === "workspace" ? boundary.workspace_id : boundary.host_id;
}
export function sameOperationAuthorityBoundary(left, right) {
    return left.kind === right.kind
        && operationAuthorityBoundaryId(left) === operationAuthorityBoundaryId(right);
}
export function requireWorkspaceAuthorityId(authority) {
    if (authority.boundary.kind !== "workspace") {
        throw new Error("This semantic operation requires Workspace authority.");
    }
    return authority.boundary.workspace_id;
}
export function createOperationAuthorityContext(input) {
    return {
        principal_id: input.principal_id,
        boundary: input.boundary,
        capability_grant_ids: Object.freeze([...(input.capability_grant_ids ?? [])]),
        ...(input.session_capability_grant_ids ? {
            session_capability_grant_ids: Object.freeze([...input.session_capability_grant_ids]),
        } : {}),
        grants: input.grants,
        interaction: input.interaction,
    };
}
/** Canonical accounting applied to every invocation independent of caller input. */
export const DEFAULT_OPERATION_USAGE = Object.freeze({ "operation.count": 1 });
const EMPTY_OPERATION_PROVENANCE = Object.freeze({
    cause_event_id: null,
    delivery_ids: Object.freeze([]),
    execution_attempt_id: null,
    node_execution_id: null,
    scope_execution_id: null,
});
const EMPTY_GOVERNANCE_EVIDENCE = Object.freeze({
    policy_evaluation_id: null,
    approval_request_ids: Object.freeze([]),
    approval_receipt_ids: Object.freeze([]),
    budget_reservation_id: null,
});
/** Process-local proof ledger. Durable Bus storage can implement the same atomic boundary. */
export class InMemoryOperationInvocationLedger {
    entries = new Map();
    begin(key, requestDigest, receipt) {
        const existing = this.entries.get(key);
        if (existing)
            return existing;
        this.entries.set(key, { request_digest: requestDigest, receipt });
        return null;
    }
    update(key, receipt) {
        const existing = this.entries.get(key);
        if (!existing || existing.receipt.invocation_id !== receipt.invocation_id) {
            throw new Error(`Operation invocation '${key}' was not reserved by '${receipt.invocation_id}'.`);
        }
        this.entries.set(key, { request_digest: existing.request_digest, receipt });
    }
}
export class SemanticOperationRegistry {
    validator;
    ledger;
    governance;
    definitions = new Map();
    currentVersions = new Map();
    executionOwnerId = `operation_owner_${process.pid}_${randomUUID()}`;
    constructor(validator, ledger, governance) {
        this.validator = validator;
        this.ledger = ledger;
        this.governance = governance;
    }
    register(definition, options = {}) {
        assertDefinition(definition);
        const versions = this.definitions.get(definition.operation_id) ?? new Map();
        if (versions.has(definition.operation_version)) {
            throw new Error(`Operation '${definition.operation_id}@${definition.operation_version}' is already registered.`);
        }
        versions.set(definition.operation_version, definition);
        this.definitions.set(definition.operation_id, versions);
        if (options.current !== false)
            this.currentVersions.set(definition.operation_id, definition.operation_version);
        return this;
    }
    /**
     * Projects the current registry identities for a trusted authority issuer.
     * The caller must still apply an explicit session-purpose policy; this does
     * not imply that every registered operation belongs in every session.
     */
    listCurrentOperationIds(input) {
        const operationIds = [];
        for (const [operationId, version] of this.currentVersions) {
            const definition = this.definitions.get(operationId)?.get(version);
            if (!definition)
                continue;
            if (!definition.interaction_constraints.allowed_modes.includes(input.interaction_mode))
                continue;
            if (input.boundary_kind && !definition.authority_boundary_kinds.includes(input.boundary_kind))
                continue;
            operationIds.push(operationId);
        }
        return operationIds.sort((left, right) => left.localeCompare(right));
    }
    /**
     * Canonical, non-authority-specific metadata for trusted diagnostics and
     * contract inventories. Availability still requires project() with an
     * authenticated principal and optional selected resource.
     */
    listCurrentOperationMetadata(input) {
        const operations = [];
        for (const [operationId, version] of this.currentVersions) {
            const definition = this.definitions.get(operationId)?.get(version);
            if (!definition)
                continue;
            if (!definition.interaction_constraints.allowed_modes.includes(input.interaction_mode))
                continue;
            if (input.boundary_kind && !definition.authority_boundary_kinds.includes(input.boundary_kind))
                continue;
            operations.push({
                operation_id: definition.operation_id,
                operation_version: definition.operation_version,
                category: definition.category,
                title: definition.title,
                effects: definition.effects,
            });
        }
        return operations.sort((left, right) => left.operation_id.localeCompare(right.operation_id));
    }
    async project(request) {
        const queryTokens = [...new Set((request.query ?? "").toLowerCase().split(/\s+/).filter((token) => token.length >= 2))];
        const category = request.category?.toLowerCase();
        const descriptors = [];
        for (const [operationId, version] of this.currentVersions) {
            const definition = this.definitions.get(operationId)?.get(version);
            if (!definition)
                continue;
            if (!definition.authority_boundary_kinds.includes(request.authority.boundary.kind))
                continue;
            if (category && definition.category.toLowerCase() !== category)
                continue;
            if (request.target && !definition.target.resource_kinds.includes(request.target.ref.kind))
                continue;
            const haystack = `${definition.operation_id} ${definition.category} ${definition.title} ${definition.description}`.toLowerCase();
            if (queryTokens.length > 0 && !queryTokens.some((token) => haystack.includes(token)))
                continue;
            descriptors.push({
                operation_id: definition.operation_id,
                operation_version: definition.operation_version,
                authority_boundary_kinds: definition.authority_boundary_kinds,
                category: definition.category,
                title: definition.title,
                description: definition.description,
                effects: definition.effects,
                required_grants: definition.required_grants,
                interaction_constraints: definition.interaction_constraints,
                target: definition.target,
                input: definition.input,
                result: definition.result,
                availability: await this.evaluateAvailability(definition, {
                    authority: request.authority,
                    target: request.target ?? null,
                }),
            });
        }
        if (queryTokens.length === 0)
            return descriptors;
        // Clients may show a bounded page. Rank the concrete need before incidental
        // matches, retaining partial matches and each descriptor's exact authority.
        const ranked = descriptors.map(descriptor => {
            const id = descriptor.operation_id.toLowerCase();
            const title = descriptor.title.toLowerCase();
            const haystack = `${id} ${descriptor.category} ${title} ${descriptor.description}`.toLowerCase();
            return { descriptor, rank: [
                    Number(id === queryTokens.join(".") || id === queryTokens.join(" ")),
                    queryTokens.filter(token => haystack.includes(token)).length,
                    queryTokens.filter(token => id.includes(token)).length,
                    queryTokens.filter(token => title.includes(token)).length,
                ] };
        });
        ranked.sort((left, right) => {
            for (let index = 0; index < left.rank.length; index++) {
                const difference = right.rank[index] - left.rank[index];
                if (difference)
                    return difference;
            }
            return 0;
        });
        return ranked.map(item => item.descriptor);
    }
    async invoke(environment, request) {
        if (!request.idempotency_key.trim()) {
            return {
                kind: "rejected",
                refusal: refusal("idempotency_key_required", "An idempotency key is required for every operation invocation.", true, requiredAction("supply_idempotency_key", "Retry safely", "Retry with one stable idempotency key for this intended operation.")),
            };
        }
        const definition = this.definitions.get(request.operation_id)?.get(request.operation_version);
        if (!definition) {
            return {
                kind: "rejected",
                refusal: refusal("operation_version_not_found", `Operation '${request.operation_id}@${request.operation_version}' is not registered.`, false, requiredAction("rediscover_operation", "Refresh available actions", "Discover the current operation contract before trying again."), { operation_id: request.operation_id, operation_version: request.operation_version }),
            };
        }
        const ledgerKey = invocationLedgerKey(environment.authority, request);
        const requestDigest = digest(request);
        const invocationId = `opinv_${digest({ ledger_key: ledgerKey }).slice(0, 32)}`;
        const startedAt = (environment.now ?? isoNow)();
        const runningReceipt = {
            receipt_id: invocationId,
            invocation_id: invocationId,
            operation_id: definition.operation_id,
            operation_version: definition.operation_version,
            principal_id: environment.authority.principal_id,
            authority_boundary: environment.authority.boundary,
            target: request.target ?? null,
            expected_resource_revision: request.expected_resource_revision ?? null,
            idempotency_key: request.idempotency_key,
            request_digest: requestDigest,
            provenance: environment.provenance ?? EMPTY_OPERATION_PROVENANCE,
            state: "running",
            result_schema_version: definition.result.version,
            result: null,
            refusal: null,
            changed_refs: [],
            progress_ref: { kind: "operation_invocation", id: invocationId, revision: null },
            cancel_ref: null,
            audit_ref: null,
            governance: EMPTY_GOVERNANCE_EVIDENCE,
            execution_owner_id: this.executionOwnerId,
            started_at: startedAt,
            updated_at: startedAt,
            completed_at: null,
        };
        const existing = await this.ledger.begin(ledgerKey, requestDigest, runningReceipt);
        if (existing) {
            if (existing.request_digest !== requestDigest) {
                return {
                    kind: "conflict",
                    refusal: refusal("idempotency_key_reused", "This idempotency key already identifies a different invocation request.", false, requiredAction("new_idempotency_key", "Use a new idempotency key", "Keep the existing key for the original intent and use a new key for this different request."), { existing_receipt_id: existing.receipt.receipt_id }),
                    existing_receipt: existing.receipt,
                };
            }
            if (existing.receipt.state === "running" && ownerMayStillBeRunning(existing.receipt.execution_owner_id, this.executionOwnerId)) {
                return { kind: "receipt", replayed: true, receipt: existing.receipt };
            }
            if (existing.receipt.state === "running") {
                await this.governance.recover({
                    invocation_id: invocationId,
                    definition,
                    authority: environment.authority,
                    provenance: existing.receipt.provenance,
                    target: null,
                    request,
                    request_digest: requestDigest,
                    input: request.input,
                    pre_effect_refusal: null,
                    prior_evidence: existing.receipt.governance,
                    receipt: existing.receipt,
                });
                const recoveredAt = (environment.now ?? isoNow)();
                const recovered = {
                    ...existing.receipt,
                    state: "outcome_unknown",
                    refusal: refusal("operation_outcome_unknown", "The Bus restarted or lost ownership while this operation might have been causing effects.", false, requiredAction("inspect_state", "Inspect current state", "Inspect the target and retained audit evidence before deciding whether another operation is safe."), { invocation_id: invocationId }),
                    progress_ref: null,
                    execution_owner_id: null,
                    updated_at: recoveredAt,
                    completed_at: recoveredAt,
                };
                await this.ledger.update(ledgerKey, recovered);
                return { kind: "receipt", replayed: true, receipt: recovered };
            }
            if (existing.receipt.state === "outcome_unknown") {
                // The receipt is already truthful, but the first settlement attempt may
                // have failed before its Budget and audit evidence reached the same
                // terminal state. Recovery is idempotent and never re-enters the
                // handler, so every replay also repairs any incomplete governance
                // evidence left by a prior process or storage failure.
                try {
                    await this.governance.recover({
                        invocation_id: invocationId,
                        definition,
                        authority: environment.authority,
                        provenance: existing.receipt.provenance,
                        target: null,
                        request,
                        request_digest: requestDigest,
                        input: request.input,
                        pre_effect_refusal: null,
                        prior_evidence: existing.receipt.governance,
                        receipt: existing.receipt,
                    });
                }
                catch {
                    // Keep returning the durable outcome_unknown receipt. A later replay
                    // can retry evidence repair without risking another handler effect.
                }
                return { kind: "receipt", replayed: true, receipt: existing.receipt };
            }
            if (existing.receipt.state !== "awaiting_approval") {
                return { kind: "receipt", replayed: true, receipt: existing.receipt };
            }
        }
        const baseReceipt = existing?.receipt ?? runningReceipt;
        const completeRefusal = async (operationRefusal, target = request.target ?? null) => {
            const completedAt = (environment.now ?? isoNow)();
            const receipt = {
                ...baseReceipt,
                target,
                state: "refused",
                refusal: operationRefusal,
                progress_ref: null,
                execution_owner_id: null,
                updated_at: completedAt,
                completed_at: completedAt,
            };
            await this.ledger.update(ledgerKey, receipt);
            return { kind: "receipt", replayed: false, receipt };
        };
        if (!definition.authority_boundary_kinds.includes(environment.authority.boundary.kind)) {
            return completeRefusal(refusal("operation_authority_boundary_not_supported", `Operation '${definition.operation_id}' cannot run with '${environment.authority.boundary.kind}' authority.`, false, requiredAction("use_supported_authority", "Use the correct authority", "Discover and invoke this operation through one of its declared authority boundaries."), { allowed_boundary_kinds: definition.authority_boundary_kinds }));
        }
        let target = null;
        if (definition.target.resource_kinds.length > 0) {
            if (!request.target) {
                return completeRefusal(refusal("operation_target_required", "This operation requires a target resource.", false, requiredAction("select_resource", "Select a target", "Select the resource this operation should act on."), { resource_kinds: definition.target.resource_kinds }));
            }
            if (!definition.target.resource_kinds.includes(request.target.kind)) {
                return completeRefusal(refusal("operation_target_invalid", `Operation '${definition.operation_id}' does not support resource kind '${request.target.kind}'.`, false, requiredAction("select_resource", "Select a supported target", "Select a resource supported by the current operation contract."), { resource_kinds: definition.target.resource_kinds }));
            }
            target = await environment.resolve_resource(request.target);
            if (!target || target.ref.kind !== request.target.kind || target.ref.id !== request.target.id) {
                return completeRefusal(refusal("operation_target_not_found", `Target '${request.target.kind}:${request.target.id}' was not found in the authenticated authority boundary.`, false, requiredAction("refresh_resource", "Refresh the Workspace", "Refresh current state and select an available resource.")));
            }
        }
        else if (request.target) {
            return completeRefusal(refusal("operation_target_not_supported", `Operation '${definition.operation_id}' does not accept a target resource.`, false, requiredAction("remove_target", "Remove the target", "Retry the operation without a target resource.")));
        }
        const targetRef = target?.ref ?? null;
        const revisionRefusal = validateExpectedRevision(definition, request, target);
        if (revisionRefusal)
            return completeRefusal(revisionRefusal, targetRef);
        if (request.input_schema_version !== definition.input.version) {
            return completeRefusal(refusal("operation_input_schema_version_mismatch", `Input schema version '${request.input_schema_version}' is not accepted by '${definition.operation_id}@${definition.operation_version}'.`, false, requiredAction("rediscover_operation", "Refresh available actions", "Discover the current operation contract and rebuild the request from its input schema."), { expected: definition.input.version, received: request.input_schema_version }));
        }
        const inputValidation = this.validator.validate(definition.input.schema, request.input);
        if (!inputValidation.valid) {
            return completeRefusal(refusal("operation_input_invalid", "The operation input does not match its discovered schema.", false, requiredAction("correct_input", "Correct the input", "Use the exact versioned input schema returned by operation discovery."), { issues: inputValidation.issues }), targetRef);
        }
        const availability = await this.evaluateAvailability(definition, {
            authority: environment.authority,
            target,
        });
        let preEffectRefusal = availability.available ? null : availability.refusal;
        const confirmation = definition.interaction_constraints.confirmation;
        if (!preEffectRefusal
            && confirmation?.required
            && !environment.authority.interaction.confirmed_prompts.has(confirmation.prompt_id)) {
            preEffectRefusal = refusal("operation_confirmation_required", confirmation.description, true, requiredAction("confirm", confirmation.title, confirmation.description, {
                operation_id: definition.operation_id,
                operation_version: definition.operation_version,
                target: request.target ?? null,
            }), { prompt_id: confirmation.prompt_id });
        }
        const governanceInvocation = {
            invocation_id: invocationId,
            definition,
            authority: environment.authority,
            // A retry resumes the same retained intent. Its new authenticated
            // transport/Delivery is not a replacement for that intent's causal origin.
            // Authority, current target, roles, Policy and exact inputs are still
            // revalidated below and by governance before any handler runs.
            provenance: existing?.receipt.state === "awaiting_approval"
                ? existing.receipt.provenance
                : environment.provenance ?? EMPTY_OPERATION_PROVENANCE,
            target,
            request,
            request_digest: requestDigest,
            input: request.input,
            pre_effect_refusal: preEffectRefusal,
            prior_evidence: existing?.receipt.governance ?? null,
        };
        let preparation;
        try {
            preparation = await this.governance.prepare(governanceInvocation);
        }
        catch {
            return completeRefusal(refusal("operation_governance_unavailable", "Floe could not establish the canonical Policy, approval, Budget, and audit decision for this operation.", true, requiredAction("inspect_governance", "Inspect governance", "Inspect retained governance state before retrying this exact idempotent invocation."), { invocation_id: invocationId }), targetRef);
        }
        if (preparation.state !== "authorized") {
            const completedAt = (environment.now ?? isoNow)();
            const receipt = {
                ...baseReceipt,
                target: targetRef,
                state: preparation.state,
                refusal: preparation.refusal,
                governance: preparation.evidence,
                audit_ref: preparation.audit_ref,
                provenance: preparation.canonical_provenance,
                progress_ref: null,
                execution_owner_id: null,
                updated_at: completedAt,
                completed_at: preparation.state === "refused" ? completedAt : null,
            };
            await this.ledger.update(ledgerKey, receipt);
            return { kind: "receipt", replayed: false, receipt };
        }
        const authorizedReceipt = {
            ...baseReceipt,
            target: targetRef,
            state: "running",
            refusal: null,
            governance: preparation.evidence,
            audit_ref: preparation.audit_ref,
            provenance: preparation.canonical_provenance,
            progress_ref: { kind: "operation_invocation", id: invocationId, revision: null },
            execution_owner_id: this.executionOwnerId,
            updated_at: (environment.now ?? isoNow)(),
            completed_at: null,
        };
        await this.ledger.update(ledgerKey, authorizedReceipt);
        const settle = async (input) => {
            const targetAfter = request.target
                ? await environment.resolve_resource(request.target)
                : null;
            await this.governance.settle({
                ...governanceInvocation,
                preparation,
                state: input.state,
                result: input.result ?? null,
                refusal: input.refusal ?? null,
                changed_refs: input.changed_refs ?? [],
                target_after: targetAfter,
                actual_usage: input.actual_usage ?? null,
            });
            return targetAfter;
        };
        const completeUnknown = async (operationRefusal, result = null, changedRefs = []) => {
            try {
                await settle({ state: "outcome_unknown", result, refusal: operationRefusal, changed_refs: changedRefs });
            }
            catch {
                // The durable receipt remains truthful even if secondary evidence also
                // needs recovery. A later replay asks governance to reconcile it.
            }
            const completedAt = (environment.now ?? isoNow)();
            const receipt = {
                ...authorizedReceipt,
                state: "outcome_unknown",
                result,
                refusal: operationRefusal,
                changed_refs: changedRefs,
                progress_ref: null,
                execution_owner_id: null,
                updated_at: completedAt,
                completed_at: completedAt,
            };
            await this.ledger.update(ledgerKey, receipt);
            return { kind: "receipt", replayed: false, receipt };
        };
        let outcome;
        try {
            outcome = await definition.handler({
                authority: environment.authority,
                target,
                invocation_id: invocationId,
                idempotency_key: request.idempotency_key,
                expected_resource_revision: request.expected_resource_revision ?? null,
                provenance: preparation.canonical_provenance,
                governance: preparation.evidence,
            }, request.input);
        }
        catch {
            return completeUnknown(refusal("operation_outcome_unknown", "The operation handler stopped without proving whether its effects completed.", false, requiredAction("inspect_state", "Inspect current state", "Inspect the target and invocation evidence before deciding whether a new operation is safe."), { invocation_id: invocationId }));
        }
        if (outcome.state === "refused") {
            await settle({ state: "refused", refusal: outcome.refusal });
            const completedAt = (environment.now ?? isoNow)();
            const receipt = {
                ...authorizedReceipt,
                state: "refused",
                refusal: outcome.refusal,
                progress_ref: null,
                execution_owner_id: null,
                updated_at: completedAt,
                completed_at: completedAt,
            };
            await this.ledger.update(ledgerKey, receipt);
            return { kind: "receipt", replayed: false, receipt };
        }
        const resultValidation = this.validator.validate(definition.result.schema, outcome.result);
        if (!resultValidation.valid) {
            return completeUnknown(refusal("operation_result_invalid", "The operation handler returned a result that violates its published result schema.", false, requiredAction("inspect_contract", "Inspect the operation contract", "The Bus operation implementation and its published result schema must be corrected together."), { issues: resultValidation.issues, invocation_id: invocationId }), null, outcome.changed_refs ?? []);
        }
        if (outcome.state === "accepted" && !outcome.progress_ref) {
            return completeUnknown(refusal("operation_progress_ref_required", "An accepted asynchronous operation must return an inspectable progress reference.", false, requiredAction("inspect_contract", "Inspect the operation contract", "The handler must expose progress for accepted asynchronous work."), { invocation_id: invocationId }), outcome.result, outcome.changed_refs ?? []);
        }
        let actualUsage = DEFAULT_OPERATION_USAGE;
        try {
            if (definition.resource_accounting?.measure) {
                const measured = await definition.resource_accounting.measure({ authority: environment.authority, target }, request.input, outcome.result);
                actualUsage = normalizeResourceUsage({ ...DEFAULT_OPERATION_USAGE, ...measured });
            }
            await settle({
                state: outcome.state,
                result: outcome.result,
                changed_refs: outcome.changed_refs ?? [],
                actual_usage: actualUsage,
            });
        }
        catch {
            return completeUnknown(refusal("operation_governance_outcome_unknown", "The operation completed its handler, but Floe could not prove its final governance records.", false, requiredAction("inspect_state", "Inspect current state", "Inspect the operation receipt, target, Budget, and audit evidence before retrying."), { invocation_id: invocationId }), outcome.result, outcome.changed_refs ?? []);
        }
        const completedAt = (environment.now ?? isoNow)();
        const receipt = {
            ...authorizedReceipt,
            target: targetRef,
            state: outcome.state,
            result: outcome.result,
            changed_refs: outcome.changed_refs ?? [],
            progress_ref: outcome.progress_ref ?? null,
            cancel_ref: outcome.cancel_ref ?? null,
            audit_ref: preparation.audit_ref ?? outcome.audit_ref ?? null,
            execution_owner_id: null,
            updated_at: completedAt,
            completed_at: outcome.state === "completed" ? completedAt : null,
        };
        await this.ledger.update(ledgerKey, receipt);
        return { kind: "receipt", replayed: false, receipt };
    }
    async evaluateAvailability(definition, context) {
        const missingGrants = definition.required_grants.filter((grant) => !context.authority.grants.has(grant));
        if (missingGrants.length > 0) {
            return unavailable(refusal("operation_grant_required", "The current principal is not authorised to use this operation.", false, requiredAction("request_grant", "Request access", "Request the narrow grants required for this operation."), { missing_grants: missingGrants }));
        }
        if (!definition.interaction_constraints.allowed_modes.includes(context.authority.interaction.mode)) {
            return unavailable(refusal("operation_interaction_not_supported", `This operation cannot run in '${context.authority.interaction.mode}' interaction mode.`, false, requiredAction("change_interaction", "Use a supported interaction", "Run this operation through a client that can satisfy its declared interaction constraints."), { allowed_modes: definition.interaction_constraints.allowed_modes }));
        }
        const broker = definition.interaction_constraints.broker;
        if (broker && context.authority.interaction.broker_id !== broker.broker_id) {
            return unavailable(refusal("operation_broker_required", `This operation requires the trusted '${broker.broker_id}' broker.`, false, requiredAction("use_broker", "Open the trusted broker", broker.purpose), { broker_id: broker.broker_id }));
        }
        if (definition.target.resource_kinds.length > 0 && !context.target) {
            return unavailable(refusal("operation_target_required", "Select a target resource to determine whether this operation is available.", false, requiredAction("select_resource", "Select a target", "Select the resource this operation should act on."), { resource_kinds: definition.target.resource_kinds }));
        }
        if (!definition.availability)
            return { available: true };
        try {
            return await definition.availability(context);
        }
        catch {
            return unavailable(refusal("operation_availability_unknown", "Floe could not determine whether this operation is currently safe and available.", true, requiredAction("refresh_resource", "Refresh current state", "Refresh the target and try discovery again.")));
        }
    }
}
function validateExpectedRevision(definition, request, target) {
    const policy = definition.target.expected_revision;
    const expected = request.expected_resource_revision ?? null;
    const current = target?.ref.revision ?? null;
    if (policy === "not_applicable") {
        return expected === null
            ? null
            : refusal("operation_revision_not_supported", "This operation does not accept an expected resource revision.", false, requiredAction("remove_expected_revision", "Remove the revision", "Retry without an expected resource revision."));
    }
    if (policy === "required" && expected === null) {
        return refusal("operation_expected_revision_required", "The current resource revision is required before this operation can change it.", true, requiredAction("refresh_resource", "Refresh the resource", "Read the current resource and retry with its exact revision."), { current_revision: current });
    }
    if (expected !== null && current !== expected) {
        return refusal("operation_resource_revision_conflict", "The target changed after this operation was prepared.", true, requiredAction("refresh_resource", "Review the latest version", "Refresh the resource, review the change, and create a new invocation."), { expected_revision: expected, current_revision: current });
    }
    return null;
}
function unavailable(operationRefusal) {
    return { available: false, refusal: operationRefusal };
}
export function refusal(code, message, retryable, requiredActionValue, details = {}) {
    return {
        code,
        message,
        retryable,
        required_action: requiredActionValue,
        details,
    };
}
export function requiredAction(code, title, description, operation = null) {
    return { code, title, description, operation };
}
function assertDefinition(definition) {
    for (const [label, value] of [
        ["operation_id", definition.operation_id],
        ["operation_version", definition.operation_version],
        ["input schema version", definition.input.version],
        ["result schema version", definition.result.version],
    ]) {
        if (!value.trim())
            throw new Error(`Semantic operation ${label} must not be empty.`);
    }
    if (definition.interaction_constraints.allowed_modes.length === 0) {
        throw new Error(`Operation '${definition.operation_id}' must allow at least one interaction mode.`);
    }
    if (definition.interaction_constraints.approval) {
        throw new Error(`Operation '${definition.operation_id}' declares a session approval. Approval must be a canonical bound Policy decision.`);
    }
    if (definition.authority_boundary_kinds.length === 0) {
        throw new Error(`Operation '${definition.operation_id}' must allow at least one authority boundary kind.`);
    }
    const boundaryKinds = new Set(definition.authority_boundary_kinds);
    if (boundaryKinds.size !== definition.authority_boundary_kinds.length
        || [...boundaryKinds].some((kind) => kind !== "workspace" && kind !== "host")) {
        throw new Error(`Operation '${definition.operation_id}' declares invalid authority boundary kinds.`);
    }
}
function invocationLedgerKey(authority, request) {
    return canonicalJson({
        authority_boundary: authority.boundary,
        principal_id: authority.principal_id,
        operation_id: request.operation_id,
        idempotency_key: request.idempotency_key,
    });
}
function digest(value) {
    return createHash("sha256").update(canonicalJson(value)).digest("hex");
}
function canonicalJson(value) {
    return JSON.stringify(canonicalize(value));
}
function canonicalize(value) {
    if (Array.isArray(value))
        return value.map(canonicalize);
    if (value && typeof value === "object") {
        return Object.fromEntries(Object.entries(value)
            .filter(([, entry]) => entry !== undefined)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, entry]) => [key, canonicalize(entry)]));
    }
    return value;
}
function isoNow() {
    return new Date().toISOString();
}
function ownerMayStillBeRunning(existingOwnerId, currentOwnerId) {
    if (!existingOwnerId)
        return false;
    if (existingOwnerId === currentOwnerId)
        return true;
    const match = /^operation_owner_(\d+)_/.exec(existingOwnerId);
    if (!match)
        return false;
    const pid = Number(match[1]);
    if (!Number.isInteger(pid) || pid <= 0)
        return false;
    if (pid === process.pid)
        return true;
    try {
        process.kill(pid, 0);
        return true;
    }
    catch {
        return false;
    }
}
function normalizeResourceUsage(input) {
    const normalized = {};
    for (const [metric, amount] of Object.entries(input)) {
        const name = metric.trim();
        if (!name || !Number.isFinite(amount) || amount < 0) {
            throw new Error("Operation resource accounting returned an invalid metric or amount.");
        }
        normalized[name] = amount;
    }
    return Object.freeze(Object.fromEntries(Object.entries(normalized).sort(([left], [right]) => left.localeCompare(right))));
}
