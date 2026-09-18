/** Bus adapter for cross-record Context and decision-Event guarantees. */
export class BusApprovalOperationBackend {
    bus;
    store;
    constructor(bus) {
        this.bus = bus;
        this.store = bus.approvalStore;
    }
    contextBelongsToWorkspace(contextId, workspaceId) {
        const context = this.bus.contextStore.getContext(contextId);
        return Boolean(context
            && context.workspace_id === workspaceId
            && context.lifecycle_state === "active");
    }
    createRequest(input) {
        return this.bus.createApprovalRequest(input);
    }
    decideRequest(input) {
        return this.bus.decideApprovalRequest(input);
    }
    configureResponse(input) {
        return this.bus.configureApprovalResponse(input);
    }
}
