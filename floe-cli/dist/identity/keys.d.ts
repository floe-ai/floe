import { type Event as NostrEvent } from "nostr-tools/pure";
export declare const NIP42_AUTH_KIND = 22242;
export declare function normalizePhrase(phrase: string): string;
/** A fresh 12-word recovery phrase (128 bits of entropy). */
export declare function generatePhrase(): string;
export declare function isValidPhrase(phrase: string): boolean;
/** NIP-06: m/44'/1237'/0'/0/0. */
export declare function secretKeyFromPhrase(phrase: string): Uint8Array;
export declare function publicKeyHex(secretKey: Uint8Array): string;
export declare function npubOf(pubkeyHex: string): string;
export declare function nsecOf(secretKey: Uint8Array): string;
/** The kind:22242 event proving possession of the key for one Bus challenge. */
export declare function signAuthEvent(secretKey: Uint8Array, relay: string, challenge: string): NostrEvent;
