/**
 * The identity's key material: a BIP-39 recovery phrase, the NIP-06 secp256k1
 * key derived from it, and the NIP-42 proof the Bus verifies (ADR-0015). Every
 * primitive is nostr-tools / noble; nothing cryptographic is written here.
 */
import { generateSeedWords, privateKeyFromSeedWords, validateWords } from "nostr-tools/nip06";
import { finalizeEvent, getPublicKey } from "nostr-tools/pure";
import { nip19 } from "nostr-tools";
export const NIP42_AUTH_KIND = 22242;
export function normalizePhrase(phrase) {
    return phrase.trim().toLowerCase().split(/\s+/).join(" ");
}
/** A fresh 12-word recovery phrase (128 bits of entropy). */
export function generatePhrase() {
    return generateSeedWords();
}
export function isValidPhrase(phrase) {
    try {
        return validateWords(normalizePhrase(phrase));
    }
    catch {
        return false;
    }
}
/** NIP-06: m/44'/1237'/0'/0/0. */
export function secretKeyFromPhrase(phrase) {
    return privateKeyFromSeedWords(normalizePhrase(phrase));
}
export function publicKeyHex(secretKey) {
    return getPublicKey(secretKey);
}
export function npubOf(pubkeyHex) {
    return nip19.npubEncode(pubkeyHex);
}
export function nsecOf(secretKey) {
    return nip19.nsecEncode(secretKey);
}
/** The kind:22242 event proving possession of the key for one Bus challenge. */
export function signAuthEvent(secretKey, relay, challenge) {
    return finalizeEvent({
        kind: NIP42_AUTH_KIND,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
            ["relay", relay],
            ["challenge", challenge],
        ],
        content: "",
    }, secretKey);
}
