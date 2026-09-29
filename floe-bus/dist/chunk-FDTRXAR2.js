import { createRequire as __floeCreateRequire } from 'node:module'; const require = __floeCreateRequire(import.meta.url);

// floe-bus/dist/actor-definition-contract.js
var ActorDefinitionValidationError = class extends Error {
  reason;
  code = "E_ACTOR_DEFINITION_INVALID";
  constructor(reason) {
    super(`Invalid Actor definition: ${reason}`);
    this.reason = reason;
    this.name = "ActorDefinitionValidationError";
  }
};
function canonicalActorScopePath(value) {
  const segments = [];
  const text = value.trim().replace(/\\/g, "/");
  if (!text || text.startsWith("/") || /^[a-z]:/i.test(text))
    return null;
  for (const segment of text.split("/")) {
    if (segment === "" || segment === ".")
      continue;
    if (segment === "..")
      return null;
    segments.push(segment);
  }
  return segments.length ? segments.join("/") : ".";
}
function validateActorDefinition(content) {
  nonEmpty("label", content.label);
  nonEmpty("charter", content.charter);
  nonEmpty("instructions", content.instructions);
  unique(content.responsibilities.map((item) => item.responsibility_id), "responsibility id");
  for (const responsibility of content.responsibilities) {
    nonEmpty("responsibility title", responsibility.title);
    nonEmpty("responsibility description", responsibility.description);
  }
  unique(content.capability_grant_ids, "CapabilityGrant id");
  unique(content.escalation_rules.map((item) => item.rule_id), "escalation rule id");
  for (const ref of content.knowledge_refs)
    validateRef(ref, "knowledge reference");
  for (const [name, ref] of Object.entries(content.policy_refs)) {
    if (ref)
      validateRef(ref, `${name} policy reference`);
  }
  if (content.scope !== void 0) {
    if (!content.scope || !Array.isArray(content.scope.paths) || content.scope.paths.length === 0) {
      throw new ActorDefinitionValidationError("scope.paths must list at least one workspace-relative folder");
    }
    for (const path of content.scope.paths) {
      if (typeof path !== "string" || canonicalActorScopePath(path) !== path) {
        throw new ActorDefinitionValidationError(`scope path '${String(path)}' must be canonical and stay within the Workspace (for example '.' or 'src/app')`);
      }
    }
    unique(content.scope.paths, "scope path");
  }
  for (const rule of content.escalation_rules) {
    nonEmpty("escalation condition", rule.when);
    if (rule.action === "delegate" && !rule.target_actor_id?.trim()) {
      throw new ActorDefinitionValidationError(`delegation rule '${rule.rule_id}' must name a target Actor`);
    }
    if (rule.action !== "delegate" && rule.target_actor_id != null) {
      throw new ActorDefinitionValidationError(`only delegation rule '${rule.rule_id}' may name a target Actor`);
    }
  }
}
function validateRef(ref, label) {
  nonEmpty(`${label} kind`, ref.kind);
  nonEmpty(`${label} id`, ref.id);
  if (ref.revision !== null)
    nonEmpty(`${label} revision`, ref.revision);
}
function unique(values, label) {
  const seen = /* @__PURE__ */ new Set();
  for (const value of values) {
    nonEmpty(label, value);
    if (seen.has(value))
      throw new ActorDefinitionValidationError(`duplicate ${label} '${value}'`);
    seen.add(value);
  }
}
function nonEmpty(label, value) {
  if (typeof value !== "string" || !value.trim()) {
    throw new ActorDefinitionValidationError(`${label} must not be empty`);
  }
}

export {
  ActorDefinitionValidationError,
  canonicalActorScopePath,
  validateActorDefinition
};
