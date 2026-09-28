import { type Protection, type ScryptParams, type SecretKind } from "./identity-file.js";
export type IdentitySummary = {
    npub: string;
    pubkey_hex: string;
    display_name: string;
    protection: Protection;
    secret_kind: SecretKind;
};
export type AgentState = {
    kind: "none";
} | ({
    kind: "locked" | "unlocked";
} & IdentitySummary);
export declare class AgentError extends Error {
    readonly code: string;
    readonly details: Record<string, unknown>;
    constructor(code: string, message: string, details?: Record<string, unknown>);
}
/** One authenticated surface connection. */
export interface AgentConnection {
    readonly surface: string;
    send(message: Record<string, unknown>): void;
}
type Timer = unknown;
export type AgentDeps = {
    home: string;
    busUrl: string;
    version: string | null;
    lockAfterIdleMs: number;
    /** Read (or with `create`, mint) the vault key for device protection; null when absent. */
    deviceKey: (create: boolean) => Promise<Uint8Array | null>;
    /** host_control from the native broker, for re-admission and revocation only. */
    hostToken: () => Promise<string>;
    fetch?: typeof fetch;
    now?: () => number;
    setTimer?: (fn: () => void, ms: number) => Timer;
    clearTimer?: (timer: Timer) => void;
    scrypt?: ScryptParams;
    /** Renew a bearer this long before it expires. */
    renewBeforeExpiryMs?: number;
    log?: (line: string) => void;
};
export declare class IdentityAgent {
    private readonly deps;
    private secretKey;
    private readonly connections;
    private readonly sessions;
    private idleTimer;
    private queue;
    private readonly bus;
    private readonly now;
    private readonly setTimer;
    private readonly clearTimer;
    private readonly log;
    constructor(deps: AgentDeps);
    get version(): string | null;
    attach(conn: AgentConnection): void;
    detach(conn: AgentConnection): void;
    state(): AgentState;
    /** Dispatch one request. Throws AgentError with a stable code on refusal. */
    handle(conn: AgentConnection, op: string, args: Record<string, unknown>): Promise<unknown>;
    private create;
    private unlock;
    private lock;
    private restore;
    private reveal;
    /**
     * "I forgot my passphrase and have no recovery phrase": re-admission, not
     * recovery. A new identity is made, admitted to every workspace the old one
     * was in, and the old one is revoked on this Floe. The old file is set aside
     * under a dated name, never deleted.
     */
    private replace;
    /**
     * Import an identity file from an earlier surface (the console's format).
     * The surface passes the file's contents and the passphrase the person typed;
     * only the agent decrypts.
     */
    private importLegacy;
    private joinFolder;
    private startSession;
    private selectWorkspace;
    private endOwnSession;
    private listSessions;
    private revokeSession;
    private authenticateSession;
    private scheduleRenewal;
    private endSession;
    private revokeBearer;
    private summary;
    private requireFile;
    /** A copy of the unlocked key; device protection unlocks without asking. */
    private ensureUnlocked;
    private openSecret;
    private openKey;
    private store;
    private displayNameFromBus;
    private adoptKey;
    private scheduleIdleLock;
    private cancelIdleLock;
    private clearSessionTimer;
    private ownSession;
    private pushSession;
    private broadcastState;
    private serial;
    /** For tests: is the identity file present? */
    hasIdentityFile(): boolean;
}
export {};
