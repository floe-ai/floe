import { createHash, randomUUID } from "node:crypto";
import { posix, win32 } from "node:path";
export class WorkspaceIdentityNotFoundError extends Error {
    workspace_id;
    code = "E_WORKSPACE_IDENTITY_NOT_FOUND";
    constructor(workspace_id) {
        super(`Workspace identity not found: ${workspace_id}`);
        this.workspace_id = workspace_id;
        this.name = "WorkspaceIdentityNotFoundError";
    }
}
export class WorkspaceIdentityConflictError extends Error {
    workspace_id;
    reason;
    code = "E_WORKSPACE_IDENTITY_CONFLICT";
    constructor(workspace_id, reason) {
        super(`Workspace identity '${workspace_id}' conflicts with retained state: ${reason}`);
        this.workspace_id = workspace_id;
        this.reason = reason;
        this.name = "WorkspaceIdentityConflictError";
    }
}
export class WorkspaceLocatorInvalidError extends Error {
    platform;
    reason;
    code = "E_WORKSPACE_LOCATOR_INVALID";
    constructor(platform, reason) {
        super(`Invalid ${platform} Workspace locator: ${reason}`);
        this.platform = platform;
        this.reason = reason;
        this.name = "WorkspaceLocatorInvalidError";
    }
}
export class WorkspaceLocatorConflictError extends Error {
    workspace_id;
    conflicting_workspace_id;
    host_id;
    code = "E_WORKSPACE_LOCATOR_CONFLICT";
    constructor(workspace_id, conflicting_workspace_id, host_id) {
        super(`The requested local Workspace location is already bound to Workspace '${conflicting_workspace_id}'.`);
        this.workspace_id = workspace_id;
        this.conflicting_workspace_id = conflicting_workspace_id;
        this.host_id = host_id;
        this.name = "WorkspaceLocatorConflictError";
    }
}
export class WorkspaceExplicitRebindRequiredError extends Error {
    workspace_id;
    host_id;
    current_binding_id;
    code = "E_WORKSPACE_EXPLICIT_REBIND_REQUIRED";
    constructor(workspace_id, host_id, current_binding_id) {
        super(`Workspace '${workspace_id}' already has a location on this host. Use the explicit rebind operation to move it.`);
        this.workspace_id = workspace_id;
        this.host_id = host_id;
        this.current_binding_id = current_binding_id;
        this.name = "WorkspaceExplicitRebindRequiredError";
    }
}
export class WorkspaceBindingNotFoundError extends Error {
    workspace_id;
    host_id;
    code = "E_WORKSPACE_BINDING_NOT_FOUND";
    constructor(workspace_id, host_id) {
        super(`Workspace '${workspace_id}' has no current location on this host.`);
        this.workspace_id = workspace_id;
        this.host_id = host_id;
        this.name = "WorkspaceBindingNotFoundError";
    }
}
export class WorkspaceBindingChangedError extends Error {
    workspace_id;
    expected_binding_id;
    actual_binding_id;
    code = "E_WORKSPACE_BINDING_CHANGED";
    constructor(workspace_id, expected_binding_id, actual_binding_id) {
        super(`Workspace '${workspace_id}' location changed before the requested rebind could be applied.`);
        this.workspace_id = workspace_id;
        this.expected_binding_id = expected_binding_id;
        this.actual_binding_id = actual_binding_id;
        this.name = "WorkspaceBindingChangedError";
    }
}
export class WorkspaceIdentityMigrationRefusedError extends Error {
    refusals;
    code = "E_WORKSPACE_IDENTITY_MIGRATION_REFUSED";
    constructor(refusals) {
        super(`Workspace identity migration was refused: ${refusals.map((item) => item.message).join("; ")}`);
        this.refusals = refusals;
        this.name = "WorkspaceIdentityMigrationRefusedError";
    }
}
export class WorkspaceIdentityMigrationPlanStaleError extends Error {
    code = "E_WORKSPACE_IDENTITY_MIGRATION_PLAN_STALE";
    constructor() {
        super("Workspace identity migration state changed after it was inspected. Create a new migration plan.");
        this.name = "WorkspaceIdentityMigrationPlanStaleError";
    }
}
/**
 * Returns this Bus installation's opaque local host identity. It is stored in
 * local database state, not derived from a computer name, account, or path.
 */
export function getOrCreateLocalHostIdentity(db, dependencies = {}) {
    db.exec(`
    CREATE TABLE IF NOT EXISTS local_host_identity (
      singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
      host_id TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL
    );
  `);
    const existing = db.prepare(`
    SELECT host_id, created_at FROM local_host_identity WHERE singleton = 1
  `).get();
    if (existing)
        return existing;
    const hostId = (dependencies.host_id_factory ?? (() => `host_${randomUUID()}`))();
    assertNonEmpty("host_id", hostId);
    const createdAt = (dependencies.now ?? (() => new Date().toISOString()))();
    assertTimestamp("created_at", createdAt);
    db.prepare(`
    INSERT INTO local_host_identity (singleton, host_id, created_at) VALUES (1, ?, ?)
  `).run(hostId, createdAt);
    return { host_id: hostId, created_at: createdAt };
}
/**
 * Normalises for comparison on the host which owns the locator. It never
 * resolves through the process cwd and never touches the filesystem.
 */
export function normalizeWorkspaceLocator(locator, platform) {
    const value = locator.trim();
    if (!value)
        throw new WorkspaceLocatorInvalidError(platform, "the location is empty");
    if (platform === "windows") {
        if (!win32.isAbsolute(value)) {
            throw new WorkspaceLocatorInvalidError(platform, "an absolute path is required");
        }
        return trimNonRootTrailingSeparators(win32.normalize(value), "windows").toLowerCase();
    }
    if (!posix.isAbsolute(value)) {
        throw new WorkspaceLocatorInvalidError(platform, "an absolute path is required");
    }
    return trimNonRootTrailingSeparators(posix.normalize(value), "posix");
}
/** Creates the destination schema only when no legacy migration is required. */
export function applyWorkspaceIdentitySchema(db) {
    const columns = workspaceColumns(db);
    if (columns.includes("locator")) {
        throw new WorkspaceIdentityMigrationRefusedError([{
                code: "partial_identity_schema",
                message: "The legacy Workspace table still owns local paths; plan and apply its identity migration first.",
                workspace_ids: [],
            }]);
    }
    ensureCanonicalWorkspaceSchema(db);
    ensureWorkspaceBindingSchema(db);
}
/**
 * Inspects the old locator-derived Workspace table without changing it. The
 * plan is explicit so backup/approval policy can run before schema mutation.
 */
export function planWorkspaceIdentityMigration(db, input) {
    assertNonEmpty("host_id", input.host_id);
    const columns = workspaceColumns(db);
    const bindingTableExists = tableExists(db, "workspace_locator_bindings");
    if (columns.length === 0) {
        return migrationPlan("bootstrap", input, fingerprint({ columns }), [], []);
    }
    if (!columns.includes("locator")) {
        const canonical = canonicalWorkspaceColumns.every((column) => columns.includes(column));
        if (!canonical) {
            return migrationPlan("blocked", input, fingerprint({ columns }), [], [{
                    code: "unsupported_workspace_schema",
                    message: "The Workspace table is neither the supported legacy schema nor the canonical identity schema.",
                    workspace_ids: [],
                }]);
        }
        return migrationPlan(bindingTableExists ? "already_current" : "ensure_bindings", input, fingerprint({ columns, bindingTableExists }), [], []);
    }
    const requiredLegacy = [
        "workspace_id", "name", "locator", "status", "init_authorized",
        "active_config_hash", "selected_at", "created_at", "updated_at",
    ];
    if (!requiredLegacy.every((column) => columns.includes(column))) {
        return migrationPlan("blocked", input, fingerprint({ columns }), [], [{
                code: "unsupported_workspace_schema",
                message: "The legacy Workspace table does not contain every field needed for a lossless migration.",
                workspace_ids: [],
            }]);
    }
    if (bindingTableExists) {
        return migrationPlan("blocked", input, fingerprint({ columns, bindingTableExists }), [], [{
                code: "partial_identity_schema",
                message: "Legacy Workspace paths and canonical locator bindings coexist. Automatic migration will not choose a source of truth.",
                workspace_ids: [],
            }]);
    }
    const rows = db.prepare(`
    SELECT workspace_id, name, locator, status, init_authorized, active_config_hash,
           selected_at, created_at, updated_at
    FROM workspaces
    ORDER BY workspace_id
  `).all();
    const actions = [];
    const refusals = [];
    const ownersByLocator = new Map();
    for (const workspace of rows) {
        try {
            const normalizedLocator = normalizeWorkspaceLocator(workspace.locator, input.platform);
            actions.push({
                workspace,
                binding_id: migratedBindingId(input.host_id, workspace.workspace_id, normalizedLocator),
                normalized_locator: normalizedLocator,
            });
            const owners = ownersByLocator.get(normalizedLocator) ?? [];
            owners.push(workspace.workspace_id);
            ownersByLocator.set(normalizedLocator, owners);
        }
        catch (error) {
            refusals.push({
                code: "invalid_legacy_locator",
                message: error instanceof Error ? error.message : "A legacy Workspace locator is invalid.",
                workspace_ids: [workspace.workspace_id],
            });
        }
    }
    for (const owners of ownersByLocator.values()) {
        if (owners.length < 2)
            continue;
        refusals.push({
            code: "normalized_locator_conflict",
            message: `Legacy Workspace rows ${owners.join(", ")} resolve to the same location on this host.`,
            workspace_ids: owners,
        });
    }
    const sourceFingerprint = fingerprint({ columns, rows, host_id: input.host_id, platform: input.platform });
    return migrationPlan(refusals.length > 0 ? "blocked" : "migrate_legacy", input, sourceFingerprint, actions, refusals);
}
/** Applies exactly the inspected plan. Re-running against canonical state is a no-op. */
export function applyWorkspaceIdentityMigration(db, plan) {
    if (plan.refusals.length > 0 || plan.kind === "blocked") {
        throw new WorkspaceIdentityMigrationRefusedError(plan.refusals);
    }
    return inSavepoint(db, () => {
        const current = planWorkspaceIdentityMigration(db, {
            host_id: plan.host_id,
            platform: plan.platform,
        });
        if (current.source_fingerprint !== plan.source_fingerprint || current.kind !== plan.kind) {
            throw new WorkspaceIdentityMigrationPlanStaleError();
        }
        if (plan.kind === "already_current") {
            return { changed: false, migrated_workspace_ids: [] };
        }
        if (plan.kind === "bootstrap" || plan.kind === "ensure_bindings") {
            ensureCanonicalWorkspaceSchema(db);
            ensureWorkspaceBindingSchema(db);
            return { changed: true, migrated_workspace_ids: [] };
        }
        migrateLegacyWorkspaceTable(db, plan.actions, plan.host_id, plan.platform);
        return {
            changed: true,
            migrated_workspace_ids: plan.actions.map((action) => action.workspace.workspace_id),
        };
    });
}
export class SqliteWorkspaceIdentityStore {
    db;
    now;
    workspaceIdFactory;
    bindingIdFactory;
    constructor(db, dependencies = {}) {
        this.db = db;
        this.now = dependencies.now ?? (() => new Date().toISOString());
        this.workspaceIdFactory = dependencies.workspace_id_factory ?? (() => `workspace_${randomUUID()}`);
        this.bindingIdFactory = dependencies.binding_id_factory ?? (() => `wbind_${randomUUID()}`);
    }
    createWorkspace(input) {
        const workspaceId = this.workspaceIdFactory();
        assertNonEmpty("workspace_id", workspaceId);
        const timestamp = this.now();
        const identity = {
            workspace_id: workspaceId,
            name: normalizedName(input.name),
            creation_kind: "created",
            source_workspace_id: null,
            created_at: timestamp,
            updated_at: timestamp,
        };
        return inSavepoint(this.db, () => {
            this.insertIdentity(identity);
            if (input.binding)
                this.insertBinding(identity.workspace_id, input.binding, "registered", null);
            return identity;
        });
    }
    createDerivedWorkspace(input) {
        this.requireIdentity(input.source_workspace_id);
        const workspaceId = this.workspaceIdFactory();
        assertNonEmpty("workspace_id", workspaceId);
        const timestamp = this.now();
        const identity = {
            workspace_id: workspaceId,
            name: normalizedName(input.name),
            creation_kind: input.kind,
            source_workspace_id: input.source_workspace_id,
            created_at: timestamp,
            updated_at: timestamp,
        };
        return inSavepoint(this.db, () => {
            this.insertIdentity(identity);
            if (input.binding)
                this.insertBinding(identity.workspace_id, input.binding, "registered", null);
            return identity;
        });
    }
    /** Restoring retains the exported identity; it never silently becomes a copy. */
    restoreWorkspace(input) {
        validateIdentitySnapshot(input.snapshot);
        return inSavepoint(this.db, () => {
            const existing = this.getIdentity(input.snapshot.workspace_id);
            if (existing) {
                assertSameRetainedIdentity(existing, input.snapshot);
            }
            else {
                this.insertIdentity(input.snapshot);
            }
            if (input.binding)
                this.bindLocator(input.snapshot.workspace_id, input.binding);
            return this.requireIdentity(input.snapshot.workspace_id);
        });
    }
    bindLocator(workspaceId, input) {
        this.requireIdentity(workspaceId);
        assertNonEmpty("host_id", input.host_id);
        const normalizedLocator = normalizeWorkspaceLocator(input.locator, input.platform);
        const current = this.getCurrentBinding(workspaceId, input.host_id);
        if (current) {
            if (current.normalized_locator === normalizedLocator && current.platform === input.platform)
                return current;
            throw new WorkspaceExplicitRebindRequiredError(workspaceId, input.host_id, current.binding_id);
        }
        this.assertLocatorAvailable(workspaceId, input.host_id, normalizedLocator);
        return this.insertBinding(workspaceId, input, "registered", null);
    }
    rebindLocator(input) {
        const normalizedLocator = normalizeWorkspaceLocator(input.locator, input.platform);
        return inSavepoint(this.db, () => {
            const current = this.getCurrentBinding(input.workspace_id, input.host_id);
            if (!current)
                throw new WorkspaceBindingNotFoundError(input.workspace_id, input.host_id);
            if (current.binding_id !== input.expected_binding_id) {
                throw new WorkspaceBindingChangedError(input.workspace_id, input.expected_binding_id, current.binding_id);
            }
            if (current.platform === input.platform && current.normalized_locator === normalizedLocator)
                return current;
            this.assertLocatorAvailable(input.workspace_id, input.host_id, normalizedLocator);
            const timestamp = this.now();
            const replacementId = this.bindingIdFactory();
            assertNonEmpty("binding_id", replacementId);
            this.db.prepare(`
        UPDATE workspace_locator_bindings
        SET state = 'superseded', superseded_at = ?, superseded_by_binding_id = ?, updated_at = ?
        WHERE binding_id = ? AND state = 'current'
      `).run(timestamp, replacementId, timestamp, current.binding_id);
            this.insertBinding(input.workspace_id, input, "registered", replacementId, current.selected_at);
            return this.requireBinding(replacementId);
        });
    }
    /**
     * Records local attachment state only when it still describes the current
     * binding. A late callback from a superseded path cannot mutate the new one.
     */
    updateCurrentBinding(input) {
        return inSavepoint(this.db, () => {
            const current = this.getCurrentBinding(input.workspace_id, input.host_id);
            if (!current)
                throw new WorkspaceBindingNotFoundError(input.workspace_id, input.host_id);
            if (current.binding_id !== input.expected_binding_id) {
                throw new WorkspaceBindingChangedError(input.workspace_id, input.expected_binding_id, current.binding_id);
            }
            const updatedAt = this.now();
            this.db.prepare(`
        UPDATE workspace_locator_bindings
        SET status = ?, init_authorized = ?, active_config_hash = ?, selected_at = ?, updated_at = ?
        WHERE binding_id = ? AND state = 'current'
      `).run(input.status ?? current.status, input.init_authorized === undefined ? (current.init_authorized ? 1 : 0) : (input.init_authorized ? 1 : 0), input.active_config_hash === undefined ? current.active_config_hash : input.active_config_hash, input.selected_at === undefined ? current.selected_at : input.selected_at, updatedAt, current.binding_id);
            return this.requireBinding(current.binding_id);
        });
    }
    updateWorkspaceName(workspaceId, name) {
        this.requireIdentity(workspaceId);
        this.db.prepare(`UPDATE workspaces SET name = ?, updated_at = ? WHERE workspace_id = ?`)
            .run(normalizedName(name), this.now(), workspaceId);
        return this.requireIdentity(workspaceId);
    }
    selectLocalWorkspace(workspaceId, hostId) {
        return inSavepoint(this.db, () => {
            const binding = this.getCurrentBinding(workspaceId, hostId);
            if (!binding)
                throw new WorkspaceBindingNotFoundError(workspaceId, hostId);
            const timestamp = this.now();
            this.db.prepare(`
        UPDATE workspace_locator_bindings
        SET selected_at = NULL, updated_at = ?
        WHERE host_id = ? AND state = 'current' AND selected_at IS NOT NULL
      `).run(timestamp, hostId);
            this.db.prepare(`
        UPDATE workspace_locator_bindings SET selected_at = ?, updated_at = ?
        WHERE binding_id = ? AND state = 'current'
      `).run(timestamp, timestamp, binding.binding_id);
            return this.requireBinding(binding.binding_id);
        });
    }
    getIdentity(workspaceId) {
        const row = this.db.prepare(`
      SELECT workspace_id, name, creation_kind, source_workspace_id, created_at, updated_at
      FROM workspaces
      WHERE workspace_id = ?
    `).get(workspaceId);
        return row ? identityFromRow(row) : null;
    }
    getLocalProjection(workspaceId, hostId) {
        const identity = this.getIdentity(workspaceId);
        if (!identity)
            return null;
        return { ...identity, binding: this.getCurrentBinding(workspaceId, hostId) };
    }
    listLocalProjections(hostId) {
        return this.listIdentities().map((identity) => ({
            ...identity,
            binding: this.getCurrentBinding(identity.workspace_id, hostId),
        }));
    }
    getRemoteProjection(workspaceId, servingHostId) {
        const identity = this.getIdentity(workspaceId);
        if (!identity)
            return null;
        return remoteProjection(identity, this.getCurrentBinding(workspaceId, servingHostId));
    }
    listRemoteProjections(servingHostId) {
        return this.listIdentities().map((identity) => remoteProjection(identity, this.getCurrentBinding(identity.workspace_id, servingHostId)));
    }
    resolveWorkspaceByLocator(hostId, platform, locator) {
        const normalizedLocator = normalizeWorkspaceLocator(locator, platform);
        const row = this.db.prepare(`
      SELECT w.workspace_id, w.name, w.creation_kind, w.source_workspace_id, w.created_at, w.updated_at
      FROM workspace_locator_bindings b
      JOIN workspaces w ON w.workspace_id = b.workspace_id
      WHERE b.host_id = ? AND b.normalized_locator = ? AND b.state = 'current'
    `).get(hostId, normalizedLocator);
        return row ? identityFromRow(row) : null;
    }
    getCurrentBinding(workspaceId, hostId) {
        const row = this.db.prepare(`
      SELECT *
      FROM workspace_locator_bindings
      WHERE workspace_id = ? AND host_id = ? AND state = 'current'
    `).get(workspaceId, hostId);
        return row ? bindingFromRow(row) : null;
    }
    listBindingHistory(workspaceId, hostId) {
        return this.db.prepare(`
      SELECT *
      FROM workspace_locator_bindings
      WHERE workspace_id = ? AND host_id = ?
      ORDER BY bound_at, binding_id
    `).all(workspaceId, hostId).map(bindingFromRow);
    }
    listIdentities() {
        return this.db.prepare(`
      SELECT workspace_id, name, creation_kind, source_workspace_id, created_at, updated_at
      FROM workspaces
      ORDER BY created_at DESC, workspace_id
    `).all().map(identityFromRow);
    }
    requireIdentity(workspaceId) {
        const identity = this.getIdentity(workspaceId);
        if (!identity)
            throw new WorkspaceIdentityNotFoundError(workspaceId);
        return identity;
    }
    insertIdentity(identity) {
        try {
            this.db.prepare(`
        INSERT INTO workspaces (
          workspace_id, name, creation_kind, source_workspace_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(identity.workspace_id, identity.name, identity.creation_kind, identity.source_workspace_id, identity.created_at, identity.updated_at);
        }
        catch (error) {
            if (isUniqueConstraint(error)) {
                throw new WorkspaceIdentityConflictError(identity.workspace_id, "that opaque identity already exists");
            }
            throw error;
        }
    }
    insertBinding(workspaceId, input, status, prescribedBindingId, selectedAt = null) {
        assertNonEmpty("host_id", input.host_id);
        const normalizedLocator = normalizeWorkspaceLocator(input.locator, input.platform);
        this.assertLocatorAvailable(workspaceId, input.host_id, normalizedLocator);
        const bindingId = prescribedBindingId ?? this.bindingIdFactory();
        assertNonEmpty("binding_id", bindingId);
        const timestamp = this.now();
        try {
            this.db.prepare(`
        INSERT INTO workspace_locator_bindings (
          binding_id, workspace_id, host_id, platform, locator, normalized_locator,
          state, status, init_authorized, active_config_hash, selected_at,
          bound_at, updated_at, superseded_at, superseded_by_binding_id
        ) VALUES (?, ?, ?, ?, ?, ?, 'current', ?, ?, NULL, ?, ?, ?, NULL, NULL)
      `).run(bindingId, workspaceId, input.host_id, input.platform, input.locator.trim(), normalizedLocator, status, input.init_authorized ? 1 : 0, selectedAt, timestamp, timestamp);
        }
        catch (error) {
            if (isUniqueConstraint(error)) {
                const conflict = this.currentBindingAt(input.host_id, normalizedLocator);
                if (conflict && conflict.workspace_id !== workspaceId) {
                    throw new WorkspaceLocatorConflictError(workspaceId, conflict.workspace_id, input.host_id);
                }
            }
            throw error;
        }
        return this.requireBinding(bindingId);
    }
    requireBinding(bindingId) {
        const row = this.db.prepare(`SELECT * FROM workspace_locator_bindings WHERE binding_id = ?`)
            .get(bindingId);
        if (!row)
            throw new Error(`Workspace locator binding was not persisted: ${bindingId}`);
        return bindingFromRow(row);
    }
    assertLocatorAvailable(workspaceId, hostId, normalizedLocator) {
        const conflict = this.currentBindingAt(hostId, normalizedLocator);
        if (conflict && conflict.workspace_id !== workspaceId) {
            throw new WorkspaceLocatorConflictError(workspaceId, conflict.workspace_id, hostId);
        }
    }
    currentBindingAt(hostId, normalizedLocator) {
        const row = this.db.prepare(`
      SELECT * FROM workspace_locator_bindings
      WHERE host_id = ? AND normalized_locator = ? AND state = 'current'
    `).get(hostId, normalizedLocator);
        return row ? bindingFromRow(row) : null;
    }
}
const canonicalWorkspaceColumns = [
    "workspace_id",
    "name",
    "creation_kind",
    "source_workspace_id",
    "created_at",
    "updated_at",
];
function ensureCanonicalWorkspaceSchema(db) {
    db.exec(`
    CREATE TABLE IF NOT EXISTS workspaces (
      workspace_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      creation_kind TEXT NOT NULL CHECK (creation_kind IN ('created', 'legacy_retained', 'copied', 'forked')),
      source_workspace_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      CHECK (
        (creation_kind IN ('created', 'legacy_retained') AND source_workspace_id IS NULL)
        OR (creation_kind IN ('copied', 'forked') AND source_workspace_id IS NOT NULL)
      )
    );
  `);
}
function ensureWorkspaceBindingSchema(db) {
    db.exec(`
    CREATE TABLE IF NOT EXISTS workspace_locator_bindings (
      binding_id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE RESTRICT,
      host_id TEXT NOT NULL,
      platform TEXT NOT NULL CHECK (platform IN ('windows', 'posix')),
      locator TEXT NOT NULL,
      normalized_locator TEXT NOT NULL,
      state TEXT NOT NULL CHECK (state IN ('current', 'superseded')),
      status TEXT NOT NULL,
      init_authorized INTEGER NOT NULL DEFAULT 0 CHECK (init_authorized IN (0, 1)),
      active_config_hash TEXT,
      selected_at TEXT,
      bound_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      superseded_at TEXT,
      superseded_by_binding_id TEXT,
      CHECK (
        (state = 'current' AND superseded_at IS NULL AND superseded_by_binding_id IS NULL)
        OR (state = 'superseded' AND superseded_at IS NOT NULL AND superseded_by_binding_id IS NOT NULL)
      )
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_workspace_binding_current_workspace_host
      ON workspace_locator_bindings(workspace_id, host_id)
      WHERE state = 'current';

    CREATE UNIQUE INDEX IF NOT EXISTS idx_workspace_binding_current_locator
      ON workspace_locator_bindings(host_id, normalized_locator)
      WHERE state = 'current';

    CREATE INDEX IF NOT EXISTS idx_workspace_binding_history
      ON workspace_locator_bindings(workspace_id, host_id, bound_at);
  `);
}
function migrateLegacyWorkspaceTable(db, actions, hostId, platform) {
    db.exec(`
    CREATE TABLE workspaces_identity_next (
      workspace_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      creation_kind TEXT NOT NULL CHECK (creation_kind IN ('created', 'legacy_retained', 'copied', 'forked')),
      source_workspace_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      CHECK (
        (creation_kind IN ('created', 'legacy_retained') AND source_workspace_id IS NULL)
        OR (creation_kind IN ('copied', 'forked') AND source_workspace_id IS NOT NULL)
      )
    );
  `);
    const insertWorkspace = db.prepare(`
    INSERT INTO workspaces_identity_next (
      workspace_id, name, creation_kind, source_workspace_id, created_at, updated_at
    ) VALUES (?, ?, 'legacy_retained', NULL, ?, ?)
  `);
    for (const action of actions) {
        insertWorkspace.run(action.workspace.workspace_id, action.workspace.name, action.workspace.created_at, action.workspace.updated_at);
    }
    db.exec(`
    DROP TABLE workspaces;
    ALTER TABLE workspaces_identity_next RENAME TO workspaces;
  `);
    ensureWorkspaceBindingSchema(db);
    const insertBinding = db.prepare(`
    INSERT INTO workspace_locator_bindings (
      binding_id, workspace_id, host_id, platform, locator, normalized_locator,
      state, status, init_authorized, active_config_hash, selected_at,
      bound_at, updated_at, superseded_at, superseded_by_binding_id
    ) VALUES (?, ?, ?, ?, ?, ?, 'current', ?, ?, ?, ?, ?, ?, NULL, NULL)
  `);
    for (const action of actions) {
        insertBinding.run(action.binding_id, action.workspace.workspace_id, hostId, platform, action.workspace.locator, action.normalized_locator, action.workspace.status, action.workspace.init_authorized ? 1 : 0, action.workspace.active_config_hash, action.workspace.selected_at, action.workspace.created_at, action.workspace.updated_at);
    }
}
function migrationPlan(kind, input, sourceFingerprint, actions, refusals) {
    return {
        plan_version: 1,
        kind,
        host_id: input.host_id,
        platform: input.platform,
        source_fingerprint: sourceFingerprint,
        actions,
        refusals,
    };
}
function workspaceColumns(db) {
    if (!tableExists(db, "workspaces"))
        return [];
    return db.prepare(`PRAGMA table_info(workspaces)`).all().map((row) => row.name);
}
function tableExists(db, tableName) {
    return Boolean(db.prepare(`SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = ?`).get(tableName));
}
function identityFromRow(row) {
    return {
        workspace_id: row.workspace_id,
        name: row.name,
        creation_kind: row.creation_kind,
        source_workspace_id: row.source_workspace_id,
        created_at: row.created_at,
        updated_at: row.updated_at,
    };
}
function bindingFromRow(row) {
    return {
        binding_id: row.binding_id,
        workspace_id: row.workspace_id,
        host_id: row.host_id,
        platform: row.platform,
        locator: row.locator,
        normalized_locator: row.normalized_locator,
        state: row.state,
        status: row.status,
        init_authorized: row.init_authorized === 1,
        active_config_hash: row.active_config_hash,
        selected_at: row.selected_at,
        bound_at: row.bound_at,
        updated_at: row.updated_at,
        superseded_at: row.superseded_at,
        superseded_by_binding_id: row.superseded_by_binding_id,
    };
}
function remoteProjection(identity, binding) {
    return {
        ...identity,
        availability: {
            bound_on_serving_host: binding !== null,
            status: binding?.status ?? null,
        },
    };
}
function assertSameRetainedIdentity(existing, snapshot) {
    if (existing.created_at !== snapshot.created_at
        || existing.creation_kind !== snapshot.creation_kind
        || existing.source_workspace_id !== snapshot.source_workspace_id) {
        throw new WorkspaceIdentityConflictError(snapshot.workspace_id, "the imported identity provenance does not match the identity already stored here");
    }
}
function validateIdentitySnapshot(snapshot) {
    assertNonEmpty("workspace_id", snapshot.workspace_id);
    normalizedName(snapshot.name);
    if (!["created", "legacy_retained", "copied", "forked"].includes(snapshot.creation_kind)) {
        throw new WorkspaceIdentityConflictError(snapshot.workspace_id, "the creation kind is unsupported");
    }
    const derived = snapshot.creation_kind === "copied" || snapshot.creation_kind === "forked";
    if (derived !== Boolean(snapshot.source_workspace_id)) {
        throw new WorkspaceIdentityConflictError(snapshot.workspace_id, "the identity provenance is incomplete");
    }
    if (snapshot.source_workspace_id === snapshot.workspace_id) {
        throw new WorkspaceIdentityConflictError(snapshot.workspace_id, "a Workspace cannot be derived from itself");
    }
    assertTimestamp("created_at", snapshot.created_at);
    assertTimestamp("updated_at", snapshot.updated_at);
}
function normalizedName(name) {
    const value = name.trim();
    if (!value)
        throw new Error("Workspace name must not be empty.");
    return value;
}
function assertTimestamp(field, value) {
    if (!value || Number.isNaN(Date.parse(value)))
        throw new Error(`${field} must be an ISO timestamp.`);
}
function assertNonEmpty(field, value) {
    if (!value.trim())
        throw new Error(`${field} must not be empty.`);
}
function trimNonRootTrailingSeparators(value, platform) {
    const path = platform === "windows" ? win32 : posix;
    const root = path.parse(value).root;
    let result = value;
    while (result.length > root.length && /[\\/]$/.test(result))
        result = result.slice(0, -1);
    return result;
}
function migratedBindingId(hostId, workspaceId, normalizedLocator) {
    const digest = createHash("sha256")
        .update(JSON.stringify([hostId, workspaceId, normalizedLocator]))
        .digest("hex")
        .slice(0, 24);
    return `wbind_migrated_${digest}`;
}
function fingerprint(value) {
    return createHash("sha256").update(canonicalJson(value)).digest("hex");
}
function canonicalJson(value) {
    if (Array.isArray(value))
        return `[${value.map(canonicalJson).join(",")}]`;
    if (value !== null && typeof value === "object") {
        return `{${Object.entries(value)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
            .join(",")}}`;
    }
    return JSON.stringify(value);
}
let savepointSequence = 0;
function inSavepoint(db, action) {
    savepointSequence += 1;
    const name = `workspace_identity_${savepointSequence}`;
    db.exec(`SAVEPOINT ${name}`);
    try {
        const result = action();
        db.exec(`RELEASE SAVEPOINT ${name}`);
        return result;
    }
    catch (error) {
        db.exec(`ROLLBACK TO SAVEPOINT ${name}`);
        db.exec(`RELEASE SAVEPOINT ${name}`);
        throw error;
    }
}
function isUniqueConstraint(error) {
    return error instanceof Error && /UNIQUE constraint failed|PRIMARY KEY constraint failed/i.test(error.message);
}
