import { readFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { CliOperationClient, selectLocalWorkspace, } from "./operation-client.js";
export function registerOperationsCommand(program, dependencies) {
    const operations = program
        .command("operations")
        .description("Discover and use Floe's canonical semantic operations");
    addCommonOptions(operations
        .command("list")
        .description("List operations allowed by the current Floe authority"))
        .option("--query <text>", "find operations by outcome or name")
        .option("--category <category>", "limit operations to one Bus category")
        .option("--json", "print the exact Bus descriptor projection")
        .action(async (options) => {
        const client = createClient(dependencies);
        const boundary = await resolveBoundary(client, options, dependencies);
        const target = parseTarget(options);
        const descriptors = await client.discover({
            boundary,
            query: options.query,
            category: options.category,
            target,
        });
        write(dependencies, options.json
            ? JSON.stringify({ operations: descriptors }, null, 2)
            : formatOperationList(descriptors));
    });
    addCommonOptions(operations
        .command("describe")
        .argument("<operation-id>", "exact semantic operation id")
        .description("Show one live Bus-owned operation contract"))
        .action(async (operationId, options) => {
        const client = createClient(dependencies);
        const boundary = await resolveBoundary(client, options, dependencies);
        const descriptor = await client.describe(boundary, operationId, parseTarget(options));
        write(dependencies, JSON.stringify(descriptor, null, 2));
    });
    addCommonOptions(operations
        .command("invoke")
        .argument("<operation-id>", "exact semantic operation id")
        .description("Invoke one discovered operation using JSON intent"))
        .requiredOption("--input <json-or-@file>", "JSON operation intent, or @path to a JSON file")
        .option("--idempotency-key <key>", "stable key so a retry of a write is safe to replay; reads do not need one")
        .option("--expected-revision <revision>", "expected target revision for compare-and-swap")
        .action(async (operationId, options) => {
        const client = createClient(dependencies);
        const boundary = await resolveBoundary(client, options, dependencies);
        const result = await client.invokeSelected({
            boundary,
            operation_id: operationId,
            input: parseJsonIntent(options.input, dependencies.read_file),
            ...(options.idempotencyKey !== undefined
                ? { idempotency_key: options.idempotencyKey }
                : {}),
            target: parseTarget(options),
            ...(options.expectedRevision !== undefined
                ? { expected_resource_revision: options.expectedRevision }
                : {}),
            confirm: dependencies.confirm ?? confirmInTerminal,
        });
        write(dependencies, JSON.stringify(result, null, 2));
    });
}
function addCommonOptions(command) {
    return command
        .option("--workspace <workspace-id>", "use an exact attached Workspace identity")
        .option("--host", "use local host authority instead of a Workspace")
        .option("--target-kind <kind>", "target resource kind from the discovered contract")
        .option("--target-id <id>", "target resource identity from the discovered contract");
}
async function resolveBoundary(client, options, dependencies) {
    if (options.host) {
        if (options.workspace)
            throw new Error("Use either --host or --workspace, not both.");
        return { kind: "host" };
    }
    const workspaces = await client.listLocalWorkspaces();
    const workspace = selectLocalWorkspace(workspaces, options.workspace, dependencies.cwd?.() ?? process.cwd());
    return { kind: "workspace", workspace_id: workspace.workspace_id };
}
export function parseTarget(options) {
    if (Boolean(options.targetKind) !== Boolean(options.targetId)) {
        throw new Error("--target-kind and --target-id must be supplied together.");
    }
    return options.targetKind && options.targetId
        ? { kind: options.targetKind, id: options.targetId }
        : null;
}
export function parseJsonIntent(value, readFile = (path) => readFileSync(path, "utf8")) {
    const source = value.startsWith("@")
        ? readFile(value.slice(1))
        : value;
    if (!source.trim())
        throw new Error("Operation input must contain JSON intent.");
    try {
        return JSON.parse(source);
    }
    catch (error) {
        throw new Error(`Operation input is not valid JSON: ${error.message}`);
    }
}
export function formatOperationList(descriptors) {
    if (descriptors.length === 0)
        return "No matching semantic operations are available.";
    return descriptors.map((descriptor) => {
        const effect = typeof descriptor.effects.mode === "string" ? descriptor.effects.mode : "unknown";
        const availability = descriptor.availability.available
            ? "available"
            : refusalMessage(descriptor.availability.refusal);
        return `${descriptor.operation_id} | ${descriptor.category} | ${effect} | ${availability}\n  ${descriptor.title}`;
    }).join("\n");
}
export async function confirmInTerminal(confirmation) {
    const rl = createInterface({ input: stdin, output: stdout });
    try {
        stdout.write(`\n${confirmation.title}\n${confirmation.description}\n`);
        const answer = (await rl.question("Continue? [y/N] ")).trim().toLowerCase();
        return answer === "y" || answer === "yes";
    }
    finally {
        rl.close();
    }
}
function createClient(dependencies) {
    return dependencies.client?.() ?? new CliOperationClient();
}
function write(dependencies, message) {
    (dependencies.output ?? console.log)(message);
}
function refusalMessage(value) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
        const message = value.message;
        if (typeof message === "string" && message)
            return `unavailable: ${message}`;
    }
    return "unavailable";
}
