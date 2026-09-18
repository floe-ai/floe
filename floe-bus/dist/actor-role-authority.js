import { createHash, randomUUID } from "node:crypto";
export class ActorRoleAuthorityValidationError extends Error {
    reason;
    code = "E_ACTOR_ROLE_AUTHORITY_INVALID";
    constructor(reason) {
        super(`Invalid Actor role authority: ${reason}`);
        this.reason = reason;
        this.name = "ActorRoleAuthorityValidationError";
    }
}
export class ActorRoleAuthorityNotFoundError extends Error {
    kind;
    id;
    code = "E_ACTOR_ROLE_AUTHORITY_NOT_FOUND";
    constructor(kind, id) {
        super(`Actor role ${kind.replace("_", " ")} not found: ${id}`);
        this.kind = kind;
        this.id = id;
        this.name = "ActorRoleAuthorityNotFoundError";
    }
}
export class ActorRoleAuthorityConflictError extends Error {
    reason;
    code = "E_ACTOR_ROLE_AUTHORITY_CONFLICT";
    constructor(reason) {
        super(`Actor role authority conflict: ${reason}`);
        this.reason = reason;
        this.name = "ActorRoleAuthorityConflictError";
    }
}
function addColumnIfMissing(db, table, column, definition) {
    if (!tableExists(db, table))
        return;
    const columns = db.prepare(`PRAGMA table_info(${table})`).all();
    if (!columns.some((item) => item.name === column)) {
        db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
}
function tableExists(db, name) {
    return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name));
}
export function applyActorRoleAuthoritySchema(db) {
    db.exec(`
    CREATE TABLE IF NOT EXISTS principal_actor_bindings (
      principal_actor_binding_id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      principal_id TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      bound_by_principal_id TEXT NOT NULL,
      bound_at TEXT NOT NULL,
      evidence_refs_json TEXT NOT NULL DEFAULT '[]',
      revoked_by_principal_id TEXT,
      revoked_at TEXT,
      revocation_reason TEXT
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_principal_actor_bindings_active
      ON principal_actor_bindings(workspace_id, principal_id, actor_id)
      WHERE revoked_at IS NULL;

    CREATE INDEX IF NOT EXISTS idx_principal_actor_bindings_principal
      ON principal_actor_bindings(workspace_id, principal_id, revoked_at, bound_at);

    CREATE TABLE IF NOT EXISTS actor_role_assignments (
      actor_role_assignment_id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      role TEXT NOT NULL,
      boundary_kind TEXT NOT NULL CHECK (boundary_kind IN ('workspace', 'scope', 'context')),
      boundary_id TEXT NOT NULL,
      assigned_by_principal_id TEXT NOT NULL,
      assigned_at TEXT NOT NULL,
      revoked_by_principal_id TEXT,
      revoked_at TEXT,
      revocation_reason TEXT
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_actor_role_assignments_active
      ON actor_role_assignments(workspace_id, actor_id, role, boundary_kind, boundary_id)
      WHERE revoked_at IS NULL;

    CREATE INDEX IF NOT EXISTS idx_actor_role_assignments_boundary
      ON actor_role_assignments(workspace_id, boundary_kind, boundary_id, revoked_at, assigned_at);
  `);
    addColumnIfMissing(db, "principal_actor_bindings", "evidence_refs_json", "TEXT NOT NULL DEFAULT '[]'");
    const legacyBindings = db.prepare(`
    SELECT principal_actor_binding_id, bound_at
    FROM principal_actor_bindings
    WHERE evidence_refs_json = '[]'
  `).all();
    const attachLegacyEvidence = db.prepare(`
    UPDATE principal_actor_bindings SET evidence_refs_json = ?
    WHERE principal_actor_binding_id = ? AND evidence_refs_json = '[]'
  `);
    for (const binding of legacyBindings) {
        attachLegacyEvidence.run(JSON.stringify([{
                kind: "legacy_authority_import",
                id: binding.principal_actor_binding_id,
                revision: `bound:${binding.bound_at}`,
            }]), binding.principal_actor_binding_id);
    }
    // Context collaboration owns Context-local role selection. This exact ref
    // binds its current projection to the retained authority record instead of
    // asking Policy or Approval code to trust a mutable role string.
    addColumnIfMissing(db, "context_participants", "actor_role_assignment_id", "TEXT");
    if (tableExists(db, "context_participants") && tableExists(db, "contexts") && tableExists(db, "actors")) {
        const missing = db.prepare(`
      SELECT cp.context_id, cp.endpoint_id, cp.role, cp.joined_at, cp.updated_at,
             c.workspace_id, c.created_by_principal_id
      FROM context_participants cp
      JOIN contexts c ON c.context_id = cp.context_id
      JOIN actors a ON a.actor_id = cp.endpoint_id AND a.workspace_id = c.workspace_id
      WHERE cp.actor_role_assignment_id IS NULL
    `).all();
        const insert = db.prepare(`
      INSERT INTO actor_role_assignments (
        actor_role_assignment_id, workspace_id, actor_id, role,
        boundary_kind, boundary_id, assigned_by_principal_id, assigned_at,
        revoked_by_principal_id, revoked_at, revocation_reason
      ) VALUES (?, ?, ?, ?, 'context', ?, ?, ?, NULL, NULL, NULL)
    `);
        const attach = db.prepare(`
      UPDATE context_participants SET actor_role_assignment_id = ?
      WHERE context_id = ? AND endpoint_id = ? AND actor_role_assignment_id IS NULL
    `);
        withSavepoint(db, "migrate_context_actor_roles", () => {
            for (const row of missing) {
                const assignmentId = `actor_role_assignment_${randomUUID()}`;
                insert.run(assignmentId, row.workspace_id, row.endpoint_id, requiredText(row.role, "Context participant role"), row.context_id, row.created_by_principal_id ?? "system:legacy-context-role-import", row.updated_at ?? row.joined_at);
                attach.run(assignmentId, row.context_id, row.endpoint_id);
            }
        });
    }
}
/**
 * Canonical identity and role authority.
 *
 * A principal is authenticated by a transport. This store only establishes
 * which Actor identity that principal backs, and which retained roles that
 * Actor holds. It never grants an operation and never distinguishes human from
 * model, service, or future runtime backing.
 */
export class ActorRoleAuthorityStore {
    db;
    now;
    constructor(db, dependencies = {}) {
        this.db = db;
        this.now = dependencies.now ?? (() => new Date().toISOString());
        applyActorRoleAuthoritySchema(db);
    }
    bindPrincipal(input) {
        const workspaceId = requiredText(input.workspace_id, "workspace_id");
        const principalId = requiredText(input.principal_id, "principal_id");
        const actorId = requiredText(input.actor_id, "actor_id");
        const evidenceRefs = normalizeAuthorityEvidenceRefs(input.evidence_refs);
        this.requireActiveActor(workspaceId, actorId);
        const existing = this.getActivePrincipalBinding(workspaceId, principalId, actorId);
        if (existing)
            return existing;
        const id = requiredText(input.principal_actor_binding_id ?? `principal_actor_binding_${randomUUID()}`, "principal_actor_binding_id");
        try {
            this.db.prepare(`
        INSERT INTO principal_actor_bindings (
          principal_actor_binding_id, workspace_id, principal_id, actor_id,
          bound_by_principal_id, bound_at, evidence_refs_json,
          revoked_by_principal_id, revoked_at, revocation_reason
        ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL)
      `).run(id, workspaceId, principalId, actorId, requiredText(input.bound_by_principal_id, "bound_by_principal_id"), this.now(), JSON.stringify(evidenceRefs));
        }
        catch (error) {
            if (String(error).includes("UNIQUE constraint failed")) {
                throw new ActorRoleAuthorityConflictError("the principal-to-Actor binding already exists");
            }
            throw error;
        }
        return this.requirePrincipalBinding(id);
    }
    /**
     * Establish the Actor principal used by an active runtime Delivery. Neither
     * principal_id nor actor_id is accepted from a request: both are derived from
     * the exact retained runtime and Actor-definition pins selected by the Bus.
     * An explicit prior revocation is never silently undone.
     */
    ensureTrustedRuntimeSelfBinding(input) {
        const workspaceId = requiredText(input.workspace_id, "workspace_id");
        const runtimeBindingId = requiredText(input.actor_runtime_binding_id, "actor_runtime_binding_id");
        const definitionRevisionId = requiredText(input.actor_definition_revision_id, "actor_definition_revision_id");
        const source = this.db.prepare(`
      SELECT arb.actor_id,
             arb.workspace_id,
             arb.status AS runtime_status,
             adr.actor_id AS definition_actor_id,
             adr.workspace_id AS definition_workspace_id,
             adr.semantic_digest AS definition_digest,
             adr.published_at AS definition_published_at,
             adr.withdrawn_at AS definition_withdrawn_at,
             a.status AS actor_status
      FROM actor_runtime_bindings arb
      JOIN actor_definition_revisions adr
        ON adr.actor_definition_revision_id = ?
      JOIN actors a ON a.actor_id = arb.actor_id
      WHERE arb.actor_runtime_binding_id = ?
    `).get(definitionRevisionId, runtimeBindingId);
        if (!source
            || source.workspace_id !== workspaceId
            || source.definition_workspace_id !== workspaceId
            || source.definition_actor_id !== source.actor_id
            || source.runtime_status !== "resolved"
            || source.actor_status !== "active"
            || !source.definition_published_at
            || source.definition_withdrawn_at) {
            throw new ActorRoleAuthorityValidationError("the selected runtime pins do not prove one active Actor identity in this Workspace");
        }
        const actorId = source.actor_id;
        const history = this.listPrincipalBindings(workspaceId, {
            principal_id: actorId,
            actor_id: actorId,
            include_revoked: true,
        });
        const active = history.find((binding) => binding.status === "active");
        if (active)
            return active;
        if (history.length > 0) {
            throw new ActorRoleAuthorityConflictError("the runtime principal-to-Actor binding was explicitly revoked and requires an authorised management decision before it can be restored");
        }
        return this.bindPrincipal({
            workspace_id: workspaceId,
            principal_id: actorId,
            actor_id: actorId,
            bound_by_principal_id: actorId,
            evidence_refs: [
                {
                    kind: "actor_definition_revision",
                    id: definitionRevisionId,
                    revision: source.definition_digest,
                },
                {
                    kind: "actor_runtime_binding",
                    id: runtimeBindingId,
                    revision: runtimeBindingId,
                },
            ],
        });
    }
    revokePrincipalBinding(input) {
        const binding = this.requirePrincipalBinding(input.principal_actor_binding_id);
        this.requireWorkspace(binding.workspace_id, input.workspace_id);
        if (binding.status === "revoked")
            return binding;
        const result = this.db.prepare(`
      UPDATE principal_actor_bindings
      SET revoked_by_principal_id = ?, revoked_at = ?, revocation_reason = ?
      WHERE principal_actor_binding_id = ? AND revoked_at IS NULL
    `).run(requiredText(input.revoked_by_principal_id, "revoked_by_principal_id"), this.now(), requiredText(input.reason, "reason"), binding.principal_actor_binding_id);
        if (Number(result.changes) !== 1) {
            throw new ActorRoleAuthorityConflictError("the principal-to-Actor binding changed before revocation");
        }
        return this.requirePrincipalBinding(binding.principal_actor_binding_id);
    }
    assignRole(input) {
        const workspaceId = requiredText(input.workspace_id, "workspace_id");
        const actorId = requiredText(input.actor_id, "actor_id");
        const role = normalizeRole(input.role);
        const boundary = normalizeBoundary(input.boundary, workspaceId);
        this.requireActiveActor(workspaceId, actorId);
        this.requireBoundary(workspaceId, boundary);
        const existing = this.getActiveRoleAssignment(workspaceId, actorId, role, boundary);
        if (existing)
            return existing;
        const id = requiredText(input.actor_role_assignment_id ?? `actor_role_assignment_${randomUUID()}`, "actor_role_assignment_id");
        try {
            this.db.prepare(`
        INSERT INTO actor_role_assignments (
          actor_role_assignment_id, workspace_id, actor_id, role,
          boundary_kind, boundary_id, assigned_by_principal_id, assigned_at,
          revoked_by_principal_id, revoked_at, revocation_reason
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL)
      `).run(id, workspaceId, actorId, role, boundary.kind, boundaryId(boundary), requiredText(input.assigned_by_principal_id, "assigned_by_principal_id"), this.now());
        }
        catch (error) {
            if (String(error).includes("UNIQUE constraint failed")) {
                throw new ActorRoleAuthorityConflictError("the Actor already holds this role at the selected boundary");
            }
            throw error;
        }
        return this.requireRoleAssignment(id);
    }
    revokeRoleAssignment(input) {
        const assignment = this.requireRoleAssignment(input.actor_role_assignment_id);
        this.requireWorkspace(assignment.workspace_id, input.workspace_id);
        if (assignment.status === "revoked")
            return assignment;
        const result = this.db.prepare(`
      UPDATE actor_role_assignments
      SET revoked_by_principal_id = ?, revoked_at = ?, revocation_reason = ?
      WHERE actor_role_assignment_id = ? AND revoked_at IS NULL
    `).run(requiredText(input.revoked_by_principal_id, "revoked_by_principal_id"), this.now(), requiredText(input.reason, "reason"), assignment.actor_role_assignment_id);
        if (Number(result.changes) !== 1) {
            throw new ActorRoleAuthorityConflictError("the Actor role assignment changed before revocation");
        }
        return this.requireRoleAssignment(assignment.actor_role_assignment_id);
    }
    /**
     * Atomically changes the authority record referenced by one Context
     * participant. ContextStore owns the surrounding participant mutation.
     */
    replaceContextParticipantRole(input) {
        const boundary = { kind: "context", context_id: input.context_id };
        const previous = input.previous_actor_role_assignment_id
            ? this.requireRoleAssignment(input.previous_actor_role_assignment_id)
            : null;
        if (previous
            && previous.workspace_id === input.workspace_id
            && previous.actor_id === input.actor_id
            && previous.role === normalizeRole(input.role)
            && previous.boundary.kind === "context"
            && previous.boundary.context_id === input.context_id
            && previous.status === "active") {
            return previous;
        }
        if (previous && previous.status === "active") {
            this.revokeRoleAssignment({
                workspace_id: input.workspace_id,
                actor_role_assignment_id: previous.actor_role_assignment_id,
                revoked_by_principal_id: input.assigned_by_principal_id,
                reason: "Context participant role changed",
            });
        }
        return this.assignRole({
            workspace_id: input.workspace_id,
            actor_id: input.actor_id,
            role: input.role,
            boundary,
            assigned_by_principal_id: input.assigned_by_principal_id,
        });
    }
    listPrincipalBindings(workspaceId, options = {}) {
        const conditions = ["workspace_id = ?"];
        const parameters = [requiredText(workspaceId, "workspace_id")];
        if (options.principal_id) {
            conditions.push("principal_id = ?");
            parameters.push(options.principal_id);
        }
        if (options.actor_id) {
            conditions.push("actor_id = ?");
            parameters.push(options.actor_id);
        }
        if (!options.include_revoked)
            conditions.push("revoked_at IS NULL");
        return this.db.prepare(`
      SELECT * FROM principal_actor_bindings
      WHERE ${conditions.join(" AND ")}
      ORDER BY bound_at ASC, principal_actor_binding_id ASC
    `).all(...parameters).map(mapPrincipalBinding);
    }
    listRoleAssignments(workspaceId, options = {}) {
        const normalizedWorkspace = requiredText(workspaceId, "workspace_id");
        const conditions = ["workspace_id = ?"];
        const parameters = [normalizedWorkspace];
        if (options.actor_id) {
            conditions.push("actor_id = ?");
            parameters.push(options.actor_id);
        }
        if (options.boundary) {
            const boundary = normalizeBoundary(options.boundary, normalizedWorkspace);
            conditions.push("boundary_kind = ?", "boundary_id = ?");
            parameters.push(boundary.kind, boundaryId(boundary));
        }
        if (!options.include_revoked)
            conditions.push("revoked_at IS NULL");
        return this.db.prepare(`
      SELECT * FROM actor_role_assignments
      WHERE ${conditions.join(" AND ")}
      ORDER BY assigned_at ASC, actor_role_assignment_id ASC
    `).all(...parameters).map(mapRoleAssignment);
    }
    getPrincipalBinding(id) {
        const row = this.db.prepare("SELECT * FROM principal_actor_bindings WHERE principal_actor_binding_id = ?").get(id);
        return row ? mapPrincipalBinding(row) : null;
    }
    requirePrincipalBinding(id) {
        const found = this.getPrincipalBinding(id);
        if (!found)
            throw new ActorRoleAuthorityNotFoundError("principal_binding", id);
        return found;
    }
    getRoleAssignment(id) {
        const row = this.db.prepare("SELECT * FROM actor_role_assignments WHERE actor_role_assignment_id = ?").get(id);
        return row ? mapRoleAssignment(row) : null;
    }
    requireRoleAssignment(id) {
        const found = this.getRoleAssignment(id);
        if (!found)
            throw new ActorRoleAuthorityNotFoundError("role_assignment", id);
        return found;
    }
    /** Resolve roles exclusively from retained canonical records. */
    resolveCurrent(input) {
        const workspaceId = requiredText(input.workspace_id, "workspace_id");
        const principalId = requiredText(input.principal_id, "principal_id");
        const target = this.resolveTarget(workspaceId, input.target ?? {});
        const bindings = this.listPrincipalBindings(workspaceId, { principal_id: principalId })
            .filter((binding) => this.isActorActive(workspaceId, binding.actor_id));
        const actorIds = [...new Set(bindings.map((binding) => binding.actor_id))].sort();
        const evidence = [];
        for (const binding of bindings) {
            const assignments = this.listApplicableRoleAssignments(workspaceId, binding.actor_id, target);
            for (const assignment of assignments) {
                evidence.push({
                    actor_id: binding.actor_id,
                    role: assignment.role,
                    principal_binding_ref: principalBindingRef(binding),
                    role_source_ref: roleAssignmentRef(assignment),
                    source_boundary: {
                        kind: assignment.boundary.kind,
                        id: boundaryId(assignment.boundary),
                        scope_composition_revision_id: null,
                        node_placement_id: null,
                    },
                });
            }
            if (target.scope_composition_revision_id && target.node_placement_id) {
                const placement = this.getPlacementRole(workspaceId, target.scope_composition_revision_id, target.node_placement_id, binding.actor_id);
                if (placement && (!target.node_execution_id
                    || this.nodeExecutionAssignsActor(target.node_execution_id, binding.actor_id))) {
                    evidence.push({
                        actor_id: binding.actor_id,
                        role: "executor",
                        principal_binding_ref: principalBindingRef(binding),
                        role_source_ref: {
                            kind: "scope_composition_revision",
                            id: placement.revision_id,
                            revision: placement.semantic_digest,
                        },
                        source_boundary: {
                            kind: target.node_execution_id ? "node_execution" : "node_placement",
                            id: target.node_execution_id ?? placement.node_id,
                            scope_composition_revision_id: placement.revision_id,
                            node_placement_id: placement.node_id,
                        },
                    });
                }
            }
        }
        const normalizedEvidence = dedupeEvidence(evidence);
        const roles = [...new Set(normalizedEvidence.map((item) => item.role))].sort();
        const resolvedAt = this.now();
        const authorityState = {
            workspace_id: workspaceId,
            principal_id: principalId,
            actor_ids: actorIds,
            roles,
            evidence: normalizedEvidence,
            resolved_target: target,
        };
        return {
            ...authorityState,
            evidence_digest: createHash("sha256").update(canonicalJson(authorityState)).digest("hex"),
            resolved_at: resolvedAt,
        };
    }
    validateResolutionEvidence(resolution, options = {}) {
        const checkedAt = options.at ?? this.now();
        const requireCurrent = options.require_current === true;
        const invalid = [];
        for (const evidence of resolution.evidence) {
            if (!this.actorIsValidAt(resolution.workspace_id, evidence.actor_id, checkedAt, requireCurrent)) {
                invalid.push({ actor_id: evidence.actor_id, role: evidence.role, reason: "Actor identity is no longer valid" });
                continue;
            }
            const binding = this.getPrincipalBinding(evidence.principal_binding_ref.id);
            if (!binding
                || binding.workspace_id !== resolution.workspace_id
                || binding.principal_id !== resolution.principal_id
                || binding.actor_id !== evidence.actor_id
                || principalBindingRevision(binding) !== evidence.principal_binding_ref.revision
                || !activeAt(binding.bound_at, binding.revoked_at, checkedAt)
                || (requireCurrent && binding.status !== "active")) {
                invalid.push({ actor_id: evidence.actor_id, role: evidence.role, reason: "principal-to-Actor binding is no longer valid" });
                continue;
            }
            if (evidence.role_source_ref.kind === "actor_role_assignment") {
                const assignment = this.getRoleAssignment(evidence.role_source_ref.id);
                if (!assignment
                    || assignment.workspace_id !== resolution.workspace_id
                    || assignment.actor_id !== evidence.actor_id
                    || assignment.role !== evidence.role
                    || roleAssignmentRevision(assignment) !== evidence.role_source_ref.revision
                    || !activeAt(assignment.assigned_at, assignment.revoked_at, checkedAt)
                    || (requireCurrent && assignment.status !== "active")
                    || (requireCurrent
                        && assignment.boundary.kind === "context"
                        && !this.contextAssignmentIsCurrent(assignment))) {
                    invalid.push({ actor_id: evidence.actor_id, role: evidence.role, reason: "Actor role assignment is no longer valid" });
                }
                continue;
            }
            const placement = this.getPlacementRole(resolution.workspace_id, evidence.role_source_ref.id, evidence.source_boundary.node_placement_id ?? "", evidence.actor_id);
            if (!placement
                || placement.semantic_digest !== evidence.role_source_ref.revision
                || evidence.role !== "executor"
                || evidence.source_boundary.scope_composition_revision_id !== placement.revision_id
                || resolution.resolved_target.scope_composition_revision_id !== placement.revision_id
                || resolution.resolved_target.node_placement_id !== placement.node_id
                || (evidence.source_boundary.kind === "node_placement"
                    ? evidence.source_boundary.id !== placement.node_id
                    : evidence.source_boundary.kind !== "node_execution"
                        || evidence.source_boundary.id !== resolution.resolved_target.node_execution_id)
                || (resolution.resolved_target.node_execution_id !== null
                    && !this.nodeExecutionAssignsActor(resolution.resolved_target.node_execution_id, evidence.actor_id))) {
                invalid.push({ actor_id: evidence.actor_id, role: evidence.role, reason: "pinned NodePlacement role evidence is unavailable" });
            }
        }
        return {
            valid: invalid.length === 0,
            checked_at: checkedAt,
            require_current: requireCurrent,
            invalid_evidence: invalid,
        };
    }
    listApplicableRoleAssignments(workspaceId, actorId, target) {
        const boundaries = [{ kind: "workspace", workspace_id: workspaceId }];
        if (target.scope_id)
            boundaries.push({ kind: "scope", scope_id: target.scope_id });
        if (target.context_id)
            boundaries.push({ kind: "context", context_id: target.context_id });
        const result = [];
        for (const boundary of boundaries) {
            for (const assignment of this.listRoleAssignments(workspaceId, { actor_id: actorId, boundary })) {
                if (boundary.kind === "context" && !this.contextAssignmentIsCurrent(assignment))
                    continue;
                result.push(assignment);
            }
        }
        return result;
    }
    contextAssignmentIsCurrent(assignment) {
        if (assignment.boundary.kind !== "context" || !tableExists(this.db, "context_participants"))
            return false;
        const row = this.db.prepare(`
      SELECT c.workspace_id, c.lifecycle_state, cp.role, cp.actor_role_assignment_id
      FROM context_participants cp
      JOIN contexts c ON c.context_id = cp.context_id
      WHERE cp.context_id = ? AND cp.endpoint_id = ?
    `).get(assignment.boundary.context_id, assignment.actor_id);
        return Boolean(row
            && row.workspace_id === assignment.workspace_id
            && row.lifecycle_state === "active"
            && row.role === assignment.role
            && row.actor_role_assignment_id === assignment.actor_role_assignment_id);
    }
    resolveTarget(workspaceId, input) {
        let scopeId = optionalText(input.scope_id);
        let revisionId = optionalText(input.scope_composition_revision_id);
        let nodeId = optionalText(input.node_placement_id);
        let nodeExecutionId = optionalText(input.node_execution_id);
        let contextId = optionalText(input.context_id);
        if ((revisionId && !nodeId) || (!revisionId && nodeId)) {
            throw new ActorRoleAuthorityValidationError("scope_composition_revision_id and node_placement_id must be selected together");
        }
        if (nodeExecutionId) {
            const row = this.db.prepare(`
        SELECT ne.node_execution_id, ne.revision_id, ne.node_id, ne.context_id,
               se.workspace_id, se.scope_id
        FROM node_executions ne
        JOIN scope_executions se ON se.execution_id = ne.execution_id
        WHERE ne.node_execution_id = ?
      `).get(nodeExecutionId);
            if (!row || row.workspace_id !== workspaceId) {
                throw new ActorRoleAuthorityValidationError("the selected NodeExecution is not available in this Workspace");
            }
            assertSameOptional("scope_id", scopeId, row.scope_id);
            assertSameOptional("scope_composition_revision_id", revisionId, row.revision_id);
            assertSameOptional("node_placement_id", nodeId, row.node_id);
            assertSameOptional("context_id", contextId, row.context_id);
            scopeId = row.scope_id;
            revisionId = row.revision_id;
            nodeId = row.node_id;
            contextId = row.context_id;
        }
        if (revisionId) {
            const revision = this.db.prepare(`
        SELECT workspace_id, scope_id, published_at, withdrawn_at
        FROM scope_composition_revisions WHERE revision_id = ?
      `).get(revisionId);
            if (!revision
                || revision.workspace_id !== workspaceId
                || !revision.published_at
                || revision.withdrawn_at) {
                throw new ActorRoleAuthorityValidationError("the selected composition revision is not retained and published in this Workspace");
            }
            assertSameOptional("scope_id", scopeId, revision.scope_id);
            scopeId = revision.scope_id;
        }
        if (contextId) {
            const context = this.db.prepare(`
        SELECT workspace_id, scope_id FROM contexts WHERE context_id = ?
      `).get(contextId);
            if (!context || context.workspace_id !== workspaceId) {
                throw new ActorRoleAuthorityValidationError("the selected Context is not available in this Workspace");
            }
            if (scopeId && context.scope_id && context.scope_id !== scopeId) {
                throw new ActorRoleAuthorityValidationError("the selected Context and Scope do not match");
            }
            scopeId = scopeId ?? context.scope_id;
        }
        if (scopeId) {
            const scope = this.db.prepare(`
        SELECT status FROM scopes WHERE workspace_id = ? AND scope_id = ?
      `).get(workspaceId, scopeId);
            if (!scope || scope.status === "retired") {
                throw new ActorRoleAuthorityValidationError("the selected Scope is not active in this Workspace");
            }
        }
        return {
            scope_id: scopeId,
            scope_composition_revision_id: revisionId,
            node_placement_id: nodeId,
            node_execution_id: nodeExecutionId,
            context_id: contextId,
        };
    }
    getPlacementRole(workspaceId, revisionId, nodeId, actorId) {
        if (!nodeId)
            return null;
        const row = this.db.prepare(`
      SELECT r.revision_id, r.semantic_digest, r.workspace_id,
             r.published_at, r.withdrawn_at, n.node_id, n.kind, n.resource_id
      FROM scope_composition_revisions r
      JOIN scope_node_placements n ON n.revision_id = r.revision_id
      WHERE r.revision_id = ? AND n.node_id = ?
    `).get(revisionId, nodeId);
        if (!row
            || row.workspace_id !== workspaceId
            || !row.published_at
            || row.withdrawn_at
            || row.kind !== "actor"
            || row.resource_id !== actorId)
            return null;
        return {
            revision_id: row.revision_id,
            node_id: row.node_id,
            semantic_digest: row.semantic_digest,
        };
    }
    nodeExecutionAssignsActor(nodeExecutionId, actorId) {
        const row = this.db.prepare(`
      SELECT assigned_actor_ids_json FROM node_executions WHERE node_execution_id = ?
    `).get(nodeExecutionId);
        if (!row)
            return false;
        try {
            const assigned = JSON.parse(row.assigned_actor_ids_json);
            return Array.isArray(assigned) && assigned.every((item) => typeof item === "string")
                && assigned.includes(actorId);
        }
        catch {
            return false;
        }
    }
    getActivePrincipalBinding(workspaceId, principalId, actorId) {
        const row = this.db.prepare(`
      SELECT * FROM principal_actor_bindings
      WHERE workspace_id = ? AND principal_id = ? AND actor_id = ? AND revoked_at IS NULL
    `).get(workspaceId, principalId, actorId);
        return row ? mapPrincipalBinding(row) : null;
    }
    getActiveRoleAssignment(workspaceId, actorId, role, boundary) {
        const row = this.db.prepare(`
      SELECT * FROM actor_role_assignments
      WHERE workspace_id = ? AND actor_id = ? AND role = ?
        AND boundary_kind = ? AND boundary_id = ? AND revoked_at IS NULL
    `).get(workspaceId, actorId, role, boundary.kind, boundaryId(boundary));
        return row ? mapRoleAssignment(row) : null;
    }
    isActorActive(workspaceId, actorId) {
        if (!tableExists(this.db, "actors"))
            return false;
        const actor = this.db.prepare(`
      SELECT 1 FROM actors WHERE workspace_id = ? AND actor_id = ? AND status = 'active'
    `).get(workspaceId, actorId);
        return Boolean(actor);
    }
    actorIsValidAt(workspaceId, actorId, at, requireCurrent) {
        if (!tableExists(this.db, "actors"))
            return false;
        const actor = this.db.prepare(`
      SELECT status, created_at, retired_at
      FROM actors
      WHERE workspace_id = ? AND actor_id = ?
    `).get(workspaceId, actorId);
        if (!actor || !activeAt(actor.created_at, actor.retired_at, at))
            return false;
        return !requireCurrent || actor.status === "active";
    }
    requireActiveActor(workspaceId, actorId) {
        if (!this.isActorActive(workspaceId, actorId)) {
            throw new ActorRoleAuthorityValidationError("the selected Actor is missing, retired, or outside this Workspace");
        }
    }
    requireBoundary(workspaceId, boundary) {
        if (boundary.kind === "workspace")
            return;
        if (boundary.kind === "scope") {
            const scope = this.db.prepare(`
        SELECT status FROM scopes WHERE workspace_id = ? AND scope_id = ?
      `).get(workspaceId, boundary.scope_id);
            if (!scope || scope.status === "retired") {
                throw new ActorRoleAuthorityValidationError("the selected Scope is missing, retired, or outside this Workspace");
            }
            return;
        }
        const context = this.db.prepare(`
      SELECT lifecycle_state FROM contexts WHERE workspace_id = ? AND context_id = ?
    `).get(workspaceId, boundary.context_id);
        if (!context || context.lifecycle_state !== "active") {
            throw new ActorRoleAuthorityValidationError("the selected Context is missing, inactive, or outside this Workspace");
        }
    }
    requireWorkspace(actual, expected) {
        if (actual !== requiredText(expected, "workspace_id")) {
            throw new ActorRoleAuthorityValidationError("the selected record belongs to another Workspace");
        }
    }
}
function mapPrincipalBinding(row) {
    return {
        principal_actor_binding_id: row.principal_actor_binding_id,
        workspace_id: row.workspace_id,
        principal_id: row.principal_id,
        actor_id: row.actor_id,
        bound_by_principal_id: row.bound_by_principal_id,
        bound_at: row.bound_at,
        evidence_refs: Object.freeze(normalizeAuthorityEvidenceRefs(JSON.parse(row.evidence_refs_json))),
        revoked_by_principal_id: row.revoked_by_principal_id,
        revoked_at: row.revoked_at,
        revocation_reason: row.revocation_reason,
        status: row.revoked_at ? "revoked" : "active",
    };
}
function mapRoleAssignment(row) {
    return {
        actor_role_assignment_id: row.actor_role_assignment_id,
        workspace_id: row.workspace_id,
        actor_id: row.actor_id,
        role: row.role,
        boundary: row.boundary_kind === "workspace"
            ? { kind: "workspace", workspace_id: row.boundary_id }
            : row.boundary_kind === "scope"
                ? { kind: "scope", scope_id: row.boundary_id }
                : { kind: "context", context_id: row.boundary_id },
        status: row.revoked_at ? "revoked" : "active",
        assigned_by_principal_id: row.assigned_by_principal_id,
        assigned_at: row.assigned_at,
        revoked_by_principal_id: row.revoked_by_principal_id,
        revoked_at: row.revoked_at,
        revocation_reason: row.revocation_reason,
    };
}
function normalizeBoundary(boundary, workspaceId) {
    if (boundary.kind === "workspace") {
        const selected = requiredText(boundary.workspace_id, "boundary.workspace_id");
        if (selected !== workspaceId) {
            throw new ActorRoleAuthorityValidationError("a Workspace role assignment must name its own Workspace");
        }
        return { kind: "workspace", workspace_id: selected };
    }
    if (boundary.kind === "scope") {
        return { kind: "scope", scope_id: requiredText(boundary.scope_id, "boundary.scope_id") };
    }
    return { kind: "context", context_id: requiredText(boundary.context_id, "boundary.context_id") };
}
function boundaryId(boundary) {
    if (boundary.kind === "workspace")
        return boundary.workspace_id;
    if (boundary.kind === "scope")
        return boundary.scope_id;
    return boundary.context_id;
}
function principalBindingRevision(binding) {
    // Revocation is a later lifecycle fact. The retained evidence identity stays
    // anchored to the immutable establishment of the relationship so an old
    // decision remains auditable while current re-use can still fail closed.
    return `bound:${binding.bound_at}`;
}
function roleAssignmentRevision(assignment) {
    return `assigned:${assignment.assigned_at}`;
}
function principalBindingRef(binding) {
    return {
        kind: "principal_actor_binding",
        id: binding.principal_actor_binding_id,
        revision: principalBindingRevision(binding),
    };
}
function roleAssignmentRef(assignment) {
    return {
        kind: "actor_role_assignment",
        id: assignment.actor_role_assignment_id,
        revision: roleAssignmentRevision(assignment),
    };
}
function activeAt(startedAt, endedAt, at) {
    return startedAt <= at && (endedAt === null || endedAt > at);
}
function assertSameOptional(label, selected, actual) {
    if (selected !== null && selected !== actual) {
        throw new ActorRoleAuthorityValidationError(`${label} conflicts with the selected execution evidence`);
    }
}
function optionalText(value) {
    if (value == null)
        return null;
    return requiredText(value, "target identifier");
}
function requiredText(value, label) {
    if (typeof value !== "string" || !value.trim()) {
        throw new ActorRoleAuthorityValidationError(`${label} must not be empty`);
    }
    return value.trim();
}
function normalizeRole(value) {
    const role = requiredText(value, "role");
    if (role.length > 128)
        throw new ActorRoleAuthorityValidationError("role must be 128 characters or fewer");
    return role;
}
function normalizeAuthorityEvidenceRefs(value) {
    if (!Array.isArray(value) || value.length === 0) {
        throw new ActorRoleAuthorityValidationError("principal-to-Actor binding evidence must contain at least one retained reference");
    }
    const normalized = value.map((item, index) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) {
            throw new ActorRoleAuthorityValidationError(`principal binding evidence ${index + 1} is not a resource reference`);
        }
        const candidate = item;
        const kind = requiredText(String(candidate.kind ?? ""), `evidence_refs[${index}].kind`);
        const id = requiredText(String(candidate.id ?? ""), `evidence_refs[${index}].id`);
        if (candidate.revision !== null && candidate.revision !== undefined && typeof candidate.revision !== "string") {
            throw new ActorRoleAuthorityValidationError(`evidence_refs[${index}].revision must be text or null`);
        }
        const revision = typeof candidate.revision === "string"
            ? requiredText(candidate.revision, `evidence_refs[${index}].revision`)
            : null;
        return { kind, id, revision };
    });
    const unique = new Map(normalized.map((item) => [
        `${item.kind}\0${item.id}\0${item.revision ?? ""}`,
        item,
    ]));
    return [...unique.values()].sort((left, right) => `${left.kind}\0${left.id}\0${left.revision ?? ""}`
        .localeCompare(`${right.kind}\0${right.id}\0${right.revision ?? ""}`));
}
function canonicalJson(value) {
    if (Array.isArray(value))
        return `[${value.map(canonicalJson).join(",")}]`;
    if (value && typeof value === "object") {
        return `{${Object.entries(value)
            .filter(([, item]) => item !== undefined)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
            .join(",")}}`;
    }
    return JSON.stringify(value);
}
function dedupeEvidence(evidence) {
    const unique = new Map();
    for (const item of evidence) {
        const key = [
            item.actor_id,
            item.role,
            item.principal_binding_ref.id,
            item.role_source_ref.kind,
            item.role_source_ref.id,
            item.source_boundary.kind,
            item.source_boundary.id,
            item.source_boundary.scope_composition_revision_id ?? "",
            item.source_boundary.node_placement_id ?? "",
        ].join("\u0000");
        unique.set(key, item);
    }
    return [...unique.values()].sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right)));
}
function withSavepoint(db, name, fn) {
    const savepoint = name.replace(/[^A-Za-z0-9_]/g, "_");
    db.exec(`SAVEPOINT ${savepoint}`);
    try {
        const result = fn();
        db.exec(`RELEASE SAVEPOINT ${savepoint}`);
        return result;
    }
    catch (error) {
        db.exec(`ROLLBACK TO SAVEPOINT ${savepoint}`);
        db.exec(`RELEASE SAVEPOINT ${savepoint}`);
        throw error;
    }
}
