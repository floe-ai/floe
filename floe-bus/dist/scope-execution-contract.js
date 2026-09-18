export function scopeExecutionStateRevision(execution) {
    return [execution.revision_id, execution.state_revision, execution.status,
        execution.completed_at ?? "", execution.cancelled_at ?? ""].join(":");
}
export function nodeExecutionStateRevision(node) {
    return [node.revision_id, node.state_revision, node.status,
        node.completed_at ?? "", node.cancelled_at ?? ""].join(":");
}
