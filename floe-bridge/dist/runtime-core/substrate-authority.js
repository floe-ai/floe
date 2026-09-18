/**
 * Return a valid operation-authority session for the active Delivery, issuing
 * or refreshing it from the Bus when the cached one is missing or within one
 * minute of expiry. Throws when no Delivery is bound or when the Bus returns a
 * different immutable processing contract for the same Delivery.
 */
export async function requireOperationAuthority(bus, turn) {
    if (!turn.delivery_id) {
        throw new Error("No active Delivery is bound to this substrate tool call.");
    }
    let session = turn.operation_authority_session;
    const expiresAt = session ? Date.parse(session.expires_at) : Number.NaN;
    if (!session || !Number.isFinite(expiresAt) || expiresAt <= Date.now() + 60_000) {
        const prepared = await bus.prepareRuntimeDelivery(turn.delivery_id);
        if (turn.processing_contract_id
            && prepared.processing_contract.processing_contract_id !== turn.processing_contract_id) {
            throw new Error("Runtime preparation returned a different immutable processing contract for the active Delivery.");
        }
        session = prepared.operation_authority_session;
        turn.operation_authority_session = session;
        turn.processing_contract_id = prepared.processing_contract.processing_contract_id;
    }
    return session;
}
