/**
 * Durable delivery cursor for transport projections. Canonical domain records
 * remain authoritative; this ledger only lets a disconnected client catch up
 * without polling or guessing what changed.
 */
export class TransportPushStreamStore {
    db;
    constructor(db) {
        this.db = db;
        applyTransportPushStreamSchema(db);
    }
    append(input) {
        if (!input.type.trim())
            throw new Error("Push update type must not be empty.");
        const at = input.at ?? new Date().toISOString();
        const result = this.db.prepare(`
      INSERT INTO transport_push_entries (workspace_id, event_type, payload_json, created_at)
      VALUES (?, ?, ?, ?)
    `).run(input.workspace_id, input.type, JSON.stringify(input.payload), at);
        return this.require(Number(result.lastInsertRowid));
    }
    latestCursor() {
        const row = this.db.prepare(`
      SELECT sequence FROM transport_push_entries ORDER BY sequence DESC LIMIT 1
    `).get();
        return row ? encodeTransportPushCursor(row.sequence) : null;
    }
    listAfter(input) {
        const after = decodeTransportPushCursor(input.after_cursor ?? null);
        const through = input.through_sequence ?? Number.MAX_SAFE_INTEGER;
        const limit = Math.min(Math.max(input.limit ?? 10_000, 1), 10_000);
        const rows = input.workspace_id
            ? this.db.prepare(`
          SELECT sequence, workspace_id, event_type, payload_json, created_at
          FROM transport_push_entries
          WHERE sequence > ? AND sequence <= ? AND workspace_id = ?
          ORDER BY sequence ASC
          LIMIT ?
        `).all(after, through, input.workspace_id, limit)
            : this.db.prepare(`
          SELECT sequence, workspace_id, event_type, payload_json, created_at
          FROM transport_push_entries
          WHERE sequence > ? AND sequence <= ?
          ORDER BY sequence ASC
          LIMIT ?
        `).all(after, through, limit);
        return rows.map(rowToEntry);
    }
    latestSequence() {
        const row = this.db.prepare(`
      SELECT COALESCE(MAX(sequence), 0) AS sequence FROM transport_push_entries
    `).get();
        return Number(row.sequence);
    }
    cursorForSequence(sequence) {
        return sequence > 0 ? encodeTransportPushCursor(sequence) : null;
    }
    getBridgeCheckpoint(bridgeId) {
        const row = this.db.prepare(`
      SELECT sequence FROM transport_push_checkpoints
      WHERE audience = 'bridge_service' AND binding_id = ?
    `).get(bridgeId);
        return row ? encodeTransportPushCursor(Number(row.sequence)) : null;
    }
    acknowledgeBridge(bridgeId, cursor) {
        if (!bridgeId.trim())
            throw new Error("Bridge identity must not be empty.");
        const sequence = decodeTransportPushCursor(cursor);
        if (sequence > this.latestSequence())
            throw new InvalidTransportPushCursorError();
        const updatedAt = new Date().toISOString();
        this.db.prepare(`
      INSERT INTO transport_push_checkpoints (
        audience, binding_id, sequence, updated_at
      ) VALUES ('bridge_service', ?, ?, ?)
      ON CONFLICT(audience, binding_id) DO UPDATE SET
        sequence = CASE
          WHEN excluded.sequence > transport_push_checkpoints.sequence
          THEN excluded.sequence
          ELSE transport_push_checkpoints.sequence
        END,
        updated_at = CASE
          WHEN excluded.sequence > transport_push_checkpoints.sequence
          THEN excluded.updated_at
          ELSE transport_push_checkpoints.updated_at
        END
    `).run(bridgeId, sequence, updatedAt);
        return this.getBridgeCheckpoint(bridgeId) ?? encodeTransportPushCursor(0);
    }
    require(sequence) {
        const row = this.db.prepare(`
      SELECT sequence, workspace_id, event_type, payload_json, created_at
      FROM transport_push_entries WHERE sequence = ?
    `).get(sequence);
        if (!row)
            throw new Error("Push update was not persisted.");
        return rowToEntry(row);
    }
}
export class InvalidTransportPushCursorError extends Error {
    constructor() {
        super("The push stream cursor is invalid.");
        this.name = "InvalidTransportPushCursorError";
    }
}
export function applyTransportPushStreamSchema(db) {
    db.exec(`
    CREATE TABLE IF NOT EXISTS transport_push_entries (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id TEXT,
      event_type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_transport_push_workspace_sequence
      ON transport_push_entries(workspace_id, sequence);

    CREATE TABLE IF NOT EXISTS transport_push_checkpoints (
      audience TEXT NOT NULL CHECK (audience = 'bridge_service'),
      binding_id TEXT NOT NULL,
      sequence INTEGER NOT NULL CHECK (sequence >= 0),
      updated_at TEXT NOT NULL,
      PRIMARY KEY (audience, binding_id)
    );
  `);
}
export function encodeTransportPushCursor(sequence) {
    if (!Number.isSafeInteger(sequence) || sequence < 0)
        throw new InvalidTransportPushCursorError();
    return Buffer.from(JSON.stringify({ v: 1, sequence }), "utf8").toString("base64url");
}
export function decodeTransportPushCursor(cursor) {
    if (cursor === null)
        return 0;
    try {
        const decoded = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
        if (!decoded
            || typeof decoded !== "object"
            || decoded.v !== 1
            || !Number.isSafeInteger(decoded.sequence)
            || Number(decoded.sequence) < 0) {
            throw new InvalidTransportPushCursorError();
        }
        return Number(decoded.sequence);
    }
    catch (error) {
        if (error instanceof InvalidTransportPushCursorError)
            throw error;
        throw new InvalidTransportPushCursorError();
    }
}
function rowToEntry(row) {
    const payload = JSON.parse(row.payload_json);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw new Error("Stored push update payload is invalid.");
    }
    return {
        cursor: encodeTransportPushCursor(Number(row.sequence)),
        sequence: Number(row.sequence),
        workspace_id: row.workspace_id,
        type: row.event_type,
        payload: payload,
        at: row.created_at,
    };
}
