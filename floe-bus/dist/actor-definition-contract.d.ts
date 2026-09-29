/**
 * @invariant This file is the provider-neutral public Actor definition contract.
 * It must not depend on Bus storage, transport, runtime, or Node-only APIs.
 */
export type VersionedResourceRef = Readonly<{
    kind: string;
    id: string;
    revision: string | null;
}>;
export type ActorResponsibility = Readonly<{
    responsibility_id: string;
    title: string;
    description: string;
}>;
export type ActorEscalationRule = Readonly<{
    rule_id: string;
    when: string;
    action: "decline" | "delegate" | "escalate" | "signal_unowned";
    target_actor_id?: string | null;
}>;
export type ActorScope = Readonly<{
    paths: readonly string[];
}>;
export type ActorDefinitionContent = Readonly<{
    label: string;
    charter: string;
    responsibilities: readonly ActorResponsibility[];
    instructions: string;
    knowledge_refs: readonly VersionedResourceRef[];
    capability_grant_ids: readonly string[];
    policy_refs: Readonly<{
        budget: VersionedResourceRef | null;
        trust: VersionedResourceRef | null;
        approval: VersionedResourceRef | null;
    }>;
    escalation_rules: readonly ActorEscalationRule[];
    /**
     * Workspace-relative folders that bound this Actor's filesystem authority.
     * Absent means no filesystem authority at all; grants never widen it.
     */
    scope?: ActorScope;
}>;
export declare class ActorDefinitionValidationError extends Error {
    readonly reason: string;
    readonly code: "E_ACTOR_DEFINITION_INVALID";
    constructor(reason: string);
}
/**
 * Canonical workspace-relative scope path: forward slashes, no leading "./",
 * no trailing slash, and "." for the Workspace root. Returns null when the
 * path is absolute or climbs out of the Workspace.
 */
export declare function canonicalActorScopePath(value: string): string | null;
export declare function validateActorDefinition(content: ActorDefinitionContent): void;
