import { createHash, randomUUID } from "node:crypto";
/**
 * The runtime adapter for an Actor whose turns are executed by an attached
 * client rather than by a Bridge. No Bridge provides this adapter, so the
 * existing adapter-match filter skips such Actors with no special-casing. The
 * name describes only what executes the turn (a client); it never names who.
 */
export const CLIENT_ADAPTER_ID = "client";
export class RuntimeProfileValidationError extends Error {
    reason;
    code = "E_RUNTIME_PROFILE_INVALID";
    constructor(reason) {
        super(`Invalid runtime profile: ${reason}`);
        this.reason = reason;
        this.name = "RuntimeProfileValidationError";
    }
}
export class RuntimeProfileNotFoundError extends Error {
    runtime_profile_id;
    code = "E_RUNTIME_PROFILE_NOT_FOUND";
    constructor(runtime_profile_id) {
        super(`Runtime profile not found: ${runtime_profile_id}`);
        this.runtime_profile_id = runtime_profile_id;
        this.name = "RuntimeProfileNotFoundError";
    }
}
export class RuntimeProfileRevisionNotFoundError extends Error {
    runtime_profile_revision_id;
    code = "E_RUNTIME_PROFILE_REVISION_NOT_FOUND";
    constructor(runtime_profile_revision_id) {
        super(`Runtime profile revision not found: ${runtime_profile_revision_id}`);
        this.runtime_profile_revision_id = runtime_profile_revision_id;
        this.name = "RuntimeProfileRevisionNotFoundError";
    }
}
export class RuntimeProfileImmutableError extends Error {
    runtime_profile_revision_id;
    code = "E_RUNTIME_PROFILE_IMMUTABLE";
    constructor(runtime_profile_revision_id) {
        super(`Published runtime profile cannot be changed: ${runtime_profile_revision_id}`);
        this.runtime_profile_revision_id = runtime_profile_revision_id;
        this.name = "RuntimeProfileImmutableError";
    }
}
export class RuntimeProfileConflictError extends Error {
    resource_id;
    expected;
    actual;
    code = "E_RUNTIME_PROFILE_CONFLICT";
    constructor(resource_id, expected, actual) {
        super(`Runtime profile state changed before this operation completed.`);
        this.resource_id = resource_id;
        this.expected = expected;
        this.actual = actual;
        this.name = "RuntimeProfileConflictError";
    }
}
export class ActorRuntimeBindingConflictError extends Error {
    actor_id;
    expected_binding_id;
    actual_binding_id;
    code = "E_ACTOR_RUNTIME_BINDING_CONFLICT";
    constructor(actor_id, expected_binding_id, actual_binding_id) {
        super(`Actor '${actor_id}' runtime binding changed before this operation completed.`);
        this.actor_id = actor_id;
        this.expected_binding_id = expected_binding_id;
        this.actual_binding_id = actual_binding_id;
        this.name = "ActorRuntimeBindingConflictError";
    }
}
export function validateRuntimeProfile(content) {
    nonEmpty("label", content.label);
    nonEmpty("adapter_id", content.adapter_id);
    unique(content.secret_ref_ids, "SecretRef id");
    unique(content.required_capability_ids, "capability id");
    if (content.checkpoint_policy.mode === "required" && !content.checkpoint_policy.schema_ref?.trim()) {
        throw new RuntimeProfileValidationError("a required checkpoint policy must name its schema");
    }
    if (content.checkpoint_policy.mode === "none" && content.checkpoint_policy.schema_ref !== null) {
        throw new RuntimeProfileValidationError("a disabled checkpoint policy cannot name a schema");
    }
    assertJsonData(content.configuration, "configuration");
    assertJsonData(content.resource_policy, "resource_policy");
    rejectSecretMaterial(content.configuration, "configuration");
    rejectSecretMaterial(content.resource_policy, "resource_policy");
}
export function runtimeProfileDigest(content) {
    validateRuntimeProfile(content);
    return createHash("sha256").update(canonicalJson(content)).digest("hex");
}
export function applyRuntimeProfileSchema(db) {
    db.exec(`
    CREATE TABLE IF NOT EXISTS runtime_profiles (
      runtime_profile_id TEXT PRIMARY KEY,
      owner_kind TEXT NOT NULL CHECK (owner_kind IN ('workspace', 'host', 'deployment')),
      owner_id TEXT NOT NULL,
      current_revision_id TEXT,
      status TEXT NOT NULL CHECK (status IN ('active', 'retired')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      retired_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_runtime_profiles_owner
      ON runtime_profiles(owner_kind, owner_id, status, created_at);

    CREATE TABLE IF NOT EXISTS runtime_profile_revisions (
      runtime_profile_revision_id TEXT PRIMARY KEY,
      runtime_profile_id TEXT NOT NULL REFERENCES runtime_profiles(runtime_profile_id),
      revision_number INTEGER NOT NULL,
      based_on_revision_id TEXT REFERENCES runtime_profile_revisions(runtime_profile_revision_id),
      semantic_digest TEXT NOT NULL,
      content_json TEXT NOT NULL,
      created_by_principal_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      published_at TEXT,
      withdrawn_at TEXT,
      UNIQUE(runtime_profile_id, revision_number)
    );

    CREATE INDEX IF NOT EXISTS idx_runtime_profile_revisions_profile
      ON runtime_profile_revisions(runtime_profile_id, revision_number DESC);

    CREATE TABLE IF NOT EXISTS runtime_profile_head_changes (
      head_change_id TEXT PRIMARY KEY,
      runtime_profile_id TEXT NOT NULL REFERENCES runtime_profiles(runtime_profile_id),
      from_revision_id TEXT,
      to_revision_id TEXT NOT NULL REFERENCES runtime_profile_revisions(runtime_profile_revision_id),
      reason TEXT NOT NULL CHECK (reason IN ('publish', 'rollback')),
      changed_by_principal_id TEXT NOT NULL,
      changed_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_runtime_profile_head_changes_profile
      ON runtime_profile_head_changes(runtime_profile_id, changed_at, head_change_id);

    CREATE TABLE IF NOT EXISTS actor_runtime_bindings (
      actor_runtime_binding_id TEXT PRIMARY KEY,
      actor_id TEXT NOT NULL REFERENCES actors(actor_id),
      workspace_id TEXT NOT NULL,
      runtime_profile_id TEXT NOT NULL REFERENCES runtime_profiles(runtime_profile_id),
      runtime_profile_revision_id TEXT NOT NULL REFERENCES runtime_profile_revisions(runtime_profile_revision_id),
      endpoint_id TEXT,
      status TEXT NOT NULL CHECK (status IN ('resolved', 'unresolved', 'disabled')),
      unresolved_reasons_json TEXT NOT NULL,
      created_by_principal_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      superseded_at TEXT
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_actor_runtime_binding_current
      ON actor_runtime_bindings(actor_id) WHERE superseded_at IS NULL;

    CREATE INDEX IF NOT EXISTS idx_actor_runtime_bindings_workspace
      ON actor_runtime_bindings(workspace_id, actor_id, created_at DESC);
  `);
}
export class RuntimeProfileStore {
    db;
    now;
    bindingChanged;
    constructor(db, now = () => new Date().toISOString(), bindingChanged) {
        this.db = db;
        this.now = now;
        this.bindingChanged = bindingChanged;
        applyRuntimeProfileSchema(db);
    }
    createProfile(input) {
        validateOwner(input.owner);
        nonEmpty("created_by_principal_id", input.created_by_principal_id);
        validateRuntimeProfile(input.content);
        const profileId = input.runtime_profile_id ?? `runtime_profile_${randomUUID()}`;
        nonEmpty("runtime_profile_id", profileId);
        const at = this.now();
        let draft;
        transaction(this.db, () => {
            this.db.prepare(`
        INSERT INTO runtime_profiles (
          runtime_profile_id, owner_kind, owner_id, current_revision_id,
          status, created_at, updated_at, retired_at
        ) VALUES (?, ?, ?, NULL, 'active', ?, ?, NULL)
      `).run(profileId, input.owner.kind, input.owner.id, at, at);
            draft = this.insertDraft({
                runtime_profile_id: profileId,
                based_on_revision_id: null,
                created_by_principal_id: input.created_by_principal_id,
                content: input.content,
            });
        });
        return { profile: this.requireProfile(profileId), draft };
    }
    createDraft(input) {
        const profile = this.requireProfile(input.runtime_profile_id);
        if (profile.status === "retired") {
            throw new RuntimeProfileValidationError("a retired runtime profile cannot receive a new draft");
        }
        const basedOn = input.based_on_revision_id === undefined
            ? profile.current_revision_id
            : input.based_on_revision_id;
        if (basedOn !== null)
            this.requireRevisionForProfile(basedOn, profile.runtime_profile_id);
        return this.insertDraft({
            runtime_profile_id: profile.runtime_profile_id,
            based_on_revision_id: basedOn,
            created_by_principal_id: input.created_by_principal_id,
            content: input.content,
        });
    }
    replaceDraft(input) {
        validateRuntimeProfile(input.content);
        const revision = this.requireRevision(input.runtime_profile_revision_id);
        if (revision.published_at || revision.withdrawn_at) {
            throw new RuntimeProfileImmutableError(revision.runtime_profile_revision_id);
        }
        if (revision.semantic_digest !== input.expected_digest) {
            throw new RuntimeProfileConflictError(revision.runtime_profile_revision_id, input.expected_digest, revision.semantic_digest);
        }
        this.db.prepare(`
      UPDATE runtime_profile_revisions SET semantic_digest = ?, content_json = ?
      WHERE runtime_profile_revision_id = ? AND published_at IS NULL AND withdrawn_at IS NULL
    `).run(runtimeProfileDigest(input.content), JSON.stringify(input.content), revision.runtime_profile_revision_id);
        return this.requireRevision(revision.runtime_profile_revision_id);
    }
    publishDraft(input) {
        const revision = this.requireRevision(input.runtime_profile_revision_id);
        const profile = this.requireProfile(revision.runtime_profile_id);
        if (revision.withdrawn_at)
            throw new RuntimeProfileImmutableError(revision.runtime_profile_revision_id);
        if (revision.published_at) {
            if (profile.current_revision_id === revision.runtime_profile_revision_id)
                return revision;
            throw new RuntimeProfileImmutableError(revision.runtime_profile_revision_id);
        }
        if (profile.current_revision_id !== input.expected_current_revision_id) {
            throw new RuntimeProfileConflictError(profile.runtime_profile_id, input.expected_current_revision_id, profile.current_revision_id);
        }
        nonEmpty("changed_by_principal_id", input.changed_by_principal_id);
        const at = this.now();
        transaction(this.db, () => {
            this.db.prepare(`
        UPDATE runtime_profile_revisions SET published_at = ?
        WHERE runtime_profile_revision_id = ? AND published_at IS NULL AND withdrawn_at IS NULL
      `).run(at, revision.runtime_profile_revision_id);
            this.db.prepare(`
        UPDATE runtime_profiles SET current_revision_id = ?, updated_at = ?
        WHERE runtime_profile_id = ?
      `).run(revision.runtime_profile_revision_id, at, profile.runtime_profile_id);
            this.recordHeadChange({
                runtime_profile_id: profile.runtime_profile_id,
                from_revision_id: profile.current_revision_id,
                to_revision_id: revision.runtime_profile_revision_id,
                reason: "publish",
                changed_by_principal_id: input.changed_by_principal_id,
                changed_at: at,
            });
        });
        return this.requireRevision(revision.runtime_profile_revision_id);
    }
    rollback(input) {
        const profile = this.requireProfile(input.runtime_profile_id);
        const revision = this.requireRevisionForProfile(input.to_published_revision_id, profile.runtime_profile_id);
        if (!revision.published_at || revision.withdrawn_at) {
            throw new RuntimeProfileValidationError("rollback target must be a retained published runtime profile revision");
        }
        if (profile.current_revision_id !== input.expected_current_revision_id) {
            throw new RuntimeProfileConflictError(profile.runtime_profile_id, input.expected_current_revision_id, profile.current_revision_id);
        }
        nonEmpty("changed_by_principal_id", input.changed_by_principal_id);
        const at = this.now();
        transaction(this.db, () => {
            this.db.prepare(`
        UPDATE runtime_profiles SET current_revision_id = ?, updated_at = ? WHERE runtime_profile_id = ?
      `).run(revision.runtime_profile_revision_id, at, profile.runtime_profile_id);
            this.recordHeadChange({
                runtime_profile_id: profile.runtime_profile_id,
                from_revision_id: profile.current_revision_id,
                to_revision_id: revision.runtime_profile_revision_id,
                reason: "rollback",
                changed_by_principal_id: input.changed_by_principal_id,
                changed_at: at,
            });
        });
        return revision;
    }
    setProfileStatus(input) {
        const profile = this.requireProfile(input.runtime_profile_id);
        if (profile.current_revision_id !== input.expected_current_revision_id) {
            throw new RuntimeProfileConflictError(profile.runtime_profile_id, input.expected_current_revision_id, profile.current_revision_id);
        }
        const at = this.now();
        this.db.prepare(`
      UPDATE runtime_profiles SET status = ?, retired_at = ?, updated_at = ?
      WHERE runtime_profile_id = ?
    `).run(input.status, input.status === "retired" ? at : null, at, profile.runtime_profile_id);
        return this.requireProfile(profile.runtime_profile_id);
    }
    bindActor(input) {
        nonEmpty("actor_id", input.actor_id);
        nonEmpty("created_by_principal_id", input.created_by_principal_id);
        const actor = this.db.prepare(`SELECT actor_id, workspace_id, status FROM actors WHERE actor_id = ?`)
            .get(input.actor_id);
        if (!actor)
            throw new RuntimeProfileValidationError(`Actor '${input.actor_id}' does not exist`);
        if (actor.status === "retired")
            throw new RuntimeProfileValidationError("a retired Actor cannot receive a runtime binding");
        const revision = this.requireRevision(input.runtime_profile_revision_id);
        if (!revision.published_at || revision.withdrawn_at) {
            throw new RuntimeProfileValidationError("an Actor can bind only to a retained published runtime profile revision");
        }
        const reasons = normalizedReasons(input.status, input.unresolved_reasons ?? []);
        const current = this.getCurrentActorBinding(input.actor_id);
        if ((current?.actor_runtime_binding_id ?? null) !== input.expected_current_binding_id) {
            throw new ActorRuntimeBindingConflictError(input.actor_id, input.expected_current_binding_id, current?.actor_runtime_binding_id ?? null);
        }
        const profile = this.requireProfile(revision.runtime_profile_id);
        const at = this.now();
        const bindingId = `actor_runtime_binding_${randomUUID()}`;
        transaction(this.db, () => {
            if (current) {
                this.db.prepare(`
          UPDATE actor_runtime_bindings SET superseded_at = ?
          WHERE actor_runtime_binding_id = ? AND superseded_at IS NULL
        `).run(at, current.actor_runtime_binding_id);
            }
            this.db.prepare(`
        INSERT INTO actor_runtime_bindings (
          actor_runtime_binding_id, actor_id, workspace_id, runtime_profile_id,
          runtime_profile_revision_id, endpoint_id, status,
          unresolved_reasons_json, created_by_principal_id, created_at, superseded_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
      `).run(bindingId, actor.actor_id, actor.workspace_id, profile.runtime_profile_id, revision.runtime_profile_revision_id, input.endpoint_id ?? null, input.status, JSON.stringify(reasons), input.created_by_principal_id, at);
        });
        const binding = this.requireActorBinding(bindingId);
        this.bindingChanged?.(binding, current);
        return binding;
    }
    getProfile(profileId) {
        const row = this.db.prepare(`SELECT * FROM runtime_profiles WHERE runtime_profile_id = ?`)
            .get(profileId);
        return row ? rowToProfile(row) : null;
    }
    requireProfile(profileId) {
        const profile = this.getProfile(profileId);
        if (!profile)
            throw new RuntimeProfileNotFoundError(profileId);
        return profile;
    }
    getRevision(revisionId) {
        const row = this.db.prepare(`
      SELECT * FROM runtime_profile_revisions WHERE runtime_profile_revision_id = ?
    `).get(revisionId);
        return row ? rowToRevision(row) : null;
    }
    requireRevision(revisionId) {
        const revision = this.getRevision(revisionId);
        if (!revision)
            throw new RuntimeProfileRevisionNotFoundError(revisionId);
        return revision;
    }
    listRevisions(profileId) {
        this.requireProfile(profileId);
        return this.db.prepare(`
      SELECT * FROM runtime_profile_revisions
      WHERE runtime_profile_id = ? ORDER BY revision_number DESC
    `).all(profileId).map(rowToRevision);
    }
    listHeadChanges(profileId) {
        this.requireProfile(profileId);
        return this.db.prepare(`
      SELECT * FROM runtime_profile_head_changes
      WHERE runtime_profile_id = ? ORDER BY changed_at, head_change_id
    `).all(profileId);
    }
    getCurrentActorBinding(actorId) {
        const row = this.db.prepare(`
      SELECT * FROM actor_runtime_bindings WHERE actor_id = ? AND superseded_at IS NULL
    `).get(actorId);
        return row ? rowToBinding(row) : null;
    }
    getCurrentActorBindingForEndpoint(workspaceId, endpointId) {
        const row = this.db.prepare(`
      SELECT * FROM actor_runtime_bindings
      WHERE workspace_id = ? AND endpoint_id = ? AND superseded_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1
    `).get(workspaceId, endpointId);
        return row ? rowToBinding(row) : null;
    }
    requireActorBinding(bindingId) {
        const row = this.db.prepare(`
      SELECT * FROM actor_runtime_bindings WHERE actor_runtime_binding_id = ?
    `).get(bindingId);
        if (!row)
            throw new RuntimeProfileValidationError(`Actor runtime binding '${bindingId}' does not exist`);
        return rowToBinding(row);
    }
    listActorBindings(actorId) {
        return this.db.prepare(`
      SELECT * FROM actor_runtime_bindings WHERE actor_id = ? ORDER BY created_at DESC
    `).all(actorId).map(rowToBinding);
    }
    insertDraft(input) {
        nonEmpty("created_by_principal_id", input.created_by_principal_id);
        validateRuntimeProfile(input.content);
        const revisionId = `runtime_profile_revision_${randomUUID()}`;
        const revisionNumber = Number(this.db.prepare(`
      SELECT COALESCE(MAX(revision_number), 0) + 1 AS next
      FROM runtime_profile_revisions WHERE runtime_profile_id = ?
    `).get(input.runtime_profile_id).next);
        this.db.prepare(`
      INSERT INTO runtime_profile_revisions (
        runtime_profile_revision_id, runtime_profile_id, revision_number,
        based_on_revision_id, semantic_digest, content_json,
        created_by_principal_id, created_at, published_at, withdrawn_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)
    `).run(revisionId, input.runtime_profile_id, revisionNumber, input.based_on_revision_id, runtimeProfileDigest(input.content), JSON.stringify(input.content), input.created_by_principal_id, this.now());
        return this.requireRevision(revisionId);
    }
    requireRevisionForProfile(revisionId, profileId) {
        const revision = this.requireRevision(revisionId);
        if (revision.runtime_profile_id !== profileId) {
            throw new RuntimeProfileValidationError(`revision '${revisionId}' belongs to another runtime profile`);
        }
        return revision;
    }
    recordHeadChange(change) {
        this.db.prepare(`
      INSERT INTO runtime_profile_head_changes (
        head_change_id, runtime_profile_id, from_revision_id, to_revision_id,
        reason, changed_by_principal_id, changed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(`runtime_profile_head_change_${randomUUID()}`, change.runtime_profile_id, change.from_revision_id, change.to_revision_id, change.reason, change.changed_by_principal_id, change.changed_at);
    }
}
function rowToProfile(row) {
    return {
        runtime_profile_id: String(row.runtime_profile_id),
        owner: { kind: String(row.owner_kind), id: String(row.owner_id) },
        current_revision_id: row.current_revision_id == null ? null : String(row.current_revision_id),
        status: String(row.status),
        created_at: String(row.created_at),
        updated_at: String(row.updated_at),
        retired_at: row.retired_at == null ? null : String(row.retired_at),
    };
}
function rowToRevision(row) {
    const content = JSON.parse(String(row.content_json));
    validateRuntimeProfile(content);
    return {
        runtime_profile_revision_id: String(row.runtime_profile_revision_id),
        runtime_profile_id: String(row.runtime_profile_id),
        revision_number: Number(row.revision_number),
        based_on_revision_id: row.based_on_revision_id == null ? null : String(row.based_on_revision_id),
        semantic_digest: String(row.semantic_digest),
        content,
        created_by_principal_id: String(row.created_by_principal_id),
        created_at: String(row.created_at),
        published_at: row.published_at == null ? null : String(row.published_at),
        withdrawn_at: row.withdrawn_at == null ? null : String(row.withdrawn_at),
    };
}
function rowToBinding(row) {
    return {
        actor_runtime_binding_id: String(row.actor_runtime_binding_id),
        actor_id: String(row.actor_id),
        workspace_id: String(row.workspace_id),
        runtime_profile_id: String(row.runtime_profile_id),
        runtime_profile_revision_id: String(row.runtime_profile_revision_id),
        endpoint_id: row.endpoint_id == null ? null : String(row.endpoint_id),
        status: String(row.status),
        unresolved_reasons: JSON.parse(String(row.unresolved_reasons_json)),
        created_by_principal_id: String(row.created_by_principal_id),
        created_at: String(row.created_at),
        superseded_at: row.superseded_at == null ? null : String(row.superseded_at),
    };
}
function validateOwner(owner) {
    if (!["workspace", "host", "deployment"].includes(owner.kind)) {
        throw new RuntimeProfileValidationError("owner kind is invalid");
    }
    nonEmpty("owner id", owner.id);
}
function normalizedReasons(status, reasons) {
    const normalized = [...new Set(reasons.map((item) => item.trim()).filter(Boolean))].sort();
    if (status === "unresolved" && normalized.length === 0) {
        throw new RuntimeProfileValidationError("an unresolved runtime binding must explain what is unresolved");
    }
    if (status === "resolved" && normalized.length > 0) {
        throw new RuntimeProfileValidationError("a resolved runtime binding cannot retain unresolved reasons");
    }
    return normalized;
}
function rejectSecretMaterial(value, path) {
    if (Array.isArray(value)) {
        value.forEach((item, index) => rejectSecretMaterial(item, `${path}[${index}]`));
        return;
    }
    if (!value || typeof value !== "object")
        return;
    for (const [key, item] of Object.entries(value)) {
        if (/^(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret|credential)$/i.test(key)) {
            throw new RuntimeProfileValidationError(`${path}.${key} must be represented by a SecretRef`);
        }
        rejectSecretMaterial(item, `${path}.${key}`);
    }
}
function assertJsonData(value, path) {
    if (value === null || ["string", "number", "boolean"].includes(typeof value))
        return;
    if (Array.isArray(value)) {
        value.forEach((item, index) => assertJsonData(item, `${path}[${index}]`));
        return;
    }
    if (typeof value === "object") {
        for (const [key, item] of Object.entries(value)) {
            if (item === undefined)
                throw new RuntimeProfileValidationError(`${path}.${key} is undefined`);
            assertJsonData(item, `${path}.${key}`);
        }
        return;
    }
    throw new RuntimeProfileValidationError(`${path} must contain JSON data only`);
}
function unique(values, label) {
    const seen = new Set();
    for (const value of values) {
        nonEmpty(label, value);
        if (seen.has(value))
            throw new RuntimeProfileValidationError(`duplicate ${label} '${value}'`);
        seen.add(value);
    }
}
function nonEmpty(label, value) {
    if (typeof value !== "string" || !value.trim()) {
        throw new RuntimeProfileValidationError(`${label} must not be empty`);
    }
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
function transaction(db, action) {
    db.exec("SAVEPOINT runtime_profile_change");
    try {
        const result = action();
        db.exec("RELEASE runtime_profile_change");
        return result;
    }
    catch (error) {
        db.exec("ROLLBACK TO runtime_profile_change");
        db.exec("RELEASE runtime_profile_change");
        throw error;
    }
}
