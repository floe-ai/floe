export declare const FAST_SCRYPT: {
    N: number;
    r: number;
    p: number;
};
/** A v1 identity file as the console wrote it. */
export declare function legacyConsoleFile(plaintext: Buffer, npub: string, passphrase: string, protection?: "passphrase" | "device"): {
    kdf: {
        salt: string;
        N: number;
        r: number;
        p: number;
        name: string;
    };
    cipher: {
        name: string;
        iv: string;
        ciphertext: string;
        tag: string;
    };
    protection?: "passphrase" | "device" | undefined;
    version: number;
    npub: string;
    created_at: string;
};
/**
 * An in-memory Bus answering the identity routes the agent uses, faithful to
 * their status codes (floe-bus/src/server.ts). Signatures are really verified.
 */
export declare class FakeBus {
    private readonly now;
    readonly hostToken: string;
    identities: Map<string, {
        identity_id: string;
        pubkey_hex: string;
        display_name: string;
        revoked_at: string | null;
        workspaces: Array<{
            workspace_id: string;
            name: string;
        }>;
    }>;
    revokedSessions: string[];
    authentications: number;
    private counter;
    constructor(now?: () => number, hostToken?: string);
    admit(pubkey: string, display_name: string, workspace: {
        workspace_id: string;
        name: string;
    }): {
        identity_id: string;
        pubkey_hex: string;
        display_name: string;
        revoked_at: string | null;
        workspaces: Array<{
            workspace_id: string;
            name: string;
        }>;
    };
    fetch: typeof fetch;
}
/** Timers the test fires by hand, so nothing waits on the clock. */
export declare class ManualTimers {
    private next;
    readonly pending: Map<number, {
        fn: () => void;
        ms: number;
    }>;
    set: (fn: () => void, ms: number) => number;
    clear: (id: unknown) => void;
    fireAll(): void;
    delays(): number[];
}
