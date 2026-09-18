import { createHash, randomUUID } from "node:crypto";
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
export class ScopeCompositionInvalidError extends Error {
    reason;
    code = "E_SCOPE_COMPOSITION_INVALID";
    constructor(reason) {
        super(`Invalid Scope composition: ${reason}`);
        this.reason = reason;
        this.name = "ScopeCompositionInvalidError";
    }
}
export class ScopeCompositionNotFoundError extends Error {
    revision_id;
    code = "E_SCOPE_COMPOSITION_NOT_FOUND";
    constructor(revision_id) {
        super(`Scope composition revision not found: ${revision_id}`);
        this.revision_id = revision_id;
        this.name = "ScopeCompositionNotFoundError";
    }
}
export class ScopeCompositionImmutableError extends Error {
    revision_id;
    code = "E_SCOPE_COMPOSITION_IMMUTABLE";
    constructor(revision_id) {
        super(`Published Scope composition revision cannot be changed: ${revision_id}`);
        this.revision_id = revision_id;
        this.name = "ScopeCompositionImmutableError";
    }
}
export class ScopeCompositionConflictError extends Error {
    scope_id;
    expected_revision_id;
    actual_revision_id;
    code = "E_SCOPE_COMPOSITION_CONFLICT";
    constructor(scope_id, expected_revision_id, actual_revision_id) {
        super(`Scope '${scope_id}' changed: expected published revision '${expected_revision_id ?? "none"}', found '${actual_revision_id ?? "none"}'.`);
        this.scope_id = scope_id;
        this.expected_revision_id = expected_revision_id;
        this.actual_revision_id = actual_revision_id;
        this.name = "ScopeCompositionConflictError";
    }
}
export class ScopeCompositionImpactConflictError extends Error {
    expected_impact_digest;
    actual_impact_digest;
    code = "E_SCOPE_COMPOSITION_IMPACT_CONFLICT";
    constructor(expected_impact_digest, actual_impact_digest) {
        super(`Scope composition impact changed: expected '${expected_impact_digest}', found '${actual_impact_digest}'.`);
        this.expected_impact_digest = expected_impact_digest;
        this.actual_impact_digest = actual_impact_digest;
        this.name = "ScopeCompositionImpactConflictError";
    }
}
function nowIso() {
    return new Date().toISOString();
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
export function scopeCompositionDigest(content) {
    return createHash("sha256").update(canonicalJson(normalizeCompositionContent(content))).digest("hex");
}
function normalizeCompositionContent(content) {
    return {
        nodes: content.nodes.map((node) => ({
            node_id: node.node_id,
            kind: node.kind,
            ...(node.label ? { label: node.label } : {}),
            ...(node.resource_id ? { resource_id: node.resource_id } : {}),
            config: node.config ?? {},
            bindings: node.bindings ?? [],
            capability_grant_ids: [...(node.capability_grant_ids ?? [])].sort(),
            ...(node.activation ? { activation: node.activation } : {}),
            ...(node.context_policy ? { context_policy: node.context_policy } : {}),
        })),
        ports: content.ports.map((port) => ({
            port_id: port.port_id,
            node_id: port.node_id,
            name: port.name,
            direction: port.direction,
            event_types: port.event_types ?? [],
            artefact_types: port.artefact_types ?? [],
            schema_ref: port.schema_ref ?? null,
            min_count: port.min_count ?? 0,
            max_count: port.max_count === undefined ? 1 : port.max_count,
        })),
        edges: content.edges.map((edge) => ({
            edge_id: edge.edge_id,
            source_port_id: edge.source_port_id,
            target_port_id: edge.target_port_id,
            enabled: edge.enabled !== false,
            priority: edge.priority ?? 0,
            policy: edge.policy ?? {},
        })),
    };
}
function json(value) {
    return JSON.stringify(value ?? {});
}
function parseJson(value, fallback) {
    if (!value)
        return fallback;
    return JSON.parse(value);
}
function requireUnique(values, label) {
    const seen = new Set();
    for (const value of values) {
        if (!value || !ID_RE.test(value)) {
            throw new ScopeCompositionInvalidError(`${label} '${value}' is not a stable identifier`);
        }
        if (seen.has(value))
            throw new ScopeCompositionInvalidError(`duplicate ${label} '${value}'`);
        seen.add(value);
    }
}
function contractsOverlap(left, right) {
    if (!left?.length || !right?.length)
        return true;
    return left.includes("*") || right.includes("*") || left.some((value) => right.includes(value));
}
export function validateScopeComposition(content, routingMode = "edge") {
    if (content.nodes.length === 0) {
        throw new ScopeCompositionInvalidError("at least one NodePlacement is required");
    }
    requireUnique(content.nodes.map((node) => node.node_id), "node id");
    requireUnique(content.ports.map((port) => port.port_id), "port id");
    requireUnique(content.edges.map((edge) => edge.edge_id), "edge id");
    const nodes = new Map(content.nodes.map((node) => [node.node_id, node]));
    const ports = new Map(content.ports.map((port) => [port.port_id, port]));
    for (const port of content.ports) {
        if (!nodes.has(port.node_id)) {
            throw new ScopeCompositionInvalidError(`port '${port.port_id}' references missing node '${port.node_id}'`);
        }
        const min = port.min_count ?? 0;
        const max = port.max_count ?? 1;
        if (!Number.isInteger(min) || min < 0) {
            throw new ScopeCompositionInvalidError(`port '${port.port_id}' has invalid min_count`);
        }
        if (max !== null && (!Number.isInteger(max) || max < min)) {
            throw new ScopeCompositionInvalidError(`port '${port.port_id}' has invalid max_count`);
        }
    }
    for (const edge of content.edges) {
        const source = ports.get(edge.source_port_id);
        const target = ports.get(edge.target_port_id);
        if (!source)
            throw new ScopeCompositionInvalidError(`edge '${edge.edge_id}' references missing source port '${edge.source_port_id}'`);
        if (!target)
            throw new ScopeCompositionInvalidError(`edge '${edge.edge_id}' references missing target port '${edge.target_port_id}'`);
        if (source.direction !== "output") {
            throw new ScopeCompositionInvalidError(`edge '${edge.edge_id}' source '${source.port_id}' is not an output port`);
        }
        if (target.direction !== "input") {
            throw new ScopeCompositionInvalidError(`edge '${edge.edge_id}' target '${target.port_id}' is not an input port`);
        }
        if (!contractsOverlap(source.event_types, target.event_types)) {
            throw new ScopeCompositionInvalidError(`edge '${edge.edge_id}' connects incompatible Event contracts`);
        }
        if (!contractsOverlap(source.artefact_types, target.artefact_types)) {
            throw new ScopeCompositionInvalidError(`edge '${edge.edge_id}' connects incompatible Artefact contracts`);
        }
    }
    for (const node of content.nodes) {
        requireUnique(node.capability_grant_ids ?? [], `CapabilityGrant id on node '${node.node_id}'`);
        validateNodePolicies(node, content.ports, routingMode);
    }
}
/** Side-effect-free validation used by every client before publication. */
export function inspectScopeCompositionValidation(content, routingMode = "edge") {
    try {
        validateScopeComposition(content, routingMode);
        return {
            valid: true,
            semantic_digest: scopeCompositionDigest(content),
            diagnostics: [],
        };
    }
    catch (error) {
        if (!(error instanceof ScopeCompositionInvalidError))
            throw error;
        return {
            valid: false,
            semantic_digest: null,
            diagnostics: [{
                    severity: "error",
                    code: error.code,
                    message: error.message,
                    resource_ids: [],
                }],
        };
    }
}
function contentOf(revision) {
    return { nodes: revision.nodes, ports: revision.ports, edges: revision.edges };
}
function compareByStableId(from, to, idKey) {
    const before = new Map(from.map((item) => [String(item[idKey]), item]));
    const after = new Map(to.map((item) => [String(item[idKey]), item]));
    const added = [...after.keys()].filter((id) => !before.has(id)).sort();
    const removed = [...before.keys()].filter((id) => !after.has(id)).sort();
    const changed = [...after.keys()].filter((id) => {
        const prior = before.get(id);
        return prior !== undefined && canonicalJson(prior) !== canonicalJson(after.get(id));
    }).sort();
    return { added, removed, changed };
}
export function compareScopeCompositionRevisions(from, to) {
    return {
        from_revision_id: from?.revision_id ?? null,
        to_revision_id: to.revision_id,
        from_semantic_digest: from?.semantic_digest ?? null,
        to_semantic_digest: to.semantic_digest,
        nodes: compareByStableId(from?.nodes ?? [], to.nodes, "node_id"),
        ports: compareByStableId(from?.ports ?? [], to.ports, "port_id"),
        edges: compareByStableId(from?.edges ?? [], to.edges, "edge_id"),
    };
}
export function simulateScopeComposition(revision, ingressNodeId, outputPortId) {
    validateScopeComposition(contentOf(revision), revision.routing_mode);
    if (revision.routing_mode !== "edge") {
        throw new ScopeCompositionInvalidError("legacy subscription revisions cannot be simulated as an Edge plan");
    }
    const ingress = revision.nodes.find((node) => node.node_id === ingressNodeId);
    if (!ingress || ingress.kind !== "event") {
        throw new ScopeCompositionInvalidError(`simulation ingress '${ingressNodeId}' is not an Event node`);
    }
    const ports = new Map(revision.ports.map((port) => [port.port_id, port]));
    const nodes = new Map(revision.nodes.map((node) => [node.node_id, node]));
    const output = ports.get(outputPortId);
    if (!output || output.node_id !== ingressNodeId || output.direction !== "output") {
        throw new ScopeCompositionInvalidError(`simulation output Port '${outputPortId}' does not belong to ingress '${ingressNodeId}'`);
    }
    const enabled = revision.edges.filter((edge) => edge.enabled !== false);
    const bySource = new Map();
    for (const edge of enabled) {
        const list = bySource.get(edge.source_port_id) ?? [];
        list.push(edge);
        bySource.set(edge.source_port_id, list);
    }
    for (const list of bySource.values()) {
        list.sort((left, right) => (left.priority ?? 0) - (right.priority ?? 0)
            || left.edge_id.localeCompare(right.edge_id));
    }
    const queue = [{ port_id: outputPortId, depth: 0 }];
    const expandedPorts = new Set();
    const reachableNodes = new Set([ingressNodeId]);
    const reachableEdges = new Set();
    const terminalPorts = new Set();
    const steps = [];
    while (queue.length > 0) {
        const current = queue.shift();
        if (expandedPorts.has(current.port_id))
            continue;
        expandedPorts.add(current.port_id);
        const outgoing = bySource.get(current.port_id) ?? [];
        if (outgoing.length === 0)
            terminalPorts.add(current.port_id);
        for (const edge of outgoing) {
            reachableEdges.add(edge.edge_id);
            const sourcePort = ports.get(edge.source_port_id);
            const targetPort = ports.get(edge.target_port_id);
            const targetNode = nodes.get(targetPort.node_id);
            reachableNodes.add(targetNode.node_id);
            steps.push({
                depth: current.depth + 1,
                edge_id: edge.edge_id,
                source_node_id: sourcePort.node_id,
                source_port_id: sourcePort.port_id,
                target_node_id: targetNode.node_id,
                target_port_id: targetPort.port_id,
                activation: targetNode.activation ?? null,
                context_policy: targetNode.context_policy ?? null,
            });
            for (const next of revision.ports
                .filter((port) => port.node_id === targetNode.node_id && port.direction === "output")
                .sort((left, right) => left.port_id.localeCompare(right.port_id))) {
                queue.push({ port_id: next.port_id, depth: current.depth + 1 });
            }
        }
    }
    const unreachableNodeIds = revision.nodes.map((node) => node.node_id)
        .filter((nodeId) => !reachableNodes.has(nodeId)).sort();
    return {
        revision_id: revision.revision_id,
        semantic_digest: revision.semantic_digest,
        ingress_node_id: ingressNodeId,
        output_port_id: outputPortId,
        reachable_node_ids: [...reachableNodes].sort(),
        reachable_edge_ids: [...reachableEdges].sort(),
        unreachable_node_ids: unreachableNodeIds,
        terminal_output_port_ids: [...terminalPorts].sort(),
        steps,
        diagnostics: unreachableNodeIds.length > 0 ? [{
                severity: "warning",
                code: "scope_plan_unreachable_nodes",
                message: "Some Nodes are not reachable from this ingress.",
                resource_ids: unreachableNodeIds,
            }] : [],
    };
}
function validateNodePolicies(node, ports, routingMode) {
    const inputPorts = ports.filter((port) => port.node_id === node.node_id && port.direction === "input");
    const isProcessingNode = node.kind === "actor" || node.kind === "command";
    const needsContext = isProcessingNode || node.kind === "event";
    if (routingMode === "legacy_subscription") {
        if (node.activation?.mode !== "legacy_subscription" || !stableText(node.activation.graph_id)) {
            throw new ScopeCompositionInvalidError(`legacy node '${node.node_id}' must retain its explicit legacy_subscription activation`);
        }
    }
    else if (node.activation?.mode === "legacy_subscription") {
        throw new ScopeCompositionInvalidError(`Edge-routed node '${node.node_id}' cannot use legacy_subscription activation`);
    }
    else if (isProcessingNode) {
        validateActivationPolicy(node, inputPorts);
    }
    else if (node.activation !== undefined) {
        validateActivationPolicy(node, inputPorts);
    }
    if (needsContext && node.context_policy === undefined) {
        throw new ScopeCompositionInvalidError(`node '${node.node_id}' must declare a Context policy`);
    }
    if (node.context_policy !== undefined)
        validateContextPolicy(node);
}
function validateActivationPolicy(node, inputPorts) {
    const policy = node.activation;
    if (!policy) {
        throw new ScopeCompositionInvalidError(`processing node '${node.node_id}' must declare an activation policy`);
    }
    if (policy.mode === "per_delivery") {
        requireExactKeys(policy, ["mode"], `activation policy for node '${node.node_id}'`);
        return;
    }
    if (policy.mode === "all_required_ports") {
        requireExactKeys(policy, ["mode"], `activation policy for node '${node.node_id}'`);
        if (!inputPorts.some((port) => (port.min_count ?? 0) > 0)) {
            throw new ScopeCompositionInvalidError(`all_required_ports node '${node.node_id}' must have at least one required input Port`);
        }
        return;
    }
    if (policy.mode === "keyed_gather") {
        requireExactKeys(policy, ["mode", "join_key", "expected_members"], `activation policy for node '${node.node_id}'`);
        validateEventContentSelector(policy.join_key, `join key for node '${node.node_id}'`);
        if (!policy.expected_members) {
            if (!inputPorts.some((port) => (port.min_count ?? 0) > 0)) {
                throw new ScopeCompositionInvalidError(`keyed_gather node '${node.node_id}' must have required input Ports or dynamic expected membership`);
            }
            return;
        }
        const expected = policy.expected_members;
        requireExactKeys(expected, ["mode", "collection_port_id", "member_port_id", "member_key", "match"], `expected membership for node '${node.node_id}'`);
        if (expected.mode !== "from_collection") {
            throw new ScopeCompositionInvalidError(`node '${node.node_id}' has an unsupported expected-membership mode`);
        }
        const collectionPort = inputPorts.find((port) => port.port_id === expected.collection_port_id);
        const memberPort = inputPorts.find((port) => port.port_id === expected.member_port_id);
        if (!collectionPort || !memberPort) {
            throw new ScopeCompositionInvalidError(`node '${node.node_id}' expected-membership Ports must be input Ports on that node`);
        }
        if (collectionPort.port_id === memberPort.port_id) {
            throw new ScopeCompositionInvalidError(`node '${node.node_id}' collection and member Ports must be different`);
        }
        const collectionMax = collectionPort.max_count === undefined ? 1 : collectionPort.max_count;
        if ((collectionPort.min_count ?? 0) < 1 || collectionMax !== 1) {
            throw new ScopeCompositionInvalidError(`node '${node.node_id}' collection Port must require exactly one ArtefactVersion`);
        }
        const memberMax = memberPort.max_count === undefined ? 1 : memberPort.max_count;
        if (memberMax !== null) {
            throw new ScopeCompositionInvalidError(`node '${node.node_id}' dynamic member Port must allow unbounded membership`);
        }
        if (expected.match !== "member_key" && expected.match !== "member_key_and_version") {
            throw new ScopeCompositionInvalidError(`node '${node.node_id}' has an unsupported member match policy`);
        }
        if (expected.member_key.source === "event_content") {
            validateEventContentSelector(expected.member_key, `member key for node '${node.node_id}'`);
        }
        else if (expected.member_key.source !== "publication_member_key") {
            throw new ScopeCompositionInvalidError(`node '${node.node_id}' has an unsupported member-key selector`);
        }
        return;
    }
    throw new ScopeCompositionInvalidError(`node '${node.node_id}' has unsupported activation mode '${String(policy.mode)}'`);
}
function validateContextPolicy(node) {
    const policy = node.context_policy;
    if (policy.mode === "new_per_execution") {
        requireExactKeys(policy, ["mode"], `Context policy for node '${node.node_id}'`);
        return;
    }
    if (policy.mode === "reuse_by_key") {
        requireExactKeys(policy, ["mode", "key_template"], `Context policy for node '${node.node_id}'`);
        if (!stableText(policy.key_template)) {
            throw new ScopeCompositionInvalidError(`node '${node.node_id}' reuse_by_key policy requires key_template`);
        }
        return;
    }
    if (policy.mode === "fixed") {
        requireExactKeys(policy, ["mode", "context_id"], `Context policy for node '${node.node_id}'`);
        if (!stableText(policy.context_id)) {
            throw new ScopeCompositionInvalidError(`node '${node.node_id}' fixed policy requires context_id`);
        }
        return;
    }
    throw new ScopeCompositionInvalidError(`node '${node.node_id}' has unsupported Context mode '${String(policy.mode)}'`);
}
function validateEventContentSelector(selector, label) {
    if (!selector || selector.source !== "event_content" || !stableText(selector.path)) {
        throw new ScopeCompositionInvalidError(`${label} must select a non-empty Event content path`);
    }
    requireExactKeys(selector, ["source", "path"], label);
}
function stableText(value) {
    return typeof value === "string" && value.trim().length > 0 && value.length <= 4096;
}
function requireExactKeys(value, allowed, label) {
    const allowedKeys = new Set(allowed);
    const extra = Object.keys(value).filter((key) => !allowedKeys.has(key));
    if (extra.length > 0) {
        throw new ScopeCompositionInvalidError(`${label} has unsupported field '${extra[0]}'`);
    }
}
export function applyScopeCompositionSchema(db) {
    db.exec(`
    CREATE TABLE IF NOT EXISTS scope_composition_revisions (
      revision_id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      scope_id TEXT NOT NULL,
      revision_number INTEGER NOT NULL,
      routing_mode TEXT NOT NULL,
      based_on_revision_id TEXT,
      semantic_digest TEXT NOT NULL,
      created_by_endpoint_id TEXT,
      created_at TEXT NOT NULL,
      published_at TEXT,
      withdrawn_at TEXT,
      UNIQUE (workspace_id, scope_id, revision_number)
    );

    CREATE INDEX IF NOT EXISTS idx_scope_composition_revisions_scope
      ON scope_composition_revisions(workspace_id, scope_id, revision_number DESC);

    CREATE TABLE IF NOT EXISTS scope_node_placements (
      revision_id TEXT NOT NULL,
      node_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      label TEXT,
      resource_id TEXT,
      config_json TEXT NOT NULL,
      bindings_json TEXT NOT NULL,
      capability_grant_ids_json TEXT NOT NULL DEFAULT '[]',
      activation_json TEXT NOT NULL,
      context_policy_json TEXT NOT NULL,
      PRIMARY KEY (revision_id, node_id)
    );

    CREATE TABLE IF NOT EXISTS scope_ports (
      revision_id TEXT NOT NULL,
      port_id TEXT NOT NULL,
      node_id TEXT NOT NULL,
      name TEXT NOT NULL,
      direction TEXT NOT NULL,
      event_types_json TEXT NOT NULL,
      artefact_types_json TEXT NOT NULL,
      schema_ref TEXT,
      min_count INTEGER NOT NULL,
      max_count INTEGER,
      PRIMARY KEY (revision_id, port_id)
    );

    CREATE INDEX IF NOT EXISTS idx_scope_ports_node
      ON scope_ports(revision_id, node_id, direction);

    CREATE TABLE IF NOT EXISTS scope_edges (
      revision_id TEXT NOT NULL,
      edge_id TEXT NOT NULL,
      source_port_id TEXT NOT NULL,
      target_port_id TEXT NOT NULL,
      enabled INTEGER NOT NULL,
      priority INTEGER NOT NULL,
      policy_json TEXT NOT NULL,
      PRIMARY KEY (revision_id, edge_id)
    );

    CREATE INDEX IF NOT EXISTS idx_scope_edges_source
      ON scope_edges(revision_id, source_port_id, enabled, priority);
  `);
    const placementColumns = db.prepare("PRAGMA table_info(scope_node_placements)")
        .all();
    if (!placementColumns.some((column) => column.name === "capability_grant_ids_json")) {
        db.exec("ALTER TABLE scope_node_placements ADD COLUMN capability_grant_ids_json TEXT NOT NULL DEFAULT '[]'");
    }
    // Early revisions hashed caller shorthand while storage materialised default
    // Port and Edge values. Correct retained digests once so an exported or
    // cloned exact composition keeps the same semantic identity after restart.
    const retained = new ScopeCompositionStore(db);
    const ids = db.prepare(`SELECT revision_id FROM scope_composition_revisions`)
        .all();
    for (const { revision_id: revisionId } of ids) {
        const revision = retained.getRevision(revisionId);
        if (!revision)
            continue;
        const digest = scopeCompositionDigest(contentOf(revision));
        if (digest !== revision.semantic_digest) {
            db.prepare(`UPDATE scope_composition_revisions SET semantic_digest = ? WHERE revision_id = ?`)
                .run(digest, revisionId);
        }
    }
}
export class ScopeCompositionStore {
    db;
    constructor(db) {
        this.db = db;
    }
    createDraft(input) {
        const routingMode = input.routing_mode ?? "edge";
        validateScopeComposition(input.content, routingMode);
        const revisionId = input.revision_id ?? `revision_${randomUUID()}`;
        const revisionNumber = Number(this.db.prepare(`
      SELECT COALESCE(MAX(revision_number), 0) + 1 AS next
      FROM scope_composition_revisions
      WHERE workspace_id = ? AND scope_id = ?
    `).get(input.workspace_id, input.scope_id).next);
        const timestamp = nowIso();
        this.transaction(() => {
            this.db.prepare(`
        INSERT INTO scope_composition_revisions (
          revision_id, workspace_id, scope_id, revision_number, routing_mode,
          based_on_revision_id, semantic_digest, created_by_endpoint_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(revisionId, input.workspace_id, input.scope_id, revisionNumber, routingMode, input.based_on_revision_id ?? null, scopeCompositionDigest(input.content), input.created_by_endpoint_id ?? null, timestamp);
            this.insertContent(revisionId, input.content);
        });
        return this.getRevision(revisionId);
    }
    replaceDraft(revisionId, content, expectedDigest) {
        const existing = this.getRevision(revisionId);
        if (!existing)
            throw new ScopeCompositionNotFoundError(revisionId);
        if (existing.published_at)
            throw new ScopeCompositionImmutableError(revisionId);
        validateScopeComposition(content, existing.routing_mode);
        if (expectedDigest !== undefined && expectedDigest !== existing.semantic_digest) {
            throw new ScopeCompositionConflictError(existing.scope_id, expectedDigest, existing.semantic_digest);
        }
        this.transaction(() => {
            this.deleteContent(revisionId);
            this.insertContent(revisionId, content);
            this.db.prepare(`UPDATE scope_composition_revisions SET semantic_digest = ? WHERE revision_id = ?`)
                .run(scopeCompositionDigest(content), revisionId);
        });
        return this.getRevision(revisionId);
    }
    publishDraft(input) {
        const revision = this.getRevision(input.revision_id);
        if (!revision)
            throw new ScopeCompositionNotFoundError(input.revision_id);
        if (revision.published_at) {
            const current = this.getPublishedRevision(revision.workspace_id, revision.scope_id);
            if (current?.revision_id === revision.revision_id)
                return revision;
            throw new ScopeCompositionImmutableError(revision.revision_id);
        }
        if (revision.withdrawn_at) {
            throw new ScopeCompositionInvalidError(`revision '${revision.revision_id}' is a withdrawn draft`);
        }
        validateScopeComposition(revision, revision.routing_mode);
        const scope = this.db.prepare(`
      SELECT published_revision_id FROM scopes WHERE workspace_id = ? AND scope_id = ?
    `).get(revision.workspace_id, revision.scope_id);
        if (!scope)
            throw new ScopeCompositionInvalidError(`Scope '${revision.scope_id}' does not exist`);
        const actual = scope.published_revision_id ?? null;
        if (input.expected_published_revision_id !== undefined && input.expected_published_revision_id !== actual) {
            throw new ScopeCompositionConflictError(revision.scope_id, input.expected_published_revision_id, actual);
        }
        const impact = this.assessImpact(revision.revision_id);
        if (input.expected_impact_digest !== undefined
            && input.expected_impact_digest !== impact.impact_digest) {
            throw new ScopeCompositionImpactConflictError(input.expected_impact_digest, impact.impact_digest);
        }
        const publishedAt = nowIso();
        this.transaction(() => {
            this.db.prepare(`UPDATE scope_composition_revisions SET published_at = ? WHERE revision_id = ? AND published_at IS NULL`)
                .run(publishedAt, revision.revision_id);
            this.db.prepare(`UPDATE scopes SET published_revision_id = ?, updated_at = ? WHERE workspace_id = ? AND scope_id = ?`)
                .run(revision.revision_id, publishedAt, revision.workspace_id, revision.scope_id);
        });
        return this.getRevision(revision.revision_id);
    }
    assessImpact(targetRevisionId) {
        const target = this.getRevision(targetRevisionId);
        if (!target)
            throw new ScopeCompositionNotFoundError(targetRevisionId);
        const current = this.getPublishedRevision(target.workspace_id, target.scope_id);
        const changes = compareScopeCompositionRevisions(current, target);
        const activeStatuses = [
            "queued", "active", "waiting_external", "paused", "blocked",
        ];
        const placeholders = activeStatuses.map(() => "?").join(", ");
        const executionSchemaExists = Boolean(this.db.prepare(`
      SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'scope_executions'
    `).get());
        const active = executionSchemaExists
            ? this.db.prepare(`
          SELECT execution_id, revision_id
          FROM scope_executions
          WHERE workspace_id = ? AND scope_id = ? AND status IN (${placeholders})
          ORDER BY execution_id ASC
        `).all(target.workspace_id, target.scope_id, ...activeStatuses)
            : [];
        const impactWithoutDigest = {
            ...changes,
            active_execution_ids_pinned_to_current: active
                .filter((execution) => execution.revision_id === current?.revision_id)
                .map((execution) => execution.execution_id),
            active_execution_ids_pinned_to_target: active
                .filter((execution) => execution.revision_id === target.revision_id)
                .map((execution) => execution.execution_id),
        };
        return {
            ...impactWithoutDigest,
            impact_digest: createHash("sha256").update(canonicalJson(impactWithoutDigest)).digest("hex"),
        };
    }
    /**
     * Moves only the current-plan pointer. Retained revisions and every active
     * execution's pinned revision remain exact.
     */
    rollbackPublishedRevision(input) {
        const target = this.getRevision(input.target_revision_id);
        if (!target)
            throw new ScopeCompositionNotFoundError(input.target_revision_id);
        if (!target.published_at || target.withdrawn_at) {
            throw new ScopeCompositionInvalidError(`rollback target '${target.revision_id}' is not a retained published revision`);
        }
        const current = this.getPublishedRevision(target.workspace_id, target.scope_id);
        if (!current || current.revision_id !== input.expected_published_revision_id) {
            throw new ScopeCompositionConflictError(target.scope_id, input.expected_published_revision_id, current?.revision_id ?? null);
        }
        const impact = this.assessImpact(target.revision_id);
        if (impact.impact_digest !== input.expected_impact_digest) {
            throw new ScopeCompositionImpactConflictError(input.expected_impact_digest, impact.impact_digest);
        }
        if (current.revision_id === target.revision_id)
            return target;
        this.db.prepare(`
      UPDATE scopes SET published_revision_id = ?, updated_at = ?
      WHERE workspace_id = ? AND scope_id = ? AND published_revision_id = ?
    `).run(target.revision_id, nowIso(), target.workspace_id, target.scope_id, current.revision_id);
        const updated = this.getPublishedRevision(target.workspace_id, target.scope_id);
        if (updated?.revision_id !== target.revision_id) {
            throw new ScopeCompositionConflictError(target.scope_id, current.revision_id, updated?.revision_id ?? null);
        }
        return updated;
    }
    cloneRevision(input) {
        const source = this.getRevision(input.source_revision_id);
        if (!source)
            throw new ScopeCompositionNotFoundError(input.source_revision_id);
        const targetScope = this.db.prepare(`
      SELECT scope_id FROM scopes WHERE workspace_id = ? AND scope_id = ?
    `).get(input.target_workspace_id, input.target_scope_id);
        if (!targetScope) {
            throw new ScopeCompositionInvalidError(`target Scope '${input.target_scope_id}' does not exist`);
        }
        return this.createDraft({
            workspace_id: input.target_workspace_id,
            scope_id: input.target_scope_id,
            routing_mode: source.routing_mode,
            based_on_revision_id: source.revision_id,
            created_by_endpoint_id: input.created_by_endpoint_id ?? null,
            content: contentOf(source),
        });
    }
    exportRevision(revisionId) {
        const revision = this.getRevision(revisionId);
        if (!revision)
            throw new ScopeCompositionNotFoundError(revisionId);
        return {
            format: "floe.scope-composition",
            format_version: 1,
            source: {
                workspace_id: revision.workspace_id,
                scope_id: revision.scope_id,
                revision_id: revision.revision_id,
                revision_number: revision.revision_number,
            },
            routing_mode: revision.routing_mode,
            semantic_digest: revision.semantic_digest,
            content: contentOf(revision),
        };
    }
    importRevision(input) {
        if (input.portable.format !== "floe.scope-composition" || input.portable.format_version !== 1) {
            throw new ScopeCompositionInvalidError("unsupported portable Scope composition format");
        }
        validateScopeComposition(input.portable.content, input.portable.routing_mode);
        const digest = scopeCompositionDigest(input.portable.content);
        if (digest !== input.portable.semantic_digest) {
            throw new ScopeCompositionInvalidError("portable Scope composition digest does not match its content");
        }
        return this.createDraft({
            workspace_id: input.target_workspace_id,
            scope_id: input.target_scope_id,
            routing_mode: input.portable.routing_mode,
            based_on_revision_id: null,
            created_by_endpoint_id: input.created_by_endpoint_id ?? null,
            content: input.portable.content,
        });
    }
    withdrawDraft(revisionId) {
        const revision = this.getRevision(revisionId);
        if (!revision)
            throw new ScopeCompositionNotFoundError(revisionId);
        if (revision.published_at)
            throw new ScopeCompositionImmutableError(revisionId);
        if (!revision.withdrawn_at) {
            this.db.prepare(`UPDATE scope_composition_revisions SET withdrawn_at = ? WHERE revision_id = ?`)
                .run(nowIso(), revisionId);
        }
        return this.getRevision(revisionId);
    }
    getRevision(revisionId) {
        const row = this.db.prepare(`SELECT * FROM scope_composition_revisions WHERE revision_id = ?`).get(revisionId);
        return row ? this.rowToRevision(row) : null;
    }
    getPublishedRevision(workspaceId, scopeId) {
        const row = this.db.prepare(`
      SELECT r.*
      FROM scopes s
      JOIN scope_composition_revisions r ON r.revision_id = s.published_revision_id
      WHERE s.workspace_id = ? AND s.scope_id = ?
    `).get(workspaceId, scopeId);
        return row ? this.rowToRevision(row) : null;
    }
    listRevisions(workspaceId, scopeId) {
        const rows = this.db.prepare(`
      SELECT * FROM scope_composition_revisions
      WHERE workspace_id = ? AND scope_id = ?
      ORDER BY revision_number DESC
    `).all(workspaceId, scopeId);
        return rows.map((row) => this.rowToRevision(row));
    }
    rowToRevision(row) {
        const nodes = this.db.prepare(`
      SELECT * FROM scope_node_placements WHERE revision_id = ? ORDER BY rowid ASC
    `).all(row.revision_id).map((node) => {
            const activation = parseJson(node.activation_json, {});
            const contextPolicy = parseJson(node.context_policy_json, {});
            return {
                node_id: String(node.node_id),
                kind: node.kind,
                ...(node.label ? { label: String(node.label) } : {}),
                ...(node.resource_id ? { resource_id: String(node.resource_id) } : {}),
                config: parseJson(node.config_json, {}),
                bindings: parseJson(node.bindings_json, []),
                capability_grant_ids: parseJson(node.capability_grant_ids_json, []),
                ...(Object.keys(activation).length > 0 ? { activation: activation } : {}),
                ...(Object.keys(contextPolicy).length > 0 ? { context_policy: contextPolicy } : {}),
            };
        });
        const ports = this.db.prepare(`
      SELECT * FROM scope_ports WHERE revision_id = ? ORDER BY rowid ASC
    `).all(row.revision_id).map((port) => ({
            port_id: String(port.port_id),
            node_id: String(port.node_id),
            name: String(port.name),
            direction: port.direction === "output" ? "output" : "input",
            event_types: parseJson(port.event_types_json, []),
            artefact_types: parseJson(port.artefact_types_json, []),
            schema_ref: port.schema_ref ?? null,
            min_count: Number(port.min_count),
            max_count: port.max_count === null ? null : Number(port.max_count),
        }));
        const edges = this.db.prepare(`
      SELECT * FROM scope_edges WHERE revision_id = ? ORDER BY priority ASC, rowid ASC
    `).all(row.revision_id).map((edge) => ({
            edge_id: String(edge.edge_id),
            source_port_id: String(edge.source_port_id),
            target_port_id: String(edge.target_port_id),
            enabled: Number(edge.enabled) === 1,
            priority: Number(edge.priority),
            policy: parseJson(edge.policy_json, {}),
        }));
        return {
            revision_id: String(row.revision_id),
            workspace_id: String(row.workspace_id),
            scope_id: String(row.scope_id),
            revision_number: Number(row.revision_number),
            routing_mode: row.routing_mode === "legacy_subscription" ? "legacy_subscription" : "edge",
            based_on_revision_id: row.based_on_revision_id ?? null,
            semantic_digest: String(row.semantic_digest),
            created_by_endpoint_id: row.created_by_endpoint_id ?? null,
            created_at: String(row.created_at),
            published_at: row.published_at ?? null,
            withdrawn_at: row.withdrawn_at ?? null,
            nodes,
            ports,
            edges,
        };
    }
    insertContent(revisionId, content) {
        const insertNode = this.db.prepare(`
      INSERT INTO scope_node_placements (
        revision_id, node_id, kind, label, resource_id, config_json,
        bindings_json, capability_grant_ids_json, activation_json, context_policy_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
        for (const node of content.nodes) {
            insertNode.run(revisionId, node.node_id, node.kind, node.label ?? null, node.resource_id ?? null, json(node.config), json(node.bindings ?? []), json(node.capability_grant_ids ?? []), json(node.activation), json(node.context_policy));
        }
        const insertPort = this.db.prepare(`
      INSERT INTO scope_ports (
        revision_id, port_id, node_id, name, direction, event_types_json,
        artefact_types_json, schema_ref, min_count, max_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
        for (const port of content.ports) {
            insertPort.run(revisionId, port.port_id, port.node_id, port.name, port.direction, json(port.event_types ?? []), json(port.artefact_types ?? []), port.schema_ref ?? null, port.min_count ?? 0, port.max_count === undefined ? 1 : port.max_count);
        }
        const insertEdge = this.db.prepare(`
      INSERT INTO scope_edges (
        revision_id, edge_id, source_port_id, target_port_id, enabled, priority, policy_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
        for (const edge of content.edges) {
            insertEdge.run(revisionId, edge.edge_id, edge.source_port_id, edge.target_port_id, edge.enabled === false ? 0 : 1, edge.priority ?? 0, json(edge.policy));
        }
    }
    deleteContent(revisionId) {
        this.db.prepare(`DELETE FROM scope_edges WHERE revision_id = ?`).run(revisionId);
        this.db.prepare(`DELETE FROM scope_ports WHERE revision_id = ?`).run(revisionId);
        this.db.prepare(`DELETE FROM scope_node_placements WHERE revision_id = ?`).run(revisionId);
    }
    transaction(fn) {
        this.db.exec("BEGIN IMMEDIATE");
        try {
            const result = fn();
            this.db.exec("COMMIT");
            return result;
        }
        catch (error) {
            this.db.exec("ROLLBACK");
            throw error;
        }
    }
}
