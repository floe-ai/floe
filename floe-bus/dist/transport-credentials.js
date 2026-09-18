import { createHash, randomBytes, randomUUID } from "node:crypto";
/** Installs process-authentication records. Bearer material is never stored. */
export function applyTransportCredentialSchema(db) {
    db.exec(`
    CREATE TABLE IF NOT EXISTS transport_credentials (
      transport_credential_id TEXT PRIMARY KEY,
      audience TEXT NOT NULL CHECK (audience IN ('host_control', 'bridge_service')),
      host_id TEXT,
      bridge_id TEXT,
      authorized_host_id TEXT,
      token_hash TEXT NOT NULL,
      issued_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      revoked_at TEXT,
      replaces_credential_id TEXT REFERENCES transport_credentials(transport_credential_id),
      CHECK (
        (audience = 'host_control'
          AND host_id IS NOT NULL AND length(trim(host_id)) > 0
          AND bridge_id IS NULL AND authorized_host_id IS NULL)
        OR
        (audience = 'bridge_service'
          AND bridge_id IS NOT NULL AND length(trim(bridge_id)) > 0
          AND host_id IS NULL
          AND authorized_host_id IS NOT NULL AND length(trim(authorized_host_id)) > 0)
      ),
      UNIQUE (audience, token_hash)
    );

    CREATE INDEX IF NOT EXISTS idx_transport_credentials_host
      ON transport_credentials(host_id, expires_at DESC)
      WHERE audience = 'host_control';

    CREATE INDEX IF NOT EXISTS idx_transport_credentials_bridge
      ON transport_credentials(bridge_id, expires_at DESC)
      WHERE audience = 'bridge_service';

    CREATE INDEX IF NOT EXISTS idx_transport_credentials_active_expiry
      ON transport_credentials(expires_at)
      WHERE revoked_at IS NULL;
  `);
    const columns = db.prepare("PRAGMA table_info(transport_credentials)")
        .all();
    if (!columns.some((column) => column.name === "authorized_host_id")) {
        db.exec("ALTER TABLE transport_credentials ADD COLUMN authorized_host_id TEXT");
    }
}
/**
 * Durable authentication for the two trusted process boundaries. This store
 * establishes process identity only; Workspace operation authority continues
 * to come from OperationAuthoritySession and CapabilityGrant records.
 */
export class SqliteTransportCredentialStore {
    db;
    now;
    tokenFactory;
    credentialIdFactory;
    constructor(db, dependencies = {}) {
        this.db = db;
        this.now = dependencies.now ?? isoNow;
        this.tokenFactory = dependencies.token_factory ?? createBearerToken;
        this.credentialIdFactory = dependencies.credential_id_factory
            ?? ((audience) => `transport_${audience}_${randomUUID()}`);
    }
    issueHostControlCredential(input) {
        return this.issueCredential("host_control", input.host_id, input.expires_at, null);
    }
    /**
     * Installs the native host credential without manufacturing a second source
     * of authority. Reusing the same bearer is idempotent. A different bearer is
     * refused while any current credential exists for the host, so restart can
     * never rotate authority silently.
     */
    installHostControlCredential(input) {
        const hostId = requireBindingId(input.host_id);
        const bearerToken = requireBearerMaterial(input.bearer_token);
        const now = safeCurrentTimestamp(this.now());
        const current = this.db.prepare(`
      SELECT transport_credential_id, audience, host_id, bridge_id,
             issued_at, expires_at, revoked_at, replaces_credential_id
      FROM transport_credentials
      WHERE audience = 'host_control'
        AND host_id = ?
        AND revoked_at IS NULL
        AND expires_at > ?
      ORDER BY issued_at DESC
      LIMIT 1
    `).get(hostId, now);
        if (current) {
            const verified = this.verifyHostControlBearerToken(bearerToken);
            if (!verified.verified
                || verified.credential.audience !== "host_control"
                || verified.credential.host_id !== hostId) {
                throw new TransportCredentialLifecycleError("The supplied host-control credential does not match the installed credential.");
            }
            return verified.credential;
        }
        return this.issueCredential("host_control", hostId, input.expires_at, null, undefined, bearerToken).credential;
    }
    issueBridgeServiceCredential(input) {
        return this.issueCredential("bridge_service", input.bridge_id, input.expires_at, null, undefined, undefined, input.host_id);
    }
    /**
     * Replaces the ephemeral credential handed to one Bridge process start.
     * Every still-current credential for the exact Bridge/host binding is
     * revoked in the same savepoint before the new bearer is returned.
     */
    replaceBridgeServiceCredential(input) {
        const bridgeId = requireBindingId(input.bridge_id);
        const hostId = requireBindingId(input.host_id);
        const replacementAt = validTimestamp("replacement time", this.now());
        const expires = validTimestamp("expires_at", input.expires_at);
        if (expires.ms <= replacementAt.ms) {
            throw new TransportCredentialLifecycleError("Transport credential expiry must be after replacement.");
        }
        return inSavepoint(this.db, () => {
            const current = this.db.prepare(`
        SELECT transport_credential_id
        FROM transport_credentials
        WHERE audience = 'bridge_service'
          AND bridge_id = ?
          AND authorized_host_id = ?
          AND revoked_at IS NULL
        ORDER BY issued_at DESC, transport_credential_id DESC
      `).all(bridgeId, hostId);
            this.db.prepare(`
        UPDATE transport_credentials
        SET revoked_at = ?
        WHERE audience = 'bridge_service'
          AND bridge_id = ?
          AND authorized_host_id = ?
          AND revoked_at IS NULL
      `).run(replacementAt.iso, bridgeId, hostId);
            return this.issueCredential("bridge_service", bridgeId, expires.iso, current[0]?.transport_credential_id ?? null, replacementAt.iso, undefined, hostId);
        });
    }
    /**
     * Verification accepts only a bearer token and the host identity established
     * by the trusted native transport. Origin and network location are absent by
     * design and therefore cannot confer authority.
     */
    verifyHostControlCredential(bearerToken, hostId) {
        return this.verifyCredential("host_control", bearerToken, hostId);
    }
    /** Resolves native host identity from bearer material, never request content. */
    verifyHostControlBearerToken(bearerToken) {
        return this.verifyCredentialByBearer("host_control", bearerToken);
    }
    /** Verification is bound to the configured Bridge process identity. */
    verifyBridgeServiceCredential(bearerToken, bridgeId) {
        return this.verifyCredential("bridge_service", bearerToken, bridgeId);
    }
    /** Resolves Bridge identity from bearer material, never request content. */
    verifyBridgeServiceBearerToken(bearerToken) {
        return this.verifyCredentialByBearer("bridge_service", bearerToken);
    }
    rotateHostControlCredential(input) {
        return this.rotateCredential("host_control", input.transport_credential_id, input.host_id, input.expires_at);
    }
    rotateBridgeServiceCredential(input) {
        return this.rotateCredential("bridge_service", input.transport_credential_id, input.bridge_id, input.expires_at);
    }
    revokeHostControlCredential(transportCredentialId, hostId, revokedAt = this.now()) {
        return this.revokeCredential("host_control", transportCredentialId, hostId, revokedAt);
    }
    revokeBridgeServiceCredential(transportCredentialId, bridgeId, revokedAt = this.now()) {
        return this.revokeCredential("bridge_service", transportCredentialId, bridgeId, revokedAt);
    }
    issueCredential(audience, bindingId, expiresAt, replacesCredentialId, issuedAt = this.now(), suppliedBearerToken, authorizedHostId) {
        const binding = requireBindingId(bindingId);
        const issued = validTimestamp("issued_at", issuedAt);
        const expires = validTimestamp("expires_at", expiresAt);
        if (expires.ms <= issued.ms) {
            throw new TransportCredentialLifecycleError("Transport credential expiry must be after its issue time.");
        }
        const bearerToken = requireBearerMaterial(suppliedBearerToken ?? this.tokenFactory(audience));
        const bridgeHostId = audience === "bridge_service"
            ? requireBindingId(authorizedHostId ?? "")
            : null;
        const credentialId = requireIdentifier(this.credentialIdFactory(audience), "transport_credential_id");
        try {
            this.db.prepare(`
        INSERT INTO transport_credentials (
          transport_credential_id, audience, host_id, bridge_id, authorized_host_id, token_hash,
          issued_at, expires_at, revoked_at, replaces_credential_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)
      `).run(credentialId, audience, audience === "host_control" ? binding : null, audience === "bridge_service" ? binding : null, bridgeHostId, hashTransportBearerToken(audience, bearerToken), issued.iso, expires.iso, replacesCredentialId);
        }
        catch {
            // Never surface a database value derived from bearer material.
            throw new TransportCredentialLifecycleError("Transport credential issuance could not be completed.");
        }
        const credential = this.requireCredential(credentialId);
        return { bearer_token: bearerToken, credential };
    }
    verifyCredential(audience, bearerToken, bindingId) {
        // Always hash and perform the same indexed lookup. Missing, malformed,
        // cross-audience, wrongly bound, expired, and revoked credentials all
        // return the same denial contract.
        const token = typeof bearerToken === "string" ? bearerToken : "";
        const binding = typeof bindingId === "string" ? bindingId : "";
        const now = safeCurrentTimestamp(this.now());
        const row = this.db.prepare(`
      SELECT transport_credential_id, audience, host_id, bridge_id,
             authorized_host_id, issued_at, expires_at, revoked_at, replaces_credential_id
      FROM transport_credentials
      WHERE audience = ?
        AND token_hash = ?
        AND (
          (? = 'host_control' AND host_id = ?)
          OR
          (? = 'bridge_service' AND bridge_id = ?)
        )
        AND issued_at <= ?
        AND expires_at > ?
        AND revoked_at IS NULL
      LIMIT 1
    `).get(audience, hashTransportBearerToken(audience, token), audience, binding, audience, binding, now, now);
        if (!row)
            return transportCredentialDenied();
        try {
            return { verified: true, credential: rowToCredential(row) };
        }
        catch {
            return transportCredentialDenied();
        }
    }
    verifyCredentialByBearer(audience, bearerToken) {
        const token = typeof bearerToken === "string" ? bearerToken : "";
        const now = safeCurrentTimestamp(this.now());
        const row = this.db.prepare(`
      SELECT transport_credential_id, audience, host_id, bridge_id,
             authorized_host_id, issued_at, expires_at, revoked_at, replaces_credential_id
      FROM transport_credentials
      WHERE audience = ?
        AND token_hash = ?
        AND issued_at <= ?
        AND expires_at > ?
        AND revoked_at IS NULL
      LIMIT 1
    `).get(audience, hashTransportBearerToken(audience, token), now, now);
        if (!row)
            return transportCredentialDenied();
        try {
            return { verified: true, credential: rowToCredential(row) };
        }
        catch {
            return transportCredentialDenied();
        }
    }
    rotateCredential(audience, transportCredentialId, bindingId, expiresAt) {
        const credentialId = requireIdentifier(transportCredentialId, "transport_credential_id");
        const binding = requireBindingId(bindingId);
        const current = this.findCredential(credentialId);
        if (!current
            || current.audience !== audience
            || credentialBindingId(current) !== binding
            || current.revoked_at !== null) {
            throw new TransportCredentialLifecycleError("Transport credential rotation was not accepted.");
        }
        const rotatedAt = validTimestamp("rotation time", this.now());
        const expires = validTimestamp("expires_at", expiresAt);
        if (expires.ms <= rotatedAt.ms) {
            throw new TransportCredentialLifecycleError("Transport credential expiry must be after rotation.");
        }
        return inSavepoint(this.db, () => {
            const revoked = this.db.prepare(`
        UPDATE transport_credentials
        SET revoked_at = ?
        WHERE transport_credential_id = ? AND audience = ? AND revoked_at IS NULL
      `).run(rotatedAt.iso, credentialId, audience);
            if (Number(revoked.changes) !== 1) {
                throw new TransportCredentialLifecycleError("Transport credential rotation was not accepted.");
            }
            const authorizedHostId = current.audience === "bridge_service" ? current.host_id : undefined;
            return this.issueCredential(audience, binding, expires.iso, credentialId, rotatedAt.iso, undefined, authorizedHostId);
        });
    }
    revokeCredential(audience, transportCredentialId, bindingId, revokedAt) {
        const credentialId = requireIdentifier(transportCredentialId, "transport_credential_id");
        const binding = requireBindingId(bindingId);
        const revoked = validTimestamp("revoked_at", revokedAt);
        const result = this.db.prepare(`
      UPDATE transport_credentials
      SET revoked_at = ?
      WHERE transport_credential_id = ?
        AND audience = ?
        AND revoked_at IS NULL
        AND (
          (? = 'host_control' AND host_id = ?)
          OR
          (? = 'bridge_service' AND bridge_id = ?)
        )
        AND issued_at <= ?
    `).run(revoked.iso, credentialId, audience, audience, binding, audience, binding, revoked.iso);
        return Number(result.changes) === 1;
    }
    findCredential(transportCredentialId) {
        const row = this.db.prepare(`
      SELECT transport_credential_id, audience, host_id, bridge_id,
             authorized_host_id, issued_at, expires_at, revoked_at, replaces_credential_id
      FROM transport_credentials
      WHERE transport_credential_id = ?
    `).get(transportCredentialId);
        return row ? rowToCredential(row) : null;
    }
    requireCredential(transportCredentialId) {
        const record = this.findCredential(transportCredentialId);
        if (!record) {
            throw new TransportCredentialLifecycleError("Transport credential issuance could not be completed.");
        }
        return record;
    }
}
export class TransportCredentialLifecycleError extends Error {
    error_code = "E_TRANSPORT_CREDENTIAL_LIFECYCLE";
    constructor(message) {
        super(message);
        this.name = "TransportCredentialLifecycleError";
    }
}
function rowToCredential(row) {
    const base = {
        transport_credential_id: row.transport_credential_id,
        issued_at: row.issued_at,
        expires_at: row.expires_at,
        revoked_at: row.revoked_at,
        replaces_credential_id: row.replaces_credential_id,
    };
    if (row.audience === "host_control"
        && row.host_id
        && row.bridge_id === null
        && row.authorized_host_id === null) {
        return { ...base, audience: "host_control", host_id: row.host_id };
    }
    if (row.audience === "bridge_service"
        && row.bridge_id
        && row.host_id === null
        && row.authorized_host_id) {
        return {
            ...base,
            audience: "bridge_service",
            bridge_id: row.bridge_id,
            host_id: row.authorized_host_id,
        };
    }
    throw new TransportCredentialLifecycleError("Stored transport credential identity is invalid.");
}
function credentialBindingId(record) {
    return record.audience === "host_control" ? record.host_id : record.bridge_id;
}
function transportCredentialDenied() {
    return {
        verified: false,
        code: "transport_credential_denied",
        message: "The transport credential was not accepted.",
    };
}
function hashTransportBearerToken(audience, bearerToken) {
    return createHash("sha256")
        .update(`floe-transport-credential:${audience}:v1\0`, "utf8")
        .update(bearerToken, "utf8")
        .digest("hex");
}
function createBearerToken(audience) {
    return `floe_${audience}_${randomBytes(32).toString("base64url")}`;
}
function requireBearerMaterial(value) {
    if (typeof value !== "string" || value.length < 32) {
        throw new TransportCredentialLifecycleError("Transport credentials must contain at least 32 characters of bearer material.");
    }
    return value;
}
function requireBindingId(value) {
    return requireIdentifier(value, "transport credential binding");
}
function requireIdentifier(value, label) {
    if (typeof value !== "string"
        || !value.trim()
        || value.length > 512
        || /[\u0000-\u001f\u007f]/.test(value)) {
        throw new TransportCredentialLifecycleError(`${label} must be non-empty text without control characters.`);
    }
    return value;
}
function validTimestamp(label, value) {
    const ms = Date.parse(value);
    if (!Number.isFinite(ms)) {
        throw new TransportCredentialLifecycleError(`${label} must be an ISO timestamp.`);
    }
    return { iso: new Date(ms).toISOString(), ms };
}
function safeCurrentTimestamp(value) {
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? new Date(ms).toISOString() : "0000-01-01T00:00:00.000Z";
}
let savepointSequence = 0;
function inSavepoint(db, operation) {
    savepointSequence += 1;
    const name = `transport_credential_${savepointSequence}`;
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
