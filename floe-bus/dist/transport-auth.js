/** One verifier for HTTP and WebSocket transports. Request content is absent. */
export class BusTransportAuthenticator {
    store;
    constructor(store) {
        this.store = store;
    }
    authenticateHostControl(bearerToken) {
        const verified = this.store.transportCredentialStore.verifyHostControlBearerToken(bearerToken);
        if (!verified.verified || verified.credential.audience !== "host_control")
            return denied();
        if (verified.credential.host_id !== this.store.localHostId)
            return denied();
        return {
            verified: true,
            authority: {
                audience: "host_control",
                host_id: verified.credential.host_id,
                credential_id: verified.credential.transport_credential_id,
            },
        };
    }
    authenticateBridgeService(bearerToken) {
        const verified = this.store.transportCredentialStore.verifyBridgeServiceBearerToken(bearerToken);
        if (!verified.verified || verified.credential.audience !== "bridge_service")
            return denied();
        return {
            verified: true,
            authority: {
                audience: "bridge_service",
                bridge_id: verified.credential.bridge_id,
                host_id: verified.credential.host_id,
                credential_id: verified.credential.transport_credential_id,
            },
        };
    }
    authenticateWorkspaceOperation(bearerToken, workspaceId) {
        const verified = this.store.operationAuthorityVerifier.verifyBearerToken(bearerToken, {
            boundary: { kind: "workspace", workspace_id: workspaceId },
        });
        if (!verified.verified)
            return denied();
        return {
            verified: true,
            authority: {
                audience: "workspace_operation",
                workspace_id: workspaceId,
                authority_session_id: verified.authority_session_id,
                verification: verified,
            },
        };
    }
}
export function parseBearerHeader(authorization) {
    const match = /^Bearer\s+([^\s]+)$/i.exec(authorization ?? "");
    return match?.[1] ?? "";
}
function denied() {
    return {
        verified: false,
        code: "transport_auth_required",
        message: "The transport credential was not accepted.",
    };
}
