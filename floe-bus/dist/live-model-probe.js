/**
 * @invariant This module is the single implementation point for live-model-list probing.
 * It fetches per-provider live model IDs and returns them for intersection with pi's catalog.
 * All failure modes MUST fail-open (return undefined so callers pass the full catalog through).
 * No model IDs are hardcoded. No real network calls occur in unit tests (inject fetchFn).
 * Custom models.json entries are never filtered — they bypass intersection at the call site.
 */
/** Per-provider+credential cache keyed by `"provider\0credentialHash"`. */
const cache = new Map();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const PROBE_TIMEOUT_MS = 5_000;
/** Exported for tests to reset between runs. */
export function clearLiveModelCache() {
    cache.clear();
}
function cacheKey(provider, credentialToken) {
    // We don't need a secure hash here — just a stable string for cache keying.
    return `${provider}\0${credentialToken.slice(0, 16)}`;
}
/**
 * Probe Anthropic for live model IDs.
 * OAuth tokens (sk-ant-oat prefix) use Authorization: Bearer + anthropic-beta containing
 * "oauth-2025-04-20" — mirroring pi-ai's createClient() at
 * node_modules/@earendil-works/pi-ai/dist/providers/anthropic.js lines 629-643.
 * Plain API keys use x-api-key only.
 * Paginates via limit=1000 + after_id/has_more.
 */
async function probeAnthropic(credential, isOAuth, fetchFn) {
    const ids = new Set();
    let afterId;
    let hasMore = true;
    while (hasMore) {
        const url = new URL("https://api.anthropic.com/v1/models");
        url.searchParams.set("limit", "1000");
        if (afterId)
            url.searchParams.set("after_id", afterId);
        const headers = {
            "anthropic-version": "2023-06-01",
        };
        if (isOAuth) {
            // OAuth: Bearer auth with claude-code identity beta headers
            // (matches pi-ai providers/anthropic.js createClient OAuth branch)
            headers["Authorization"] = `Bearer ${credential}`;
            headers["anthropic-beta"] = "claude-code-20250219,oauth-2025-04-20";
        }
        else {
            headers["x-api-key"] = credential;
        }
        const res = await withTimeout(fetchFn(url.toString(), { headers }), PROBE_TIMEOUT_MS);
        if (!res.ok)
            return undefined;
        const body = await res.json();
        if (!isAnthropicResponse(body))
            return undefined;
        for (const model of body.data)
            ids.add(model.id);
        hasMore = body.has_more;
        afterId = body.last_id ?? undefined;
    }
    return ids.size > 0 ? ids : undefined;
}
function isAnthropicResponse(body) {
    if (!body || typeof body !== "object")
        return false;
    const b = body;
    if (!Array.isArray(b["data"]))
        return false;
    if (typeof b["has_more"] !== "boolean")
        return false;
    return b["data"].every((m) => m && typeof m === "object" && typeof m["id"] === "string");
}
/**
 * Probe Google/Gemini for live model IDs.
 * API key goes as ?key= param; OAuth tokens go as Authorization: Bearer.
 * Paginates via pageSize/pageToken. Strips "models/" prefix from name.
 */
async function probeGoogle(credential, isOAuth, fetchFn) {
    const ids = new Set();
    let pageToken;
    do {
        const url = new URL("https://generativelanguage.googleapis.com/v1beta/models");
        url.searchParams.set("pageSize", "1000");
        if (pageToken)
            url.searchParams.set("pageToken", pageToken);
        const headers = {};
        if (isOAuth) {
            headers["Authorization"] = `Bearer ${credential}`;
        }
        else {
            url.searchParams.set("key", credential);
        }
        const res = await withTimeout(fetchFn(url.toString(), { headers }), PROBE_TIMEOUT_MS);
        if (!res.ok)
            return undefined;
        const body = await res.json();
        if (!isGoogleResponse(body))
            return undefined;
        for (const model of body.models) {
            // name is like "models/gemini-2.0-flash" — strip "models/" prefix
            const id = model.name.startsWith("models/") ? model.name.slice("models/".length) : model.name;
            ids.add(id);
        }
        pageToken = body.nextPageToken ?? undefined;
    } while (pageToken);
    return ids.size > 0 ? ids : undefined;
}
function isGoogleResponse(body) {
    if (!body || typeof body !== "object")
        return false;
    const b = body;
    if (!Array.isArray(b["models"]))
        return false;
    return b["models"].every((m) => m && typeof m === "object" && typeof m["name"] === "string");
}
/**
 * Probe OpenAI for live model IDs.
 * Uses Authorization: Bearer. Works for plain API keys and OpenAI Codex OAuth tokens.
 */
async function probeOpenAI(credential, fetchFn) {
    const res = await withTimeout(fetchFn("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${credential}` },
    }), PROBE_TIMEOUT_MS);
    if (!res.ok)
        return undefined;
    const body = await res.json();
    if (!isOpenAIResponse(body))
        return undefined;
    const ids = new Set(body.data.map((m) => m.id));
    return ids.size > 0 ? ids : undefined;
}
function isOpenAIResponse(body) {
    if (!body || typeof body !== "object")
        return false;
    const b = body;
    if (!Array.isArray(b["data"]))
        return false;
    return b["data"].every((m) => m && typeof m === "object" && typeof m["id"] === "string");
}
/**
 * Probe GitHub Copilot for live model IDs.
 * Uses baseUrl from pi's getGitHubCopilotBaseUrl + static Copilot headers.
 * The endpoint is undocumented — fail open on anything unexpected.
 *
 * Headers replicated from pi-ai source:
 *   node_modules/@earendil-works/pi-ai/dist/utils/oauth/github-copilot.js (COPILOT_HEADERS constant)
 * We import getGitHubCopilotBaseUrl from pi's oauth module to derive the correct base URL
 * from the token's embedded proxy-ep field (enterprise Copilot support).
 */
async function probeCopilot(credential, 
// injected for testability; real calls use pi's getGitHubCopilotBaseUrl
getBaseUrl, fetchFn) {
    const baseUrl = getBaseUrl(credential);
    const url = `${baseUrl}/models`;
    const res = await withTimeout(fetchFn(url, {
        headers: {
            Authorization: `Bearer ${credential}`,
            // Static Copilot headers — replicated from pi-ai COPILOT_HEADERS constant
            // Source: node_modules/@earendil-works/pi-ai/dist/utils/oauth/github-copilot.js
            "User-Agent": "GitHubCopilotChat/0.35.0",
            "Editor-Version": "vscode/1.107.0",
            "Editor-Plugin-Version": "copilot-chat/0.35.0",
            "Copilot-Integration-Id": "vscode-chat",
        },
    }), PROBE_TIMEOUT_MS);
    if (!res.ok)
        return undefined;
    const body = await res.json();
    // The Copilot models endpoint returns { data: [{ id, ... }] } (OpenAI-compatible shape)
    if (!isOpenAIResponse(body))
        return undefined;
    const ids = new Set(body.data.map((m) => m.id));
    return ids.size > 0 ? ids : undefined;
}
/**
 * Probe a provider for its live model IDs.
 * Returns undefined (fail-open) on any error, timeout, unexpected shape, or missing credential.
 * Results are cached per provider+credential for CACHE_TTL_MS.
 *
 * @param provider   - pi provider string (e.g. "anthropic", "google", "openai", "github-copilot")
 * @param credential - pre-resolved credential (token already refreshed by auth layer, or undefined)
 * @param fetchFn    - injectable fetch implementation (defaults to global fetch)
 * @param getBaseUrl - injectable base-URL resolver for Copilot (defaults to pi's helper)
 */
export async function fetchLiveModelIds(provider, credential, fetchFn = globalFetch, getBaseUrl) {
    if (!credential)
        return undefined;
    const { token, isOAuth } = credential;
    if (!token)
        return undefined;
    const key = cacheKey(provider, token);
    const now = Date.now();
    const cached = cache.get(key);
    if (cached && cached.expiresAt > now)
        return cached.ids;
    try {
        let ids;
        switch (provider) {
            case "anthropic":
                ids = await probeAnthropic(token, isOAuth, fetchFn);
                break;
            case "google":
                ids = await probeGoogle(token, isOAuth, fetchFn);
                break;
            case "openai":
            case "openai-codex":
                ids = await probeOpenAI(token, fetchFn);
                break;
            case "github-copilot": {
                const baseUrlResolver = getBaseUrl ?? defaultCopilotBaseUrl;
                ids = await probeCopilot(token, baseUrlResolver, fetchFn);
                break;
            }
            default:
                // No probe for this provider — fail open
                return undefined;
        }
        if (ids && ids.size > 0) {
            cache.set(key, { ids, expiresAt: now + CACHE_TTL_MS });
        }
        return ids;
    }
    catch {
        // Any network error or unhandled exception → fail open
        return undefined;
    }
}
/**
 * Intersect pi's full catalog with a live model ID set.
 * Models originating from models.json custom entries are ALWAYS kept.
 * If liveIds is undefined (probe failed/skipped), the full catalog passes through unchanged.
 */
export function intersectWithLive(catalogModels, customModelKeys, liveIds) {
    if (!liveIds)
        return catalogModels;
    return catalogModels.filter((m) => customModelKeys.has(`${m.provider}/${m.id}`) || liveIds.has(m.id));
}
// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------
async function withTimeout(promise, ms) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("probe timeout")), ms);
        promise.then((v) => { clearTimeout(timer); resolve(v); }, (e) => { clearTimeout(timer); reject(e); });
    });
}
function globalFetch(url, init) {
    return fetch(url, init);
}
// Lazy import of pi's getGitHubCopilotBaseUrl to avoid circular issues at module load.
// Source: @earendil-works/pi-ai/oauth → getGitHubCopilotBaseUrl(token, enterpriseDomain?)
let _piCopilotBaseUrl;
function defaultCopilotBaseUrl(token) {
    if (!_piCopilotBaseUrl) {
        // Dynamic require is intentional — avoids top-level async import and keeps the module
        // synchronously loadable for tests. The import resolves to the already-loaded pi-ai bundle.
        try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const mod = require("@earendil-works/pi-ai/oauth");
            _piCopilotBaseUrl = mod.getGitHubCopilotBaseUrl;
        }
        catch {
            return "https://api.individual.githubcopilot.com";
        }
    }
    return _piCopilotBaseUrl(token);
}
