/**
 * Trusted, versioned core implementations. The child receives no source code,
 * shell text, filesystem path, environment credential, or downstream target.
 */
const CORE_IMPLEMENTATIONS = Object.freeze({
    "core.command.echo": Object.freeze({
        revision: "1",
        entry_point: "echo",
        run(contract) {
            const output = contract.outputs.ports[0];
            if (!output)
                return { outputs: {}, resource_use: { "command.invocation": 1 } };
            return {
                outputs: {
                    [output.name]: [{
                            value: contract.arguments,
                            content: { input: contract.arguments },
                            artefact_version_ids: [],
                        }],
                },
                resource_use: { "command.invocation": 1 },
            };
        },
    }),
});
export function coreCommandImplementationAvailable(input) {
    const implementation = CORE_IMPLEMENTATIONS[input.implementation_id];
    return Boolean(implementation
        && implementation.revision === input.implementation_revision
        && implementation.entry_point === input.entry_point);
}
export function runIsolatedCommandHostChild() {
    if (typeof process.send !== "function") {
        throw new Error("The isolated Command host requires an authenticated parent IPC channel.");
    }
    process.send({ type: "ready", command_host_protocol: 1 });
    process.on("message", (raw) => {
        const message = raw;
        if (message.type !== "invoke" || typeof message.request_id !== "string")
            return;
        try {
            if (typeof message.implementation_id !== "string"
                || typeof message.implementation_revision !== "string"
                || typeof message.entry_point !== "string"
                || !message.contract) {
                throw commandHostError("command_host_request_invalid", "The Command host request is incomplete.");
            }
            const implementation = CORE_IMPLEMENTATIONS[message.implementation_id];
            if (!implementation
                || implementation.revision !== message.implementation_revision
                || implementation.entry_point !== message.entry_point) {
                throw commandHostError("command_implementation_unavailable", "The exact core Command implementation is not installed in this host.");
            }
            const result = implementation.run(message.contract);
            process.send?.({ type: "response", request_id: message.request_id, ok: true, result });
        }
        catch (error) {
            process.send?.({
                type: "response",
                request_id: message.request_id,
                ok: false,
                error: {
                    code: typeof error.code === "string"
                        ? error.code
                        : "command_host_failed",
                    message: error instanceof Error ? error.message : String(error),
                },
            });
        }
    });
}
function commandHostError(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
}
