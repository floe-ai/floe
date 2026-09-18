/**
 * Explicit transport migration boundary for Events written before canonical
 * ArtefactVersion references were introduced. Present identifiers are
 * validated and preserved exactly; only an absent legacy field becomes [].
 */
export function normalizeEventEnvelopeAtTransport(value) {
    const ids = value.artefact_version_ids;
    if (ids !== undefined && (!Array.isArray(ids) || ids.some((id) => typeof id !== "string" || !id.trim()))) {
        throw new Error("The Bus returned an invalid Event artefact_version_ids contract.");
    }
    return {
        ...value,
        artefact_version_ids: ids === undefined ? [] : [...ids],
    };
}
function normalizeDeliveryBundleAtTransport(bundle) {
    return {
        ...bundle,
        events: (bundle.events ?? []).map(normalizeEventEnvelopeAtTransport),
    };
}
/**
 * An unavailable Bridge is an authority state, not a transient network error.
 * Callers can surface this without exposing the rejected credential or relying
 * on loopback as an implicit grant.
 */
export class BridgeTransportUnavailableError extends Error {
    reason;
    code = "bridge_transport_unavailable";
    constructor(reason) {
        super(reason === "credential_missing"
            ? "The Bridge service credential is unavailable."
            : reason === "credential_not_accepted"
                ? "The Bridge service credential was not accepted."
                : "The Bridge service credential cannot be sent over an insecure transport.");
        this.reason = reason;
        this.name = "BridgeTransportUnavailableError";
    }
}
export class BusClient {
    baseUrl;
    #authorityStateValue;
    #bearerToken;
    constructor(baseUrl, authority) {
        this.baseUrl = baseUrl;
        const token = authority?.audience === "bridge_service"
            ? authority.bearer_token.trim()
            : "";
        const secureTransport = isCredentialTransportSecure(baseUrl);
        this.#bearerToken = secureTransport ? token || null : null;
        this.#authorityStateValue = !secureTransport
            ? { status: "unavailable", reason: "insecure_transport" }
            : this.#bearerToken
                ? { status: "available", audience: "bridge_service" }
                : { status: "unavailable", reason: "credential_missing" };
    }
    get authorityState() {
        return this.#authorityStateValue;
    }
    requireAuthority() {
        if (this.#authorityStateValue.status === "unavailable") {
            throw new BridgeTransportUnavailableError(this.#authorityStateValue.reason);
        }
    }
    markAuthorityUnavailable(reason) {
        this.#bearerToken = null;
        this.#authorityStateValue = { status: "unavailable", reason };
    }
    async health() {
        const path = "/health";
        const response = await fetch(`${this.baseUrl}${path}`);
        if (!response.ok)
            throw new Error(`GET ${path} failed: ${response.status} ${await response.text()}`);
        return response.json();
    }
    async registerBridge(capabilities) {
        await this.post("/v1/bridges/register", { capabilities });
    }
    async reportBridgeLiveness() {
        await this.post("/v1/bridges/liveness", {});
    }
    async listWorkspaces() {
        const result = await this.get("/v1/bridge/workspace-bindings");
        return result.workspaces;
    }
    async discoverOperations(workspaceId, operationAuthorityBearer, input = {}) {
        const params = new URLSearchParams();
        if (input.query)
            params.set("query", input.query);
        if (input.category)
            params.set("category", input.category);
        if (input.target) {
            params.set("target_kind", input.target.kind);
            params.set("target_id", input.target.id);
        }
        const suffix = params.size > 0 ? `?${params}` : "";
        return this.getWithBearer(`/v1/workspaces/${encodeURIComponent(workspaceId)}/operations${suffix}`, operationAuthorityBearer);
    }
    /** The same authenticated, digest-checked exact-content read used by clients. */
    async readArtefactVersionContent(workspaceId, versionId, bearerToken) {
        const maximumBytes = 20 * 1024 * 1024;
        const path = `/v1/workspaces/${encodeURIComponent(workspaceId)}/artefact-versions/${encodeURIComponent(versionId)}/content`;
        const response = await fetch(`${this.baseUrl}${path}`, {
            headers: this.operationAuthorityHeaders(bearerToken), redirect: "error",
        });
        if (!response.ok)
            throw new Error(`Artefact content read failed: ${response.status} ${await response.text()}`);
        if (response.headers.get("x-floe-artefact-version-id") !== versionId) {
            await response.body?.cancel();
            throw new Error("The content response did not identify the requested ArtefactVersion.");
        }
        if (Number(response.headers.get("content-length")) > maximumBytes) {
            await response.body?.cancel();
            throw new Error("Artefact content exceeds the 20MB model-input limit.");
        }
        const reader = response.body?.getReader();
        if (!reader)
            throw new Error("The ArtefactVersion has no readable content.");
        const chunks = [];
        let size = 0;
        try {
            while (true) {
                const next = await reader.read();
                if (next.done)
                    break;
                size += next.value.byteLength;
                if (size > maximumBytes) {
                    await reader.cancel();
                    throw new Error("Artefact content exceeds the 20MB model-input limit.");
                }
                chunks.push(next.value);
            }
        }
        finally {
            reader.releaseLock();
        }
        return {
            bytes: Buffer.concat(chunks),
            media_type: (response.headers.get("content-type") ?? "application/octet-stream").split(";", 1)[0].trim().toLowerCase(),
        };
    }
    async invokeOperation(workspaceId, operationAuthorityBearer, request) {
        return this.postWithBearer(`/v1/workspaces/${encodeURIComponent(workspaceId)}/operations/invoke`, request, operationAuthorityBearer);
    }
    async listConfigs() {
        const result = await this.get("/v1/configs");
        return result.configs;
    }
    async listEndpoints(workspaceId) {
        const result = await this.get(`/v1/workspaces/${encodeURIComponent(workspaceId)}/endpoints`);
        return result.endpoints;
    }
    async listRuntimeEndpoints(workspaceId, bindingId) {
        const result = await this.get(`/v1/bridge/workspaces/${encodeURIComponent(workspaceId)}/runtime-endpoints?binding_id=${encodeURIComponent(bindingId)}`);
        return result.endpoints;
    }
    /**
     * Fetch a context by id. Returns null when the bus reports 404. Throws on other non-2xx
     * responses or network errors — callers are expected to catch and degrade gracefully
     * (the bridge falls back to an empty participants list and logs a warning).
     */
    async getContext(contextId) {
        const path = `/v1/contexts/${encodeURIComponent(contextId)}`;
        const response = await fetch(`${this.baseUrl}${path}`, { headers: this.authorizedHeaders() });
        if (response.status === 404)
            return null;
        if (!response.ok)
            throw await this.responseError("GET", path, response);
        return response.json();
    }
    async registerEndpoint(input) {
        await this.post("/v1/endpoints/register", input);
    }
    async updateEndpointStatus(endpointId, status) {
        await this.post(`/v1/endpoints/${encodeURIComponent(endpointId)}/status`, { status });
    }
    async retireEndpoint(endpointId) {
        return this.post(`/v1/endpoints/${encodeURIComponent(endpointId)}/retire`, {});
    }
    async reportAttachment(workspaceId, input) {
        await this.post(`/v1/workspaces/${encodeURIComponent(workspaceId)}/attachment-result`, input);
    }
    async importWorkspaceConfiguration(workspaceId, inventory) {
        return this.post(`/v1/workspaces/${encodeURIComponent(workspaceId)}/import-config`, inventory);
    }
    async claimDeliveries() {
        const result = await this.get("/v1/delivery/claim?limit=10");
        return (result.deliveries ?? []).map(normalizeDeliveryBundleAtTransport);
    }
    async reportDeliveryStatus(deliveryId, state, error) {
        const result = await this.post(`/v1/delivery/${encodeURIComponent(deliveryId)}/status`, {
            state,
            error: error ?? null
        });
        return result.delivery;
    }
    async prepareRuntimeDelivery(deliveryId) {
        return this.post(`/v1/delivery/${encodeURIComponent(deliveryId)}/runtime-prepare`, {});
    }
    async readRuntimeCredential(deliveryId, secretRefId) {
        const path = `/v1/delivery/${encodeURIComponent(deliveryId)}/runtime-credentials/${encodeURIComponent(secretRefId)}`;
        const response = await fetch(`${this.baseUrl}${path}`, {
            headers: this.authorizedHeaders({ accept: "application/octet-stream" }),
            cache: "no-store",
        });
        if (!response.ok)
            throw await this.responseError("GET", path, response);
        const length = Number(response.headers.get("content-length") ?? "0");
        if (Number.isFinite(length) && length > 1024 * 1024) {
            throw new Error("The runtime credential response exceeded its bounded transport contract.");
        }
        const material = new Uint8Array(await response.arrayBuffer());
        if (material.byteLength === 0 || material.byteLength > 1024 * 1024) {
            material.fill(0);
            throw new Error("The runtime credential response was invalid.");
        }
        return material;
    }
    async replaceRuntimeCredential(deliveryId, secretRefId, material) {
        if (!(material instanceof Uint8Array) || material.byteLength === 0 || material.byteLength > 1024 * 1024) {
            throw new Error("The refreshed runtime credential is invalid.");
        }
        const path = `/v1/delivery/${encodeURIComponent(deliveryId)}/runtime-credentials/${encodeURIComponent(secretRefId)}`;
        // `fetch` accepts an ArrayBuffer as a body in every runtime supported by the
        // Bridge. Slice the exact view so adjacent bytes from a pooled Buffer can
        // never cross this private transport boundary.
        const body = material.buffer.slice(material.byteOffset, material.byteOffset + material.byteLength);
        const response = await fetch(`${this.baseUrl}${path}`, {
            method: "PUT",
            headers: this.authorizedHeaders({ "content-type": "application/octet-stream" }),
            body,
        });
        if (!response.ok)
            throw await this.responseError("PUT", path, response);
    }
    async emit(event) {
        return this.post("/v1/events/emit", event);
    }
    async reportTurnEnd(endpointId) {
        await this.post(`/v1/endpoints/${encodeURIComponent(endpointId)}/turn-end`, {});
    }
    async appendRuntimeTelemetry(input) {
        await this.post("/v1/runtime/telemetry", input);
    }
    async recordRuntimeTurnResult(input) {
        const result = await this.post("/v1/runtime/turn-result", input);
        return {
            ...result,
            result_event: normalizeEventEnvelopeAtTransport(result.result_event),
            return_event: result.return_event ? normalizeEventEnvelopeAtTransport(result.return_event) : null,
        };
    }
    async resolveRuntimeBinding(workspaceId, endpointId) {
        return this.get(`/v1/runtime/bindings/resolve?workspace_id=${encodeURIComponent(workspaceId)}&endpoint_id=${encodeURIComponent(endpointId)}`);
    }
    async createPulse(input) {
        return this.post("/v1/pulses", input);
    }
    async listPulses(filters) {
        const params = new URLSearchParams();
        if (filters.workspace_id)
            params.set("workspace_id", filters.workspace_id);
        if (filters.status)
            params.set("status", filters.status);
        if (filters.scope_id)
            params.set("scope_id", filters.scope_id);
        return this.get(`/v1/pulses?${params}`);
    }
    async pausePulse(pulseId) {
        return this.post(`/v1/pulses/${encodeURIComponent(pulseId)}/pause`, {});
    }
    async resumePulse(pulseId) {
        return this.post(`/v1/pulses/${encodeURIComponent(pulseId)}/resume`, {});
    }
    async cancelPulse(pulseId) {
        return this.post(`/v1/pulses/${encodeURIComponent(pulseId)}/cancel`, {});
    }
    /** Retained legacy graphs used for remaining Event-source and Actor instruction bindings. */
    async listScopeGraphsForWorkspace(workspaceId) {
        return this.get(`/v1/workspaces/${encodeURIComponent(workspaceId)}/graphs`);
    }
    /**
     * Fires an existing Scope Graph trigger node — no new wake mechanism, just
     * the same `fireScopeGraphTrigger` emit path a manual trigger fire would
     * use. A world-facing doorway (e.g. a watched folder) passes arrival facts
     * (channel, locator, observed_at, raw_reference) as ordinary `content` —
     * there is no separate origin envelope; the shape of `content` is exactly
     * what the receiving node's own config decides to make of it.
     */
    async fireScopeGraphTriggerNode(workspaceId, graphId, nodeId, input = {}) {
        const result = await this.post(`/v1/workspaces/${encodeURIComponent(workspaceId)}/graphs/${encodeURIComponent(graphId)}/nodes/${encodeURIComponent(nodeId)}/fire`, input);
        return { events: (result.events ?? []).map(normalizeEventEnvelopeAtTransport) };
    }
    async requestConfigSnapshot(workspaceId) {
        return this.post(`/v1/workspaces/${encodeURIComponent(workspaceId)}/config-snapshot`, {});
    }
    /**
     * Create a new context in the bus.
     * Supports optional scope_id (for card-as-context) and title.
     */
    async createContext(input) {
        const result = await this.post(`/v1/workspaces/${encodeURIComponent(input.workspace_id)}/contexts`, {
            participants: input.participants ?? [],
            scope_id: input.scope_id ?? null,
            created_by_endpoint_id: input.created_by_endpoint_id ?? null,
            title: input.title ?? null,
            parent_context_id: input.parent_context_id ?? null,
        });
        return result.context.context_id;
    }
    /**
     * List all contexts for a specific scope in a workspace.
     * Uses the server-side indexed query (idx_contexts_workspace_scope).
     */
    async listContextsForScope(workspaceId, scopeId) {
        const url = `/v1/workspaces/${encodeURIComponent(workspaceId)}/contexts?scope_id=${encodeURIComponent(scopeId)}`;
        const result = await this.get(url);
        return result.contexts;
    }
    /**
     * Add an endpoint as a participant in a context (idempotent).
     * Returns whether the participant was newly added.
     */
    async addParticipant(contextId, endpointId) {
        const result = await this.post(`/v1/contexts/${encodeURIComponent(contextId)}/participants`, { endpoint_id: endpointId });
        return { added: result.added };
    }
    /**
     * Remove an endpoint from a context's participant list (idempotent).
     * Returns whether the participant was removed.
     */
    async removeParticipant(contextId, endpointId) {
        const result = await this._delete(`/v1/contexts/${encodeURIComponent(contextId)}/participants/${encodeURIComponent(endpointId)}`);
        return { removed: result.removed };
    }
    /**
     * Subscribe an endpoint to event types in a context (UPSERT, idempotent).
     * eventTypes defaults to ["*"] (all events).
     * Pass [] to create a silent watcher — still a participant, never woken.
     */
    async subscribeToContext(contextId, endpointId, eventTypes = ["*"]) {
        await this.post(`/v1/contexts/${encodeURIComponent(contextId)}/subscriptions`, { endpoint_id: endpointId, event_types: eventTypes });
    }
    /**
     * Remove an endpoint's subscription from a context entirely.
     * Does NOT remove the endpoint from participants.
     */
    async unsubscribeFromContext(contextId, endpointId) {
        await this._delete(`/v1/contexts/${encodeURIComponent(contextId)}/subscriptions/${encodeURIComponent(endpointId)}`);
    }
    /**
     * Batch-apply participant + subscription changes in one atomic call.
     *
     * - `entries`: each endpoint is added as a participant AND gets its subscription
     *   upserted with the given `event_types`. Pass `[]` to create a silent watcher.
     * - `participantsOnly`: endpoints added as participants with no subscription change.
     *
     * Maps to `POST /v1/contexts/:id/subscriptions:batch`.
     */
    async applyContextSubscriptions(contextId, entries, participantsOnly = []) {
        await this.post(`/v1/contexts/${encodeURIComponent(contextId)}/subscriptions:batch`, { entries, participants_only: participantsOnly });
    }
    /**
     * List all subscriptions for a context.
     */
    async listContextSubscriptions(contextId) {
        const result = await this.get(`/v1/contexts/${encodeURIComponent(contextId)}/subscriptions`);
        return result.subscriptions;
    }
    /**
     * List events for a context in either direction from an optional cursor.
     * Returns a chronological page and the Bus cursor for that direction. Runtime actors use
     * this deliberately through the Context-history tool; it is not prompt injection.
     */
    async listContextEvents(contextId, cursor, limit, direction = "forward") {
        const params = new URLSearchParams({ context_id: contextId, direction });
        if (cursor)
            params.set(direction === "backward" ? "before" : "since", cursor);
        if (limit != null)
            params.set("limit", String(limit));
        const result = await this.get(`/v1/events?${params}`);
        return {
            events: (result.events ?? []).map(normalizeEventEnvelopeAtTransport),
            next_cursor: (direction === "backward" ? result.previous_cursor : result.next_cursor) ?? null,
        };
    }
    /**
     * List child contexts whose parent_context_id equals contextId.
     * Used for epic→card links.
     */
    async listChildContexts(contextId) {
        const result = await this.get(`/v1/contexts/${encodeURIComponent(contextId)}/children`);
        return result.contexts;
    }
    // ---------------------------------------------------------------------------
    async _delete(path) {
        const response = await fetch(`${this.baseUrl}${path}`, {
            method: "DELETE",
            headers: this.authorizedHeaders(),
        });
        if (!response.ok)
            throw await this.responseError("DELETE", path, response);
        return response.json();
    }
    async get(path) {
        const response = await fetch(`${this.baseUrl}${path}`, { headers: this.authorizedHeaders() });
        if (!response.ok)
            throw await this.responseError("GET", path, response);
        return response.json();
    }
    async post(path, body) {
        const response = await fetch(`${this.baseUrl}${path}`, {
            method: "POST",
            headers: this.authorizedHeaders({ "content-type": "application/json" }),
            body: JSON.stringify(body)
        });
        if (!response.ok)
            throw await this.responseError("POST", path, response);
        return response.json();
    }
    async getWithBearer(path, bearerToken) {
        const response = await fetch(`${this.baseUrl}${path}`, {
            headers: this.operationAuthorityHeaders(bearerToken),
        });
        if (!response.ok) {
            throw new Error(`GET ${path} failed: ${response.status} ${await response.text()}`);
        }
        return response.json();
    }
    async postWithBearer(path, body, bearerToken) {
        const response = await fetch(`${this.baseUrl}${path}`, {
            method: "POST",
            headers: this.operationAuthorityHeaders(bearerToken, { "content-type": "application/json" }),
            body: JSON.stringify(body),
        });
        if (!response.ok) {
            throw new Error(`POST ${path} failed: ${response.status} ${await response.text()}`);
        }
        return response.json();
    }
    operationAuthorityHeaders(bearerToken, additional = {}) {
        const token = bearerToken.trim();
        if (!token)
            throw new Error("The active Delivery has no operation authority session.");
        if (!isCredentialTransportSecure(this.baseUrl)) {
            throw new Error("Operation authority cannot cross an insecure transport.");
        }
        return {
            ...additional,
            authorization: `Bearer ${token}`,
        };
    }
    authorizedHeaders(additional = {}) {
        this.requireAuthority();
        return {
            ...additional,
            authorization: `Bearer ${this.#bearerToken}`,
        };
    }
    async responseError(method, path, response) {
        if (response.status === 401) {
            // A 401 also means this route requires a different credential audience.
            // One refused watcher/operation must not poison the shared Bridge client.
            // Verify once against an existing Bridge-only read before discarding its
            // credential. This is failure-triggered, not a recurring liveness check.
            const bridgeReadPath = "/v1/bridge/workspace-bindings";
            let bridgeRejected = path === bridgeReadPath;
            if (!bridgeRejected && this.#bearerToken) {
                try {
                    const probe = await fetch(`${this.baseUrl}${bridgeReadPath}`, {
                        headers: this.authorizedHeaders(), signal: AbortSignal.timeout(5_000),
                    });
                    bridgeRejected = probe.status === 401;
                    await probe.body?.cancel();
                }
                catch {
                    // A network failure cannot establish that a credential is invalid.
                    // The original operation remains refused; no authority is widened.
                }
            }
            if (bridgeRejected) {
                this.markAuthorityUnavailable("credential_not_accepted");
                return new BridgeTransportUnavailableError("credential_not_accepted");
            }
        }
        return new Error(`${method} ${path} failed: ${response.status} ${await response.text()}`);
    }
}
/** Credentials may cross TLS, or a loopback-only cleartext transport. */
export function isCredentialTransportSecure(value) {
    try {
        const url = new URL(value);
        if (url.protocol === "https:" || url.protocol === "wss:")
            return true;
        if (url.protocol !== "http:" && url.protocol !== "ws:")
            return false;
        const host = url.hostname.toLowerCase();
        return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1";
    }
    catch {
        return false;
    }
}
