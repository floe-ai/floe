import { createHash, randomUUID } from "node:crypto";
export class AuditConflictError extends Error {
    invocation_id;
    reason;
    code = "E_AUDIT_CONFLICT";
    constructor(invocation_id, reason) {
        super(`Audit for invocation '${invocation_id}' conflicts: ${reason}`);
        this.invocation_id = invocation_id;
        this.reason = reason;
        this.name = "AuditConflictError";
    }
}
export class AuditValidationError extends Error {
    reason;
    code = "E_AUDIT_INVALID";
    constructor(reason) {
        super(`Invalid audit record: ${reason}`);
        this.reason = reason;
        this.name = "AuditValidationError";
    }
}
export function applyAuditSchema(db) {
    db.exec(`
    CREATE TABLE IF NOT EXISTS audit_requests (
      audit_id TEXT PRIMARY KEY,
      workspace_id TEXT,
      invocation_id TEXT NOT NULL UNIQUE,
      principal_id TEXT NOT NULL,
      boundary_kind TEXT NOT NULL CHECK (boundary_kind IN ('workspace', 'host')),
      boundary_id TEXT NOT NULL,
      capability_grant_ids_json TEXT NOT NULL,
      interaction_mode TEXT NOT NULL CHECK (interaction_mode IN ('interactive', 'unattended', 'brokered')),
      operation_id TEXT NOT NULL,
      operation_version TEXT NOT NULL,
      target_before_json TEXT,
      expected_resource_revision TEXT,
      idempotency_key TEXT NOT NULL,
      input_schema_version TEXT NOT NULL,
      input_digest TEXT NOT NULL,
      request_summary_json TEXT NOT NULL,
      reason TEXT,
      artefact_version_ids_json TEXT NOT NULL,
      provenance_json TEXT NOT NULL,
      policy_evaluation_id TEXT,
      budget_reservation_id TEXT,
      request_digest TEXT NOT NULL,
      started_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_audit_requests_workspace_time
      ON audit_requests(workspace_id, started_at DESC, audit_id DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_requests_principal_time
      ON audit_requests(principal_id, started_at DESC, audit_id DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_requests_operation_time
      ON audit_requests(operation_id, started_at DESC, audit_id DESC);

    CREATE TABLE IF NOT EXISTS audit_outcomes (
      audit_id TEXT PRIMARY KEY REFERENCES audit_requests(audit_id),
      state TEXT NOT NULL CHECK (state IN ('accepted', 'completed', 'refused', 'outcome_unknown')),
      result_schema_version TEXT NOT NULL,
      result_digest TEXT,
      result_summary_json TEXT NOT NULL,
      refusal_json TEXT,
      changed_refs_json TEXT NOT NULL,
      target_after_json TEXT,
      prior_state_digest TEXT,
      resulting_state_digest TEXT,
      affected_artefact_version_ids_json TEXT NOT NULL,
      completed_at TEXT NOT NULL,
      outcome_digest TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_audit_outcomes_state_time
      ON audit_outcomes(state, completed_at DESC, audit_id DESC);
  `);
}
export class AuditStore {
    db;
    now;
    constructor(db, dependencies = {}) {
        this.db = db;
        this.now = dependencies.now ?? (() => new Date().toISOString());
    }
    begin(input) {
        const normalized = normalizeRequest({
            ...input,
            audit_id: input.audit_id ?? `audit_${randomUUID()}`,
            request_digest: "",
            started_at: input.started_at ?? this.now(),
        });
        const requestDigest = digest(requestDigestContent(normalized));
        const record = { ...normalized, request_digest: requestDigest };
        const existing = this.getByInvocationId(record.invocation_id)?.request ?? null;
        if (existing) {
            if (existing.request_digest !== requestDigest) {
                throw new AuditConflictError(record.invocation_id, "the invocation was already recorded with a different request");
            }
            return existing;
        }
        try {
            this.db.prepare(`
        INSERT INTO audit_requests (
          audit_id, workspace_id, invocation_id, principal_id,
          boundary_kind, boundary_id, capability_grant_ids_json, interaction_mode,
          operation_id, operation_version, target_before_json, expected_resource_revision,
          idempotency_key, input_schema_version, input_digest, request_summary_json,
          reason, artefact_version_ids_json, provenance_json,
          policy_evaluation_id, budget_reservation_id, request_digest, started_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(record.audit_id, record.workspace_id, record.invocation_id, record.principal_id, record.authority_boundary.kind, boundaryId(record.authority_boundary), JSON.stringify(record.capability_grant_ids), record.interaction_mode, record.operation_id, record.operation_version, record.target_before ? JSON.stringify(record.target_before) : null, record.expected_resource_revision, record.idempotency_key, record.input_schema_version, record.input_digest, JSON.stringify(record.request_summary), record.reason, JSON.stringify(record.artefact_version_ids), JSON.stringify(record.provenance), record.policy_evaluation_id, record.budget_reservation_id, record.request_digest, record.started_at);
        }
        catch (error) {
            if (String(error).includes("UNIQUE constraint failed")) {
                const concurrent = this.getByInvocationId(record.invocation_id)?.request;
                if (concurrent?.request_digest === requestDigest)
                    return concurrent;
                throw new AuditConflictError(record.invocation_id, "the invocation was recorded concurrently with different evidence");
            }
            throw error;
        }
        return this.require(record.audit_id).request;
    }
    complete(input) {
        const request = this.require(input.audit_id).request;
        const outcome = normalizeOutcome({ ...input, completed_at: input.completed_at ?? this.now() });
        const outcomeDigest = digest(outcome);
        const existing = this.getOutcome(request.audit_id);
        if (existing) {
            const row = this.db.prepare("SELECT outcome_digest FROM audit_outcomes WHERE audit_id = ?")
                .get(request.audit_id);
            if (row.outcome_digest !== outcomeDigest) {
                throw new AuditConflictError(request.invocation_id, "the outcome was already recorded differently");
            }
            return existing;
        }
        try {
            this.db.prepare(`
        INSERT INTO audit_outcomes (
          audit_id, state, result_schema_version, result_digest,
          result_summary_json, refusal_json, changed_refs_json, target_after_json,
          prior_state_digest, resulting_state_digest,
          affected_artefact_version_ids_json, completed_at, outcome_digest
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(outcome.audit_id, outcome.state, outcome.result_schema_version, outcome.result_digest, JSON.stringify(outcome.result_summary), outcome.refusal ? JSON.stringify(outcome.refusal) : null, JSON.stringify(outcome.changed_refs), outcome.target_after ? JSON.stringify(outcome.target_after) : null, outcome.prior_state_digest, outcome.resulting_state_digest, JSON.stringify(outcome.affected_artefact_version_ids), outcome.completed_at, outcomeDigest);
        }
        catch (error) {
            if (String(error).includes("UNIQUE constraint failed")) {
                const concurrent = this.getOutcome(request.audit_id);
                const row = this.db.prepare("SELECT outcome_digest FROM audit_outcomes WHERE audit_id = ?")
                    .get(request.audit_id);
                if (concurrent && row?.outcome_digest === outcomeDigest)
                    return concurrent;
                throw new AuditConflictError(request.invocation_id, "the outcome was recorded concurrently with different evidence");
            }
            throw error;
        }
        return this.getOutcome(request.audit_id);
    }
    get(auditId) {
        const row = this.db.prepare("SELECT * FROM audit_requests WHERE audit_id = ?")
            .get(auditId);
        return row ? { request: mapRequest(row), outcome: this.getOutcome(auditId) } : null;
    }
    require(auditId) {
        const record = this.get(auditId);
        if (!record)
            throw new AuditValidationError(`audit '${auditId}' was not found`);
        return record;
    }
    getByInvocationId(invocationId) {
        const row = this.db.prepare("SELECT * FROM audit_requests WHERE invocation_id = ?")
            .get(invocationId);
        return row ? { request: mapRequest(row), outcome: this.getOutcome(row.audit_id) } : null;
    }
    list(input = {}) {
        const clauses = [];
        const values = [];
        if (input.workspace_id !== undefined) {
            clauses.push(input.workspace_id === null ? "r.workspace_id IS NULL" : "r.workspace_id = ?");
            if (input.workspace_id !== null)
                values.push(input.workspace_id);
        }
        if (input.principal_id) {
            clauses.push("r.principal_id = ?");
            values.push(input.principal_id);
        }
        if (input.operation_id) {
            clauses.push("r.operation_id = ?");
            values.push(input.operation_id);
        }
        if (input.state) {
            clauses.push("o.state = ?");
            values.push(input.state);
        }
        const limit = Math.min(Math.max(Math.floor(input.limit ?? 100), 1), 500);
        const rows = this.db.prepare(`
      SELECT r.* FROM audit_requests r
      LEFT JOIN audit_outcomes o ON o.audit_id = r.audit_id
      ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
      ORDER BY r.started_at DESC, r.audit_id DESC LIMIT ?
    `).all(...values, limit);
        return rows.map((row) => ({ request: mapRequest(row), outcome: this.getOutcome(row.audit_id) }));
    }
    getOutcome(auditId) {
        const row = this.db.prepare("SELECT * FROM audit_outcomes WHERE audit_id = ?")
            .get(auditId);
        return row ? mapOutcome(row) : null;
    }
}
export function auditValueDigest(value) {
    return digest(value);
}
function normalizeRequest(record) {
    const boundary = record.authority_boundary.kind === "workspace"
        ? { kind: "workspace", workspace_id: requiredText(record.authority_boundary.workspace_id, "workspace_id") }
        : { kind: "host", host_id: requiredText(record.authority_boundary.host_id, "host_id") };
    const workspaceId = boundary.kind === "workspace" ? boundary.workspace_id : null;
    if (record.workspace_id !== workspaceId) {
        throw new AuditValidationError("workspace_id must match the authenticated authority boundary");
    }
    return {
        audit_id: requiredText(record.audit_id, "audit_id"),
        workspace_id: workspaceId,
        invocation_id: requiredText(record.invocation_id, "invocation_id"),
        principal_id: requiredText(record.principal_id, "principal_id"),
        authority_boundary: boundary,
        capability_grant_ids: uniqueText(record.capability_grant_ids),
        interaction_mode: record.interaction_mode,
        operation_id: requiredText(record.operation_id, "operation_id"),
        operation_version: requiredText(record.operation_version, "operation_version"),
        target_before: record.target_before ? normalizeRef(record.target_before) : null,
        expected_resource_revision: nullableText(record.expected_resource_revision),
        idempotency_key: requiredText(record.idempotency_key, "idempotency_key"),
        input_schema_version: requiredText(record.input_schema_version, "input_schema_version"),
        input_digest: requiredDigest(record.input_digest, "input_digest"),
        request_summary: safeJsonObject(record.request_summary, "request_summary"),
        reason: nullableText(record.reason),
        artefact_version_ids: uniqueText(record.artefact_version_ids),
        provenance: normalizeProvenance(record.provenance),
        policy_evaluation_id: nullableText(record.policy_evaluation_id),
        budget_reservation_id: nullableText(record.budget_reservation_id),
        request_digest: record.request_digest,
        started_at: validTime(record.started_at, "started_at"),
    };
}
function normalizeOutcome(record) {
    if (!["accepted", "completed", "refused", "outcome_unknown"].includes(record.state)) {
        throw new AuditValidationError("outcome state is invalid");
    }
    if (record.state === "refused" && !record.refusal) {
        throw new AuditValidationError("a refused outcome requires its structured refusal");
    }
    if ((record.state === "accepted" || record.state === "completed") && record.refusal) {
        throw new AuditValidationError("an accepted or completed outcome cannot contain a refusal");
    }
    return {
        audit_id: requiredText(record.audit_id, "audit_id"),
        state: record.state,
        result_schema_version: requiredText(record.result_schema_version, "result_schema_version"),
        result_digest: record.result_digest == null ? null : requiredDigest(record.result_digest, "result_digest"),
        result_summary: safeJsonObject(record.result_summary, "result_summary"),
        refusal: record.refusal,
        changed_refs: record.changed_refs.map(normalizeRef),
        target_after: record.target_after ? normalizeRef(record.target_after) : null,
        prior_state_digest: record.prior_state_digest == null ? null : requiredDigest(record.prior_state_digest, "prior_state_digest"),
        resulting_state_digest: record.resulting_state_digest == null ? null : requiredDigest(record.resulting_state_digest, "resulting_state_digest"),
        affected_artefact_version_ids: uniqueText(record.affected_artefact_version_ids),
        completed_at: validTime(record.completed_at, "completed_at"),
    };
}
function requestDigestContent(record) {
    const { audit_id: _auditId, request_digest: _requestDigest, ...content } = record;
    return content;
}
function mapRequest(row) {
    const authorityBoundary = row.boundary_kind === "workspace"
        ? { kind: "workspace", workspace_id: row.boundary_id }
        : { kind: "host", host_id: row.boundary_id };
    return {
        audit_id: String(row.audit_id),
        workspace_id: row.workspace_id == null ? null : String(row.workspace_id),
        invocation_id: String(row.invocation_id),
        principal_id: String(row.principal_id),
        authority_boundary: authorityBoundary,
        capability_grant_ids: JSON.parse(row.capability_grant_ids_json),
        interaction_mode: row.interaction_mode,
        operation_id: String(row.operation_id),
        operation_version: String(row.operation_version),
        target_before: row.target_before_json ? JSON.parse(row.target_before_json) : null,
        expected_resource_revision: row.expected_resource_revision == null ? null : String(row.expected_resource_revision),
        idempotency_key: String(row.idempotency_key),
        input_schema_version: String(row.input_schema_version),
        input_digest: String(row.input_digest),
        request_summary: JSON.parse(row.request_summary_json),
        reason: row.reason == null ? null : String(row.reason),
        artefact_version_ids: JSON.parse(row.artefact_version_ids_json),
        provenance: JSON.parse(row.provenance_json),
        policy_evaluation_id: row.policy_evaluation_id == null ? null : String(row.policy_evaluation_id),
        budget_reservation_id: row.budget_reservation_id == null ? null : String(row.budget_reservation_id),
        request_digest: String(row.request_digest),
        started_at: String(row.started_at),
    };
}
function mapOutcome(row) {
    return {
        audit_id: String(row.audit_id),
        state: row.state,
        result_schema_version: String(row.result_schema_version),
        result_digest: row.result_digest == null ? null : String(row.result_digest),
        result_summary: JSON.parse(row.result_summary_json),
        refusal: row.refusal_json ? JSON.parse(row.refusal_json) : null,
        changed_refs: JSON.parse(row.changed_refs_json),
        target_after: row.target_after_json ? JSON.parse(row.target_after_json) : null,
        prior_state_digest: row.prior_state_digest == null ? null : String(row.prior_state_digest),
        resulting_state_digest: row.resulting_state_digest == null ? null : String(row.resulting_state_digest),
        affected_artefact_version_ids: JSON.parse(row.affected_artefact_version_ids_json),
        completed_at: String(row.completed_at),
    };
}
function normalizeRef(ref) {
    return {
        kind: requiredText(ref.kind, "resource kind"),
        id: requiredText(ref.id, "resource id"),
        revision: ref.revision == null ? null : requiredText(ref.revision, "resource revision"),
    };
}
function normalizeProvenance(value) {
    return {
        cause_event_id: nullableText(value.cause_event_id),
        delivery_ids: uniqueText(value.delivery_ids),
        execution_attempt_id: nullableText(value.execution_attempt_id),
        node_execution_id: nullableText(value.node_execution_id),
        scope_execution_id: nullableText(value.scope_execution_id),
    };
}
function safeJsonObject(value, field) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new AuditValidationError(`${field} must be an object`);
    }
    JSON.stringify(value);
    return value;
}
function validTime(value, field) {
    const text = requiredText(value, field);
    if (!Number.isFinite(Date.parse(text)))
        throw new AuditValidationError(`${field} must be a timestamp`);
    return text;
}
function nullableText(value) {
    return value == null ? null : requiredText(value, "audit field");
}
function uniqueText(values) {
    return [...new Set(values.map((value) => requiredText(value, "audit reference")))].sort();
}
function requiredDigest(value, field) {
    const text = requiredText(value, field);
    if (!/^[a-f0-9]{64}$/.test(text))
        throw new AuditValidationError(`${field} must be a SHA-256 digest`);
    return text;
}
function requiredText(value, field) {
    if (typeof value !== "string" || !value.trim())
        throw new AuditValidationError(`${field} is required`);
    return value.trim();
}
function boundaryId(boundary) {
    return boundary.kind === "workspace" ? boundary.workspace_id : boundary.host_id;
}
function digest(value) {
    return createHash("sha256").update(canonicalJson(value)).digest("hex");
}
function canonicalJson(value) {
    if (Array.isArray(value))
        return `[${value.map(canonicalJson).join(",")}]`;
    if (value && typeof value === "object") {
        const entries = Object.entries(value)
            .filter(([, item]) => item !== undefined)
            .sort(([left], [right]) => left.localeCompare(right));
        return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
    }
    return JSON.stringify(value);
}
