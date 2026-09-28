import { z } from "zod";
export type Protection = "passphrase" | "device";
export type SecretKind = "phrase" | "nsec";
export type ScryptParams = {
    N: number;
    r: number;
    p: number;
};
/** OWASP scrypt minimums for a file at rest; the same the console used. */
export declare const SCRYPT_PARAMS: ScryptParams;
declare const IdentityFileSchema: z.ZodObject<{
    version: z.ZodLiteral<2>;
    npub: z.ZodString;
    pubkey_hex: z.ZodString;
    display_name: z.ZodString;
    created_at: z.ZodString;
    protection: z.ZodEnum<["passphrase", "device"]>;
    secret_kind: z.ZodEnum<["phrase", "nsec"]>;
    seal: z.ZodDiscriminatedUnion<"name", [z.ZodObject<{
        name: z.ZodLiteral<"scrypt">;
        N: z.ZodNumber;
        r: z.ZodNumber;
        p: z.ZodNumber;
        salt: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        name: "scrypt";
        r: number;
        N: number;
        p: number;
        salt: string;
    }, {
        name: "scrypt";
        r: number;
        N: number;
        p: number;
        salt: string;
    }>, z.ZodObject<{
        name: z.ZodLiteral<"os-vault">;
    }, "strict", z.ZodTypeAny, {
        name: "os-vault";
    }, {
        name: "os-vault";
    }>]>;
    cipher: z.ZodObject<{
        name: z.ZodLiteral<"aes-256-gcm">;
        iv: z.ZodString;
        ciphertext: z.ZodString;
        tag: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        name: "aes-256-gcm";
        iv: string;
        ciphertext: string;
        tag: string;
    }, {
        name: "aes-256-gcm";
        iv: string;
        ciphertext: string;
        tag: string;
    }>;
}, "strict", z.ZodTypeAny, {
    version: 2;
    display_name: string;
    npub: string;
    pubkey_hex: string;
    created_at: string;
    protection: "passphrase" | "device";
    secret_kind: "phrase" | "nsec";
    seal: {
        name: "scrypt";
        r: number;
        N: number;
        p: number;
        salt: string;
    } | {
        name: "os-vault";
    };
    cipher: {
        name: "aes-256-gcm";
        iv: string;
        ciphertext: string;
        tag: string;
    };
}, {
    version: 2;
    display_name: string;
    npub: string;
    pubkey_hex: string;
    created_at: string;
    protection: "passphrase" | "device";
    secret_kind: "phrase" | "nsec";
    seal: {
        name: "scrypt";
        r: number;
        N: number;
        p: number;
        salt: string;
    } | {
        name: "os-vault";
    };
    cipher: {
        name: "aes-256-gcm";
        iv: string;
        ciphertext: string;
        tag: string;
    };
}>;
export type IdentityFile = z.infer<typeof IdentityFileSchema>;
export declare class WrongPassphraseError extends Error {
    constructor();
}
export type SealInput = {
    secretKind: SecretKind;
    /** UTF-8 phrase bytes, or the raw 32-byte key. */
    secret: Uint8Array;
    npub: string;
    pubkeyHex: string;
    displayName: string;
    protection: Protection;
    /** Required for `passphrase`. */
    passphrase?: string;
    /** Required for `device`: the vault wrapping key (32 bytes). */
    deviceKey?: Uint8Array;
    scrypt?: ScryptParams;
    createdAt?: string;
};
export declare function sealIdentity(input: SealInput): IdentityFile;
/** Decrypt the sealed secret. Throws WrongPassphraseError when the key does not fit. */
export declare function openIdentity(file: IdentityFile, unlock: {
    passphrase?: string;
    deviceKey?: Uint8Array;
}): Buffer;
export declare function identityDir(home: string): string;
export declare function identityFilePath(home: string): string;
export declare function loadIdentityFile(home: string): IdentityFile | null;
/** Write atomically, so a crash never leaves half an identity. */
export declare function saveIdentityFile(home: string, file: IdentityFile): void;
/**
 * Move the current identity aside under a dated name rather than delete it: a
 * forgotten passphrase may turn up. Returns the new file name, or null if there
 * was nothing to move.
 */
export declare function setAsideIdentityFile(home: string, now?: Date): string | null;
declare const LegacyConsoleFileSchema: z.ZodObject<{
    version: z.ZodLiteral<1>;
    npub: z.ZodString;
    created_at: z.ZodString;
    protection: z.ZodOptional<z.ZodEnum<["passphrase", "device"]>>;
    kdf: z.ZodObject<{
        name: z.ZodLiteral<"scrypt">;
        N: z.ZodNumber;
        r: z.ZodNumber;
        p: z.ZodNumber;
        salt: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        name: "scrypt";
        r: number;
        N: number;
        p: number;
        salt: string;
    }, {
        name: "scrypt";
        r: number;
        N: number;
        p: number;
        salt: string;
    }>;
    cipher: z.ZodObject<{
        name: z.ZodLiteral<"aes-256-gcm">;
        iv: z.ZodString;
        ciphertext: z.ZodString;
        tag: z.ZodString;
    }, "passthrough", z.ZodTypeAny, z.objectOutputType<{
        name: z.ZodLiteral<"aes-256-gcm">;
        iv: z.ZodString;
        ciphertext: z.ZodString;
        tag: z.ZodString;
    }, z.ZodTypeAny, "passthrough">, z.objectInputType<{
        name: z.ZodLiteral<"aes-256-gcm">;
        iv: z.ZodString;
        ciphertext: z.ZodString;
        tag: z.ZodString;
    }, z.ZodTypeAny, "passthrough">>;
}, "strip", z.ZodTypeAny, {
    version: 1;
    npub: string;
    created_at: string;
    cipher: {
        name: "aes-256-gcm";
        iv: string;
        ciphertext: string;
        tag: string;
    } & {
        [k: string]: unknown;
    };
    kdf: {
        name: "scrypt";
        r: number;
        N: number;
        p: number;
        salt: string;
    };
    protection?: "passphrase" | "device" | undefined;
}, {
    version: 1;
    npub: string;
    created_at: string;
    cipher: {
        name: "aes-256-gcm";
        iv: string;
        ciphertext: string;
        tag: string;
    } & {
        [k: string]: unknown;
    };
    kdf: {
        name: "scrypt";
        r: number;
        N: number;
        p: number;
        salt: string;
    };
    protection?: "passphrase" | "device" | undefined;
}>;
export type LegacyConsoleFile = z.infer<typeof LegacyConsoleFileSchema>;
export declare function parseLegacyConsoleFile(value: unknown): LegacyConsoleFile | null;
/**
 * Decrypt a console identity file. A device-protected console file was sealed
 * with an empty passphrase. Throws WrongPassphraseError on mismatch.
 */
export declare function openLegacyConsoleFile(file: LegacyConsoleFile, passphrase: string): Buffer;
export {};
