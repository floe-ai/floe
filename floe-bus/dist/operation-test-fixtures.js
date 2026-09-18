import { InMemoryOperationInvocationLedger, SemanticOperationRegistry, } from "./operations.js";
/** Unit-only governance proof. Production Bus construction cannot omit governance. */
export const ALLOWING_TEST_OPERATION_GOVERNANCE = {
    prepare: (input) => {
        const common = {
            evidence: {
                policy_evaluation_id: "policy_evaluation:test-allow",
                approval_request_ids: [],
                approval_receipt_ids: [],
                budget_reservation_id: null,
            },
            audit_ref: null,
            canonical_provenance: input.provenance,
        };
        return input.pre_effect_refusal
            ? { ...common, state: "refused", refusal: input.pre_effect_refusal }
            : { ...common, state: "authorized" };
    },
    settle: () => undefined,
    recover: () => undefined,
};
export function createTestOperationRegistry(validator, ledger = new InMemoryOperationInvocationLedger()) {
    return new SemanticOperationRegistry(validator, ledger, ALLOWING_TEST_OPERATION_GOVERNANCE);
}
