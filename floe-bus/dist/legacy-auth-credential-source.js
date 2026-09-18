import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import YAML from "yaml";
/**
 * Explicit migration-only reader for the legacy Pi auth files. It returns one
 * credential to trusted broker code and never changes or deletes the source.
 */
export class LegacyAuthCredentialSource {
    profilesPath;
    authPath;
    constructor(profilesPath, authPath) {
        this.profilesPath = profilesPath;
        this.authPath = authPath;
    }
    async read(request) {
        const profileId = safeId(request.profile_id, "legacy profile ID");
        const expectedFingerprint = safeFingerprint(request.source_fingerprint);
        let authBytes;
        let profileText;
        try {
            [authBytes, profileText] = await Promise.all([
                readFile(this.authPath),
                readFile(this.profilesPath, "utf8"),
            ]);
        }
        catch {
            throw new LegacyCredentialSourceError("legacy_source_unavailable");
        }
        try {
            const actualFingerprint = `sha256:${createHash("sha256").update(authBytes).digest("hex")}`;
            if (actualFingerprint !== expectedFingerprint) {
                throw new LegacyCredentialSourceError("legacy_source_changed");
            }
            const profiles = parseProfiles(profileText);
            const profile = profiles.find((candidate) => candidate.id === profileId);
            if (!profile)
                throw new LegacyCredentialSourceError("legacy_profile_not_found");
            const auth = parseAuth(authBytes);
            const credential = auth[profile.provider];
            if (!credential)
                throw new LegacyCredentialSourceError("legacy_credential_not_found");
            const material = Uint8Array.from(Buffer.from(JSON.stringify(credential), "utf8"));
            if (material.byteLength === 0)
                throw new LegacyCredentialSourceError("legacy_credential_invalid");
            return { provider_id: profile.provider, material };
        }
        finally {
            authBytes.fill(0);
        }
    }
}
export class LegacyCredentialSourceError extends Error {
    code;
    constructor(code) {
        super("The selected legacy credential could not be verified for migration.");
        this.code = code;
        this.name = "LegacyCredentialSourceError";
    }
}
function parseProfiles(text) {
    let value;
    try {
        value = YAML.parse(text);
    }
    catch {
        throw new LegacyCredentialSourceError("legacy_credential_invalid");
    }
    if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.profiles)) {
        throw new LegacyCredentialSourceError("legacy_credential_invalid");
    }
    return value.profiles.map((item) => {
        if (!isRecord(item))
            throw new LegacyCredentialSourceError("legacy_credential_invalid");
        return {
            id: safeId(item.id, "legacy profile ID"),
            provider: safeId(item.provider, "legacy provider ID"),
        };
    });
}
function parseAuth(bytes) {
    let value;
    try {
        value = JSON.parse(Buffer.from(bytes).toString("utf8"));
    }
    catch {
        throw new LegacyCredentialSourceError("legacy_credential_invalid");
    }
    if (!isRecord(value))
        throw new LegacyCredentialSourceError("legacy_credential_invalid");
    const result = {};
    for (const [provider, credential] of Object.entries(value)) {
        safeId(provider, "legacy provider ID");
        if (!isRecord(credential) || (credential.type !== "api_key" && credential.type !== "oauth")) {
            throw new LegacyCredentialSourceError("legacy_credential_invalid");
        }
        if (credential.type === "api_key" && (typeof credential.key !== "string" || !credential.key)) {
            throw new LegacyCredentialSourceError("legacy_credential_invalid");
        }
        if (credential.type === "oauth" && (typeof credential.access !== "string" || !credential.access
            || typeof credential.refresh !== "string" || !credential.refresh
            || typeof credential.expires !== "number" || !Number.isFinite(credential.expires))) {
            throw new LegacyCredentialSourceError("legacy_credential_invalid");
        }
        result[provider] = credential;
    }
    return result;
}
function safeFingerprint(value) {
    if (!/^sha256:[a-f0-9]{64}$/.test(value)) {
        throw new LegacyCredentialSourceError("legacy_credential_invalid");
    }
    return value;
}
function safeId(value, _label) {
    if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,511}$/.test(value)) {
        throw new LegacyCredentialSourceError("legacy_credential_invalid");
    }
    return value;
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value)
        && Object.getPrototypeOf(value) === Object.prototype;
}
