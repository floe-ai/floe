/**
 * The agent's calls to the Bus. Unprivileged routes carry a signed NIP-42 proof
 * (ADR-0015); the few host routes (re-admission, revocation) carry host_control
 * obtained from the native broker for that one call.
 */
import type { Event as NostrEvent } from "nostr-tools/pure";
export type Workspace = {
    workspace_id: string;
    name: string;
};
export type AuthenticateReply = {
    kind: "bearer";
    bearer_token: string;
    authority_session_id: string | null;
    identity_id: string;
    workspace: Workspace;
    expires_at: string;
    workspaces: Workspace[];
} | {
    kind: "selection_required";
    workspaces: Workspace[];
} | {
    kind: "not_admitted";
} | {
    kind: "not_admitted_to_workspace";
    workspaces: Workspace[];
};
export type JoinOutcome = {
    kind: "ready" | "pending";
    workspace_id: string;
} | {
    kind: "failed";
    workspace_id: string;
    reason: string;
} | {
    kind: "invalid";
    error: string;
    message: string;
} | {
    kind: "refused";
    message: string;
};
export declare class BusUnreachableError extends Error {
    readonly url: string;
    constructor(url: string, cause: unknown);
}
export declare class BusIdentityClient {
    private readonly base;
    private readonly httpFetch;
    constructor(base: string, httpFetch?: typeof fetch);
    private url;
    private call;
    challenge(): Promise<{
        challenge: string;
        relay: string;
    }>;
    authenticate(event: NostrEvent, workspaceId?: string): Promise<AuthenticateReply>;
    /** Display name the Bus holds for this key, if it is admitted anywhere. */
    displayNameFor(event: NostrEvent): Promise<string | null>;
    registerWorkspace(event: NostrEvent, input: {
        locator: string;
        display_name: string;
        name?: string;
        create_directory?: boolean;
    }): Promise<JoinOutcome>;
    listClients(hostToken: string): Promise<Array<{
        identity_id: string;
        pubkey_hex: string;
        display_name: string;
        revoked_at: string | null;
        workspaces: Workspace[];
    }>>;
    admit(hostToken: string, input: {
        display_name: string;
        pubkey: string;
        workspace_id: string;
    }): Promise<void>;
    revokeIdentity(hostToken: string, identityId: string): Promise<void>;
    revokeSession(hostToken: string, identityId: string, authoritySessionId: string): Promise<boolean>;
}
