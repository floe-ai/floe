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
    /** Defaults to FLOE_CONFIG, then ~/.floe/config.yaml. */
    configPath?: string;
    /**
     * Start Floe (bus, bridge and agent) when the agent is not answering, if the
     * machine's services.start_on_demand allows it. Default true.
     */
    start?: boolean;
};
export declare function connectIdentity(options: ConnectOptions): Promise<IdentityClient>;
export declare class IdentityClient {
    private readonly channel;
    private current;
    private nextId;
    private readonly pending;
    private readonly stateListeners;
    private readonly closeListeners;
    private readonly sessionListeners;
    private readonly early;
    private closed;
    /** @internal Use connectIdentity. */
    constructor(channel: AgentChannel);
    get state(): IdentityState;
    /** The Floe version of the agent serving this machine. */
    get agentVersion(): string | null;
    /**
     * Set when the agent is a different Floe version from the copy this surface
     * depends on. Connect-first: the running agent is used as is, never restarted.
     */
    get versionNote(): string | null;
    onState(listener: (state: IdentityState) => void): () => void;
    onClose(listener: () => void): () => void;
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
    close(): void;
    private request;
    private receive;
    private dispatchSession;
    private handleClose;
}
