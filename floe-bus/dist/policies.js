import { createHash, randomUUID } from "node:crypto";
export class PolicyValidationError extends Error {
    reason;
    code = "E_POLICY_INVALID";
    constructor(reason) {
        super(`Invalid Policy: ${reason}`);
        this.reason = reason;
        this.name = "PolicyValidationError";
    }
}
export class PolicyNotFoundError extends Error {
    kind;
    id;
    code = "E_POLICY_NOT_FOUND";
    constructor(kind, id) {
        super(`Policy ${kind} not found: ${id}`);
        this.kind = kind;
        this.id = id;
        this.name = "PolicyNotFoundError";
    }
}
export class PolicyConflictError extends Error {
    policy_id;
    reason;
    code = "E_POLICY_CONFLICT";
    constructor(policy_id, reason) {
        super(`Policy '${policy_id}' cannot change: ${reason}`);
        this.policy_id = policy_id;
        this.reason = reason;
        this.name = "PolicyConflictError";
    }
}
export function applyPolicySchema(db) {
    db.exec(`
    CREATE TABLE IF NOT EXISTS policies (
      policy_id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      category TEXT NOT NULL CHECK (category IN ('operation', 'approval', 'budget', 'trust', 'data', 'emergency_stop')),
      status TEXT NOT NULL CHECK (status IN ('active', 'retired')),
      current_revision_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      retired_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_policies_workspace_status
      ON policies(workspace_id, status, category, created_at);

    CREATE TABLE IF NOT EXISTS policy_revisions (
      policy_revision_id TEXT PRIMARY KEY,
      policy_id TEXT NOT NULL REFERENCES policies(policy_id),
      workspace_id TEXT NOT NULL,
      category TEXT NOT NULL CHECK (category IN ('operation', 'approval', 'budget', 'trust', 'data', 'emergency_stop')),
      revision_number INTEGER NOT NULL,
      based_on_revision_id TEXT REFERENCES policy_revisions(policy_revision_id),
      semantic_digest TEXT NOT NULL,
      content_json TEXT NOT NULL,
      created_by_principal_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      published_at TEXT,
      withdrawn_at TEXT,
      UNIQUE(policy_id, revision_number)
    );

    CREATE INDEX IF NOT EXISTS idx_policy_revisions_policy
      ON policy_revisions(policy_id, revision_number DESC);

    CREATE TABLE IF NOT EXISTS policy_bindings (
      policy_binding_id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      policy_revision_id TEXT NOT NULL REFERENCES policy_revisions(policy_revision_id),
      subject_kind TEXT NOT NULL CHECK (subject_kind IN ('workspace', 'scope', 'actor', 'node_placement', 'connector_binding', 'extension_installation')),
      subject_id TEXT NOT NULL,
      subject_revision_id TEXT,
      status TEXT NOT NULL CHECK (status IN ('active', 'revoked')),
      bound_by_principal_id TEXT NOT NULL,
      bound_at TEXT NOT NULL,
      revoked_by_principal_id TEXT,
      revoked_at TEXT,
      revocation_reason TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_policy_bindings_subject
      ON policy_bindings(workspace_id, status, subject_kind, subject_id, bound_at);

    CREATE INDEX IF NOT EXISTS idx_policy_bindings_revision
      ON policy_bindings(policy_revision_id, status);

    CREATE TABLE IF NOT EXISTS policy_evaluations (
      evaluation_id TEXT PRIMARY KEY,
      workspace_id TEXT,
      boundary_kind TEXT NOT NULL CHECK (boundary_kind IN ('workspace', 'host')),
      boundary_id TEXT NOT NULL,
      facts_json TEXT,
      facts_digest TEXT NOT NULL,
      evaluated_policy_revision_ids_json TEXT NOT NULL,
      matched_rules_json TEXT NOT NULL,
      decision TEXT NOT NULL CHECK (decision IN ('allow', 'deny', 'require_approval')),
      denial_reasons_json TEXT NOT NULL,
      approval_requirements_json TEXT NOT NULL,
      budget_limits_json TEXT NOT NULL,
      evaluated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_policy_evaluations_workspace_time
      ON policy_evaluations(workspace_id, evaluated_at DESC, evaluation_id DESC);
  `);
    let evaluationInfo = db.prepare("PRAGMA table_info(policy_evaluations)").all();
    let evaluationColumns = new Set(evaluationInfo.map((column) => column.name));
    if (!evaluationColumns.has("facts_json")) {
        db.exec("ALTER TABLE policy_evaluations ADD COLUMN facts_json TEXT");
    }
    if (!evaluationColumns.has("boundary_kind")) {
        db.exec(`
      ALTER TABLE policy_evaluations ADD COLUMN boundary_kind TEXT NOT NULL DEFAULT 'workspace';
      ALTER TABLE policy_evaluations ADD COLUMN boundary_id TEXT NOT NULL DEFAULT '';
      UPDATE policy_evaluations SET boundary_id = workspace_id WHERE boundary_id = '';
    `);
        evaluationInfo = db.prepare("PRAGMA table_info(policy_evaluations)").all();
        evaluationColumns = new Set(evaluationInfo.map((column) => column.name));
    }
    if (evaluationInfo.find((column) => column.name === "workspace_id")?.notnull === 1) {
        // Host governance was added before Policy bindings were extended beyond a
        // Workspace. Rebuild only the evaluation ledger so a host evaluation can
        // retain a null Workspace and its exact authenticated host boundary.
        db.exec(`
      PRAGMA defer_foreign_keys = ON;
      CREATE TABLE policy_evaluations_canonical (
        evaluation_id TEXT PRIMARY KEY,
        workspace_id TEXT,
        boundary_kind TEXT NOT NULL CHECK (boundary_kind IN ('workspace', 'host')),
        boundary_id TEXT NOT NULL,
        facts_json TEXT,
        facts_digest TEXT NOT NULL,
        evaluated_policy_revision_ids_json TEXT NOT NULL,
        matched_rules_json TEXT NOT NULL,
        decision TEXT NOT NULL CHECK (decision IN ('allow', 'deny', 'require_approval')),
        denial_reasons_json TEXT NOT NULL,
        approval_requirements_json TEXT NOT NULL,
        budget_limits_json TEXT NOT NULL,
        evaluated_at TEXT NOT NULL
      );
      INSERT INTO policy_evaluations_canonical (
        evaluation_id, workspace_id, boundary_kind, boundary_id, facts_json,
        facts_digest, evaluated_policy_revision_ids_json, matched_rules_json,
        decision, denial_reasons_json, approval_requirements_json,
        budget_limits_json, evaluated_at
      ) SELECT
        evaluation_id, workspace_id, boundary_kind,
        CASE WHEN boundary_id = '' THEN workspace_id ELSE boundary_id END,
        facts_json, facts_digest, evaluated_policy_revision_ids_json,
        matched_rules_json, decision, denial_reasons_json,
        approval_requirements_json, budget_limits_json, evaluated_at
      FROM policy_evaluations;
      DROP TABLE policy_evaluations;
      ALTER TABLE policy_evaluations_canonical RENAME TO policy_evaluations;
      CREATE INDEX idx_policy_evaluations_workspace_time
        ON policy_evaluations(workspace_id, evaluated_at DESC, evaluation_id DESC);
      CREATE INDEX idx_policy_evaluations_boundary_time
        ON policy_evaluations(boundary_kind, boundary_id, evaluated_at DESC, evaluation_id DESC);
    `);
    }
    else {
        db.exec(`
      CREATE INDEX IF NOT EXISTS idx_policy_evaluations_boundary_time
        ON policy_evaluations(boundary_kind, boundary_id, evaluated_at DESC, evaluation_id DESC);
    `);
    }
    const bindingColumns = new Set(db.prepare("PRAGMA table_info(policy_bindings)").all().map((column) => column.name));
    if (!bindingColumns.has("subject_revision_id")) {
        db.exec("ALTER TABLE policy_bindings ADD COLUMN subject_revision_id TEXT");
    }
}
export class PolicyStore {
    db;
    now;
    constructor(db, dependencies = {}) {
        this.db = db;
        this.now = dependencies.now ?? (() => new Date().toISOString());
    }
    createPolicy(input) {
        const workspaceId = requiredText(input.workspace_id, "workspace_id");
        const policyId = requiredText(input.policy_id ?? `policy_${randomUUID()}`, "policy_id");
        const principalId = requiredText(input.created_by_principal_id, "created_by_principal_id");
        validateCategory(input.category);
        const content = normalizePolicyContent(input.content);
        const createdAt = this.now();
        return inSavepoint(this.db, "create_policy", () => {
            try {
                this.db.prepare(`
          INSERT INTO policies (
            policy_id, workspace_id, category, status, current_revision_id,
            created_at, updated_at, retired_at
          ) VALUES (?, ?, ?, 'active', NULL, ?, ?, NULL)
        `).run(policyId, workspaceId, input.category, createdAt, createdAt);
            }
            catch (error) {
                if (String(error).includes("UNIQUE constraint failed")) {
                    throw new PolicyConflictError(policyId, "the stable identity already exists");
                }
                throw error;
            }
            const draft = this.insertRevision({
                policy_id: policyId,
                workspace_id: workspaceId,
                category: input.category,
                revision_number: 1,
                based_on_revision_id: null,
                content,
                created_by_principal_id: principalId,
                created_at: createdAt,
            });
            return { policy: this.requirePolicy(policyId), draft };
        });
    }
    createDraft(input) {
        const policy = this.requirePolicyForWorkspace(input.policy_id, input.workspace_id);
        if (policy.status !== "active")
            throw new PolicyConflictError(policy.policy_id, "it is retired");
        if (policy.current_revision_id !== input.based_on_revision_id) {
            throw new PolicyConflictError(policy.policy_id, "the published revision changed before the draft was created");
        }
        const existingDraft = this.listRevisions(policy.policy_id).find((revision) => revision.published_at === null && revision.withdrawn_at === null);
        if (existingDraft)
            throw new PolicyConflictError(policy.policy_id, `draft '${existingDraft.policy_revision_id}' is already open`);
        const nextRevision = this.db.prepare(`
      SELECT COALESCE(MAX(revision_number), 0) + 1 AS next_revision
      FROM policy_revisions WHERE policy_id = ?
    `).get(policy.policy_id);
        return this.insertRevision({
            policy_id: policy.policy_id,
            workspace_id: policy.workspace_id,
            category: policy.category,
            revision_number: Number(nextRevision.next_revision),
            based_on_revision_id: input.based_on_revision_id,
            content: normalizePolicyContent(input.content),
            created_by_principal_id: requiredText(input.created_by_principal_id, "created_by_principal_id"),
            created_at: this.now(),
        });
    }
    replaceDraft(input) {
        const revision = this.requireRevisionForWorkspace(input.policy_revision_id, input.workspace_id);
        if (revision.published_at || revision.withdrawn_at) {
            throw new PolicyConflictError(revision.policy_id, "published or withdrawn revisions are immutable");
        }
        if (revision.semantic_digest !== input.expected_semantic_digest) {
            throw new PolicyConflictError(revision.policy_id, "the draft changed before this edit was applied");
        }
        const content = normalizePolicyContent(input.content);
        const digest = policyContentDigest(content);
        const result = this.db.prepare(`
      UPDATE policy_revisions
      SET content_json = ?, semantic_digest = ?
      WHERE policy_revision_id = ? AND published_at IS NULL AND withdrawn_at IS NULL
        AND semantic_digest = ?
    `).run(JSON.stringify(content), digest, revision.policy_revision_id, input.expected_semantic_digest);
        if (Number(result.changes) !== 1) {
            throw new PolicyConflictError(revision.policy_id, "the draft changed while it was being replaced");
        }
        return this.requireRevision(revision.policy_revision_id);
    }
    publishRevision(input) {
        const revision = this.requireRevisionForWorkspace(input.policy_revision_id, input.workspace_id);
        const policy = this.requirePolicyForWorkspace(revision.policy_id, input.workspace_id);
        if (policy.status !== "active")
            throw new PolicyConflictError(policy.policy_id, "it is retired");
        if (revision.published_at || revision.withdrawn_at) {
            throw new PolicyConflictError(policy.policy_id, "the selected revision is not an open draft");
        }
        if (policy.current_revision_id !== input.expected_current_revision_id) {
            throw new PolicyConflictError(policy.policy_id, "the published revision changed before publication");
        }
        if (revision.based_on_revision_id !== input.expected_current_revision_id) {
            throw new PolicyConflictError(policy.policy_id, "the draft is not based on the expected published revision");
        }
        const publishedAt = this.now();
        return inSavepoint(this.db, "publish_policy", () => {
            const revisionChange = this.db.prepare(`
        UPDATE policy_revisions SET published_at = ?
        WHERE policy_revision_id = ? AND published_at IS NULL AND withdrawn_at IS NULL
      `).run(publishedAt, revision.policy_revision_id);
            const headChange = this.db.prepare(`
        UPDATE policies SET current_revision_id = ?, updated_at = ?
        WHERE policy_id = ? AND workspace_id = ?
          AND ${input.expected_current_revision_id === null ? "current_revision_id IS NULL" : "current_revision_id = ?"}
      `).run(revision.policy_revision_id, publishedAt, policy.policy_id, policy.workspace_id, ...(input.expected_current_revision_id === null ? [] : [input.expected_current_revision_id]));
            if (Number(revisionChange.changes) !== 1 || Number(headChange.changes) !== 1) {
                throw new PolicyConflictError(policy.policy_id, "publication lost a concurrent update");
            }
            return {
                policy: this.requirePolicy(policy.policy_id),
                revision: this.requireRevision(revision.policy_revision_id),
            };
        });
    }
    rollback(input) {
        const policy = this.requirePolicyForWorkspace(input.policy_id, input.workspace_id);
        const target = this.requireRevisionForWorkspace(input.target_revision_id, input.workspace_id);
        if (target.policy_id !== policy.policy_id || !target.published_at || target.withdrawn_at) {
            throw new PolicyConflictError(policy.policy_id, "the rollback target is not a retained published revision");
        }
        if (policy.current_revision_id !== input.expected_current_revision_id) {
            throw new PolicyConflictError(policy.policy_id, "the published revision changed before rollback");
        }
        const changed = this.db.prepare(`
      UPDATE policies SET current_revision_id = ?, updated_at = ?
      WHERE policy_id = ? AND workspace_id = ? AND current_revision_id = ?
    `).run(target.policy_revision_id, this.now(), policy.policy_id, policy.workspace_id, input.expected_current_revision_id);
        if (Number(changed.changes) !== 1)
            throw new PolicyConflictError(policy.policy_id, "rollback lost a concurrent update");
        return this.requirePolicy(policy.policy_id);
    }
    bindRevision(input) {
        const revision = this.requireRevisionForWorkspace(input.policy_revision_id, input.workspace_id);
        if (!revision.published_at || revision.withdrawn_at) {
            throw new PolicyConflictError(revision.policy_id, "only a retained published revision can be bound");
        }
        const policy = this.requirePolicyForWorkspace(revision.policy_id, input.workspace_id);
        if (policy.status !== "active")
            throw new PolicyConflictError(policy.policy_id, "it is retired");
        const subject = normalizeSubject(input.subject);
        if (subject.kind === "workspace" && subject.id !== input.workspace_id) {
            throw new PolicyValidationError("a Workspace binding must name its own Workspace");
        }
        const bindingId = requiredText(input.policy_binding_id ?? `policy_binding_${randomUUID()}`, "policy_binding_id");
        const boundAt = this.now();
        try {
            this.db.prepare(`
        INSERT INTO policy_bindings (
          policy_binding_id, workspace_id, policy_revision_id,
          subject_kind, subject_id, subject_revision_id, status,
          bound_by_principal_id, bound_at,
          revoked_by_principal_id, revoked_at, revocation_reason
        ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, NULL, NULL, NULL)
      `).run(bindingId, input.workspace_id, revision.policy_revision_id, subject.kind, subject.id, subject.composition_revision_id ?? null, requiredText(input.bound_by_principal_id, "bound_by_principal_id"), boundAt);
        }
        catch (error) {
            if (String(error).includes("UNIQUE constraint failed")) {
                throw new PolicyConflictError(policy.policy_id, `binding '${bindingId}' already exists`);
            }
            throw error;
        }
        return this.requireBinding(bindingId);
    }
    revokeBinding(input) {
        const binding = this.requireBindingForWorkspace(input.policy_binding_id, input.workspace_id);
        if (binding.status === "revoked")
            return binding;
        const revokedAt = this.now();
        const changed = this.db.prepare(`
      UPDATE policy_bindings
      SET status = 'revoked', revoked_by_principal_id = ?, revoked_at = ?, revocation_reason = ?
      WHERE policy_binding_id = ? AND workspace_id = ? AND status = 'active'
    `).run(requiredText(input.revoked_by_principal_id, "revoked_by_principal_id"), revokedAt, requiredText(input.reason, "reason"), binding.policy_binding_id, binding.workspace_id);
        if (Number(changed.changes) !== 1) {
            throw new PolicyConflictError(this.requireRevision(binding.policy_revision_id).policy_id, "the binding changed concurrently");
        }
        return this.requireBinding(binding.policy_binding_id);
    }
    retirePolicy(input) {
        const policy = this.requirePolicyForWorkspace(input.policy_id, input.workspace_id);
        if (policy.status === "retired")
            return policy;
        const active = this.db.prepare(`
      SELECT COUNT(*) AS count FROM policy_bindings b
      JOIN policy_revisions r ON r.policy_revision_id = b.policy_revision_id
      WHERE r.policy_id = ? AND b.status = 'active'
    `).get(policy.policy_id);
        if (Number(active.count) > 0) {
            throw new PolicyConflictError(policy.policy_id, "active bindings must be revoked before retirement");
        }
        const retiredAt = this.now();
        this.db.prepare(`
      UPDATE policies SET status = 'retired', retired_at = ?, updated_at = ?
      WHERE policy_id = ? AND workspace_id = ? AND status = 'active'
    `).run(retiredAt, retiredAt, policy.policy_id, policy.workspace_id);
        return this.requirePolicy(policy.policy_id);
    }
    reactivatePolicy(input) {
        const policy = this.requirePolicyForWorkspace(input.policy_id, input.workspace_id);
        if (policy.status === "active")
            return policy;
        this.db.prepare(`
      UPDATE policies SET status = 'active', retired_at = NULL, updated_at = ?
      WHERE policy_id = ? AND workspace_id = ? AND status = 'retired'
    `).run(this.now(), policy.policy_id, policy.workspace_id);
        return this.requirePolicy(policy.policy_id);
    }
    evaluate(factsInput) {
        const facts = normalizeFacts(factsInput);
        const bindings = this.listApplicableBindings(facts);
        const evaluatedRevisionIds = [...new Set(bindings.map((binding) => binding.policy_revision_id))].sort();
        const matched = [];
        for (const binding of bindings) {
            const revision = this.requireRevision(binding.policy_revision_id);
            for (const rule of [...revision.content.rules].sort(compareRules)) {
                if (!matchesRule(rule.match, facts))
                    continue;
                matched.push({
                    policy_revision_id: revision.policy_revision_id,
                    policy_binding_id: binding.policy_binding_id,
                    rule_id: rule.rule_id,
                    effect: rule.effect,
                });
            }
        }
        const denials = matched
            .filter((item) => item.effect.kind === "deny")
            .map((item) => item.effect.reason);
        const approvals = matched
            .filter((item) => item.effect.kind === "require_approval")
            .map((item) => {
            const effect = item.effect;
            return {
                policy_revision_id: item.policy_revision_id,
                rule_id: item.rule_id,
                reason: effect.reason,
                approvers: effect.approvers,
            };
        });
        const limits = strictestLimits(matched.flatMap((item) => {
            if (item.effect.kind !== "limit")
                return [];
            const binding = bindings.find((candidate) => candidate.policy_binding_id === item.policy_binding_id);
            if (!binding)
                throw new PolicyValidationError(`binding '${item.policy_binding_id}' disappeared during evaluation`);
            return item.effect.limits.map((limit) => ({
                policy_revision_id: item.policy_revision_id,
                policy_binding_id: item.policy_binding_id,
                rule_id: item.rule_id,
                subject: binding.subject,
                ...limit,
            }));
        }));
        const decision = denials.length > 0
            ? "deny"
            : approvals.length > 0
                ? "require_approval"
                : "allow";
        const evaluatedAt = this.now();
        const factsDigest = createHash("sha256").update(canonicalJson(facts)).digest("hex");
        const evaluation = {
            evaluation_id: `policy_evaluation_${randomUUID()}`,
            workspace_id: facts.workspace_id,
            authority_boundary: facts.authority_boundary,
            facts,
            facts_digest: factsDigest,
            evaluated_policy_revision_ids: evaluatedRevisionIds,
            matched_rules: matched,
            decision,
            denial_reasons: denials,
            approval_requirements: approvals,
            budget_limits: limits,
            evaluated_at: evaluatedAt,
        };
        this.db.prepare(`
      INSERT INTO policy_evaluations (
        evaluation_id, workspace_id, boundary_kind, boundary_id, facts_json, facts_digest,
        evaluated_policy_revision_ids_json, matched_rules_json,
        decision, denial_reasons_json, approval_requirements_json,
        budget_limits_json, evaluated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(evaluation.evaluation_id, evaluation.workspace_id, evaluation.authority_boundary.kind, evaluation.authority_boundary.kind === "workspace"
            ? evaluation.authority_boundary.workspace_id
            : evaluation.authority_boundary.host_id, JSON.stringify(evaluation.facts), evaluation.facts_digest, JSON.stringify(evaluation.evaluated_policy_revision_ids), JSON.stringify(evaluation.matched_rules), evaluation.decision, JSON.stringify(evaluation.denial_reasons), JSON.stringify(evaluation.approval_requirements), JSON.stringify(evaluation.budget_limits), evaluation.evaluated_at);
        return evaluation;
    }
    getPolicy(policyId) {
        const row = this.db.prepare("SELECT * FROM policies WHERE policy_id = ?").get(policyId);
        return row ? mapPolicy(row) : null;
    }
    requirePolicy(policyId) {
        const record = this.getPolicy(policyId);
        if (!record)
            throw new PolicyNotFoundError("policy", policyId);
        return record;
    }
    requirePolicyForWorkspace(policyId, workspaceId) {
        const record = this.requirePolicy(policyId);
        if (record.workspace_id !== workspaceId)
            throw new PolicyNotFoundError("policy", policyId);
        return record;
    }
    listPolicies(workspaceId, options = {}) {
        const rows = this.db.prepare(`
      SELECT * FROM policies
      WHERE workspace_id = ? ${options.include_retired ? "" : "AND status = 'active'"}
      ORDER BY created_at ASC, policy_id ASC
    `).all(workspaceId);
        return rows.map(mapPolicy);
    }
    getRevision(revisionId) {
        const row = this.db.prepare("SELECT * FROM policy_revisions WHERE policy_revision_id = ?")
            .get(revisionId);
        return row ? mapRevision(row) : null;
    }
    requireRevision(revisionId) {
        const record = this.getRevision(revisionId);
        if (!record)
            throw new PolicyNotFoundError("revision", revisionId);
        return record;
    }
    requireRevisionForWorkspace(revisionId, workspaceId) {
        const record = this.requireRevision(revisionId);
        if (record.workspace_id !== workspaceId)
            throw new PolicyNotFoundError("revision", revisionId);
        return record;
    }
    listRevisions(policyId) {
        return this.db.prepare(`
      SELECT * FROM policy_revisions WHERE policy_id = ?
      ORDER BY revision_number DESC
    `).all(policyId).map(mapRevision);
    }
    getBinding(bindingId) {
        const row = this.db.prepare("SELECT * FROM policy_bindings WHERE policy_binding_id = ?")
            .get(bindingId);
        return row ? mapBinding(row) : null;
    }
    requireBinding(bindingId) {
        const record = this.getBinding(bindingId);
        if (!record)
            throw new PolicyNotFoundError("binding", bindingId);
        return record;
    }
    requireBindingForWorkspace(bindingId, workspaceId) {
        const record = this.requireBinding(bindingId);
        if (record.workspace_id !== workspaceId)
            throw new PolicyNotFoundError("binding", bindingId);
        return record;
    }
    listBindings(workspaceId, options = {}) {
        return this.db.prepare(`
      SELECT * FROM policy_bindings
      WHERE workspace_id = ? ${options.include_revoked ? "" : "AND status = 'active'"}
      ORDER BY bound_at ASC, policy_binding_id ASC
    `).all(workspaceId).map(mapBinding);
    }
    getEvaluation(evaluationId) {
        const row = this.db.prepare("SELECT * FROM policy_evaluations WHERE evaluation_id = ?")
            .get(evaluationId);
        return row ? mapEvaluation(row) : null;
    }
    listEvaluations(workspaceId, limit = 100) {
        const bounded = Math.min(Math.max(Math.floor(limit), 1), 500);
        return this.db.prepare(`
      SELECT * FROM policy_evaluations WHERE workspace_id = ?
      ORDER BY evaluated_at DESC, evaluation_id DESC LIMIT ?
    `).all(workspaceId, bounded).map(mapEvaluation);
    }
    listApplicableBindings(facts) {
        if (facts.authority_boundary.kind !== "workspace" || facts.workspace_id === null)
            return [];
        const subjects = policySubjectsForFacts(facts);
        if (subjects.length === 0)
            return [];
        const clauses = subjects.map(() => "(subject_kind = ? AND subject_id = ? AND COALESCE(subject_revision_id, '') = ?)").join(" OR ");
        const values = subjects.flatMap((subject) => [subject.kind, subject.id, subject.composition_revision_id ?? ""]);
        const rows = this.db.prepare(`
      SELECT b.* FROM policy_bindings b
      JOIN policy_revisions r ON r.policy_revision_id = b.policy_revision_id
      JOIN policies p ON p.policy_id = r.policy_id
      WHERE b.workspace_id = ? AND b.status = 'active'
        AND p.status = 'active' AND r.published_at IS NOT NULL AND r.withdrawn_at IS NULL
        AND (${clauses})
      ORDER BY b.bound_at ASC, b.policy_binding_id ASC
    `).all(facts.workspace_id, ...values);
        return rows.map(mapBinding);
    }
    insertRevision(input) {
        const revisionId = `policy_revision_${randomUUID()}`;
        this.db.prepare(`
      INSERT INTO policy_revisions (
        policy_revision_id, policy_id, workspace_id, category,
        revision_number, based_on_revision_id, semantic_digest,
        content_json, created_by_principal_id, created_at,
        published_at, withdrawn_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)
    `).run(revisionId, input.policy_id, input.workspace_id, input.category, input.revision_number, input.based_on_revision_id, policyContentDigest(input.content), JSON.stringify(input.content), input.created_by_principal_id, input.created_at);
        return this.requireRevision(revisionId);
    }
}
export function policyContentDigest(content) {
    return createHash("sha256").update(canonicalJson(normalizePolicyContent(content))).digest("hex");
}
function normalizePolicyContent(content) {
    const label = requiredText(content.label, "label");
    const description = requiredText(content.description, "description");
    if (!Array.isArray(content.rules))
        throw new PolicyValidationError("rules must be an array");
    const seen = new Set();
    const rules = content.rules.map((rule) => {
        const ruleId = requiredText(rule.rule_id, "rule_id");
        if (seen.has(ruleId))
            throw new PolicyValidationError(`rule_id '${ruleId}' is duplicated`);
        seen.add(ruleId);
        if (!Number.isInteger(rule.priority))
            throw new PolicyValidationError(`rule '${ruleId}' priority must be an integer`);
        const match = normalizeMatch(rule.match, ruleId);
        const effect = normalizeEffect(rule.effect, ruleId);
        return { rule_id: ruleId, priority: rule.priority, match, effect };
    });
    return { label, description, rules };
}
function normalizeMatch(match, ruleId) {
    if (!match || typeof match !== "object" || Array.isArray(match)) {
        throw new PolicyValidationError(`rule '${ruleId}' match must be an object`);
    }
    const allowed = new Set([
        "operation_ids", "principal_ids", "principal_roles", "interaction_modes",
        "target_kinds", "target_ids", "scope_ids", "actor_ids", "scope_composition_revision_ids", "node_placement_ids",
        "connector_binding_ids", "extension_installation_ids", "extension_package_version_ids",
        "data_classes", "worker_trust_levels", "external_effect", "reversibility",
    ]);
    for (const key of Object.keys(match)) {
        if (!allowed.has(key))
            throw new PolicyValidationError(`rule '${ruleId}' has unknown match field '${key}'`);
    }
    const result = {};
    for (const [key, value] of Object.entries(match)) {
        if (value === undefined)
            continue;
        if (key === "external_effect") {
            if (typeof value !== "boolean")
                throw new PolicyValidationError(`rule '${ruleId}' external_effect must be boolean`);
            result[key] = value;
            continue;
        }
        if (key === "reversibility") {
            if (!['none', 'reversible', 'irreversible'].includes(String(value))) {
                throw new PolicyValidationError(`rule '${ruleId}' reversibility is invalid`);
            }
            result[key] = value;
            continue;
        }
        if (!Array.isArray(value) || value.length === 0) {
            throw new PolicyValidationError(`rule '${ruleId}' ${key} must be a non-empty array`);
        }
        const entries = [...new Set(value.map((entry) => requiredText(String(entry), `${key} entry`)))].sort();
        result[key] = entries;
    }
    if (Boolean(result.node_placement_ids) !== Boolean(result.scope_composition_revision_ids)) {
        throw new PolicyValidationError(`rule '${ruleId}' must match NodePlacements with both node_placement_ids and scope_composition_revision_ids`);
    }
    return result;
}
function normalizeEffect(effect, ruleId) {
    if (effect.kind === "deny") {
        return { kind: "deny", reason: requiredText(effect.reason, `rule '${ruleId}' reason`) };
    }
    if (effect.kind === "require_approval") {
        const approvers = normalizeApprovers(effect.approvers, ruleId);
        return {
            kind: "require_approval",
            reason: requiredText(effect.reason, `rule '${ruleId}' reason`),
            approvers,
        };
    }
    if (effect.kind === "limit") {
        if (!Array.isArray(effect.limits) || effect.limits.length === 0) {
            throw new PolicyValidationError(`rule '${ruleId}' must contain at least one budget limit`);
        }
        const keys = new Set();
        const limits = effect.limits.map((limit) => {
            const metric = requiredText(limit.metric, "budget metric");
            if (!Number.isFinite(limit.maximum) || limit.maximum < 0) {
                throw new PolicyValidationError(`rule '${ruleId}' budget maximum must be a non-negative finite number`);
            }
            if (!["operation", "scope_execution", "day", "month", "all_time"].includes(limit.window)) {
                throw new PolicyValidationError(`rule '${ruleId}' budget window is invalid`);
            }
            const timezone = limit.timezone == null ? undefined : requiredText(limit.timezone, "budget timezone");
            if ((limit.window === "day" || limit.window === "month") && !timezone) {
                throw new PolicyValidationError(`rule '${ruleId}' calendar budget '${metric}' requires a timezone`);
            }
            if (!(limit.window === "day" || limit.window === "month") && timezone) {
                throw new PolicyValidationError(`rule '${ruleId}' non-calendar budget '${metric}' cannot set a timezone`);
            }
            if (timezone) {
                try {
                    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date(0));
                }
                catch {
                    throw new PolicyValidationError(`rule '${ruleId}' budget timezone '${timezone}' is invalid`);
                }
            }
            const key = `${metric}\0${limit.window}\0${timezone ?? ""}`;
            if (keys.has(key))
                throw new PolicyValidationError(`rule '${ruleId}' repeats budget '${metric}' for '${limit.window}'`);
            keys.add(key);
            return { metric, maximum: limit.maximum, window: limit.window, ...(timezone ? { timezone } : {}) };
        });
        return { kind: "limit", limits };
    }
    throw new PolicyValidationError(`rule '${ruleId}' effect kind is invalid`);
}
function normalizeApprovers(value, ruleId) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new PolicyValidationError(`rule '${ruleId}' approval selector must be an object`);
    }
    const principalIds = uniqueText(value.principal_ids);
    if (value.mode === "all_named") {
        if (principalIds.length === 0) {
            throw new PolicyValidationError(`rule '${ruleId}' all_named approval requires at least one principal`);
        }
        return { mode: "all_named", principal_ids: principalIds };
    }
    const roles = uniqueText(value.roles);
    if (principalIds.length === 0 && roles.length === 0) {
        throw new PolicyValidationError(`rule '${ruleId}' approval must name a principal or role`);
    }
    if (value.mode === "any")
        return { mode: "any", principal_ids: principalIds, roles };
    if (value.mode === "quorum") {
        if (!Number.isInteger(value.quorum) || value.quorum < 1) {
            throw new PolicyValidationError(`rule '${ruleId}' approval quorum must be a positive integer`);
        }
        if (principalIds.length > 0 && value.quorum > principalIds.length && roles.length === 0) {
            throw new PolicyValidationError(`rule '${ruleId}' quorum exceeds its named approvers`);
        }
        return { mode: "quorum", principal_ids: principalIds, roles, quorum: value.quorum };
    }
    throw new PolicyValidationError(`rule '${ruleId}' approval selector mode is invalid`);
}
function normalizeFacts(facts) {
    const boundary = normalizeAuthorityBoundary(facts.authority_boundary);
    const workspaceId = facts.workspace_id == null ? null : requiredText(facts.workspace_id, "workspace_id");
    if ((boundary.kind === "workspace" && workspaceId !== boundary.workspace_id)
        || (boundary.kind === "host" && workspaceId !== null)) {
        throw new PolicyValidationError("workspace_id must exactly match Workspace authority and be null for host authority");
    }
    const normalized = {
        authority_boundary: boundary,
        workspace_id: workspaceId,
        principal_id: requiredText(facts.principal_id, "principal_id"),
        principal_roles: uniqueText(facts.principal_roles),
        actor_role_evidence: normalizeActorRoleEvidence(facts.actor_role_evidence),
        interaction_mode: facts.interaction_mode,
        provenance: normalizeProvenance(facts.provenance),
        operation_id: requiredText(facts.operation_id, "operation_id"),
        target: facts.target,
        effects: facts.effects,
        scope_id: nullableText(facts.scope_id),
        actor_id: nullableText(facts.actor_id),
        scope_composition_revision_id: nullableText(facts.scope_composition_revision_id),
        node_placement_id: nullableText(facts.node_placement_id),
        connector_binding_id: nullableText(facts.connector_binding_id),
        extension_installation_id: nullableText(facts.extension_installation_id),
        extension_package_version_id: nullableText(facts.extension_package_version_id),
        data_classes: uniqueText(facts.data_classes),
        worker_trust_level: nullableText(facts.worker_trust_level),
    };
    if (Boolean(normalized.node_placement_id) && !normalized.scope_composition_revision_id) {
        throw new PolicyValidationError("NodePlacement facts require both node_placement_id and scope_composition_revision_id");
    }
    return normalized;
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
function normalizeActorRoleEvidence(values) {
    return [...values].map((evidence) => ({
        actor_id: requiredText(evidence.actor_id, "actor role actor_id"),
        role: requiredText(evidence.role, "actor role"),
        principal_binding_ref: {
            kind: "principal_actor_binding",
            id: requiredText(evidence.principal_binding_ref.id, "principal Actor binding id"),
            revision: requiredText(evidence.principal_binding_ref.revision, "principal Actor binding revision"),
        },
        role_source_ref: {
            kind: evidence.role_source_ref.kind,
            id: requiredText(evidence.role_source_ref.id, "Actor role source id"),
            revision: requiredText(evidence.role_source_ref.revision, "Actor role source revision"),
        },
        source_boundary: {
            kind: evidence.source_boundary.kind,
            id: requiredText(evidence.source_boundary.id, "Actor role source boundary id"),
            scope_composition_revision_id: nullableText(evidence.source_boundary.scope_composition_revision_id),
            node_placement_id: nullableText(evidence.source_boundary.node_placement_id),
        },
    })).sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right)));
}
function policySubjectsForFacts(facts) {
    if (facts.workspace_id === null)
        return [];
    const subjects = [{ kind: "workspace", id: facts.workspace_id }];
    if (facts.scope_id)
        subjects.push({ kind: "scope", id: facts.scope_id });
    if (facts.actor_id)
        subjects.push({ kind: "actor", id: facts.actor_id });
    if (facts.node_placement_id && facts.scope_composition_revision_id) {
        subjects.push({
            kind: "node_placement",
            id: facts.node_placement_id,
            composition_revision_id: facts.scope_composition_revision_id,
        });
    }
    if (facts.connector_binding_id)
        subjects.push({ kind: "connector_binding", id: facts.connector_binding_id });
    if (facts.extension_installation_id)
        subjects.push({ kind: "extension_installation", id: facts.extension_installation_id });
    return subjects;
}
function matchesRule(match, facts) {
    return matches(match.operation_ids, facts.operation_id)
        && matches(match.principal_ids, facts.principal_id)
        && intersects(match.principal_roles, facts.principal_roles)
        && matches(match.interaction_modes, facts.interaction_mode)
        && matches(match.target_kinds, facts.target?.kind ?? null)
        && matches(match.target_ids, facts.target?.id ?? null)
        && matches(match.scope_ids, facts.scope_id)
        && matches(match.actor_ids, facts.actor_id)
        && matches(match.scope_composition_revision_ids, facts.scope_composition_revision_id)
        && matches(match.node_placement_ids, facts.node_placement_id)
        && matches(match.connector_binding_ids, facts.connector_binding_id)
        && matches(match.extension_installation_ids, facts.extension_installation_id)
        && matches(match.extension_package_version_ids, facts.extension_package_version_id)
        && intersects(match.data_classes, facts.data_classes)
        && matches(match.worker_trust_levels, facts.worker_trust_level)
        && (match.external_effect === undefined || match.external_effect === facts.effects.external)
        && (match.reversibility === undefined || match.reversibility === facts.effects.reversibility);
}
function matches(expected, actual) {
    if (expected === undefined)
        return true;
    return actual !== null && expected.includes(actual);
}
function intersects(expected, actual) {
    if (expected === undefined)
        return true;
    return expected.some((item) => actual.includes(item));
}
function strictestLimits(limits) {
    const strictest = new Map();
    for (const limit of limits) {
        const key = `${limit.subject.kind}\0${limit.subject.id}\0${limit.subject.composition_revision_id ?? ""}\0${limit.metric}\0${limit.window}\0${limit.timezone ?? ""}`;
        const existing = strictest.get(key);
        if (!existing || limit.maximum < existing.maximum)
            strictest.set(key, limit);
    }
    return [...strictest.values()].sort((left, right) => left.subject.kind.localeCompare(right.subject.kind)
        || left.subject.id.localeCompare(right.subject.id)
        || (left.subject.composition_revision_id ?? "").localeCompare(right.subject.composition_revision_id ?? "")
        || left.metric.localeCompare(right.metric)
        || left.window.localeCompare(right.window));
}
function compareRules(left, right) {
    return right.priority - left.priority || left.rule_id.localeCompare(right.rule_id);
}
function normalizeSubject(subject) {
    if (!["workspace", "scope", "actor", "node_placement", "connector_binding", "extension_installation"].includes(subject.kind)) {
        throw new PolicyValidationError("binding subject kind is invalid");
    }
    const id = requiredText(subject.id, "binding subject id");
    if (subject.kind === "node_placement") {
        return {
            kind: subject.kind,
            id,
            composition_revision_id: requiredText(subject.composition_revision_id ?? "", "node placement composition revision id"),
        };
    }
    if (subject.composition_revision_id !== undefined) {
        throw new PolicyValidationError("only a NodePlacement subject can name a composition revision");
    }
    return { kind: subject.kind, id };
}
function validateCategory(category) {
    if (!["operation", "approval", "budget", "trust", "data", "emergency_stop"].includes(category)) {
        throw new PolicyValidationError("category is invalid");
    }
}
function requiredText(value, field) {
    if (typeof value !== "string" || !value.trim())
        throw new PolicyValidationError(`${field} is required`);
    return value.trim();
}
function nullableText(value) {
    return value == null ? null : requiredText(value, "policy fact");
}
function uniqueText(values) {
    return [...new Set(values.map((value) => requiredText(value, "policy fact")))].sort();
}
function mapPolicy(row) {
    return {
        policy_id: String(row.policy_id),
        workspace_id: String(row.workspace_id),
        category: row.category,
        status: row.status,
        current_revision_id: row.current_revision_id == null ? null : String(row.current_revision_id),
        created_at: String(row.created_at),
        updated_at: String(row.updated_at),
        retired_at: row.retired_at == null ? null : String(row.retired_at),
    };
}
function mapRevision(row) {
    return {
        policy_revision_id: String(row.policy_revision_id),
        policy_id: String(row.policy_id),
        workspace_id: String(row.workspace_id),
        category: row.category,
        revision_number: Number(row.revision_number),
        based_on_revision_id: row.based_on_revision_id == null ? null : String(row.based_on_revision_id),
        semantic_digest: String(row.semantic_digest),
        content: normalizePolicyContent(JSON.parse(row.content_json)),
        created_by_principal_id: String(row.created_by_principal_id),
        created_at: String(row.created_at),
        published_at: row.published_at == null ? null : String(row.published_at),
        withdrawn_at: row.withdrawn_at == null ? null : String(row.withdrawn_at),
    };
}
function mapBinding(row) {
    return {
        policy_binding_id: String(row.policy_binding_id),
        workspace_id: String(row.workspace_id),
        policy_revision_id: String(row.policy_revision_id),
        subject: row.subject_kind === "node_placement"
            ? {
                kind: row.subject_kind,
                id: String(row.subject_id),
                ...(row.subject_revision_id ? { composition_revision_id: String(row.subject_revision_id) } : {}),
            }
            : { kind: row.subject_kind, id: String(row.subject_id) },
        status: row.status,
        bound_by_principal_id: String(row.bound_by_principal_id),
        bound_at: String(row.bound_at),
        revoked_by_principal_id: row.revoked_by_principal_id == null ? null : String(row.revoked_by_principal_id),
        revoked_at: row.revoked_at == null ? null : String(row.revoked_at),
        revocation_reason: row.revocation_reason == null ? null : String(row.revocation_reason),
    };
}
function mapEvaluation(row) {
    const authorityBoundary = row.boundary_kind === "workspace"
        ? { kind: "workspace", workspace_id: String(row.boundary_id) }
        : { kind: "host", host_id: String(row.boundary_id) };
    const storedFacts = row.facts_json == null
        ? null
        : JSON.parse(row.facts_json);
    return {
        evaluation_id: String(row.evaluation_id),
        workspace_id: row.workspace_id == null ? null : String(row.workspace_id),
        authority_boundary: authorityBoundary,
        facts: storedFacts === null
            ? null
            : {
                ...storedFacts,
                authority_boundary: storedFacts.authority_boundary ?? authorityBoundary,
                workspace_id: authorityBoundary.kind === "workspace"
                    ? authorityBoundary.workspace_id
                    : null,
            },
        facts_digest: String(row.facts_digest),
        evaluated_policy_revision_ids: JSON.parse(row.evaluated_policy_revision_ids_json),
        matched_rules: JSON.parse(row.matched_rules_json),
        decision: row.decision,
        denial_reasons: JSON.parse(row.denial_reasons_json),
        approval_requirements: JSON.parse(row.approval_requirements_json),
        budget_limits: JSON.parse(row.budget_limits_json),
        evaluated_at: String(row.evaluated_at),
    };
}
function normalizeAuthorityBoundary(boundary) {
    if (boundary.kind === "workspace") {
        return { kind: "workspace", workspace_id: requiredText(boundary.workspace_id, "authority Workspace") };
    }
    return { kind: "host", host_id: requiredText(boundary.host_id, "authority host") };
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
function inSavepoint(db, label, action) {
    const name = `${label}_${randomUUID().replaceAll("-", "")}`;
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
