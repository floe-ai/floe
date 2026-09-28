export class BusUnreachableError extends Error {
    url;
    constructor(url, cause) {
        super(`Floe's bus is not answering at ${url} (${cause instanceof Error ? cause.message : String(cause)}).`);
        this.url = url;
        this.name = "BusUnreachableError";
    }
}
export class BusIdentityClient {
    base;
    httpFetch;
    constructor(base, httpFetch = globalThis.fetch) {
        this.base = base;
        this.httpFetch = httpFetch;
    }
    url(path) {
        return `${this.base.replace(/\/+$/, "")}${path}`;
    }
    async call(path, init = {}) {
        try {
            return await this.httpFetch(this.url(path), init);
        }
        catch (error) {
            throw new BusUnreachableError(this.base, error);
        }
    }
    async challenge() {
        const response = await this.call("/v1/identity/challenge");
        if (!response.ok)
            throw new Error(`The bus refused a challenge (${response.status}).`);
        return await response.json();
    }
    async authenticate(event, workspaceId) {
        const response = await this.call("/v1/identity/authenticate", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(workspaceId ? { auth_event: event, workspace_id: workspaceId } : { auth_event: event }),
        });
        if (response.status === 401)
            return { kind: "not_admitted" };
        const body = await response.json();
        if (response.status === 403)
            return { kind: "not_admitted_to_workspace", workspaces: body.workspaces ?? [] };
        if (!response.ok)
            throw new Error(`The bus refused authentication (${response.status}: ${body.error ?? "unknown"}).`);
        if (!body.bearer_token)
            return { kind: "selection_required", workspaces: body.workspaces ?? [] };
        const workspaces = body.workspaces ?? [];
        return {
            kind: "bearer",
            bearer_token: body.bearer_token,
            authority_session_id: body.authority_session_id ?? null,
            identity_id: body.identity?.identity_id,
            workspace: workspaces.find((w) => w.workspace_id === body.workspace_id) ?? { workspace_id: body.workspace_id, name: body.workspace_id },
            expires_at: body.expires_at,
            workspaces,
        };
    }
    /** Display name the Bus holds for this key, if it is admitted anywhere. */
    async displayNameFor(event) {
        const response = await this.call("/v1/identity/authenticate", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ auth_event: event }),
        });
        if (!response.ok)
            return null;
        const body = await response.json();
        return body.identity?.display_name ?? null;
    }
    async registerWorkspace(event, input) {
        const response = await this.call("/v1/identity/register-workspace", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                auth_event: event,
                locator: input.locator,
                display_name: input.display_name,
                ...(input.name ? { name: input.name } : {}),
                ...(input.create_directory ? { create_directory: true } : {}),
            }),
        });
        const body = await response.json().catch(() => ({}));
        if (response.status === 201)
            return { kind: "ready", workspace_id: body.workspace_id };
        if (response.status === 202)
            return { kind: "pending", workspace_id: body.workspace_id };
        if (response.status === 422)
            return { kind: "failed", workspace_id: body.workspace_id, reason: body.materialization?.reason ?? "unknown" };
        if (response.status === 401)
            return { kind: "refused", message: "The bus rejected the identity's proof." };
        const error = typeof body.error === "string" ? body.error : `http_${response.status}`;
        return { kind: "invalid", error, message: joinInvalidMessage(error, body.message) };
    }
    // ── host routes ────────────────────────────────────────────────────────────
    async listClients(hostToken) {
        const response = await this.call("/v1/clients", { headers: hostHeaders(hostToken) });
        if (!response.ok)
            throw new Error(`The bus refused to list identities (${response.status}).`);
        return (await response.json()).clients;
    }
    async admit(hostToken, input) {
        const response = await this.call("/v1/identities", {
            method: "POST",
            headers: { ...hostHeaders(hostToken), "content-type": "application/json" },
            body: JSON.stringify(input),
        });
        if (!response.ok)
            throw new Error(`The bus refused to admit the new identity to ${input.workspace_id} (${response.status}).`);
    }
    async revokeIdentity(hostToken, identityId) {
        const response = await this.call(`/v1/clients/${encodeURIComponent(identityId)}`, { method: "DELETE", headers: hostHeaders(hostToken) });
        if (!response.ok)
            throw new Error(`The bus refused to revoke ${identityId} (${response.status}).`);
    }
    async revokeSession(hostToken, identityId, authoritySessionId) {
        const response = await this.call(`/v1/clients/${encodeURIComponent(identityId)}/sessions/${encodeURIComponent(authoritySessionId)}`, { method: "DELETE", headers: hostHeaders(hostToken) });
        if (response.status === 404)
            return false;
        if (!response.ok)
            throw new Error(`The bus refused to revoke the session (${response.status}).`);
        return true;
    }
}
function hostHeaders(token) {
    return { authorization: `Bearer ${token}` };
}
function joinInvalidMessage(error, detail) {
    switch (error) {
        case "workspace_locator_invalid":
            return "That path is not usable. Choose a folder by its full location on this machine.";
        case "workspace_directory_not_found":
            return "That folder does not exist. Choose an existing folder, or ask to create it.";
        default:
            return typeof detail === "string" && detail ? detail : `The folder could not be registered (${error}).`;
    }
}
