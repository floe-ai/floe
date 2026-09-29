/**
 * `floe/identity` — how a surface acts as the person without holding their key.
 *
 *   import { connectIdentity } from "floe/identity";
 *   const identity = await connectIdentity({ surface: "my-surface" });
 *   identity.onState((state) => render(state));
 *   const session = await identity.session({}, (event) => {
 *     if (event.status === "ready") useBearer(event.bearer_token);
 *   });
 *
 * The agent pushes identity state on every change and each session's bearer
 * when minted and again before it expires. A surface never polls. The wire
 * protocol is documented in docs/reference/identity-agent-protocol.md.
 */
import { ChannelClient } from "../local-channel/client.js";
import { AgentUnavailableError, type AgentChannel } from "./connection.js";
export type Protection = "passphrase" | "device";
export type SecretKind = "phrase" | "nsec";
export type IdentityState = {
    kind: "none";
} | {
    kind: "locked" | "unlocked";
    npub: string;
    pubkey_hex: string;
    display_name: string;
    protection: Protection;
    /** "nsec" when imported from before recovery phrases existed: there are no words to show. */
    secret_kind: SecretKind;
};
export type Workspace = {
    workspace_id: string;
    name: string;
};
/** One identity Floe holds. Unreadable ones have null details but can still be deleted. */
export type HeldIdentity = {
    id: string;
    current: boolean;
    readable: boolean;
    display_name: string | null;
    created_at: string | null;
    set_aside_at: string | null;
    protection: Protection | null;
    has_recovery_phrase: boolean | null;
    npub?: string | null;
};
export type SessionEvent = {
    status: "ready";
    bearer_token: string;
    workspace: Workspace;
    workspaces: Workspace[];
    expires_at: string;
} | {
    status: "selection_required";
    workspaces: Workspace[];
    message?: string;
} | {
    status: "needs_workspace";
    message: string;
} | {
    status: "error";
    code: string;
    message: string;
} | {
    status: "ended";
    reason: "locked" | "revoked" | "ended_by_surface" | string;
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
export type IdentitySession = {
    readonly id: string;
    /** Answer a selection_required event. */
    select(workspaceId: string): Promise<void>;
    end(): Promise<void>;
};
/** A refusal from the agent, with a stable `code` (see the protocol reference). */
export declare class IdentityError extends Error {
    readonly code: string;
    readonly details: Record<string, unknown>;
    constructor(code: string, message: string, details?: Record<string, unknown>);
}
export { AgentUnavailableError };
export type ConnectOptions = {
    /** Shown in `floe identity sessions`, so the person can tell surfaces apart. */
    surface: string;
    /** Defaults to ~/.floe/config.yaml. */
    configPath?: string;
    /**
     * Start Floe (bus, bridge and agent) when the agent is not answering, if the
     * machine's services.start_on_demand allows it. Default true.
     */
    start?: boolean;
};
export declare function connectIdentity(options: ConnectOptions): Promise<IdentityClient>;
export declare class IdentityClient extends ChannelClient {
    private current;
    private readonly stateListeners;
    private readonly sessionListeners;
    private readonly early;
    /** @internal Use connectIdentity. */
    constructor(channel: AgentChannel);
    get state(): IdentityState;
    onState(listener: (state: IdentityState) => void): () => void;
    /** Create an identity. An empty passphrase protects it with this device instead. */
    create(input: {
        display_name: string;
        passphrase: string;
    }): Promise<{
        npub: string;
        phrase: string;
    }>;
    unlock(passphrase?: string): Promise<IdentityState>;
    lock(): Promise<IdentityState>;
    restore(input: {
        phrase: string;
        passphrase: string;
        display_name?: string;
        replace_existing?: boolean;
    }): Promise<{
        npub: string;
        set_aside_as: string | null;
    }>;
    /** The backup: the recovery phrase, or an nsec for an identity that has none. */
    reveal(input: {
        passphrase?: string;
        confirm?: boolean;
    }): Promise<{
        secret_kind: SecretKind;
        secret: string;
    }>;
    /** Forgot the passphrase and have no phrase: a new identity, carried into the old one's workspaces. */
    replace(input: {
        passphrase: string;
        display_name?: string;
    }): Promise<{
        npub: string;
        phrase: string;
        previous_npub: string;
        previous_revoked: boolean;
        workspaces: Workspace[];
        set_aside_as: string | null;
    }>;
    /** Import an identity file written by an earlier surface. Pass its parsed JSON. */
    importLegacy(input: {
        file: unknown;
        passphrase: string;
        display_name?: string;
        replace_existing?: boolean;
    }): Promise<{
        npub: string;
        secret_kind: SecretKind;
        protection?: Protection;
        already_present?: boolean;
        set_aside_as?: string | null;
    }>;
    /** Create or join the workspace for a folder. Sessions waiting for a workspace then receive a bearer. */
    joinFolder(input: {
        locator: string;
        create_directory?: boolean;
        name?: string;
    }): Promise<JoinOutcome>;
    /**
     * Ask for a bearer. The listener receives `ready` with the bearer, then `ready`
     * again with a fresh one before each expiry, until the session ends.
     */
    session(options: {
        workspace_id?: string;
    }, listener: (event: SessionEvent) => void): Promise<IdentitySession>;
    sessions(): Promise<{
        sessions: Array<{
            session_id: string;
            surface: string;
            status: string;
            workspace: Workspace | null;
            started_at: string;
            expires_at: string | null;
        }>;
    }>;
    revokeSession(sessionId: string): Promise<{
        revoked: boolean;
    }>;
    /** Every identity Floe holds here: the current one and each one set aside. */
    listIdentities(input?: {
        include_npub?: boolean;
    }): Promise<{
        identities: HeldIdentity[];
    }>;
    /**
     * Delete one identity for good. The current one also needs `revoke_admissions`
     * (the person's choice) and, when passphrase protected, its passphrase.
     */
    deleteIdentity(input: {
        id: string;
        confirm: true;
        revoke_admissions?: boolean;
        passphrase?: string;
    }): Promise<{
        deleted: string;
        revoked_admissions: {
            revoked: boolean;
            workspaces: Workspace[];
        } | null;
        device_key_removed: boolean;
    }>;
    protected onPush(message: Record<string, unknown>): void;
    private dispatchSession;
}
