/**
 * Legacy mutable Scope graph compatibility.
 *
 * This record predates canonical ScopeCompositionRevision, Port, Edge and
 * ScopeExecution storage. It inferred routing from one shared Context and its
 * subscriptions. That model is retained only to inspect and migrate existing
 * v0.1.x Workspaces; new pipeline topology must use `scope-compositions.ts`
 * and `scope-executions.ts`.
 *
 * Context membership and subscriptions remain valid for collaboration and
 * deliberate non-graph pub/sub. They never define or advance canonical Scope
 * execution. A revision uses either explicit Edge routing or this identified
 * legacy mode, never both.
 *
 * `graph_id` is therefore a legacy storage handle, not a user-facing primitive
 * and not proof of the current published Scope plan.
 */
import { randomUUID } from "node:crypto";
export class ScopeGraphNotFoundError extends Error {
    workspace_id;
    graph_id;
    code = "E_SCOPE_GRAPH_NOT_FOUND";
    constructor(workspace_id, graph_id) {
        super(`Scope graph not found: ${graph_id}`);
        this.workspace_id = workspace_id;
        this.graph_id = graph_id;
        this.name = "ScopeGraphNotFoundError";
    }
}
export class ScopeGraphInvalidError extends Error {
    reason;
    code = "E_SCOPE_GRAPH_INVALID";
    constructor(reason) {
        super(`Invalid scope graph: ${reason}`);
        this.reason = reason;
        this.name = "ScopeGraphInvalidError";
    }
}
export class ScopeGraphNodeNotFoundError extends Error {
    graph_id;
    node_id;
    code = "E_SCOPE_GRAPH_NODE_NOT_FOUND";
    constructor(graph_id, node_id) {
        super(`Scope graph '${graph_id}' has no node '${node_id}'`);
        this.graph_id = graph_id;
        this.node_id = node_id;
        this.name = "ScopeGraphNodeNotFoundError";
    }
}
export class ScopeGraphNodeNotATriggerError extends Error {
    graph_id;
    node_id;
    code = "E_SCOPE_GRAPH_NODE_NOT_A_TRIGGER";
    constructor(graph_id, node_id) {
        super(`Scope graph '${graph_id}' node '${node_id}' is not a trigger node`);
        this.graph_id = graph_id;
        this.node_id = node_id;
        this.name = "ScopeGraphNodeNotATriggerError";
    }
}
function nowIso() {
    return new Date().toISOString();
}
export function applyScopeGraphSchema(db) {
    db.exec(`
    CREATE TABLE IF NOT EXISTS scope_graphs (
      graph_id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      scope_id TEXT NOT NULL,
      context_id TEXT NOT NULL,
      nodes_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_scope_graphs_scope
      ON scope_graphs(workspace_id, scope_id, created_at ASC);
  `);
}
export function validateScopeGraphNodes(nodes) {
    const seenNodeIds = new Set();
    for (const node of nodes) {
        if (seenNodeIds.has(node.node_id)) {
            throw new ScopeGraphInvalidError(`duplicate node id '${node.node_id}'`);
        }
        seenNodeIds.add(node.node_id);
        if (node.kind === "actor" && !node.endpoint_id) {
            throw new ScopeGraphInvalidError(`actor node '${node.node_id}' is missing endpoint_id`);
        }
        if (node.kind === "actor" && node.bindings) {
            for (const binding of node.bindings) {
                if (binding.kind === "instructions" && !binding.text) {
                    throw new ScopeGraphInvalidError(`actor node '${node.node_id}' has an instructions binding missing text`);
                }
            }
        }
        if (node.kind === "trigger" && !node.event_type) {
            throw new ScopeGraphInvalidError(`trigger node '${node.node_id}' is missing event_type`);
        }
        if (node.kind === "command") {
            if (!node.endpoint_id) {
                throw new ScopeGraphInvalidError(`command node '${node.node_id}' is missing endpoint_id`);
            }
            if (!node.command) {
                throw new ScopeGraphInvalidError(`command node '${node.node_id}' is missing command`);
            }
        }
    }
}
/**
 * Pure node-list + Context-id persistence. Realising the wiring (participants,
 * subscriptions) is the caller's job (BusStore.createScopeGraph), using
 * ContextStore — the existing primitive — not this store.
 */
export class ScopeGraphStore {
    db;
    constructor(db) {
        this.db = db;
    }
    listScopeGraphs(workspaceId, scopeId) {
        const rows = this.db.prepare(`
      SELECT * FROM scope_graphs WHERE workspace_id = ? AND scope_id = ? ORDER BY created_at ASC
    `).all(workspaceId, scopeId);
        return rows.map((row) => this.rowToGraph(row));
    }
    /** All retained legacy graphs in a Workspace, used for migration evidence and remaining Event-source/Actor bindings. */
    listScopeGraphsForWorkspace(workspaceId) {
        const rows = this.db.prepare(`
      SELECT * FROM scope_graphs WHERE workspace_id = ? ORDER BY created_at ASC
    `).all(workspaceId);
        return rows.map((row) => this.rowToGraph(row));
    }
    getScopeGraph(workspaceId, graphId) {
        const row = this.db.prepare(`
      SELECT * FROM scope_graphs WHERE workspace_id = ? AND graph_id = ?
    `).get(workspaceId, graphId);
        return row ? this.rowToGraph(row) : null;
    }
    getScopeGraphForScope(workspaceId, scopeId) {
        const row = this.db.prepare(`
      SELECT * FROM scope_graphs
      WHERE workspace_id = ? AND scope_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(workspaceId, scopeId);
        return row ? this.rowToGraph(row) : null;
    }
    insertScopeGraph(input) {
        validateScopeGraphNodes(input.nodes);
        const graphId = `graph_${randomUUID()}`;
        const timestamp = nowIso();
        this.db.prepare(`
      INSERT INTO scope_graphs (
        graph_id, workspace_id, scope_id, context_id, nodes_json, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(graphId, input.workspace_id, input.scope_id, input.context_id, JSON.stringify(input.nodes), timestamp, timestamp);
        return this.getScopeGraph(input.workspace_id, graphId);
    }
    updateScopeGraph(input) {
        validateScopeGraphNodes(input.nodes);
        this.db.prepare(`
      UPDATE scope_graphs
      SET nodes_json = ?, updated_at = ?
      WHERE workspace_id = ? AND graph_id = ?
    `).run(JSON.stringify(input.nodes), nowIso(), input.workspace_id, input.graph_id);
        return this.getScopeGraph(input.workspace_id, input.graph_id);
    }
    rowToGraph(row) {
        return {
            graph_id: String(row.graph_id),
            workspace_id: String(row.workspace_id),
            scope_id: String(row.scope_id),
            context_id: String(row.context_id),
            nodes: JSON.parse(row.nodes_json),
            created_at: String(row.created_at),
            updated_at: String(row.updated_at)
        };
    }
}
