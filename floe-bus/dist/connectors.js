import { createHash, randomUUID } from "node:crypto";
export class ConnectorValidationError extends Error {
    reason;
    code = "E_CONNECTOR_INVALID";
    constructor(reason) {
        super(`Invalid Connector data: ${reason}`);
        this.reason = reason;
        this.name = "ConnectorValidationError";
    }
}
export class ConnectorNotFoundError extends Error {
    resource_kind;
    resource_id;
    code = "E_CONNECTOR_NOT_FOUND";
    constructor(resource_kind, resource_id) {
        super(`${resource_kind} not found: ${resource_id}`);
        this.resource_kind = resource_kind;
        this.resource_id = resource_id;
        this.name = "ConnectorNotFoundError";
    }
}
export class ConnectorOwnerMismatchError extends Error {
    expected;
    actual;
    code = "E_CONNECTOR_OWNER_MISMATCH";
    constructor(expected, actual) {
        super(`Connector resource belongs to ${actual.kind}:${actual.id}, not ${expected.kind}:${expected.id}.`);
        this.expected = expected;
        this.actual = actual;
        this.name = "ConnectorOwnerMismatchError";
    }
}
export class ConnectorRevisionConflictError extends Error {
    resource_id;
    expected_revision_id;
    actual_revision_id;
    code = "E_CONNECTOR_REVISION_CONFLICT";
    constructor(resource_id, expected_revision_id, actual_revision_id) {
        super(`Connector resource '${resource_id}' changed before this operation completed.`);
        this.resource_id = resource_id;
        this.expected_revision_id = expected_revision_id;
        this.actual_revision_id = actual_revision_id;
        this.name = "ConnectorRevisionConflictError";
    }
}
export class ConnectorLifecycleConflictError extends Error {
    connector_binding_id;
    reason;
    code = "E_CONNECTOR_LIFECYCLE_CONFLICT";
    constructor(connector_binding_id, reason) {
        super(`Connector binding '${connector_binding_id}' cannot change state: ${reason}`);
        this.connector_binding_id = connector_binding_id;
        this.reason = reason;
        this.name = "ConnectorLifecycleConflictError";
    }
}
export class ConnectorIngressIdempotencyConflictError extends Error {
    receipt;
    observation;
    code = "E_CONNECTOR_INGRESS_IDEMPOTENCY_CONFLICT";
    constructor(receipt, observation) {
        super("The same Connector ingress identity was observed with conflicting immutable facts.");
        this.receipt = receipt;
        this.observation = observation;
        this.name = "ConnectorIngressIdempotencyConflictError";
    }
}
export class ExternalActionStateError extends Error {
    external_effect_receipt_id;
    reason;
    code = "E_EXTERNAL_ACTION_STATE";
    constructor(external_effect_receipt_id, reason) {
        super(`External action '${external_effect_receipt_id}' cannot continue: ${reason}`);
        this.external_effect_receipt_id = external_effect_receipt_id;
        this.reason = reason;
        this.name = "ExternalActionStateError";
    }
}
export function applyConnectorSchema(db) {
    db.exec(`
    CREATE TABLE IF NOT EXISTS connector_definitions (
      connector_definition_id TEXT PRIMARY KEY,
      owner_kind TEXT NOT NULL CHECK (owner_kind IN ('workspace', 'host', 'deployment')),
      owner_id TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('active', 'retired')),
      current_revision_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      retired_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_connector_definitions_owner
      ON connector_definitions(owner_kind, owner_id, status, created_at);

    CREATE TABLE IF NOT EXISTS connector_definition_revisions (
      connector_definition_revision_id TEXT PRIMARY KEY,
      connector_definition_id TEXT NOT NULL REFERENCES connector_definitions(connector_definition_id),
      revision_number INTEGER NOT NULL,
      based_on_revision_id TEXT,
      semantic_digest TEXT NOT NULL,
      content_json TEXT NOT NULL,
      created_by_principal_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      published_at TEXT NOT NULL,
      UNIQUE(connector_definition_id, revision_number)
    );

    CREATE TABLE IF NOT EXISTS connector_bindings (
      connector_binding_id TEXT PRIMARY KEY,
      connector_definition_id TEXT NOT NULL REFERENCES connector_definitions(connector_definition_id),
      owner_kind TEXT NOT NULL CHECK (owner_kind IN ('workspace', 'host', 'deployment')),
      owner_id TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('disabled', 'enabled', 'retired')),
      state_version INTEGER NOT NULL,
      current_revision_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      enabled_at TEXT,
      disabled_at TEXT,
      retired_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_connector_bindings_owner
      ON connector_bindings(owner_kind, owner_id, status, created_at);

    CREATE TABLE IF NOT EXISTS connector_binding_revisions (
      connector_binding_revision_id TEXT PRIMARY KEY,
      connector_binding_id TEXT NOT NULL REFERENCES connector_bindings(connector_binding_id),
      connector_definition_revision_id TEXT NOT NULL REFERENCES connector_definition_revisions(connector_definition_revision_id),
      revision_number INTEGER NOT NULL,
      based_on_revision_id TEXT,
      semantic_digest TEXT NOT NULL,
      content_json TEXT NOT NULL,
      created_by_principal_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      published_at TEXT NOT NULL,
      UNIQUE(connector_binding_id, revision_number)
    );

    CREATE TABLE IF NOT EXISTS connector_head_changes (
      head_change_id TEXT PRIMARY KEY,
      resource_kind TEXT NOT NULL CHECK (resource_kind IN ('connector_definition', 'connector_binding')),
      resource_id TEXT NOT NULL,
      owner_kind TEXT NOT NULL CHECK (owner_kind IN ('workspace', 'host', 'deployment')),
      owner_id TEXT NOT NULL,
      from_revision_id TEXT,
      to_revision_id TEXT NOT NULL,
      changed_by_principal_id TEXT NOT NULL,
      changed_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_connector_head_changes_resource
      ON connector_head_changes(resource_kind, resource_id, changed_at);

    CREATE TABLE IF NOT EXISTS connector_health_observations (
      connector_health_observation_id TEXT PRIMARY KEY,
      connector_binding_id TEXT NOT NULL REFERENCES connector_bindings(connector_binding_id),
      connector_binding_revision_id TEXT NOT NULL REFERENCES connector_binding_revisions(connector_binding_revision_id),
      owner_kind TEXT NOT NULL CHECK (owner_kind IN ('workspace', 'host', 'deployment')),
      owner_id TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('unknown', 'healthy', 'degraded', 'unhealthy')),
      code TEXT,
      message TEXT NOT NULL,
      evidence_refs_json TEXT NOT NULL,
      observed_at TEXT NOT NULL,
      recorded_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_connector_health_binding
      ON connector_health_observations(connector_binding_id, recorded_at DESC);

    CREATE TABLE IF NOT EXISTS connector_ingress_receipts (
      connector_ingress_receipt_id TEXT PRIMARY KEY,
      connector_binding_id TEXT NOT NULL REFERENCES connector_bindings(connector_binding_id),
      connector_binding_revision_id TEXT NOT NULL REFERENCES connector_binding_revisions(connector_binding_revision_id),
      owner_kind TEXT NOT NULL CHECK (owner_kind IN ('workspace', 'host', 'deployment')),
      owner_id TEXT NOT NULL,
      source_interface_id TEXT NOT NULL,
      deduplication_key TEXT NOT NULL,
      idempotency_key TEXT NOT NULL,
      external_identity TEXT NOT NULL,
      external_revision TEXT,
      payload_digest TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('accepted', 'materialized', 'quarantined')),
      normalized_event_id TEXT,
      artefact_version_ids_json TEXT NOT NULL,
      checkpoint_ref_json TEXT,
      first_observed_at TEXT NOT NULL,
      last_observed_at TEXT NOT NULL,
      physical_observation_count INTEGER NOT NULL,
      UNIQUE(connector_binding_id, source_interface_id, deduplication_key),
      UNIQUE(connector_binding_id, source_interface_id, idempotency_key)
    );

    CREATE TABLE IF NOT EXISTS connector_ingress_observations (
      connector_ingress_observation_id TEXT PRIMARY KEY,
      connector_ingress_receipt_id TEXT NOT NULL REFERENCES connector_ingress_receipts(connector_ingress_receipt_id),
      connector_binding_revision_id TEXT NOT NULL REFERENCES connector_binding_revisions(connector_binding_revision_id),
      classification TEXT NOT NULL CHECK (classification IN ('accepted', 'quarantined', 'duplicate', 'quarantined_conflict')),
      idempotency_key TEXT NOT NULL,
      external_identity TEXT NOT NULL,
      external_revision TEXT,
      payload_digest TEXT NOT NULL,
      verification_json TEXT NOT NULL,
      evidence_refs_json TEXT NOT NULL,
      observed_at TEXT NOT NULL,
      recorded_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_connector_ingress_observations_receipt
      ON connector_ingress_observations(connector_ingress_receipt_id, recorded_at);

    CREATE TABLE IF NOT EXISTS external_effect_receipts (
      external_effect_receipt_id TEXT PRIMARY KEY,
      connector_binding_id TEXT NOT NULL REFERENCES connector_bindings(connector_binding_id),
      connector_binding_revision_id TEXT NOT NULL REFERENCES connector_binding_revisions(connector_binding_revision_id),
      owner_kind TEXT NOT NULL CHECK (owner_kind IN ('workspace', 'host', 'deployment')),
      owner_id TEXT NOT NULL,
      action_interface_id TEXT NOT NULL,
      idempotency_key TEXT NOT NULL,
      input_digest TEXT NOT NULL,
      input_refs_json TEXT NOT NULL,
      secret_ref_ids_json TEXT NOT NULL,
      capability_grant_ids_json TEXT NOT NULL,
      approval_receipt_ids_json TEXT NOT NULL,
      requested_by_principal_id TEXT NOT NULL,
      invocation_provenance_json TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('requested', 'running', 'succeeded', 'failed', 'outcome_unknown')),
      attempt_count INTEGER NOT NULL,
      requested_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT,
      UNIQUE(connector_binding_id, action_interface_id, idempotency_key)
    );

    CREATE TABLE IF NOT EXISTS external_action_attempts (
      external_action_attempt_id TEXT PRIMARY KEY,
      external_effect_receipt_id TEXT NOT NULL REFERENCES external_effect_receipts(external_effect_receipt_id),
      attempt_number INTEGER NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('started', 'succeeded', 'failed', 'outcome_unknown')),
      request_evidence_ref_json TEXT NOT NULL,
      provider_response_ref_json TEXT,
      observed_result_ref_json TEXT,
      error_code TEXT,
      error_message TEXT,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      UNIQUE(external_effect_receipt_id, attempt_number)
    );

    CREATE TABLE IF NOT EXISTS external_action_reconciliations (
      external_action_reconciliation_id TEXT PRIMARY KEY,
      external_effect_receipt_id TEXT NOT NULL REFERENCES external_effect_receipts(external_effect_receipt_id),
      outcome TEXT NOT NULL CHECK (outcome IN ('succeeded', 'failed', 'outcome_unknown')),
      evidence_ref_json TEXT NOT NULL,
      reconciled_by_principal_id TEXT NOT NULL,
      reconciled_at TEXT NOT NULL
    );
  `);
    const externalEffectColumns = db.prepare("PRAGMA table_info(external_effect_receipts)").all();
    if (!externalEffectColumns.some((column) => column.name === "invocation_provenance_json")) {
        db.exec(`ALTER TABLE external_effect_receipts ADD COLUMN invocation_provenance_json TEXT NOT NULL
      DEFAULT '{"cause_event_id":null,"delivery_ids":[],"execution_attempt_id":null,"node_execution_id":null,"scope_execution_id":null}'`);
    }
}
export class ConnectorStore {
    db;
    now;
    constructor(db, now = () => new Date().toISOString()) {
        this.db = db;
        this.now = now;
        applyConnectorSchema(db);
    }
    createDefinition(input) {
        const owner = normalizeOwner(input.owner);
        validateConnectorDefinition(input.content);
        const definitionId = requireText(input.connector_definition_id ?? `connector_definition_${randomUUID()}`, "connector_definition_id");
        const principalId = requireText(input.created_by_principal_id, "created_by_principal_id");
        const revisionId = `connector_definition_revision_${randomUUID()}`;
        const at = this.now();
        const digest = connectorDefinitionDigest(input.content);
        transaction(this.db, "connector_definition_create", () => {
            this.db.prepare(`
        INSERT INTO connector_definitions (
          connector_definition_id, owner_kind, owner_id, status, current_revision_id,
          created_at, updated_at, retired_at
        ) VALUES (?, ?, ?, 'active', ?, ?, ?, NULL)
      `).run(definitionId, owner.kind, owner.id, revisionId, at, at);
            this.db.prepare(`
        INSERT INTO connector_definition_revisions (
          connector_definition_revision_id, connector_definition_id, revision_number,
          based_on_revision_id, semantic_digest, content_json,
          created_by_principal_id, created_at, published_at
        ) VALUES (?, ?, 1, NULL, ?, ?, ?, ?, ?)
      `).run(revisionId, definitionId, digest, JSON.stringify(input.content), principalId, at, at);
            this.insertHeadChange("connector_definition", definitionId, owner, null, revisionId, principalId, at);
        });
        return {
            definition: this.requireDefinitionForOwner(definitionId, owner),
            revision: this.requireDefinitionRevisionForOwner(revisionId, owner),
        };
    }
    reviseDefinition(input) {
        const owner = normalizeOwner(input.owner);
        const definition = this.requireDefinitionForOwner(input.connector_definition_id, owner);
        if (definition.status !== "active")
            throw new ConnectorValidationError("a retired ConnectorDefinition cannot be revised");
        if (definition.current_revision_id !== input.expected_current_revision_id) {
            throw new ConnectorRevisionConflictError(definition.connector_definition_id, input.expected_current_revision_id, definition.current_revision_id);
        }
        validateConnectorDefinition(input.content);
        const principalId = requireText(input.changed_by_principal_id, "changed_by_principal_id");
        const revisionId = `connector_definition_revision_${randomUUID()}`;
        const nextOrdinal = this.nextOrdinal("connector_definition_revisions", "connector_definition_id", definition.connector_definition_id);
        const at = this.now();
        transaction(this.db, "connector_definition_revise", () => {
            this.db.prepare(`
        INSERT INTO connector_definition_revisions (
          connector_definition_revision_id, connector_definition_id, revision_number,
          based_on_revision_id, semantic_digest, content_json,
          created_by_principal_id, created_at, published_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(revisionId, definition.connector_definition_id, nextOrdinal, definition.current_revision_id, connectorDefinitionDigest(input.content), JSON.stringify(input.content), principalId, at, at);
            this.db.prepare(`
        UPDATE connector_definitions SET current_revision_id = ?, updated_at = ?
        WHERE connector_definition_id = ?
      `).run(revisionId, at, definition.connector_definition_id);
            this.insertHeadChange("connector_definition", definition.connector_definition_id, owner, definition.current_revision_id, revisionId, principalId, at);
        });
        return {
            definition: this.requireDefinitionForOwner(definition.connector_definition_id, owner),
            revision: this.requireDefinitionRevisionForOwner(revisionId, owner),
        };
    }
    setDefinitionStatus(input) {
        const owner = normalizeOwner(input.owner);
        const definition = this.requireDefinitionForOwner(input.connector_definition_id, owner);
        if (definition.current_revision_id !== input.expected_current_revision_id) {
            throw new ConnectorRevisionConflictError(definition.connector_definition_id, input.expected_current_revision_id, definition.current_revision_id);
        }
        const at = this.now();
        this.db.prepare(`
      UPDATE connector_definitions SET status = ?, retired_at = ?, updated_at = ?
      WHERE connector_definition_id = ?
    `).run(input.status, input.status === "retired" ? at : null, at, definition.connector_definition_id);
        return this.requireDefinitionForOwner(definition.connector_definition_id, owner);
    }
    createBinding(input) {
        const owner = normalizeOwner(input.owner);
        const definitionRevision = this.requireDefinitionRevision(input.connector_definition_revision_id);
        const definition = this.requireDefinition(definitionRevision.connector_definition_id);
        this.assertDefinitionMayBind(definition, owner);
        if (definition.status !== "active")
            throw new ConnectorValidationError("a retired ConnectorDefinition cannot receive a new binding");
        validateConnectorBinding(input.content, definitionRevision.content);
        const bindingId = requireText(input.connector_binding_id ?? `connector_binding_${randomUUID()}`, "connector_binding_id");
        const principalId = requireText(input.created_by_principal_id, "created_by_principal_id");
        const revisionId = `connector_binding_revision_${randomUUID()}`;
        const at = this.now();
        transaction(this.db, "connector_binding_create", () => {
            this.db.prepare(`
        INSERT INTO connector_bindings (
          connector_binding_id, connector_definition_id, owner_kind, owner_id,
          status, state_version, current_revision_id, created_at, updated_at,
          enabled_at, disabled_at, retired_at
        ) VALUES (?, ?, ?, ?, 'disabled', 1, ?, ?, ?, NULL, ?, NULL)
      `).run(bindingId, definition.connector_definition_id, owner.kind, owner.id, revisionId, at, at, at);
            this.db.prepare(`
        INSERT INTO connector_binding_revisions (
          connector_binding_revision_id, connector_binding_id,
          connector_definition_revision_id, revision_number, based_on_revision_id,
          semantic_digest, content_json, created_by_principal_id, created_at, published_at
        ) VALUES (?, ?, ?, 1, NULL, ?, ?, ?, ?, ?)
      `).run(revisionId, bindingId, definitionRevision.connector_definition_revision_id, connectorBindingDigest(definitionRevision.connector_definition_revision_id, input.content), JSON.stringify(input.content), principalId, at, at);
            this.insertHeadChange("connector_binding", bindingId, owner, null, revisionId, principalId, at);
        });
        return {
            binding: this.requireBindingForOwner(bindingId, owner),
            revision: this.requireBindingRevisionForOwner(revisionId, owner),
        };
    }
    reviseBinding(input) {
        const owner = normalizeOwner(input.owner);
        const binding = this.requireBindingForOwner(input.connector_binding_id, owner);
        if (binding.status === "retired")
            throw new ConnectorValidationError("a retired ConnectorBinding cannot be revised");
        if (binding.current_revision_id !== input.expected_current_revision_id) {
            throw new ConnectorRevisionConflictError(binding.connector_binding_id, input.expected_current_revision_id, binding.current_revision_id);
        }
        const definitionRevisionId = input.connector_definition_revision_id
            ?? this.requireBindingRevision(binding.current_revision_id).connector_definition_revision_id;
        const definitionRevision = this.requireDefinitionRevision(definitionRevisionId);
        if (definitionRevision.connector_definition_id !== binding.connector_definition_id) {
            throw new ConnectorValidationError("a binding revision cannot change ConnectorDefinition identity");
        }
        validateConnectorBinding(input.content, definitionRevision.content);
        const principalId = requireText(input.changed_by_principal_id, "changed_by_principal_id");
        const revisionId = `connector_binding_revision_${randomUUID()}`;
        const nextOrdinal = this.nextOrdinal("connector_binding_revisions", "connector_binding_id", binding.connector_binding_id);
        const at = this.now();
        transaction(this.db, "connector_binding_revise", () => {
            this.db.prepare(`
        INSERT INTO connector_binding_revisions (
          connector_binding_revision_id, connector_binding_id,
          connector_definition_revision_id, revision_number, based_on_revision_id,
          semantic_digest, content_json, created_by_principal_id, created_at, published_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(revisionId, binding.connector_binding_id, definitionRevision.connector_definition_revision_id, nextOrdinal, binding.current_revision_id, connectorBindingDigest(definitionRevision.connector_definition_revision_id, input.content), JSON.stringify(input.content), principalId, at, at);
            this.db.prepare(`
        UPDATE connector_bindings SET current_revision_id = ?, state_version = state_version + 1, updated_at = ?
        WHERE connector_binding_id = ?
      `).run(revisionId, at, binding.connector_binding_id);
            this.insertHeadChange("connector_binding", binding.connector_binding_id, owner, binding.current_revision_id, revisionId, principalId, at);
        });
        return {
            binding: this.requireBindingForOwner(binding.connector_binding_id, owner),
            revision: this.requireBindingRevisionForOwner(revisionId, owner),
        };
    }
    rotateBindingSecrets(input) {
        const current = this.requireBindingRevisionForOwner(input.expected_current_revision_id, input.owner);
        if (current.connector_binding_id !== input.connector_binding_id) {
            throw new ConnectorRevisionConflictError(input.connector_binding_id, input.expected_current_revision_id, this.requireBindingForOwner(input.connector_binding_id, input.owner).current_revision_id);
        }
        return this.reviseBinding({
            connector_binding_id: input.connector_binding_id,
            owner: input.owner,
            expected_current_revision_id: input.expected_current_revision_id,
            connector_definition_revision_id: current.connector_definition_revision_id,
            content: { ...current.content, secret_bindings: input.secret_bindings },
            changed_by_principal_id: input.changed_by_principal_id,
        });
    }
    setBindingStatus(input) {
        const owner = normalizeOwner(input.owner);
        const binding = this.requireBindingForOwner(input.connector_binding_id, owner);
        const actualRevision = connectorBindingStateRevision(binding);
        if (actualRevision !== input.expected_state_revision) {
            throw new ConnectorRevisionConflictError(binding.connector_binding_id, input.expected_state_revision, actualRevision);
        }
        if (binding.status === "retired") {
            throw new ConnectorLifecycleConflictError(binding.connector_binding_id, "a retired binding cannot be reactivated");
        }
        if (input.status === "retired" && binding.status === "enabled") {
            throw new ConnectorLifecycleConflictError(binding.connector_binding_id, "disable it before retirement");
        }
        if (input.status === "enabled")
            this.assertBindingReady(binding);
        if (input.status === binding.status)
            return binding;
        const at = this.now();
        this.db.prepare(`
      UPDATE connector_bindings
      SET status = ?, state_version = state_version + 1, updated_at = ?,
          enabled_at = CASE WHEN ? = 'enabled' THEN ? ELSE enabled_at END,
          disabled_at = CASE WHEN ? = 'disabled' THEN ? ELSE disabled_at END,
          retired_at = CASE WHEN ? = 'retired' THEN ? ELSE retired_at END
      WHERE connector_binding_id = ?
    `).run(input.status, at, input.status, at, input.status, at, input.status, at, binding.connector_binding_id);
        return this.requireBindingForOwner(binding.connector_binding_id, owner);
    }
    recordHealth(input) {
        const owner = normalizeOwner(input.owner);
        const binding = this.requireBindingForOwner(input.connector_binding_id, owner);
        if (binding.current_revision_id !== input.connector_binding_revision_id) {
            throw new ConnectorRevisionConflictError(binding.connector_binding_id, input.connector_binding_revision_id, binding.current_revision_id);
        }
        const evidenceRefs = normalizeRefs(input.evidence_refs ?? [], "evidence_refs");
        const id = `connector_health_${randomUUID()}`;
        const recordedAt = this.now();
        this.db.prepare(`
      INSERT INTO connector_health_observations (
        connector_health_observation_id, connector_binding_id,
        connector_binding_revision_id, owner_kind, owner_id, status, code,
        message, evidence_refs_json, observed_at, recorded_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, binding.connector_binding_id, binding.current_revision_id, owner.kind, owner.id, input.status, input.code == null ? null : requireText(input.code, "health.code"), requireText(input.message, "health.message", 4096), JSON.stringify(evidenceRefs), requireTimestamp(input.observed_at, "observed_at"), recordedAt);
        return this.requireHealthObservation(id);
    }
    recordIngress(input) {
        const owner = normalizeOwner(input.owner);
        const { binding, revision, source } = this.requireActiveSource(input.connector_binding_id, input.connector_binding_revision_id, owner, input.source_interface_id);
        const idempotencyKey = requireText(input.idempotency_key, "idempotency_key", 256);
        const externalIdentity = requireText(input.external_identity, "external_identity", 2048);
        const externalRevision = input.external_revision == null
            ? null
            : requireText(input.external_revision, "external_revision", 2048);
        if (source.identity_scope === "resource_revision" && externalRevision === null) {
            throw new ConnectorValidationError("resource_revision sources require an external_revision");
        }
        const payloadDigest = requireDigest(input.payload_digest, "payload_digest");
        const verification = normalizeVerification(input.verification);
        const evidenceRefs = normalizeRefs(input.evidence_refs ?? [], "evidence_refs");
        const checkpointRef = input.checkpoint_ref == null
            ? null
            : normalizeRef(input.checkpoint_ref, "checkpoint_ref");
        const observedAt = requireTimestamp(input.observed_at, "observed_at");
        const occurrenceIdentity = source.identity_scope === "occurrence"
            ? externalIdentity
            : `${externalIdentity}\u0000${externalRevision}`;
        const deduplicationKey = sha256([
            binding.connector_binding_id,
            source.interface_id,
            source.identity_scope,
            occurrenceIdentity,
        ].join("\u0000"));
        const receiptId = `connector_ingress_${deduplicationKey}`;
        const recordedAt = this.now();
        let outcome;
        let conflict = null;
        transaction(this.db, "connector_ingress", () => {
            const byIdempotency = this.db.prepare(`
        SELECT * FROM connector_ingress_receipts
        WHERE connector_binding_id = ? AND source_interface_id = ? AND idempotency_key = ?
      `).get(binding.connector_binding_id, source.interface_id, idempotencyKey);
            const existing = this.getIngressReceipt(receiptId)
                ?? (byIdempotency ? rowToIngressReceipt(byIdempotency) : null);
            if (existing) {
                const matches = existing.connector_ingress_receipt_id === receiptId
                    && existing.external_identity === externalIdentity
                    && existing.external_revision === externalRevision
                    && existing.payload_digest === payloadDigest;
                const observation = this.insertIngressObservation({
                    receipt_id: existing.connector_ingress_receipt_id,
                    binding_revision_id: revision.connector_binding_revision_id,
                    classification: matches ? "duplicate" : "quarantined_conflict",
                    idempotency_key: idempotencyKey,
                    external_identity: externalIdentity,
                    external_revision: externalRevision,
                    payload_digest: payloadDigest,
                    verification,
                    evidence_refs: evidenceRefs,
                    observed_at: observedAt,
                    recorded_at: recordedAt,
                });
                this.db.prepare(`
          UPDATE connector_ingress_receipts
          SET last_observed_at = ?, physical_observation_count = physical_observation_count + 1
          WHERE connector_ingress_receipt_id = ?
        `).run(observedAt, existing.connector_ingress_receipt_id);
                const receipt = this.requireIngressReceipt(existing.connector_ingress_receipt_id);
                outcome = { replayed: matches, receipt, observation };
                if (!matches)
                    conflict = new ConnectorIngressIdempotencyConflictError(receipt, observation);
                return;
            }
            const accepted = ingressVerificationAccepted(source, verification);
            this.db.prepare(`
        INSERT INTO connector_ingress_receipts (
          connector_ingress_receipt_id, connector_binding_id,
          connector_binding_revision_id, owner_kind, owner_id, source_interface_id,
          deduplication_key, idempotency_key, external_identity, external_revision,
          payload_digest, status, normalized_event_id, artefact_version_ids_json,
          checkpoint_ref_json, first_observed_at, last_observed_at,
          physical_observation_count
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, '[]', ?, ?, ?, 1)
      `).run(receiptId, binding.connector_binding_id, revision.connector_binding_revision_id, owner.kind, owner.id, source.interface_id, deduplicationKey, idempotencyKey, externalIdentity, externalRevision, payloadDigest, accepted ? "accepted" : "quarantined", checkpointRef === null ? null : JSON.stringify(checkpointRef), observedAt, observedAt);
            const observation = this.insertIngressObservation({
                receipt_id: receiptId,
                binding_revision_id: revision.connector_binding_revision_id,
                classification: accepted ? "accepted" : "quarantined",
                idempotency_key: idempotencyKey,
                external_identity: externalIdentity,
                external_revision: externalRevision,
                payload_digest: payloadDigest,
                verification,
                evidence_refs: evidenceRefs,
                observed_at: observedAt,
                recorded_at: recordedAt,
            });
            outcome = { replayed: false, receipt: this.requireIngressReceipt(receiptId), observation };
        });
        if (conflict)
            throw conflict;
        return outcome;
    }
    attachIngressOutcome(input) {
        const owner = normalizeOwner(input.owner);
        const receipt = this.requireIngressReceiptForOwner(input.connector_ingress_receipt_id, owner);
        if (receipt.status === "quarantined") {
            throw new ConnectorValidationError("quarantined ingress must be reconciled before it can materialize an Event");
        }
        const eventId = requireText(input.normalized_event_id, "normalized_event_id");
        const artefactVersionIds = uniqueTexts(input.artefact_version_ids ?? [], "artefact_version_id");
        if (receipt.status === "materialized") {
            if (receipt.normalized_event_id === eventId
                && canonicalJson(receipt.artefact_version_ids) === canonicalJson(artefactVersionIds))
                return receipt;
            throw new ConnectorValidationError("ingress outcome is immutable once materialized");
        }
        this.db.prepare(`
      UPDATE connector_ingress_receipts
      SET status = 'materialized', normalized_event_id = ?, artefact_version_ids_json = ?
      WHERE connector_ingress_receipt_id = ?
    `).run(eventId, JSON.stringify(artefactVersionIds), receipt.connector_ingress_receipt_id);
        return this.requireIngressReceiptForOwner(receipt.connector_ingress_receipt_id, owner);
    }
    requestExternalAction(input) {
        const owner = normalizeOwner(input.owner);
        const { binding, revision, action } = this.requireActiveAction(input.connector_binding_id, input.connector_binding_revision_id, owner, input.action_interface_id);
        const idempotencyKey = requireText(input.idempotency_key, "idempotency_key", 256);
        const inputDigest = requireDigest(input.input_digest, "input_digest");
        const inputRefs = normalizeRefs(input.input_refs ?? [], "input_refs");
        const approvalReceiptIds = uniqueTexts(input.approval_receipt_ids ?? [], "approval_receipt_id");
        if (action.approval.required && approvalReceiptIds.length === 0) {
            throw new ConnectorValidationError("this external action requires an ApprovalReceipt reference");
        }
        if (!action.approval.required && approvalReceiptIds.length > 0) {
            throw new ConnectorValidationError("this external action does not accept ApprovalReceipt references");
        }
        const requestedByPrincipalId = requireText(input.requested_by_principal_id, "requested_by_principal_id");
        const invocationProvenance = normalizeInvocationProvenance(input.invocation_provenance);
        const receiptId = `external_effect_${sha256([
            binding.connector_binding_id,
            action.interface_id,
            idempotencyKey,
        ].join("\u0000"))}`;
        const existing = this.getExternalEffectReceipt(receiptId);
        if (existing) {
            if (existing.input_digest !== inputDigest
                || canonicalJson(existing.input_refs) !== canonicalJson(inputRefs)
                || canonicalJson(existing.approval_receipt_ids) !== canonicalJson(approvalReceiptIds)
                || existing.requested_by_principal_id !== requestedByPrincipalId
                || canonicalJson(existing.invocation_provenance) !== canonicalJson(invocationProvenance)) {
                throw new ExternalActionStateError(receiptId, "the idempotency key already identifies different immutable inputs");
            }
            return { replayed: true, receipt: existing };
        }
        const secretRefIds = revision.content.secret_bindings.map((item) => item.secret_ref_id).sort();
        const at = this.now();
        this.db.prepare(`
      INSERT INTO external_effect_receipts (
        external_effect_receipt_id, connector_binding_id,
        connector_binding_revision_id, owner_kind, owner_id, action_interface_id,
        idempotency_key, input_digest, input_refs_json, secret_ref_ids_json,
        capability_grant_ids_json, approval_receipt_ids_json,
        requested_by_principal_id, invocation_provenance_json,
        status, attempt_count, requested_at,
        updated_at, completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'requested', 0, ?, ?, NULL)
    `).run(receiptId, binding.connector_binding_id, revision.connector_binding_revision_id, owner.kind, owner.id, action.interface_id, idempotencyKey, inputDigest, JSON.stringify(inputRefs), JSON.stringify(secretRefIds), JSON.stringify([...revision.content.capability_grant_ids].sort()), JSON.stringify(approvalReceiptIds), requestedByPrincipalId, JSON.stringify(invocationProvenance), at, at);
        return { replayed: false, receipt: this.requireExternalEffectReceiptForOwner(receiptId, owner) };
    }
    beginExternalActionAttempt(input) {
        const owner = normalizeOwner(input.owner);
        const receipt = this.requireExternalEffectReceiptForOwner(input.external_effect_receipt_id, owner);
        const action = this.actionForReceipt(receipt);
        if (receipt.status === "outcome_unknown") {
            throw new ExternalActionStateError(receipt.external_effect_receipt_id, "reconcile the uncertain effect before any retry");
        }
        if (receipt.status === "running" || receipt.status === "succeeded") {
            throw new ExternalActionStateError(receipt.external_effect_receipt_id, `its current status is ${receipt.status}`);
        }
        if (receipt.status === "failed") {
            const reconciledFailure = this.latestActionReconciliation(receipt.external_effect_receipt_id)?.outcome === "failed";
            if (action.retry === "never" || (action.retry === "after_reconcile" && !reconciledFailure)) {
                throw new ExternalActionStateError(receipt.external_effect_receipt_id, action.retry === "never" ? "this action contract forbids retry" : "reconcile and prove the effect absent before retry");
            }
        }
        const evidence = normalizeRef(input.request_evidence_ref, "request_evidence_ref");
        const attemptId = `external_action_attempt_${randomUUID()}`;
        const attemptNumber = receipt.attempt_count + 1;
        const at = this.now();
        transaction(this.db, "external_action_begin", () => {
            this.db.prepare(`
        INSERT INTO external_action_attempts (
          external_action_attempt_id, external_effect_receipt_id, attempt_number,
          status, request_evidence_ref_json, provider_response_ref_json,
          observed_result_ref_json, error_code, error_message, started_at, completed_at
        ) VALUES (?, ?, ?, 'started', ?, NULL, NULL, NULL, NULL, ?, NULL)
      `).run(attemptId, receipt.external_effect_receipt_id, attemptNumber, JSON.stringify(evidence), at);
            this.db.prepare(`
        UPDATE external_effect_receipts
        SET status = 'running', attempt_count = ?, updated_at = ?, completed_at = NULL
        WHERE external_effect_receipt_id = ?
      `).run(attemptNumber, at, receipt.external_effect_receipt_id);
        });
        return this.requireExternalActionAttempt(attemptId);
    }
    completeExternalActionAttempt(input) {
        const owner = normalizeOwner(input.owner);
        const attempt = this.requireExternalActionAttempt(input.external_action_attempt_id);
        const receipt = this.requireExternalEffectReceiptForOwner(attempt.external_effect_receipt_id, owner);
        if (attempt.status !== "started" || receipt.status !== "running") {
            throw new ExternalActionStateError(receipt.external_effect_receipt_id, "the attempt is no longer active");
        }
        const providerResponse = input.provider_response_ref == null
            ? null
            : normalizeRef(input.provider_response_ref, "provider_response_ref");
        const observedResult = input.observed_result_ref == null
            ? null
            : normalizeRef(input.observed_result_ref, "observed_result_ref");
        if (input.outcome === "succeeded" && !providerResponse && !observedResult) {
            throw new ConnectorValidationError("a succeeded external action requires provider or observed-result evidence");
        }
        if (input.outcome !== "succeeded" && input.error_message == null) {
            throw new ConnectorValidationError("a failed or uncertain external action requires an error message");
        }
        const at = this.now();
        transaction(this.db, "external_action_complete", () => {
            this.db.prepare(`
        UPDATE external_action_attempts
        SET status = ?, provider_response_ref_json = ?, observed_result_ref_json = ?,
            error_code = ?, error_message = ?, completed_at = ?
        WHERE external_action_attempt_id = ?
      `).run(input.outcome, providerResponse === null ? null : JSON.stringify(providerResponse), observedResult === null ? null : JSON.stringify(observedResult), input.error_code == null ? null : requireText(input.error_code, "error_code"), input.error_message == null ? null : requireText(input.error_message, "error_message", 4096), at, attempt.external_action_attempt_id);
            this.db.prepare(`
        UPDATE external_effect_receipts
        SET status = ?, updated_at = ?, completed_at = ?
        WHERE external_effect_receipt_id = ?
      `).run(input.outcome, at, input.outcome === "succeeded" ? at : null, receipt.external_effect_receipt_id);
        });
        return {
            receipt: this.requireExternalEffectReceiptForOwner(receipt.external_effect_receipt_id, owner),
            attempt: this.requireExternalActionAttempt(attempt.external_action_attempt_id),
        };
    }
    reconcileExternalAction(input) {
        const owner = normalizeOwner(input.owner);
        const receipt = this.requireExternalEffectReceiptForOwner(input.external_effect_receipt_id, owner);
        if (receipt.status !== "outcome_unknown") {
            throw new ExternalActionStateError(receipt.external_effect_receipt_id, "only an uncertain effect can be reconciled");
        }
        const evidence = normalizeRef(input.evidence_ref, "evidence_ref");
        const id = `external_action_reconciliation_${randomUUID()}`;
        const at = this.now();
        transaction(this.db, "external_action_reconcile", () => {
            this.db.prepare(`
        INSERT INTO external_action_reconciliations (
          external_action_reconciliation_id, external_effect_receipt_id,
          outcome, evidence_ref_json, reconciled_by_principal_id, reconciled_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(id, receipt.external_effect_receipt_id, input.outcome, JSON.stringify(evidence), requireText(input.reconciled_by_principal_id, "reconciled_by_principal_id"), at);
            this.db.prepare(`
        UPDATE external_effect_receipts
        SET status = ?, updated_at = ?, completed_at = ?
        WHERE external_effect_receipt_id = ?
      `).run(input.outcome, at, input.outcome === "succeeded" ? at : null, receipt.external_effect_receipt_id);
        });
        return {
            receipt: this.requireExternalEffectReceiptForOwner(receipt.external_effect_receipt_id, owner),
            reconciliation: this.requireActionReconciliation(id),
        };
    }
    getDefinition(id) {
        const row = this.db.prepare(`SELECT * FROM connector_definitions WHERE connector_definition_id = ?`).get(id);
        return row ? rowToDefinition(row) : null;
    }
    requireDefinition(id) {
        const value = this.getDefinition(id);
        if (!value)
            throw new ConnectorNotFoundError("ConnectorDefinition", id);
        return value;
    }
    requireDefinitionForOwner(id, owner) {
        const value = this.requireDefinition(id);
        assertOwner(normalizeOwner(owner), value.owner);
        return value;
    }
    getDefinitionRevision(id) {
        const row = this.db.prepare(`
      SELECT * FROM connector_definition_revisions WHERE connector_definition_revision_id = ?
    `).get(id);
        return row ? rowToDefinitionRevision(row) : null;
    }
    requireDefinitionRevision(id) {
        const value = this.getDefinitionRevision(id);
        if (!value)
            throw new ConnectorNotFoundError("ConnectorDefinitionRevision", id);
        return value;
    }
    requireDefinitionRevisionForOwner(id, owner) {
        const revision = this.requireDefinitionRevision(id);
        this.requireDefinitionForOwner(revision.connector_definition_id, owner);
        return revision;
    }
    listDefinitions(owner, options = {}) {
        const normalized = normalizeOwner(owner);
        return this.db.prepare(`
      SELECT * FROM connector_definitions
      WHERE owner_kind = ? AND owner_id = ? ${options.include_retired ? "" : "AND status = 'active'"}
      ORDER BY created_at, connector_definition_id
    `).all(normalized.kind, normalized.id).map(rowToDefinition);
    }
    listDefinitionRevisions(id, owner) {
        this.requireDefinitionForOwner(id, owner);
        return this.db.prepare(`
      SELECT * FROM connector_definition_revisions
      WHERE connector_definition_id = ? ORDER BY revision_number DESC
    `).all(id).map(rowToDefinitionRevision);
    }
    getBinding(id) {
        const row = this.db.prepare(`SELECT * FROM connector_bindings WHERE connector_binding_id = ?`).get(id);
        return row ? rowToBinding(row) : null;
    }
    requireBinding(id) {
        const value = this.getBinding(id);
        if (!value)
            throw new ConnectorNotFoundError("ConnectorBinding", id);
        return value;
    }
    requireBindingForOwner(id, owner) {
        const value = this.requireBinding(id);
        assertOwner(normalizeOwner(owner), value.owner);
        return value;
    }
    getBindingRevision(id) {
        const row = this.db.prepare(`
      SELECT * FROM connector_binding_revisions WHERE connector_binding_revision_id = ?
    `).get(id);
        return row ? rowToBindingRevision(row) : null;
    }
    requireBindingRevision(id) {
        const value = this.getBindingRevision(id);
        if (!value)
            throw new ConnectorNotFoundError("ConnectorBindingRevision", id);
        return value;
    }
    requireBindingRevisionForOwner(id, owner) {
        const revision = this.requireBindingRevision(id);
        this.requireBindingForOwner(revision.connector_binding_id, owner);
        return revision;
    }
    listBindings(owner, options = {}) {
        const normalized = normalizeOwner(owner);
        return this.db.prepare(`
      SELECT * FROM connector_bindings
      WHERE owner_kind = ? AND owner_id = ? ${options.include_retired ? "" : "AND status != 'retired'"}
      ORDER BY created_at, connector_binding_id
    `).all(normalized.kind, normalized.id).map(rowToBinding);
    }
    listBindingRevisions(id, owner) {
        this.requireBindingForOwner(id, owner);
        return this.db.prepare(`
      SELECT * FROM connector_binding_revisions
      WHERE connector_binding_id = ? ORDER BY revision_number DESC
    `).all(id).map(rowToBindingRevision);
    }
    listHeadChanges(resourceKind, resourceId) {
        return this.db.prepare(`
      SELECT * FROM connector_head_changes
      WHERE resource_kind = ? AND resource_id = ? ORDER BY changed_at, head_change_id
    `).all(resourceKind, resourceId).map(rowToHeadChange);
    }
    currentHealth(bindingId, owner) {
        this.requireBindingForOwner(bindingId, owner);
        const row = this.db.prepare(`
      SELECT * FROM connector_health_observations
      WHERE connector_binding_id = ? ORDER BY recorded_at DESC, connector_health_observation_id DESC LIMIT 1
    `).get(bindingId);
        return row ? rowToHealth(row) : null;
    }
    listQuarantinedIngress(owner) {
        const normalized = normalizeOwner(owner);
        return this.db.prepare(`
      SELECT * FROM connector_ingress_receipts
      WHERE owner_kind = ? AND owner_id = ? AND status = 'quarantined'
      ORDER BY first_observed_at, connector_ingress_receipt_id
    `).all(normalized.kind, normalized.id).map(rowToIngressReceipt);
    }
    getIngressReceipt(id) {
        const row = this.db.prepare(`
      SELECT * FROM connector_ingress_receipts WHERE connector_ingress_receipt_id = ?
    `).get(id);
        return row ? rowToIngressReceipt(row) : null;
    }
    requireIngressReceipt(id) {
        const value = this.getIngressReceipt(id);
        if (!value)
            throw new ConnectorNotFoundError("ConnectorIngressReceipt", id);
        return value;
    }
    requireIngressReceiptForOwner(id, owner) {
        const value = this.requireIngressReceipt(id);
        assertOwner(normalizeOwner(owner), value.owner);
        return value;
    }
    listIngressObservations(receiptId, owner) {
        this.requireIngressReceiptForOwner(receiptId, owner);
        return this.db.prepare(`
      SELECT * FROM connector_ingress_observations
      WHERE connector_ingress_receipt_id = ? ORDER BY recorded_at, connector_ingress_observation_id
    `).all(receiptId).map(rowToIngressObservation);
    }
    getExternalEffectReceipt(id) {
        const row = this.db.prepare(`
      SELECT * FROM external_effect_receipts WHERE external_effect_receipt_id = ?
    `).get(id);
        return row ? rowToExternalEffect(row) : null;
    }
    listExternalEffectReceipts(owner, options = {}) {
        const normalized = normalizeOwner(owner);
        const statuses = options.statuses === undefined
            ? ["requested", "running", "succeeded", "failed", "outcome_unknown"]
            : uniqueTexts(options.statuses, "external effect status");
        if (statuses.some((status) => !["requested", "running", "succeeded", "failed", "outcome_unknown"].includes(status))) {
            throw new ConnectorValidationError("unknown ExternalEffectReceipt status");
        }
        if (statuses.length === 0)
            return [];
        const bindingId = options.connector_binding_id === undefined
            ? null
            : requireText(options.connector_binding_id, "connector_binding_id");
        const placeholders = statuses.map(() => "?").join(", ");
        return this.db.prepare(`
      SELECT * FROM external_effect_receipts
      WHERE owner_kind = ? AND owner_id = ?
        AND status IN (${placeholders})
        AND (? IS NULL OR connector_binding_id = ?)
      ORDER BY requested_at, external_effect_receipt_id
    `).all(normalized.kind, normalized.id, ...statuses, bindingId, bindingId)
            .map(rowToExternalEffect);
    }
    requireExternalEffectReceiptForOwner(id, owner) {
        const value = this.getExternalEffectReceipt(id);
        if (!value)
            throw new ConnectorNotFoundError("ExternalEffectReceipt", id);
        assertOwner(normalizeOwner(owner), value.owner);
        return value;
    }
    listExternalActionAttempts(receiptId, owner) {
        this.requireExternalEffectReceiptForOwner(receiptId, owner);
        return this.db.prepare(`
      SELECT * FROM external_action_attempts
      WHERE external_effect_receipt_id = ? ORDER BY attempt_number
    `).all(receiptId).map(rowToActionAttempt);
    }
    getSourceInterfaceForBinding(bindingId, owner, interfaceId) {
        const binding = this.requireBindingForOwner(bindingId, owner);
        return this.requireActiveSource(bindingId, binding.current_revision_id, owner, interfaceId).source;
    }
    getActionInterfaceForBinding(bindingId, owner, interfaceId) {
        const binding = this.requireBindingForOwner(bindingId, owner);
        const revision = this.requireBindingRevision(binding.current_revision_id);
        const definition = this.requireDefinitionRevision(revision.connector_definition_revision_id);
        const action = definition.content.action_interfaces.find((item) => item.interface_id === interfaceId);
        if (!action || !revision.content.enabled_action_interface_ids.includes(interfaceId)) {
            throw new ConnectorValidationError(`action interface '${interfaceId}' is not enabled by this binding`);
        }
        return action;
    }
    requireHealthObservation(id) {
        const row = this.db.prepare(`
      SELECT * FROM connector_health_observations WHERE connector_health_observation_id = ?
    `).get(id);
        if (!row)
            throw new ConnectorNotFoundError("ConnectorHealthObservation", id);
        return rowToHealth(row);
    }
    requireExternalEffectReceipt(id) {
        const value = this.getExternalEffectReceipt(id);
        if (!value)
            throw new ConnectorNotFoundError("ExternalEffectReceipt", id);
        return value;
    }
    requireExternalActionAttempt(id) {
        const row = this.db.prepare(`
      SELECT * FROM external_action_attempts WHERE external_action_attempt_id = ?
    `).get(id);
        if (!row)
            throw new ConnectorNotFoundError("ExternalActionAttempt", id);
        return rowToActionAttempt(row);
    }
    requireActionReconciliation(id) {
        const row = this.db.prepare(`
      SELECT * FROM external_action_reconciliations WHERE external_action_reconciliation_id = ?
    `).get(id);
        if (!row)
            throw new ConnectorNotFoundError("ExternalActionReconciliation", id);
        return rowToActionReconciliation(row);
    }
    latestActionReconciliation(receiptId) {
        const row = this.db.prepare(`
      SELECT * FROM external_action_reconciliations
      WHERE external_effect_receipt_id = ?
      ORDER BY reconciled_at DESC, external_action_reconciliation_id DESC LIMIT 1
    `).get(receiptId);
        return row ? rowToActionReconciliation(row) : null;
    }
    actionForReceipt(receipt) {
        const revision = this.requireBindingRevision(receipt.connector_binding_revision_id);
        const definition = this.requireDefinitionRevision(revision.connector_definition_revision_id);
        const action = definition.content.action_interfaces.find((item) => item.interface_id === receipt.action_interface_id);
        if (!action)
            throw new ConnectorValidationError("the pinned external action interface is no longer retained");
        return action;
    }
    requireActiveSource(bindingId, bindingRevisionId, owner, interfaceId) {
        const binding = this.requireBindingForOwner(bindingId, owner);
        if (binding.status !== "enabled")
            throw new ConnectorLifecycleConflictError(binding.connector_binding_id, "it is not enabled");
        if (binding.current_revision_id !== bindingRevisionId) {
            throw new ConnectorRevisionConflictError(binding.connector_binding_id, bindingRevisionId, binding.current_revision_id);
        }
        const revision = this.requireBindingRevision(bindingRevisionId);
        const definition = this.requireDefinitionRevision(revision.connector_definition_revision_id);
        const source = definition.content.source_interfaces.find((item) => item.interface_id === interfaceId);
        if (!source || !revision.content.enabled_source_interface_ids.includes(interfaceId)) {
            throw new ConnectorValidationError(`source interface '${interfaceId}' is not enabled by this binding`);
        }
        return { binding, revision, source };
    }
    requireActiveAction(bindingId, bindingRevisionId, owner, interfaceId) {
        const binding = this.requireBindingForOwner(bindingId, owner);
        if (binding.status !== "enabled")
            throw new ConnectorLifecycleConflictError(binding.connector_binding_id, "it is not enabled");
        if (binding.current_revision_id !== bindingRevisionId) {
            throw new ConnectorRevisionConflictError(binding.connector_binding_id, bindingRevisionId, binding.current_revision_id);
        }
        const revision = this.requireBindingRevision(bindingRevisionId);
        const definition = this.requireDefinitionRevision(revision.connector_definition_revision_id);
        const action = definition.content.action_interfaces.find((item) => item.interface_id === interfaceId);
        if (!action || !revision.content.enabled_action_interface_ids.includes(interfaceId)) {
            throw new ConnectorValidationError(`action interface '${interfaceId}' is not enabled by this binding`);
        }
        return { binding, revision, action };
    }
    assertBindingReady(binding) {
        const revision = this.requireBindingRevision(binding.current_revision_id);
        const definition = this.requireDefinitionRevision(revision.connector_definition_revision_id);
        const definitionRecord = this.requireDefinition(definition.connector_definition_id);
        if (definitionRecord.status !== "active") {
            throw new ConnectorLifecycleConflictError(binding.connector_binding_id, "its ConnectorDefinition is retired");
        }
        const selectedSources = definition.content.source_interfaces
            .filter((item) => revision.content.enabled_source_interface_ids.includes(item.interface_id));
        const selectedActions = definition.content.action_interfaces
            .filter((item) => revision.content.enabled_action_interface_ids.includes(item.interface_id));
        const usedSlots = new Set([...selectedSources, ...selectedActions].flatMap((item) => item.credential_slot_ids));
        const boundSlots = new Set(revision.content.secret_bindings.map((item) => item.slot_id));
        const missingSlots = definition.content.credential_slots
            .filter((slot) => slot.required && usedSlots.has(slot.slot_id) && !boundSlots.has(slot.slot_id))
            .map((slot) => slot.slot_id);
        if (missingSlots.length > 0) {
            throw new ConnectorLifecycleConflictError(binding.connector_binding_id, `required SecretRef slots are unresolved: ${missingSlots.join(", ")}`);
        }
        const requiredCapabilities = [...selectedSources, ...selectedActions]
            .flatMap((item) => item.required_capability_ids);
        if (requiredCapabilities.length > 0 && revision.content.capability_grant_ids.length === 0) {
            throw new ConnectorLifecycleConflictError(binding.connector_binding_id, "required capabilities have no CapabilityGrant reference");
        }
    }
    assertDefinitionMayBind(definition, owner) {
        if (definition.owner.kind === "workspace" && !sameOwner(definition.owner, owner)) {
            throw new ConnectorOwnerMismatchError(owner, definition.owner);
        }
    }
    insertHeadChange(resourceKind, resourceId, owner, fromRevisionId, toRevisionId, principalId, at) {
        this.db.prepare(`
      INSERT INTO connector_head_changes (
        head_change_id, resource_kind, resource_id, owner_kind, owner_id,
        from_revision_id, to_revision_id, changed_by_principal_id, changed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(`connector_head_change_${randomUUID()}`, resourceKind, resourceId, owner.kind, owner.id, fromRevisionId, toRevisionId, principalId, at);
    }
    insertIngressObservation(input) {
        const id = `connector_ingress_observation_${randomUUID()}`;
        this.db.prepare(`
      INSERT INTO connector_ingress_observations (
        connector_ingress_observation_id, connector_ingress_receipt_id,
        connector_binding_revision_id, classification, idempotency_key, external_identity, external_revision,
        payload_digest, verification_json, evidence_refs_json, observed_at, recorded_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, input.receipt_id, input.binding_revision_id, input.classification, input.idempotency_key, input.external_identity, input.external_revision, input.payload_digest, JSON.stringify(input.verification), JSON.stringify(input.evidence_refs), input.observed_at, input.recorded_at);
        const row = this.db.prepare(`
      SELECT * FROM connector_ingress_observations WHERE connector_ingress_observation_id = ?
    `).get(id);
        return rowToIngressObservation(row);
    }
    nextOrdinal(table, foreignKey, id) {
        const allowed = new Set([
            "connector_definition_revisions:connector_definition_id",
            "connector_binding_revisions:connector_binding_id",
        ]);
        if (!allowed.has(`${table}:${foreignKey}`))
            throw new Error("Unsupported Connector ordinal query");
        const row = this.db.prepare(`
      SELECT COALESCE(MAX(revision_number), 0) + 1 AS next FROM ${table} WHERE ${foreignKey} = ?
    `).get(id);
        return Number(row.next);
    }
}
export function connectorDefinitionDigest(content) {
    validateConnectorDefinition(content);
    return sha256(canonicalJson(normalizeJson(content)));
}
export function connectorBindingDigest(connectorDefinitionRevisionId, content) {
    requireText(connectorDefinitionRevisionId, "connector_definition_revision_id");
    return sha256(canonicalJson(normalizeJson({ connector_definition_revision_id: connectorDefinitionRevisionId, content })));
}
export function connectorBindingStateRevision(binding) {
    return sha256(canonicalJson(normalizeJson({
        current_revision_id: binding.current_revision_id,
        status: binding.status,
        state_version: binding.state_version,
    })));
}
export function externalEffectStateRevision(receipt) {
    return sha256(canonicalJson(normalizeJson({
        status: receipt.status,
        attempt_count: receipt.attempt_count,
        updated_at: receipt.updated_at,
    })));
}
export function validateConnectorDefinition(content) {
    requireText(content.label, "definition.label");
    requireText(content.description, "definition.description", 8192);
    normalizeRef(content.implementation_ref, "definition.implementation_ref");
    requireText(content.configuration_schema_ref, "definition.configuration_schema_ref");
    if (content.configuration_ui_schema_ref !== null) {
        requireText(content.configuration_ui_schema_ref, "definition.configuration_ui_schema_ref");
    }
    const slotIds = uniqueTexts(content.credential_slots.map((item) => item.slot_id), "credential slot id");
    for (const slot of content.credential_slots) {
        requireText(slot.title, `credential slot '${slot.slot_id}' title`);
        requireText(slot.purpose, `credential slot '${slot.slot_id}' purpose`, 4096);
    }
    const sourceIds = uniqueTexts(content.source_interfaces.map((item) => item.interface_id), "source interface id");
    const actionIds = uniqueTexts(content.action_interfaces.map((item) => item.interface_id), "action interface id");
    uniqueTexts([...sourceIds, ...actionIds], "Connector interface id");
    const slots = new Set(slotIds);
    for (const source of content.source_interfaces) {
        requireText(source.title, `source '${source.interface_id}' title`);
        requireText(source.source_kind, `source '${source.interface_id}' kind`);
        requireText(source.event_type, `source '${source.interface_id}' event_type`);
        requireText(source.payload_schema_ref, `source '${source.interface_id}' payload_schema_ref`);
        if (source.observation_mode === "connector_poll" && !source.polling_contract_ref) {
            throw new ConnectorValidationError(`polling source '${source.interface_id}' must name its Connector-worker polling contract`);
        }
        if (source.observation_mode === "push" && source.polling_contract_ref !== null) {
            throw new ConnectorValidationError(`push source '${source.interface_id}' cannot declare a polling contract`);
        }
        if (source.verification.mode === "none" && source.verification.verifier_ref !== null) {
            throw new ConnectorValidationError(`source '${source.interface_id}' cannot name a verifier when verification is disabled`);
        }
        if (source.verification.mode !== "none" && !source.verification.verifier_ref) {
            throw new ConnectorValidationError(`source '${source.interface_id}' must name its verifier`);
        }
        verifySlots(source.credential_slot_ids, slots, `source '${source.interface_id}'`);
        uniqueTexts(source.required_capability_ids, `source '${source.interface_id}' capability id`);
        if (source.checkpoint_schema_ref !== null)
            requireText(source.checkpoint_schema_ref, "checkpoint_schema_ref");
    }
    const actionsById = new Map(content.action_interfaces.map((item) => [item.interface_id, item]));
    for (const action of content.action_interfaces) {
        requireText(action.title, `action '${action.interface_id}' title`);
        requireText(action.action_kind, `action '${action.interface_id}' kind`);
        requireText(action.input_schema_ref, `action '${action.interface_id}' input_schema_ref`);
        requireText(action.result_schema_ref, `action '${action.interface_id}' result_schema_ref`);
        if (action.retry === "safe" && !["required", "provider_guaranteed"].includes(action.idempotency)) {
            throw new ConnectorValidationError(`safely retried action '${action.interface_id}' must require idempotency`);
        }
        if (action.compensation_action_interface_id !== null) {
            const compensation = actionsById.get(action.compensation_action_interface_id);
            if (!compensation || compensation.interface_id === action.interface_id) {
                throw new ConnectorValidationError(`action '${action.interface_id}' names an invalid compensation action`);
            }
        }
        if (action.approval.required && !action.approval.policy_ref) {
            throw new ConnectorValidationError(`action '${action.interface_id}' requires an approval policy reference`);
        }
        if (!action.approval.required && action.approval.policy_ref !== null) {
            throw new ConnectorValidationError(`action '${action.interface_id}' cannot name approval policy when approval is disabled`);
        }
        verifySlots(action.credential_slot_ids, slots, `action '${action.interface_id}'`);
        uniqueTexts(action.required_capability_ids, `action '${action.interface_id}' capability id`);
    }
    requireText(content.health.check_capability_id, "definition.health.check_capability_id");
    if (content.health.evidence_schema_ref !== null)
        requireText(content.health.evidence_schema_ref, "health.evidence_schema_ref");
    if (content.rate_limit_policy_ref !== null)
        requireText(content.rate_limit_policy_ref, "rate_limit_policy_ref");
}
export function validateConnectorBinding(content, definition) {
    requireText(content.external_resource.kind, "binding.external_resource.kind");
    requireText(content.external_resource.id, "binding.external_resource.id");
    if (content.external_resource.display_name !== null) {
        requireText(content.external_resource.display_name, "binding.external_resource.display_name");
    }
    normalizeJson(content.configuration);
    rejectSecretMaterial(content.configuration, "binding.configuration");
    const sourceIds = new Set(definition.source_interfaces.map((item) => item.interface_id));
    const actionIds = new Set(definition.action_interfaces.map((item) => item.interface_id));
    for (const id of uniqueTexts(content.enabled_source_interface_ids, "enabled source interface id")) {
        if (!sourceIds.has(id))
            throw new ConnectorValidationError(`unknown source interface '${id}'`);
    }
    for (const id of uniqueTexts(content.enabled_action_interface_ids, "enabled action interface id")) {
        if (!actionIds.has(id))
            throw new ConnectorValidationError(`unknown action interface '${id}'`);
    }
    const slots = new Set(definition.credential_slots.map((item) => item.slot_id));
    const usedSlots = new Set();
    for (const binding of content.secret_bindings) {
        const slot = requireText(binding.slot_id, "secret binding slot_id");
        if (!slots.has(slot))
            throw new ConnectorValidationError(`unknown credential slot '${slot}'`);
        if (usedSlots.has(slot))
            throw new ConnectorValidationError(`duplicate SecretRef binding for slot '${slot}'`);
        usedSlots.add(slot);
        requireText(binding.secret_ref_id, `SecretRef for '${slot}'`);
    }
    uniqueTexts(content.capability_grant_ids, "CapabilityGrant id");
}
function normalizeOwner(owner) {
    if (!owner || !["workspace", "host", "deployment"].includes(owner.kind)) {
        throw new ConnectorValidationError("owner kind must be workspace, host, or deployment");
    }
    return { kind: owner.kind, id: requireText(owner.id, "owner.id") };
}
function sameOwner(left, right) {
    return left.kind === right.kind && left.id === right.id;
}
function assertOwner(expected, actual) {
    if (!sameOwner(expected, actual))
        throw new ConnectorOwnerMismatchError(expected, actual);
}
function normalizeVerification(value) {
    if (!value || !["verified", "failed", "not_applicable"].includes(value.origin)) {
        throw new ConnectorValidationError("ingress origin verification is invalid");
    }
    if (!["verified", "failed", "not_applicable"].includes(value.signature)) {
        throw new ConnectorValidationError("ingress signature verification is invalid");
    }
    if (!["valid", "invalid"].includes(value.schema)) {
        throw new ConnectorValidationError("ingress schema verification is invalid");
    }
    return {
        origin: value.origin,
        signature: value.signature,
        schema: value.schema,
        issues: uniqueTexts(value.issues, "verification issue"),
    };
}
function ingressVerificationAccepted(source, verification) {
    if (verification.schema !== "valid")
        return false;
    if (source.verification.mode === "none")
        return true;
    if (verification.origin !== "verified")
        return false;
    if (source.verification.mode === "signature" && verification.signature !== "verified")
        return false;
    return true;
}
function verifySlots(values, available, label) {
    for (const value of uniqueTexts(values, `${label} credential slot id`)) {
        if (!available.has(value))
            throw new ConnectorValidationError(`${label} references unknown credential slot '${value}'`);
    }
}
function normalizeRefs(values, label) {
    return values.map((value, index) => normalizeRef(value, `${label}[${index}]`));
}
function normalizeRef(value, label) {
    if (!value || typeof value !== "object")
        throw new ConnectorValidationError(`${label} must be a resource reference`);
    return {
        kind: requireText(value.kind, `${label}.kind`),
        id: requireText(value.id, `${label}.id`),
        revision: value.revision == null ? null : requireText(value.revision, `${label}.revision`),
    };
}
function rejectSecretMaterial(value, path) {
    if (Array.isArray(value)) {
        value.forEach((item, index) => rejectSecretMaterial(item, `${path}[${index}]`));
        return;
    }
    if (!value || typeof value !== "object")
        return;
    for (const [key, item] of Object.entries(value)) {
        if (/^(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret|credential|authorization)$/i.test(key)) {
            throw new ConnectorValidationError(`${path}.${key} must be represented by a SecretRef`);
        }
        rejectSecretMaterial(item, `${path}.${key}`);
    }
}
function requireText(value, label, maximum = 2048) {
    if (typeof value !== "string"
        || value.trim().length === 0
        || value.length > maximum
        || /[\u0000-\u001f\u007f]/.test(value)) {
        throw new ConnectorValidationError(`${label} must be non-empty text without control characters`);
    }
    return value;
}
function uniqueTexts(values, label) {
    const result = [];
    const seen = new Set();
    for (const candidate of values) {
        const value = requireText(candidate, label);
        if (seen.has(value))
            throw new ConnectorValidationError(`duplicate ${label} '${value}'`);
        seen.add(value);
        result.push(value);
    }
    return result;
}
function normalizeInvocationProvenance(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new ConnectorValidationError("invocation_provenance must contain authenticated operation provenance");
    }
    const candidate = value;
    const expected = [
        "cause_event_id",
        "delivery_ids",
        "execution_attempt_id",
        "node_execution_id",
        "scope_execution_id",
    ];
    if (Object.keys(candidate).some((key) => !expected.includes(key))) {
        throw new ConnectorValidationError("invocation_provenance contains an unknown field");
    }
    if (!Array.isArray(candidate.delivery_ids)) {
        throw new ConnectorValidationError("invocation_provenance.delivery_ids must be an array");
    }
    const nullableRef = (field) => {
        const item = candidate[field];
        return item == null ? null : requireText(item, `invocation_provenance.${field}`);
    };
    return {
        cause_event_id: nullableRef("cause_event_id"),
        delivery_ids: uniqueTexts(candidate.delivery_ids, "invocation_provenance.delivery_id"),
        execution_attempt_id: nullableRef("execution_attempt_id"),
        node_execution_id: nullableRef("node_execution_id"),
        scope_execution_id: nullableRef("scope_execution_id"),
    };
}
function requireTimestamp(value, label) {
    const text = requireText(value, label);
    if (!Number.isFinite(Date.parse(text)))
        throw new ConnectorValidationError(`${label} must be an ISO timestamp`);
    return text;
}
function requireDigest(value, label) {
    const text = requireText(value, label, 64).toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(text))
        throw new ConnectorValidationError(`${label} must be a SHA-256 digest`);
    return text;
}
function normalizeJson(value, label = "JSON value") {
    if (value === null || typeof value === "string" || typeof value === "boolean")
        return value;
    if (typeof value === "number") {
        if (!Number.isFinite(value))
            throw new ConnectorValidationError(`${label} contains a non-finite number`);
        return value;
    }
    if (Array.isArray(value))
        return value.map((item, index) => normalizeJson(item, `${label}[${index}]`));
    if (typeof value === "object") {
        const prototype = Object.getPrototypeOf(value);
        if (prototype !== Object.prototype && prototype !== null) {
            throw new ConnectorValidationError(`${label} must contain plain JSON objects`);
        }
        const output = {};
        for (const [key, item] of Object.entries(value)) {
            requireText(key, `${label} key`, 512);
            if (item === undefined)
                throw new ConnectorValidationError(`${label}.${key} is undefined`);
            output[key] = normalizeJson(item, `${label}.${key}`);
        }
        return output;
    }
    throw new ConnectorValidationError(`${label} must contain JSON data only`);
}
function canonicalJson(value) {
    if (Array.isArray(value))
        return `[${value.map(canonicalJson).join(",")}]`;
    if (value && typeof value === "object") {
        return `{${Object.entries(value)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
            .join(",")}}`;
    }
    return JSON.stringify(value);
}
function sha256(value) {
    return createHash("sha256").update(value).digest("hex");
}
function transaction(db, label, action) {
    const savepoint = label.replace(/[^a-z0-9_]/gi, "_");
    db.exec(`SAVEPOINT ${savepoint}`);
    try {
        const result = action();
        db.exec(`RELEASE ${savepoint}`);
        return result;
    }
    catch (error) {
        db.exec(`ROLLBACK TO ${savepoint}`);
        db.exec(`RELEASE ${savepoint}`);
        throw error;
    }
}
function rowOwner(row) {
    return { kind: row.owner_kind, id: String(row.owner_id) };
}
function rowToDefinition(row) {
    return {
        connector_definition_id: String(row.connector_definition_id),
        owner: rowOwner(row),
        status: row.status,
        current_revision_id: String(row.current_revision_id),
        created_at: String(row.created_at),
        updated_at: String(row.updated_at),
        retired_at: row.retired_at == null ? null : String(row.retired_at),
    };
}
function rowToDefinitionRevision(row) {
    return {
        connector_definition_revision_id: String(row.connector_definition_revision_id),
        connector_definition_id: String(row.connector_definition_id),
        revision_number: Number(row.revision_number),
        based_on_revision_id: row.based_on_revision_id == null ? null : String(row.based_on_revision_id),
        semantic_digest: String(row.semantic_digest),
        content: JSON.parse(String(row.content_json)),
        created_by_principal_id: String(row.created_by_principal_id),
        created_at: String(row.created_at),
        published_at: String(row.published_at),
    };
}
function rowToBinding(row) {
    return {
        connector_binding_id: String(row.connector_binding_id),
        connector_definition_id: String(row.connector_definition_id),
        owner: rowOwner(row),
        status: row.status,
        state_version: Number(row.state_version),
        current_revision_id: String(row.current_revision_id),
        created_at: String(row.created_at),
        updated_at: String(row.updated_at),
        enabled_at: row.enabled_at == null ? null : String(row.enabled_at),
        disabled_at: row.disabled_at == null ? null : String(row.disabled_at),
        retired_at: row.retired_at == null ? null : String(row.retired_at),
    };
}
function rowToBindingRevision(row) {
    return {
        connector_binding_revision_id: String(row.connector_binding_revision_id),
        connector_binding_id: String(row.connector_binding_id),
        connector_definition_revision_id: String(row.connector_definition_revision_id),
        revision_number: Number(row.revision_number),
        based_on_revision_id: row.based_on_revision_id == null ? null : String(row.based_on_revision_id),
        semantic_digest: String(row.semantic_digest),
        content: JSON.parse(String(row.content_json)),
        created_by_principal_id: String(row.created_by_principal_id),
        created_at: String(row.created_at),
        published_at: String(row.published_at),
    };
}
function rowToHeadChange(row) {
    return {
        head_change_id: String(row.head_change_id),
        resource_kind: row.resource_kind,
        resource_id: String(row.resource_id),
        owner: rowOwner(row),
        from_revision_id: row.from_revision_id == null ? null : String(row.from_revision_id),
        to_revision_id: String(row.to_revision_id),
        changed_by_principal_id: String(row.changed_by_principal_id),
        changed_at: String(row.changed_at),
    };
}
function rowToHealth(row) {
    return {
        connector_health_observation_id: String(row.connector_health_observation_id),
        connector_binding_id: String(row.connector_binding_id),
        connector_binding_revision_id: String(row.connector_binding_revision_id),
        owner: rowOwner(row),
        status: row.status,
        code: row.code == null ? null : String(row.code),
        message: String(row.message),
        evidence_refs: JSON.parse(String(row.evidence_refs_json)),
        observed_at: String(row.observed_at),
        recorded_at: String(row.recorded_at),
    };
}
function rowToIngressReceipt(row) {
    return {
        connector_ingress_receipt_id: String(row.connector_ingress_receipt_id),
        connector_binding_id: String(row.connector_binding_id),
        connector_binding_revision_id: String(row.connector_binding_revision_id),
        owner: rowOwner(row),
        source_interface_id: String(row.source_interface_id),
        deduplication_key: String(row.deduplication_key),
        idempotency_key: String(row.idempotency_key),
        external_identity: String(row.external_identity),
        external_revision: row.external_revision == null ? null : String(row.external_revision),
        payload_digest: String(row.payload_digest),
        status: row.status,
        normalized_event_id: row.normalized_event_id == null ? null : String(row.normalized_event_id),
        artefact_version_ids: JSON.parse(String(row.artefact_version_ids_json)),
        checkpoint_ref: row.checkpoint_ref_json == null
            ? null
            : JSON.parse(String(row.checkpoint_ref_json)),
        first_observed_at: String(row.first_observed_at),
        last_observed_at: String(row.last_observed_at),
        physical_observation_count: Number(row.physical_observation_count),
    };
}
function rowToIngressObservation(row) {
    return {
        connector_ingress_observation_id: String(row.connector_ingress_observation_id),
        connector_ingress_receipt_id: String(row.connector_ingress_receipt_id),
        connector_binding_revision_id: String(row.connector_binding_revision_id),
        classification: row.classification,
        idempotency_key: String(row.idempotency_key),
        external_identity: String(row.external_identity),
        external_revision: row.external_revision == null ? null : String(row.external_revision),
        payload_digest: String(row.payload_digest),
        verification: JSON.parse(String(row.verification_json)),
        evidence_refs: JSON.parse(String(row.evidence_refs_json)),
        observed_at: String(row.observed_at),
        recorded_at: String(row.recorded_at),
    };
}
function rowToExternalEffect(row) {
    return {
        external_effect_receipt_id: String(row.external_effect_receipt_id),
        connector_binding_id: String(row.connector_binding_id),
        connector_binding_revision_id: String(row.connector_binding_revision_id),
        owner: rowOwner(row),
        action_interface_id: String(row.action_interface_id),
        idempotency_key: String(row.idempotency_key),
        input_digest: String(row.input_digest),
        input_refs: JSON.parse(String(row.input_refs_json)),
        secret_ref_ids: JSON.parse(String(row.secret_ref_ids_json)),
        capability_grant_ids: JSON.parse(String(row.capability_grant_ids_json)),
        approval_receipt_ids: JSON.parse(String(row.approval_receipt_ids_json)),
        requested_by_principal_id: String(row.requested_by_principal_id),
        invocation_provenance: normalizeInvocationProvenance(JSON.parse(String(row.invocation_provenance_json))),
        status: row.status,
        attempt_count: Number(row.attempt_count),
        requested_at: String(row.requested_at),
        updated_at: String(row.updated_at),
        completed_at: row.completed_at == null ? null : String(row.completed_at),
    };
}
function rowToActionAttempt(row) {
    return {
        external_action_attempt_id: String(row.external_action_attempt_id),
        external_effect_receipt_id: String(row.external_effect_receipt_id),
        attempt_number: Number(row.attempt_number),
        status: row.status,
        request_evidence_ref: JSON.parse(String(row.request_evidence_ref_json)),
        provider_response_ref: row.provider_response_ref_json == null
            ? null
            : JSON.parse(String(row.provider_response_ref_json)),
        observed_result_ref: row.observed_result_ref_json == null
            ? null
            : JSON.parse(String(row.observed_result_ref_json)),
        error_code: row.error_code == null ? null : String(row.error_code),
        error_message: row.error_message == null ? null : String(row.error_message),
        started_at: String(row.started_at),
        completed_at: row.completed_at == null ? null : String(row.completed_at),
    };
}
function rowToActionReconciliation(row) {
    return {
        external_action_reconciliation_id: String(row.external_action_reconciliation_id),
        external_effect_receipt_id: String(row.external_effect_receipt_id),
        outcome: row.outcome,
        evidence_ref: JSON.parse(String(row.evidence_ref_json)),
        reconciled_by_principal_id: String(row.reconciled_by_principal_id),
        reconciled_at: String(row.reconciled_at),
    };
}
