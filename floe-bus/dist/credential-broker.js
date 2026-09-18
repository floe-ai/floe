import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
export class SecretAccessDeniedError extends Error {
    reason_code;
    error_code = "E_SECRET_ACCESS_DENIED";
    constructor(reason_code) {
        super(`Brokered secret operation denied: ${reason_code}.`);
        this.reason_code = reason_code;
        this.name = "SecretAccessDeniedError";
    }
}
export class SecretBindingConflictError extends Error {
    secret_ref_id;
    error_code = "E_SECRET_BINDING_CONFLICT";
    constructor(secret_ref_id) {
        super(`SecretRef '${secret_ref_id}' changed before its broker binding could be committed.`);
        this.secret_ref_id = secret_ref_id;
        this.name = "SecretBindingConflictError";
    }
}
export class CredentialBrokerOperationError extends Error {
    error_code = "E_CREDENTIAL_BROKER_OPERATION_FAILED";
    constructor() {
        super("The trusted credential broker could not complete the requested operation.");
        this.name = "CredentialBrokerOperationError";
    }
}
export class BrokerSecretNotFoundError extends Error {
    error_code = "E_BROKER_SECRET_NOT_FOUND";
    constructor() {
        super("The credential broker binding is unresolved.");
        this.name = "BrokerSecretNotFoundError";
    }
}
/** Windows broker implementation that delegates protection entirely to the OS adapter. */
export class WindowsCredentialBroker {
    protector;
    broker_id;
    locatorFactory;
    constructor(brokerId, protector, dependencies = {}) {
        this.protector = protector;
        this.broker_id = requireText(brokerId, "broker_id");
        if (protector.protection_kind !== "windows-os-credential-protection") {
            throw new Error("WindowsCredentialBroker requires an operating-system credential protector.");
        }
        this.locatorFactory = dependencies.locator_factory
            ?? ((request) => `floe/${encodeURIComponent(boundaryKey(request.owner))}/${encodeURIComponent(request.secret_ref_id)}/${randomUUID()}`);
    }
    async store(request) {
        requireSecretMaterial(request.material);
        const locator = requireText(this.locatorFactory(withoutMaterial(request)), "broker locator");
        await this.protector.writeAtomic(locator, copyMaterial(request.material));
        return locator;
    }
    async replaceAtomic(locator, material) {
        requireText(locator, "broker locator");
        requireSecretMaterial(material);
        await this.protector.writeAtomic(locator, copyMaterial(material));
    }
    async withSecret(locator, operation) {
        requireText(locator, "broker locator");
        const stored = await this.protector.read(locator);
        if (stored === null)
            throw new BrokerSecretNotFoundError();
        const material = copyMaterial(stored);
        try {
            return await operation(material);
        }
        finally {
            material.fill(0);
        }
    }
    async remove(locator) {
        requireText(locator, "broker locator");
        await this.protector.remove(locator);
    }
}
/** Deterministic, prompt-free broker for tests and isolated development. */
export class InMemoryCredentialBroker {
    broker_id;
    values = new Map();
    sequence = 0;
    constructor(brokerId = "broker:memory") {
        this.broker_id = requireText(brokerId, "broker_id");
    }
    async store(request) {
        requireSecretMaterial(request.material);
        this.sequence += 1;
        const locator = `memory:${this.sequence}`;
        this.values.set(locator, copyMaterial(request.material));
        return locator;
    }
    async replaceAtomic(locator, material) {
        requireText(locator, "broker locator");
        requireSecretMaterial(material);
        if (!this.values.has(locator))
            throw new BrokerSecretNotFoundError();
        this.values.set(locator, copyMaterial(material));
    }
    async withSecret(locator, operation) {
        requireText(locator, "broker locator");
        const stored = this.values.get(locator);
        if (!stored)
            throw new BrokerSecretNotFoundError();
        const material = copyMaterial(stored);
        try {
            return await operation(material);
        }
        finally {
            material.fill(0);
        }
    }
    async remove(locator) {
        requireText(locator, "broker locator");
        this.values.delete(locator);
    }
}
/**
 * Installs SecretRef constraints and closed audit metadata. The canonical
 * CapabilityGrant schema must be installed first. No column stores secret material.
 */
export function applyCredentialBrokerSchema(db) {
    migrateSecretRefsToOwnedBoundaries(db);
    db.exec(`
    CREATE TABLE IF NOT EXISTS secret_refs (
      secret_ref_id TEXT PRIMARY KEY,
      owner_kind TEXT NOT NULL CHECK (owner_kind IN ('workspace', 'host')),
      owner_id TEXT NOT NULL CHECK (length(trim(owner_id)) > 0),
      resource_kind TEXT NOT NULL,
      resource_id TEXT NOT NULL,
      secret_kind TEXT NOT NULL,
      label TEXT NOT NULL,
      resolution TEXT NOT NULL CHECK (resolution IN ('unresolved', 'resolved')),
      broker_id TEXT,
      broker_locator TEXT,
      generation INTEGER NOT NULL DEFAULT 0 CHECK (generation >= 0),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      CHECK (
        (resolution = 'unresolved' AND broker_id IS NULL AND broker_locator IS NULL)
        OR
        (resolution = 'resolved' AND broker_id IS NOT NULL AND broker_locator IS NOT NULL)
      )
    );

    CREATE INDEX IF NOT EXISTS idx_secret_refs_resource
      ON secret_refs(owner_kind, owner_id, resource_kind, resource_id);

    CREATE TABLE IF NOT EXISTS secret_grant_constraints (
      grant_id TEXT PRIMARY KEY REFERENCES capability_grants(grant_id) ON DELETE CASCADE,
      secret_ref_id TEXT NOT NULL REFERENCES secret_refs(secret_ref_id),
      authority_boundary_kind TEXT NOT NULL CHECK (authority_boundary_kind IN ('workspace', 'host')),
      authority_boundary_id TEXT NOT NULL CHECK (length(trim(authority_boundary_id)) > 0)
    );

    CREATE TABLE IF NOT EXISTS secret_grant_constraint_purposes (
      grant_id TEXT NOT NULL REFERENCES secret_grant_constraints(grant_id) ON DELETE CASCADE,
      purpose TEXT NOT NULL,
      PRIMARY KEY (grant_id, purpose)
    );

    CREATE INDEX IF NOT EXISTS idx_secret_grant_constraints_ref
      ON secret_grant_constraints(authority_boundary_kind, authority_boundary_id, secret_ref_id);

    CREATE TABLE IF NOT EXISTS secret_access_audit (
      audit_id TEXT PRIMARY KEY,
      action TEXT NOT NULL CHECK (action IN ('bind', 'health', 'use', 'rotate', 'refresh', 'revoke')),
      outcome TEXT NOT NULL CHECK (outcome IN ('started', 'succeeded', 'denied', 'failed')),
      reason_code TEXT,
      secret_ref_id TEXT NOT NULL,
      grant_id TEXT NOT NULL,
      principal_id TEXT NOT NULL,
      authority_boundary_kind TEXT NOT NULL CHECK (authority_boundary_kind IN ('workspace', 'host')),
      authority_boundary_id TEXT NOT NULL CHECK (length(trim(authority_boundary_id)) > 0),
      resource_kind TEXT NOT NULL,
      resource_id TEXT NOT NULL,
      purpose TEXT NOT NULL,
      operation_id TEXT NOT NULL,
      started_at TEXT NOT NULL,
      completed_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_secret_access_audit_workspace
      ON secret_access_audit(authority_boundary_kind, authority_boundary_id, started_at DESC);
  `);
    migrateSecretAccessAuditActions(db);
}
/**
 * Converts the unreleased Workspace-only SecretRef layout in one transaction.
 * Existing protected broker locators and audit evidence are retained exactly.
 */
function migrateSecretRefsToOwnedBoundaries(db) {
    const row = db.prepare(`
    SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = 'secret_refs'
  `).get();
    if (!row || row.sql.includes("owner_kind"))
        return;
    const duplicate = db.prepare(`
    SELECT secret_ref_id FROM secret_refs GROUP BY secret_ref_id HAVING COUNT(*) > 1 LIMIT 1
  `).get();
    if (duplicate) {
        throw new Error(`SecretRef migration requires a unique identity; '${duplicate.secret_ref_id}' is duplicated.`);
    }
    inSavepoint(db, "secret_ref_owner", () => {
        db.exec(`
      CREATE TEMP TABLE floe_secret_constraints AS
        SELECT grant_id, secret_ref_id, workspace_id FROM secret_grant_constraints;
      CREATE TEMP TABLE floe_secret_purposes AS
        SELECT grant_id, purpose FROM secret_grant_constraint_purposes;
      DROP TABLE secret_grant_constraint_purposes;
      DROP TABLE secret_grant_constraints;
      ALTER TABLE secret_refs RENAME TO secret_refs_workspace_only;
      CREATE TABLE secret_refs (
        secret_ref_id TEXT PRIMARY KEY,
        owner_kind TEXT NOT NULL CHECK (owner_kind IN ('workspace', 'host')),
        owner_id TEXT NOT NULL CHECK (length(trim(owner_id)) > 0),
        resource_kind TEXT NOT NULL,
        resource_id TEXT NOT NULL,
        secret_kind TEXT NOT NULL,
        label TEXT NOT NULL,
        resolution TEXT NOT NULL CHECK (resolution IN ('unresolved', 'resolved')),
        broker_id TEXT,
        broker_locator TEXT,
        generation INTEGER NOT NULL DEFAULT 0 CHECK (generation >= 0),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        CHECK (
          (resolution = 'unresolved' AND broker_id IS NULL AND broker_locator IS NULL)
          OR
          (resolution = 'resolved' AND broker_id IS NOT NULL AND broker_locator IS NOT NULL)
        )
      );
      INSERT INTO secret_refs (
        secret_ref_id, owner_kind, owner_id, resource_kind, resource_id,
        secret_kind, label, resolution, broker_id, broker_locator, generation,
        created_at, updated_at
      )
      SELECT secret_ref_id, 'workspace', workspace_id, resource_kind, resource_id,
             secret_kind, label, resolution, broker_id, broker_locator, generation,
             created_at, updated_at
      FROM secret_refs_workspace_only;
      DROP TABLE secret_refs_workspace_only;
      CREATE INDEX idx_secret_refs_resource
        ON secret_refs(owner_kind, owner_id, resource_kind, resource_id);
      CREATE TABLE secret_grant_constraints (
        grant_id TEXT PRIMARY KEY REFERENCES capability_grants(grant_id) ON DELETE CASCADE,
        secret_ref_id TEXT NOT NULL REFERENCES secret_refs(secret_ref_id),
        authority_boundary_kind TEXT NOT NULL CHECK (authority_boundary_kind IN ('workspace', 'host')),
        authority_boundary_id TEXT NOT NULL CHECK (length(trim(authority_boundary_id)) > 0)
      );
      INSERT INTO secret_grant_constraints (
        grant_id, secret_ref_id, authority_boundary_kind, authority_boundary_id
      ) SELECT grant_id, secret_ref_id, 'workspace', workspace_id FROM floe_secret_constraints;
      CREATE INDEX idx_secret_grant_constraints_ref
        ON secret_grant_constraints(authority_boundary_kind, authority_boundary_id, secret_ref_id);
      CREATE TABLE secret_grant_constraint_purposes (
        grant_id TEXT NOT NULL REFERENCES secret_grant_constraints(grant_id) ON DELETE CASCADE,
        purpose TEXT NOT NULL,
        PRIMARY KEY (grant_id, purpose)
      );
      INSERT INTO secret_grant_constraint_purposes SELECT grant_id, purpose FROM floe_secret_purposes;
      DROP TABLE floe_secret_constraints;
      DROP TABLE floe_secret_purposes;
    `);
        const audit = db.prepare(`
      SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = 'secret_access_audit'
    `).get();
        if (audit && !audit.sql.includes("authority_boundary_kind")) {
            db.exec(`
        DROP INDEX IF EXISTS idx_secret_access_audit_workspace;
        ALTER TABLE secret_access_audit RENAME TO secret_access_audit_workspace_only;
        CREATE TABLE secret_access_audit (
          audit_id TEXT PRIMARY KEY,
          action TEXT NOT NULL CHECK (action IN ('bind', 'health', 'use', 'rotate', 'refresh', 'revoke')),
          outcome TEXT NOT NULL CHECK (outcome IN ('started', 'succeeded', 'denied', 'failed')),
          reason_code TEXT,
          secret_ref_id TEXT NOT NULL,
          grant_id TEXT NOT NULL,
          principal_id TEXT NOT NULL,
          authority_boundary_kind TEXT NOT NULL CHECK (authority_boundary_kind IN ('workspace', 'host')),
          authority_boundary_id TEXT NOT NULL CHECK (length(trim(authority_boundary_id)) > 0),
          resource_kind TEXT NOT NULL,
          resource_id TEXT NOT NULL,
          purpose TEXT NOT NULL,
          operation_id TEXT NOT NULL,
          started_at TEXT NOT NULL,
          completed_at TEXT
        );
        INSERT INTO secret_access_audit (
          audit_id, action, outcome, reason_code, secret_ref_id, grant_id,
          principal_id, authority_boundary_kind, authority_boundary_id,
          resource_kind, resource_id, purpose, operation_id, started_at, completed_at
        ) SELECT audit_id, action, outcome, reason_code, secret_ref_id, grant_id,
                 principal_id, 'workspace', workspace_id, resource_kind, resource_id,
                 purpose, operation_id, started_at, completed_at
          FROM secret_access_audit_workspace_only;
        DROP TABLE secret_access_audit_workspace_only;
        CREATE INDEX idx_secret_access_audit_workspace
          ON secret_access_audit(authority_boundary_kind, authority_boundary_id, started_at DESC);
      `);
        }
    });
}
/** Preserves unreleased audit evidence while widening the closed action set. */
function migrateSecretAccessAuditActions(db) {
    const row = db.prepare(`
    SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = 'secret_access_audit'
  `).get();
    if (!row || row.sql.includes("'health'") && row.sql.includes("'revoke'"))
        return;
    inSavepoint(db, "secret_audit_actions", () => {
        db.exec(`
      DROP INDEX IF EXISTS idx_secret_access_audit_workspace;
      ALTER TABLE secret_access_audit RENAME TO secret_access_audit_legacy_actions;
      CREATE TABLE secret_access_audit (
        audit_id TEXT PRIMARY KEY,
        action TEXT NOT NULL CHECK (action IN ('bind', 'health', 'use', 'rotate', 'refresh', 'revoke')),
        outcome TEXT NOT NULL CHECK (outcome IN ('started', 'succeeded', 'denied', 'failed')),
        reason_code TEXT,
        secret_ref_id TEXT NOT NULL,
        grant_id TEXT NOT NULL,
        principal_id TEXT NOT NULL,
        authority_boundary_kind TEXT NOT NULL CHECK (authority_boundary_kind IN ('workspace', 'host')),
        authority_boundary_id TEXT NOT NULL CHECK (length(trim(authority_boundary_id)) > 0),
        resource_kind TEXT NOT NULL,
        resource_id TEXT NOT NULL,
        purpose TEXT NOT NULL,
        operation_id TEXT NOT NULL,
        started_at TEXT NOT NULL,
        completed_at TEXT
      );
      INSERT INTO secret_access_audit
      SELECT * FROM secret_access_audit_legacy_actions;
      DROP TABLE secret_access_audit_legacy_actions;
      CREATE INDEX idx_secret_access_audit_workspace
        ON secret_access_audit(authority_boundary_kind, authority_boundary_id, started_at DESC);
    `);
    });
}
export class SqliteSecretRefStore {
    db;
    now;
    secretRefIdFactory;
    auditIdFactory;
    constructor(db, dependencies = {}) {
        this.db = db;
        this.now = dependencies.now ?? isoNow;
        this.secretRefIdFactory = dependencies.secret_ref_id_factory ?? (() => `secretref_${randomUUID()}`);
        this.auditIdFactory = dependencies.audit_id_factory ?? (() => `secretaudit_${randomUUID()}`);
    }
    createSecretRef(input) {
        const secretRefId = requireText(input.secret_ref_id ?? this.secretRefIdFactory(), "secret_ref_id");
        const owner = normalizeBoundary(input.owner);
        const resource = normalizeResource(input.resource);
        const secretKind = requireText(input.secret_kind, "secret_kind");
        const label = requireText(input.label, "label");
        const now = validTimestamp("created_at", this.now()).iso;
        this.db.prepare(`
      INSERT INTO secret_refs (
        secret_ref_id, owner_kind, owner_id, resource_kind, resource_id, secret_kind,
        label, resolution, broker_id, broker_locator, generation, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'unresolved', NULL, NULL, 0, ?, ?)
    `).run(secretRefId, owner.kind, boundaryId(owner), resource.kind, resource.id, secretKind, label, now, now);
        return this.requireSecretRef(secretRefId);
    }
    getSecretRef(secretRefId) {
        requireText(secretRefId, "secret_ref_id");
        const row = this.db.prepare(`
      SELECT secret_ref_id, owner_kind, owner_id, resource_kind, resource_id, secret_kind,
             label, resolution, broker_id, broker_locator, generation, created_at, updated_at
      FROM secret_refs
      WHERE secret_ref_id = ?
    `).get(secretRefId);
        return row ? secretRefFromRow(row) : null;
    }
    listSecretRefs(owner) {
        const normalizedOwner = owner ? normalizeBoundary(owner) : null;
        return this.db.prepare(`
      SELECT secret_ref_id, owner_kind, owner_id, resource_kind, resource_id, secret_kind,
             label, resolution, broker_id, broker_locator, generation, created_at, updated_at
      FROM secret_refs
      WHERE (? IS NULL OR (owner_kind = ? AND owner_id = ?))
      ORDER BY secret_ref_id
    `).all(normalizedOwner?.kind ?? null, normalizedOwner?.kind ?? null, normalizedOwner ? boundaryId(normalizedOwner) : null).map(secretRefFromRow);
    }
    attachGrantConstraint(input, capabilityGrants) {
        const grantId = requireText(input.grant_id, "grant_id");
        const secretRefId = requireText(input.secret_ref_id, "secret_ref_id");
        const authorityBoundary = normalizeBoundary(input.authority_boundary);
        const purposes = normalizeTextSet(input.purposes, "purpose", true);
        const ref = this.getSecretRef(secretRefId);
        if (!ref)
            throw new SecretAccessDeniedError("secret_ref_not_found");
        const grant = capabilityGrants.getGrant(grantId);
        if (!grant)
            throw new SecretAccessDeniedError("grant_not_found");
        if (!sameBoundary(grant.boundary, authorityBoundary)) {
            throw new SecretAccessDeniedError("grant_boundary_mismatch");
        }
        if (!hasExactGrantTarget(grant, "secret_ref", secretRefId)) {
            throw new SecretAccessDeniedError("grant_secret_ref_target_mismatch");
        }
        inSavepoint(this.db, "secret_grant_constraint", () => {
            this.db.prepare(`
        INSERT INTO secret_grant_constraints (
          grant_id, secret_ref_id, authority_boundary_kind, authority_boundary_id
        )
        VALUES (?, ?, ?, ?)
      `)
                .run(grantId, secretRefId, authorityBoundary.kind, boundaryId(authorityBoundary));
            const purposeStatement = this.db.prepare(`
        INSERT INTO secret_grant_constraint_purposes (grant_id, purpose) VALUES (?, ?)
      `);
            for (const purpose of purposes)
                purposeStatement.run(grantId, purpose);
        });
        return this.requireGrantConstraint(grantId);
    }
    getGrantConstraint(grantId) {
        const row = this.db.prepare(`
      SELECT grant_id, secret_ref_id, authority_boundary_kind, authority_boundary_id
      FROM secret_grant_constraints
      WHERE grant_id = ?
    `).get(grantId);
        if (!row)
            return null;
        const purposes = this.db.prepare(`
      SELECT purpose FROM secret_grant_constraint_purposes WHERE grant_id = ? ORDER BY purpose
    `).all(grantId).map((item) => item.purpose);
        return {
            grant_id: row.grant_id,
            secret_ref_id: row.secret_ref_id,
            authority_boundary: boundaryFromParts(row.authority_boundary_kind, row.authority_boundary_id),
            purposes,
        };
    }
    startAudit(request, action) {
        const auditId = requireText(this.auditIdFactory(), "audit_id");
        const startedAt = validTimestamp("started_at", this.now()).iso;
        this.db.prepare(`
      INSERT INTO secret_access_audit (
        audit_id, action, outcome, reason_code, secret_ref_id, grant_id,
        principal_id, authority_boundary_kind, authority_boundary_id,
        resource_kind, resource_id, purpose,
        operation_id, started_at, completed_at
      ) VALUES (?, ?, 'started', NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
    `).run(auditId, action, request.secret_ref_id, request.grant_id, request.principal_id, request.authority_boundary.kind, boundaryId(request.authority_boundary), request.resource.kind, request.resource.id, request.purpose, request.operation_id, startedAt);
        return this.requireAudit(auditId);
    }
    recordDeniedAudit(request, action, reason) {
        const auditId = requireText(this.auditIdFactory(), "audit_id");
        const now = validTimestamp("audit timestamp", this.now()).iso;
        this.db.prepare(`
      INSERT INTO secret_access_audit (
        audit_id, action, outcome, reason_code, secret_ref_id, grant_id,
        principal_id, authority_boundary_kind, authority_boundary_id,
        resource_kind, resource_id, purpose,
        operation_id, started_at, completed_at
      ) VALUES (?, ?, 'denied', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(auditId, action, reason, request.secret_ref_id, request.grant_id, request.principal_id, request.authority_boundary.kind, boundaryId(request.authority_boundary), request.resource.kind, request.resource.id, request.purpose, request.operation_id, now, now);
        return this.requireAudit(auditId);
    }
    finishAudit(auditId, outcome, reason) {
        const completedAt = validTimestamp("completed_at", this.now()).iso;
        const result = this.db.prepare(`
      UPDATE secret_access_audit
      SET outcome = ?, reason_code = ?, completed_at = ?
      WHERE audit_id = ? AND outcome = 'started'
    `).run(outcome, reason, completedAt, auditId);
        if (Number(result.changes) !== 1)
            throw new Error(`Secret audit '${auditId}' is not open.`);
        return this.requireAudit(auditId);
    }
    commitBinding(secretRefId, expectedGeneration, expectedBinding, nextBinding, auditId) {
        const updatedAt = validTimestamp("updated_at", this.now()).iso;
        inSavepoint(this.db, "secret_binding", () => {
            const result = this.db.prepare(`
        UPDATE secret_refs
        SET resolution = 'resolved', broker_id = ?, broker_locator = ?,
            generation = generation + 1, updated_at = ?
        WHERE secret_ref_id = ? AND generation = ?
          AND broker_id IS ? AND broker_locator IS ?
      `).run(nextBinding.broker_id, nextBinding.locator, updatedAt, secretRefId, expectedGeneration, expectedBinding?.broker_id ?? null, expectedBinding?.locator ?? null);
            if (Number(result.changes) !== 1)
                throw new SecretBindingConflictError(secretRefId);
            const auditResult = this.db.prepare(`
        UPDATE secret_access_audit
        SET outcome = 'succeeded', reason_code = NULL, completed_at = ?
        WHERE audit_id = ? AND outcome = 'started'
      `).run(updatedAt, auditId);
            if (Number(auditResult.changes) !== 1)
                throw new Error(`Secret audit '${auditId}' is not open.`);
        });
        return this.requireSecretRef(secretRefId);
    }
    commitUnresolved(secretRefId, expectedGeneration, expectedBinding, auditId) {
        const updatedAt = validTimestamp("updated_at", this.now()).iso;
        inSavepoint(this.db, "secret_unbind", () => {
            const result = this.db.prepare(`
        UPDATE secret_refs
        SET resolution = 'unresolved', broker_id = NULL, broker_locator = NULL,
            generation = generation + 1, updated_at = ?
        WHERE secret_ref_id = ? AND generation = ?
          AND broker_id = ? AND broker_locator = ?
      `).run(updatedAt, secretRefId, expectedGeneration, expectedBinding.broker_id, expectedBinding.locator);
            if (Number(result.changes) !== 1)
                throw new SecretBindingConflictError(secretRefId);
            const auditResult = this.db.prepare(`
        UPDATE secret_access_audit
        SET outcome = 'succeeded', reason_code = NULL, completed_at = ?
        WHERE audit_id = ? AND outcome = 'started'
      `).run(updatedAt, auditId);
            if (Number(auditResult.changes) !== 1)
                throw new Error(`Secret audit '${auditId}' is not open.`);
        });
        return this.requireSecretRef(secretRefId);
    }
    listAudit(authorityBoundary) {
        const boundary = normalizeBoundary(authorityBoundary);
        return this.db.prepare(`
      SELECT audit_id, action, outcome, reason_code, secret_ref_id, grant_id,
             principal_id, authority_boundary_kind, authority_boundary_id,
             resource_kind, resource_id, purpose,
             operation_id, started_at, completed_at
      FROM secret_access_audit
      WHERE authority_boundary_kind = ? AND authority_boundary_id = ?
      ORDER BY started_at, audit_id
    `).all(boundary.kind, boundaryId(boundary)).map(auditFromRow);
    }
    importUnresolvedSecretRefs(workspaceId, refs) {
        const targetWorkspaceId = requireText(workspaceId, "workspace_id");
        const normalized = refs.map(normalizePortableSecretRef);
        inSavepoint(this.db, "secret_import", () => {
            for (const ref of normalized) {
                const existing = this.getSecretRef(ref.secret_ref_id);
                if (existing) {
                    const same = existing.resolution === "unresolved"
                        && existing.secret_kind === ref.secret_kind
                        && existing.label === ref.label
                        && sameResource(existing.resource, ref.resource);
                    if (!same)
                        throw new SecretRefImportConflictError(ref.secret_ref_id);
                    continue;
                }
                this.createSecretRef({
                    secret_ref_id: ref.secret_ref_id,
                    owner: { kind: "workspace", workspace_id: targetWorkspaceId },
                    resource: ref.resource,
                    secret_kind: ref.secret_kind,
                    label: ref.label,
                });
            }
        });
        return normalized.map((ref) => this.requireSecretRef(ref.secret_ref_id));
    }
    requireSecretRef(secretRefId) {
        const ref = this.getSecretRef(secretRefId);
        if (!ref)
            throw new Error(`SecretRef '${secretRefId}' was not persisted.`);
        return ref;
    }
    requireGrantConstraint(grantId) {
        const constraint = this.getGrantConstraint(grantId);
        if (!constraint)
            throw new Error(`Secret grant constraint '${grantId}' was not persisted.`);
        return constraint;
    }
    requireAudit(auditId) {
        const row = this.db.prepare(`
      SELECT audit_id, action, outcome, reason_code, secret_ref_id, grant_id,
             principal_id, authority_boundary_kind, authority_boundary_id,
             resource_kind, resource_id, purpose,
             operation_id, started_at, completed_at
      FROM secret_access_audit WHERE audit_id = ?
    `).get(auditId);
        if (!row)
            throw new Error(`Secret audit '${auditId}' was not persisted.`);
        return auditFromRow(row);
    }
}
export class SecretRefImportConflictError extends Error {
    secret_ref_id;
    error_code = "E_SECRET_REF_IMPORT_CONFLICT";
    constructor(secret_ref_id) {
        super(`Imported SecretRef '${secret_ref_id}' conflicts with existing Workspace metadata.`);
        this.secret_ref_id = secret_ref_id;
        this.name = "SecretRefImportConflictError";
    }
}
export class SecretRefExportValidationError extends Error {
    reason;
    error_code = "E_SECRET_REF_EXPORT_INVALID";
    constructor(reason) {
        super(`Invalid SecretRef export: ${reason}.`);
        this.reason = reason;
        this.name = "SecretRefExportValidationError";
    }
}
/**
 * Produces a portable unresolved inventory. Host broker identifiers, locators,
 * grants, audit history, and secret values are intentionally absent.
 */
export function exportSecretRefs(store, workspaceId) {
    const sourceWorkspaceId = requireText(workspaceId, "workspace_id");
    return {
        schema: "floe.secret-refs.v1",
        source_workspace_id: sourceWorkspaceId,
        secret_refs: store.listSecretRefs({ kind: "workspace", workspace_id: sourceWorkspaceId }).map((ref) => ({
            secret_ref_id: ref.secret_ref_id,
            resource: ref.resource,
            secret_kind: ref.secret_kind,
            label: ref.label,
            resolution: "unresolved",
        })),
    };
}
/** Parses the closed portable shape and refuses fields that could smuggle a secret. */
export function parseSecretRefExport(value) {
    let parsed;
    try {
        parsed = typeof value === "string" ? JSON.parse(value) : value;
    }
    catch {
        throw new SecretRefExportValidationError("content is not valid JSON");
    }
    const document = requirePlainObject(parsed, "document", SecretRefExportValidationError);
    requireExactKeys(document, ["schema", "source_workspace_id", "secret_refs"], "document", SecretRefExportValidationError);
    if (document.schema !== "floe.secret-refs.v1") {
        throw new SecretRefExportValidationError("schema is not floe.secret-refs.v1");
    }
    if (!Array.isArray(document.secret_refs)) {
        throw new SecretRefExportValidationError("secret_refs must be an array");
    }
    const sourceWorkspaceId = exportText(document.source_workspace_id, "source_workspace_id");
    const refs = document.secret_refs.map((item, index) => {
        const candidate = requirePlainObject(item, `secret_refs[${index}]`, SecretRefExportValidationError);
        requireExactKeys(candidate, ["secret_ref_id", "resource", "secret_kind", "label", "resolution"], `secret_refs[${index}]`, SecretRefExportValidationError);
        if (candidate.resolution !== "unresolved") {
            throw new SecretRefExportValidationError(`secret_refs[${index}].resolution must be unresolved`);
        }
        const resourceObject = requirePlainObject(candidate.resource, `secret_refs[${index}].resource`, SecretRefExportValidationError);
        requireExactKeys(resourceObject, ["kind", "id"], `secret_refs[${index}].resource`, SecretRefExportValidationError);
        return normalizePortableSecretRef({
            secret_ref_id: exportText(candidate.secret_ref_id, `secret_refs[${index}].secret_ref_id`),
            resource: {
                kind: exportText(resourceObject.kind, `secret_refs[${index}].resource.kind`),
                id: exportText(resourceObject.id, `secret_refs[${index}].resource.id`),
            },
            secret_kind: exportText(candidate.secret_kind, `secret_refs[${index}].secret_kind`),
            label: exportText(candidate.label, `secret_refs[${index}].label`),
            resolution: "unresolved",
        });
    });
    const identities = new Set();
    for (const ref of refs) {
        if (identities.has(ref.secret_ref_id)) {
            throw new SecretRefExportValidationError(`duplicate SecretRef '${ref.secret_ref_id}'`);
        }
        identities.add(ref.secret_ref_id);
    }
    return {
        schema: "floe.secret-refs.v1",
        source_workspace_id: sourceWorkspaceId,
        secret_refs: refs,
    };
}
export function importSecretRefs(store, targetWorkspaceId, value) {
    const document = parseSecretRefExport(value);
    return store.importUnresolvedSecretRefs(targetWorkspaceId, document.secret_refs);
}
/**
 * Trusted broker coordinator. Semantic operations may invoke this service after
 * authentication, but they must never expose its broker or callbacks directly.
 */
export class CredentialBrokerService {
    store;
    capabilityGrants;
    brokers;
    mutationTails = new Map();
    constructor(store, capabilityGrants, brokers) {
        this.store = store;
        this.capabilityGrants = capabilityGrants;
        const registered = new Map();
        for (const broker of brokers) {
            requireText(broker.broker_id, "broker_id");
            if (registered.has(broker.broker_id))
                throw new Error(`Duplicate credential broker '${broker.broker_id}'.`);
            registered.set(broker.broker_id, broker);
        }
        this.brokers = registered;
    }
    async bindSecretRef(input) {
        return this.serializeMutation(input.request, async () => {
            const ref = this.requireAccess(input.request, "bind", { allow_unresolved: true, require_unresolved: true });
            requireSecretMaterial(input.material);
            const broker = this.requireBroker(input.broker_id, input.request, "bind");
            const audit = this.store.startAudit(input.request, "bind");
            let locator = null;
            try {
                locator = await broker.store({
                    secret_ref_id: ref.secret_ref_id,
                    owner: ref.owner,
                    generation: ref.generation + 1,
                    material: input.material,
                });
                const expectedDigest = secretMaterialDigest(input.material);
                let verified = false;
                try {
                    verified = await broker.withSecret(locator, (stored) => {
                        const actualDigest = secretMaterialDigest(stored);
                        try {
                            return timingSafeEqual(expectedDigest, actualDigest);
                        }
                        finally {
                            actualDigest.fill(0);
                        }
                    });
                }
                finally {
                    expectedDigest.fill(0);
                }
                if (!verified)
                    throw new Error("Credential broker verification failed.");
                const binding = { broker_id: broker.broker_id, locator: requireText(locator, "broker locator") };
                return this.store.commitBinding(ref.secret_ref_id, ref.generation, null, binding, audit.audit_id);
            }
            catch (error) {
                if (locator !== null) {
                    try {
                        await broker.remove(locator);
                    }
                    catch {
                        // The trusted broker owns cleanup/recovery. Never include locator or material in the thrown error.
                    }
                }
                this.tryFinishFailedAudit(audit.audit_id, error);
                if (error instanceof SecretBindingConflictError)
                    throw error;
                throw new CredentialBrokerOperationError();
            }
        });
    }
    async useSecret(request, operation) {
        const ref = this.requireAccess(request, "use");
        const binding = ref.binding;
        const broker = this.requireBroker(binding.broker_id, request, "use");
        const audit = this.store.startAudit(request, "use");
        try {
            const result = await broker.withSecret(binding.locator, operation);
            this.store.finishAudit(audit.audit_id, "succeeded", null);
            return result;
        }
        catch (error) {
            this.tryFinishFailedAudit(audit.audit_id, error);
            if (error instanceof BrokerSecretNotFoundError) {
                throw new SecretAccessDeniedError("broker_secret_missing");
            }
            throw new CredentialBrokerOperationError();
        }
    }
    async inspectHealth(request) {
        const ref = this.requireAccess(request, "health", { allow_unresolved: true });
        if (ref.resolution === "unresolved" || !ref.binding) {
            const audit = this.store.startAudit(request, "health");
            this.store.finishAudit(audit.audit_id, "succeeded", null);
            return {
                secret_ref_id: ref.secret_ref_id,
                owner: ref.owner,
                resolution: "unresolved",
                material: "unavailable",
                generation: ref.generation,
            };
        }
        const broker = this.requireBroker(ref.binding.broker_id, request, "health");
        const audit = this.store.startAudit(request, "health");
        try {
            const available = await broker.withSecret(ref.binding.locator, () => true);
            this.store.finishAudit(audit.audit_id, "succeeded", null);
            return {
                secret_ref_id: ref.secret_ref_id,
                owner: ref.owner,
                resolution: "resolved",
                material: available ? "available" : "missing",
                generation: ref.generation,
            };
        }
        catch (error) {
            if (error instanceof BrokerSecretNotFoundError) {
                this.store.finishAudit(audit.audit_id, "succeeded", null);
                return {
                    secret_ref_id: ref.secret_ref_id,
                    owner: ref.owner,
                    resolution: "resolved",
                    material: "missing",
                    generation: ref.generation,
                };
            }
            this.tryFinishFailedAudit(audit.audit_id, error);
            throw new CredentialBrokerOperationError();
        }
    }
    async rotateSecretRef(input) {
        return this.replaceSecret(input.request, "rotate", async () => input.material);
    }
    async refreshSecretRef(request, refresh) {
        return this.replaceSecret(request, "refresh", refresh);
    }
    async revokeSecretRef(request) {
        return this.serializeMutation(request, async () => {
            const ref = this.requireAccess(request, "revoke");
            const binding = ref.binding;
            const broker = this.requireBroker(binding.broker_id, request, "revoke");
            const audit = this.store.startAudit(request, "revoke");
            try {
                await broker.remove(binding.locator);
                return this.store.commitUnresolved(ref.secret_ref_id, ref.generation, binding, audit.audit_id);
            }
            catch (error) {
                this.tryFinishFailedAudit(audit.audit_id, error);
                if (error instanceof SecretBindingConflictError)
                    throw error;
                throw new CredentialBrokerOperationError();
            }
        });
    }
    async replaceSecret(request, action, replacement) {
        return this.serializeMutation(request, async () => {
            const ref = this.requireAccess(request, action);
            const binding = ref.binding;
            const broker = this.requireBroker(binding.broker_id, request, action);
            const audit = this.store.startAudit(request, action);
            try {
                const nextMaterial = await broker.withSecret(binding.locator, async (currentMaterial) => {
                    const proposed = await replacement(currentMaterial);
                    requireSecretMaterial(proposed);
                    return copyMaterial(proposed);
                });
                try {
                    await broker.replaceAtomic(binding.locator, nextMaterial);
                }
                finally {
                    nextMaterial.fill(0);
                }
                return this.store.commitBinding(ref.secret_ref_id, ref.generation, binding, binding, audit.audit_id);
            }
            catch (error) {
                this.tryFinishFailedAudit(audit.audit_id, error);
                if (error instanceof SecretBindingConflictError)
                    throw error;
                if (error instanceof BrokerSecretNotFoundError) {
                    throw new SecretAccessDeniedError("broker_secret_missing");
                }
                throw new CredentialBrokerOperationError();
            }
        });
    }
    requireAccess(request, action, options = {}) {
        validateAccessRequest(request);
        const ref = this.store.getSecretRef(request.secret_ref_id);
        const grantInspection = this.capabilityGrants.inspectSessionGrantIds({
            principal_id: request.principal_id,
            boundary: request.authority_boundary,
            grant_ids: [request.grant_id],
        });
        const grant = grantInspection.active_grants[0] ?? null;
        const grantFailure = grantInspection.unavailable_grants[0]?.code ?? null;
        const constraint = this.store.getGrantConstraint(request.grant_id);
        const reason = inspectSecretAccess(request, ref, grant, grantFailure, constraint, options);
        if (reason !== null || ref === null) {
            const refusal = reason ?? "secret_ref_not_found";
            this.store.recordDeniedAudit(request, action, refusal);
            throw new SecretAccessDeniedError(refusal);
        }
        return ref;
    }
    requireBroker(brokerId, request, action) {
        const broker = this.brokers.get(brokerId);
        if (!broker) {
            this.store.recordDeniedAudit(request, action, "broker_unavailable");
            throw new SecretAccessDeniedError("broker_unavailable");
        }
        return broker;
    }
    tryFinishFailedAudit(auditId, error) {
        try {
            this.store.finishAudit(auditId, "failed", error instanceof BrokerSecretNotFoundError ? "broker_secret_missing" : "broker_operation_failed");
        }
        catch {
            // Preserve the first safe failure; never attach an error that may carry provider data.
        }
    }
    /** Serializes refresh/rotation for one SecretRef inside this broker process. */
    async serializeMutation(request, operation) {
        const key = `${boundaryKey(request.authority_boundary)}\0${request.secret_ref_id}`;
        const previous = this.mutationTails.get(key) ?? Promise.resolve();
        let release;
        const current = new Promise((resolve) => {
            release = resolve;
        });
        const tail = previous.then(() => current);
        this.mutationTails.set(key, tail);
        await previous;
        try {
            return await operation();
        }
        finally {
            release();
            if (this.mutationTails.get(key) === tail)
                this.mutationTails.delete(key);
        }
    }
}
/**
 * Inspects already-loaded legacy JSON in memory and produces metadata only.
 * It performs no file write, broker write, import, source deletion, or secret copy.
 */
export function planLegacyAuthJsonMigration(input, dependencies = {}) {
    const document = requirePlainObject(input.legacy_auth_json, "legacy auth.json", Error);
    const sourcePath = requireText(input.source_path, "source_path");
    const sourceFingerprint = requireText(input.source_fingerprint, "source_fingerprint");
    const workspaceId = requireText(input.target_workspace_id, "target_workspace_id");
    const resource = normalizeResource(input.resource);
    const planId = requireText(dependencies.plan_id_factory?.() ?? `authmigration_${randomUUID()}`, "plan_id");
    const secretRefIdFactory = dependencies.secret_ref_id_factory
        ?? ((sourceEntry, index) => `secretref_legacy_${index + 1}_${sourceEntry}`);
    const actions = Object.entries(document)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([sourceEntry, rawCredential], index) => {
        const safeSourceEntry = requireStableLegacyEntry(sourceEntry);
        const credential = requirePlainObject(rawCredential, `legacy auth entry '${safeSourceEntry}'`, Error);
        const credentialKind = credential.type === "api_key" || credential.type === "oauth"
            ? credential.type
            : "unknown";
        return {
            source_entry: safeSourceEntry,
            credential_kind: credentialKind,
            planned_secret_ref: {
                secret_ref_id: requireText(secretRefIdFactory(safeSourceEntry, index), "planned secret_ref_id"),
                resource,
                secret_kind: "provider-credential",
                label: safeSourceEntry,
                resolution: "unresolved",
            },
            transfer: "explicit_trusted_broker_action_required",
        };
    });
    return {
        schema: "floe.legacy-auth-migration-plan.v1",
        plan_id: planId,
        phase: "dry_run",
        source: {
            kind: "legacy_auth_json",
            path: sourcePath,
            fingerprint: sourceFingerprint,
            disposition: "preserve_until_verified",
        },
        target_workspace_id: workspaceId,
        automatic_secret_copy: false,
        actions,
    };
}
/** Assessment only. Even a verified plan never deletes the legacy source. */
export function assessLegacyAuthMigrationVerification(plan, verifiedSecretRefIds) {
    const verified = new Set(verifiedSecretRefIds);
    const expected = plan.actions.map((action) => action.planned_secret_ref.secret_ref_id);
    const unresolved = expected.filter((secretRefId) => !verified.has(secretRefId));
    return {
        plan_id: plan.plan_id,
        verified: unresolved.length === 0,
        unresolved_secret_ref_ids: unresolved,
        source_disposition: unresolved.length === 0 ? "eligible_for_explicit_cleanup" : "preserve",
        cleanup_requires_explicit_confirmation: true,
    };
}
function secretRefFromRow(row) {
    const binding = row.resolution === "resolved"
        ? { broker_id: row.broker_id, locator: row.broker_locator }
        : null;
    return {
        secret_ref_id: row.secret_ref_id,
        owner: boundaryFromParts(row.owner_kind, row.owner_id),
        resource: { kind: row.resource_kind, id: row.resource_id },
        secret_kind: row.secret_kind,
        label: row.label,
        resolution: row.resolution,
        binding,
        generation: row.generation,
        created_at: row.created_at,
        updated_at: row.updated_at,
    };
}
function auditFromRow(row) {
    return {
        audit_id: row.audit_id,
        action: row.action,
        outcome: row.outcome,
        reason_code: row.reason_code,
        secret_ref_id: row.secret_ref_id,
        grant_id: row.grant_id,
        principal_id: row.principal_id,
        authority_boundary: boundaryFromParts(row.authority_boundary_kind, row.authority_boundary_id),
        resource: { kind: row.resource_kind, id: row.resource_id },
        purpose: row.purpose,
        operation_id: row.operation_id,
        started_at: row.started_at,
        completed_at: row.completed_at,
    };
}
function normalizeResource(resource) {
    return {
        kind: requireText(resource.kind, "resource kind"),
        id: requireText(resource.id, "resource id"),
    };
}
function sameResource(left, right) {
    return left.kind === right.kind && left.id === right.id;
}
function inspectSecretAccess(request, ref, grant, grantFailure, constraint, options) {
    if (grantFailure !== null)
        return grantFailure;
    if (!grant)
        return "grant_not_found";
    if (!ref)
        return "secret_ref_not_found";
    if (ref.owner.kind === "workspace" && !sameBoundary(ref.owner, request.authority_boundary)) {
        return "grant_boundary_mismatch";
    }
    if (options.require_unresolved && ref.resolution !== "unresolved")
        return "secret_ref_already_resolved";
    if (!options.allow_unresolved && ref.resolution !== "resolved")
        return "secret_ref_unresolved";
    if (!grant.operation_ids.includes(request.operation_id))
        return "grant_operation_mismatch";
    if (!hasExactGrantTarget(grant, "secret_ref", request.secret_ref_id)) {
        return "grant_secret_ref_target_mismatch";
    }
    if (!hasExactGrantTarget(grant, request.resource.kind, request.resource.id)) {
        return "grant_resource_target_mismatch";
    }
    if (!constraint
        || !sameBoundary(constraint.authority_boundary, request.authority_boundary)
        || constraint.secret_ref_id !== request.secret_ref_id) {
        return "grant_constraint_not_found";
    }
    if (!constraint.purposes.includes(request.purpose))
        return "grant_purpose_mismatch";
    return null;
}
function hasExactGrantTarget(grant, kind, id) {
    return grant.targets.some((target) => target.kind === kind && target.id === id);
}
function normalizeTextSet(values, label, required) {
    if (required && values.length === 0)
        throw new Error(`Secret grant constraint ${label} list must not be empty.`);
    return [...new Set(values.map((value) => requireText(value, label)))].sort((left, right) => left.localeCompare(right));
}
function validateAccessRequest(request) {
    requireText(request.secret_ref_id, "secret_ref_id");
    requireText(request.grant_id, "grant_id");
    requireText(request.principal_id, "principal_id");
    normalizeBoundary(request.authority_boundary);
    normalizeResource(request.resource);
    requireText(request.purpose, "purpose");
    requireText(request.operation_id, "operation_id");
}
function normalizePortableSecretRef(value) {
    if (value.resolution !== "unresolved") {
        throw new SecretRefExportValidationError("portable SecretRef resolution must be unresolved");
    }
    return {
        secret_ref_id: requireText(value.secret_ref_id, "secret_ref_id"),
        resource: normalizeResource(value.resource),
        secret_kind: requireText(value.secret_kind, "secret_kind"),
        label: requireText(value.label, "label"),
        resolution: "unresolved",
    };
}
function requireSecretMaterial(material) {
    if (!(material instanceof Uint8Array) || material.byteLength === 0) {
        throw new Error("Credential broker secret material must be non-empty bytes.");
    }
}
function copyMaterial(material) {
    return new Uint8Array(material);
}
function secretMaterialDigest(material) {
    return createHash("sha256")
        .update("floe-credential-material-verification:v1\0", "utf8")
        .update(material)
        .digest();
}
function withoutMaterial(request) {
    return {
        secret_ref_id: request.secret_ref_id,
        owner: request.owner,
        generation: request.generation,
    };
}
function normalizeBoundary(boundary) {
    if (boundary?.kind === "workspace") {
        return { kind: "workspace", workspace_id: requireText(boundary.workspace_id, "Workspace boundary") };
    }
    if (boundary?.kind === "host") {
        return { kind: "host", host_id: requireText(boundary.host_id, "host boundary") };
    }
    throw new Error("Secret authority boundary is invalid.");
}
function boundaryId(boundary) {
    return boundary.kind === "workspace" ? boundary.workspace_id : boundary.host_id;
}
function boundaryKey(boundary) {
    return `${boundary.kind}:${boundaryId(boundary)}`;
}
function boundaryFromParts(kind, id) {
    return kind === "workspace"
        ? { kind: "workspace", workspace_id: id }
        : { kind: "host", host_id: id };
}
function sameBoundary(left, right) {
    return left.kind === right.kind && boundaryId(left) === boundaryId(right);
}
function requireText(value, label) {
    if (typeof value !== "string" || !value.trim() || /[\u0000-\u001f\u007f]/.test(value)) {
        throw new Error(`${label} must be non-empty text without control characters.`);
    }
    return value;
}
function validTimestamp(label, value) {
    const ms = Date.parse(value);
    if (!Number.isFinite(ms))
        throw new Error(`${label} must be an ISO timestamp.`);
    return { iso: value, ms };
}
function requireStableLegacyEntry(value) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)) {
        throw new Error("Legacy auth entry names must be stable identifiers before migration can be planned.");
    }
    return value;
}
function requirePlainObject(value, label, ErrorType) {
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
        throw new ErrorType(`${label} must be a plain object`);
    }
    return value;
}
function requireExactKeys(value, expectedKeys, label, ErrorType) {
    const expected = new Set(expectedKeys);
    const unexpected = Object.keys(value).filter((key) => !expected.has(key));
    const missing = expectedKeys.filter((key) => !(key in value));
    if (unexpected.length > 0 || missing.length > 0) {
        throw new ErrorType(`${label} has unexpected or missing fields`);
    }
}
function exportText(value, label) {
    try {
        return requireText(value, label);
    }
    catch {
        throw new SecretRefExportValidationError(`${label} must be non-empty safe text`);
    }
}
let savepointSequence = 0;
function inSavepoint(db, prefix, operation) {
    savepointSequence += 1;
    const name = `${prefix}_${savepointSequence}`;
    db.exec(`SAVEPOINT ${name}`);
    try {
        const result = operation();
        db.exec(`RELEASE SAVEPOINT ${name}`);
        return result;
    }
    catch (error) {
        db.exec(`ROLLBACK TO SAVEPOINT ${name}`);
        db.exec(`RELEASE SAVEPOINT ${name}`);
        throw error;
    }
}
function isoNow() {
    return new Date().toISOString();
}
