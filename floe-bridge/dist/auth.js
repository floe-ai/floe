/**
 * @invariant This module holds the bridge-side runtime configuration contract.
 * Floe does NOT broker model credentials: the vendor CLI driven by floe-runtime
 * authenticates itself. This module therefore carries only the runtime-config
 * shape passed to an adapter and the runtime auth error taxonomy used for
 * delivery control flow. It must not import any provider SDK.
 */
export class RuntimeAuthError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = "RuntimeAuthError";
    }
}
