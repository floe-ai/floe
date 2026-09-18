/** Structured runtime failure surfaced by the bridge through the originating Context. */
export class TurnFailedError extends Error {
    delivery_id;
    source_endpoint_id;
    workspace_id;
    context_id;
    thread_id;
    model_id;
    provider;
    http_status;
    code = "turn_failed";
    constructor(delivery_id, source_endpoint_id, workspace_id, context_id, thread_id, model_id, provider, http_status, message) {
        super(message);
        this.delivery_id = delivery_id;
        this.source_endpoint_id = source_endpoint_id;
        this.workspace_id = workspace_id;
        this.context_id = context_id;
        this.thread_id = thread_id;
        this.model_id = model_id;
        this.provider = provider;
        this.http_status = http_status;
        this.name = "TurnFailedError";
    }
}
