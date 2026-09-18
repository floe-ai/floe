import { createHash, randomBytes, randomUUID } from "node:crypto";
/** Installs the authentication state used to derive operation authority. */
export function applyOperationAuthoritySessionSchema(db) {
    const existingColumns = db.prepare("PRAGMA table_info(operation_authority_sessions)")
        .all();
    if (existingColumns.length > 0
        && !existingColumns.some((column) => column.name === "grant_ids_json")) {
        // The earlier unreleased session schema copied grant strings into each
        // session. Those strings cannot be promoted into auditable
        // CapabilityGrants without inventing an issuer or consent evidence.
        // Sessions are deliberately short-lived credentials, so invalidate them
        // during the backed-up schema upgrade instead of manufacturing authority.
        db.exec("DROP TABLE operation_authority_sessions");
    }
    db.exec(`
    CREATE TABLE IF NOT EXISTS operation_authority_sessions (
      authority_session_id TEXT PRIMARY KEY,
      token_hash TEXT NOT NULL UNIQUE,
      principal_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      grant_ids_json TEXT NOT NULL,
      interaction_mode TEXT NOT NULL CHECK (interaction_mode IN ('interactive', 'unattended', 'brokered')),
      interaction_session_id TEXT NOT NULL,
      broker_id TEXT,
      confirmed_prompts_json TEXT NOT NULL,
      approval_refs_json TEXT NOT NULL,
      provenance_json TEXT NOT NULL,
      issued_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      revoked_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_operation_authority_workspace_principal
      ON operation_authority_sessions(workspace_id, principal_id, expires_at DESC);

    CREATE INDEX IF NOT EXISTS idx_operation_authority_expiry
      ON operation_authority_sessions(expires_at)
      WHERE revoked_at IS NULL;
  `);
    const canonicalColumns = db.prepare("PRAGMA table_info(operation_authority_sessions)")
        .all();
    if (!canonicalColumns.some((column) => column.name === "provenance_json")) {
        // Existing short-lived sessions remain valid, but are explicitly recorded
        // as direct sessions with no causal runtime chain.
        db.exec(`
      ALTER TABLE operation_authority_sessions
      ADD COLUMN provenance_json TEXT NOT NULL
      DEFAULT '{"cause_event_id":null,"delivery_ids":[],"execution_attempt_id":null,"node_execution_id":null,"scope_execution_id":null}'
    `);
    }
}
/**
 * Durable session store for credentials issued by a trusted authentication
 * boundary. It persists only a one-way hash of each high-entropy bearer token.
 */
export class SqliteOperationAuthoritySessionStore {
    db;
    capabilityGrants;
    now;
    tokenFactory;
    sessionIdFactory;
    constructor(db, capabilityGrants, dependencies = {}) {
        this.db = db;
        this.capabilityGrants = capabilityGrants;
        this.now = dependencies.now ?? isoNow;
        this.tokenFactory = dependencies.token_factory ?? createBearerToken;
        this.sessionIdFactory = dependencies.session_id_factory ?? (() => `authsession_${randomUUID()}`);
    }
    issueSession(input) {
        assertNonEmpty("principal_id", input.principal_id);
        assertNonEmpty("workspace_id", input.workspace_id);
        assertNonEmpty("interaction.session_id", input.interaction.session_id);
        const issuedAt = this.now();
        const issuedAtMs = parseTimestamp("issued_at", issuedAt);
        const expiresAtMs = parseTimestamp("expires_at", input.expires_at);
        if (expiresAtMs <= issuedAtMs) {
            throw new Error("Operation authority session expiry must be after its issue time.");
        }
        const bearerToken = this.tokenFactory();
        if (bearerToken.length < 32) {
            throw new Error("Operation authority bearer tokens must contain at least 32 characters.");
        }
        const grantIds = this.capabilityGrants.requireActiveSessionGrantIds({
            principal_id: input.principal_id,
            boundary: { kind: "workspace", workspace_id: input.workspace_id },
            grant_ids: input.grant_ids,
        });
        const session = {
            authority_session_id: this.sessionIdFactory(),
            principal_id: input.principal_id,
            boundary: { kind: "workspace", workspace_id: input.workspace_id },
            workspace_id: input.workspace_id,
            grant_ids: grantIds,
            interaction_mode: input.interaction.mode,
            interaction_session_id: input.interaction.session_id,
            broker_id: input.interaction.broker_id ?? null,
            confirmed_prompts: normalizedSet(input.interaction.confirmed_prompts ?? [], "confirmation"),
            approval_refs: normalizedSet(input.interaction.approval_refs ?? [], "approval reference"),
            provenance: normalizeProvenance(input.provenance),
            issued_at: issuedAt,
            expires_at: input.expires_at,
            revoked_at: null,
        };
        this.db.prepare(`
      INSERT INTO operation_authority_sessions (
        authority_session_id, token_hash, principal_id, workspace_id, grant_ids_json,
        interaction_mode, interaction_session_id, broker_id,
        confirmed_prompts_json, approval_refs_json, provenance_json,
        issued_at, expires_at, revoked_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
    `).run(session.authority_session_id, hashBearerToken(bearerToken), session.principal_id, session.workspace_id, JSON.stringify(session.grant_ids), session.interaction_mode, session.interaction_session_id, session.broker_id, JSON.stringify(session.confirmed_prompts), JSON.stringify(session.approval_refs), JSON.stringify(session.provenance), session.issued_at, session.expires_at);
        return { bearer_token: bearerToken, session };
    }
    revokeSession(authoritySessionId, revokedAt = this.now()) {
        parseTimestamp("revoked_at", revokedAt);
        const result = this.db.prepare(`
      UPDATE operation_authority_sessions
      SET revoked_at = COALESCE(revoked_at, ?)
      WHERE authority_session_id = ?
    `).run(revokedAt, authoritySessionId);
        return Number(result.changes) === 1;
    }
    getSession(authoritySessionId) {
        const row = this.db.prepare(`
      SELECT authority_session_id, principal_id, workspace_id, grant_ids_json,
             interaction_mode, interaction_session_id, broker_id,
             confirmed_prompts_json, approval_refs_json, provenance_json,
             issued_at, expires_at,
             revoked_at
      FROM operation_authority_sessions
      WHERE authority_session_id = ?
    `).get(authoritySessionId);
        return row ? rowToSession(row) : null;
    }
    /** Hash lookup for OperationAuthorityVerifier; raw bearer tokens never enter SQL. */
    findByTokenHash(tokenHash) {
        const row = this.db.prepare(`
      SELECT authority_session_id, principal_id, workspace_id, grant_ids_json,
             interaction_mode, interaction_session_id, broker_id,
             confirmed_prompts_json, approval_refs_json, provenance_json,
             issued_at, expires_at,
             revoked_at
      FROM operation_authority_sessions
      WHERE token_hash = ?
    `).get(tokenHash);
        return row ? rowToSession(row) : null;
    }
}
/**
 * Converts a credential supplied by the authenticated transport into the sole
 * authority object accepted by semantic operation discovery and invocation.
 * Invocation request content is deliberately absent from this API.
 */
export class OperationAuthorityVerifier {
    sessions;
    capabilityGrants;
    now;
    constructor(sessions, capabilityGrants, now = isoNow) {
        this.sessions = sessions;
        this.capabilityGrants = capabilityGrants;
        this.now = now;
    }
    verifyBearerToken(bearerToken, transport) {
        if (!bearerToken)
            return verificationFailure("authority_token_invalid", "The authority credential is invalid.");
        const session = this.sessions.findByTokenHash(hashBearerToken(bearerToken));
        if (!session)
            return verificationFailure("authority_token_invalid", "The authority credential is invalid.");
        if (session.workspace_id !== transport.boundary.workspace_id) {
            return verificationFailure("authority_boundary_mismatch", "The authority credential is not valid for this authority boundary.");
        }
        if (session.revoked_at !== null) {
            return verificationFailure("authority_session_revoked", "The authority session has been revoked.");
        }
        if (parseTimestamp("expires_at", session.expires_at) <= parseTimestamp("now", this.now())) {
            return verificationFailure("authority_session_expired", "The authority session has expired.");
        }
        const resolved = this.capabilityGrants.resolveSessionAuthority(sessionGrantBinding(session), transport.target ?? null);
        return {
            verified: true,
            authority_session_id: session.authority_session_id,
            expires_at: session.expires_at,
            authority: resolved.authority,
            active_grant_ids: resolved.active_grant_ids,
            applicable_grant_ids: resolved.applicable_grant_ids,
            unavailable_grants: resolved.unavailable_grants,
            provenance: session.provenance,
        };
    }
}
function rowToSession(row) {
    if (!isInteractionMode(row.interaction_mode)) {
        throw new Error(`Stored operation authority mode '${row.interaction_mode}' is invalid.`);
    }
    return {
        authority_session_id: row.authority_session_id,
        principal_id: row.principal_id,
        boundary: { kind: "workspace", workspace_id: row.workspace_id },
        workspace_id: row.workspace_id,
        grant_ids: parseStringArray(row.grant_ids_json, "grant_ids_json"),
        interaction_mode: row.interaction_mode,
        interaction_session_id: row.interaction_session_id,
        broker_id: row.broker_id,
        confirmed_prompts: parseStringArray(row.confirmed_prompts_json, "confirmed_prompts_json"),
        approval_refs: parseStringArray(row.approval_refs_json, "approval_refs_json"),
        provenance: parseProvenance(row.provenance_json),
        issued_at: row.issued_at,
        expires_at: row.expires_at,
        revoked_at: row.revoked_at,
    };
}
function sessionGrantBinding(session) {
    return {
        principal_id: session.principal_id,
        boundary: session.boundary,
        grant_ids: session.grant_ids,
        interaction: {
            mode: session.interaction_mode,
            session_id: session.interaction_session_id,
            broker_id: session.broker_id,
            confirmed_prompts: session.confirmed_prompts,
            approval_refs: session.approval_refs,
        },
    };
}
function parseStringArray(value, field) {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === "string")) {
        throw new Error(`Stored operation authority ${field} is invalid.`);
    }
    return parsed;
}
function parseProvenance(value) {
    let parsed;
    try {
        parsed = JSON.parse(value);
    }
    catch {
        throw new Error("Stored operation authority provenance_json is invalid.");
    }
    if (!isRecord(parsed)) {
        throw new Error("Stored operation authority provenance_json is invalid.");
    }
    return normalizeProvenance({
        cause_event_id: optionalStoredRef(parsed.cause_event_id, "cause_event_id"),
        delivery_ids: storedRefArray(parsed.delivery_ids, "delivery_ids"),
        execution_attempt_id: optionalStoredRef(parsed.execution_attempt_id, "execution_attempt_id"),
        node_execution_id: optionalStoredRef(parsed.node_execution_id, "node_execution_id"),
        scope_execution_id: optionalStoredRef(parsed.scope_execution_id, "scope_execution_id"),
    });
}
function normalizeProvenance(input) {
    return Object.freeze({
        cause_event_id: optionalRef("provenance.cause_event_id", input.cause_event_id),
        delivery_ids: Object.freeze(normalizedSet(input.delivery_ids, "provenance delivery_id")),
        execution_attempt_id: optionalRef("provenance.execution_attempt_id", input.execution_attempt_id),
        node_execution_id: optionalRef("provenance.node_execution_id", input.node_execution_id),
        scope_execution_id: optionalRef("provenance.scope_execution_id", input.scope_execution_id),
    });
}
function optionalRef(label, value) {
    if (value === null)
        return null;
    assertNonEmpty(label, value);
    return value;
}
function optionalStoredRef(value, field) {
    if (value === null)
        return null;
    if (typeof value !== "string") {
        throw new Error(`Stored operation authority provenance ${field} is invalid.`);
    }
    return value;
}
function storedRefArray(value, field) {
    if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
        throw new Error(`Stored operation authority provenance ${field} is invalid.`);
    }
    return value;
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isInteractionMode(value) {
    return value === "interactive" || value === "unattended" || value === "brokered";
}
function normalizedSet(values, label) {
    for (const value of values)
        assertNonEmpty(label, value);
    return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}
function assertNonEmpty(label, value) {
    if (!value.trim())
        throw new Error(`Operation authority ${label} must not be empty.`);
}
function parseTimestamp(label, value) {
    const timestamp = Date.parse(value);
    if (!Number.isFinite(timestamp))
        throw new Error(`Operation authority ${label} must be an ISO timestamp.`);
    return timestamp;
}
function verificationFailure(code, message) {
    return { verified: false, code, message };
}
function createBearerToken() {
    return `floe_operation_${randomBytes(32).toString("base64url")}`;
}
export function hashBearerToken(bearerToken) {
    return createHash("sha256")
        .update("floe-operation-authority-token:v1\0", "utf8")
        .update(bearerToken, "utf8")
        .digest("hex");
}
function isoNow() {
    return new Date().toISOString();
}
