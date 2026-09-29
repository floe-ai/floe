export type OperationTarget = Readonly<{
    kind: string;
    id: string;
}>;
export type CliOperationBoundary = Readonly<{
    kind: "host";
}> | Readonly<{
    kind: "workspace";
    workspace_id: string;
}>;
export type OperationConfirmation = Readonly<{
    required: boolean;
    prompt_id: string;
    title: string;
    description: string;
}>;
/** A client projection of the Bus-owned descriptor, not a second definition. */
export type CliOperationDescriptor = Readonly<{
    operation_id: string;
    operation_version: string;
    category: string;
    title: string;
    description: string;
    effects: Readonly<Record<string, unknown>>;
    target: Readonly<Record<string, unknown>>;
    input: Readonly<{
        version: string;
        schema: Readonly<Record<string, unknown>>;
    }>;
    result: Readonly<{
        version: string;
        schema: Readonly<Record<string, unknown>>;
    }>;
    interaction_constraints: Readonly<{
        confirmation?: OperationConfirmation;
        [key: string]: unknown;
    }>;
    availability: Readonly<{
        available: boolean;
        refusal?: unknown;
    }>;
    [key: string]: unknown;
}>;
export type LocalWorkspaceProjection = Readonly<{
    workspace_id: string;
    name: string;
    binding: Readonly<{
        locator: string;
        normalized_locator?: string;
        state?: string;
    }> | null;
}>;
export type DiscoverOperationsInput = Readonly<{
    boundary: CliOperationBoundary;
    query?: string;
    category?: string;
    target?: OperationTarget | null;
}>;
export type InvokeSelectedOperationInput = Readonly<{
    boundary: CliOperationBoundary;
    operation_id: string;
    input: unknown;
    idempotency_key?: string;
    target?: OperationTarget | null;
    expected_resource_revision?: string | null;
    confirm?: (confirmation: OperationConfirmation) => Promise<boolean>;
}>;
export type CliOperationInvocation = Readonly<{
    operation_id: string;
    operation_version: string;
    input_schema_version: string;
    target: OperationTarget | null;
    expected_resource_revision?: string | null;
    idempotency_key: string;
    input: unknown;
}>;
/**
 * Trusted local transport supplied by the native authority broker. It exposes
 * only operation discovery/invocation, never reusable host or Workspace
 * bearer material and never a raw endpoint console.
 */
export interface CliOperationAuthorityBroker {
    listLocalWorkspaces(): Promise<unknown>;
    discoverOperations(input: DiscoverOperationsInput): Promise<unknown>;
    invokeOperation(input: Readonly<{
        boundary: CliOperationBoundary;
        invocation: CliOperationInvocation;
    }>): Promise<unknown>;
    confirmAndInvokeHostOperation(input: Readonly<{
        interaction_session_id: string;
        invocation: CliOperationInvocation;
    }>): Promise<unknown>;
    confirmAndInvokeWorkspaceOperation(input: Readonly<{
        workspace_id: string;
        interaction_session_id: string;
        invocation: CliOperationInvocation;
    }>): Promise<unknown>;
}
export declare class CliAuthorityBrokerUnavailableError extends Error {
    constructor();
}
export declare class UnavailableCliOperationAuthorityBroker implements CliOperationAuthorityBroker {
    listLocalWorkspaces(): Promise<never>;
    discoverOperations(): Promise<never>;
    invokeOperation(): Promise<never>;
    confirmAndInvokeHostOperation(): Promise<never>;
    confirmAndInvokeWorkspaceOperation(): Promise<never>;
}
export type NativeAuthorityCommandRunner = (command: Readonly<Record<string, unknown>>) => Promise<unknown>;
/**
 * CLI adapter over the same one-shot native authority broker packaged with the
 * desktop. The helper opens the OS vault and returns only semantic operation
 * projections/results; reusable host and Workspace credentials never enter
 * this process.
 */
export declare class NativeCliOperationAuthorityBroker implements CliOperationAuthorityBroker {
    private readonly run;
    constructor(run: NativeAuthorityCommandRunner);
    listLocalWorkspaces(): Promise<unknown>;
    discoverOperations(input: DiscoverOperationsInput): Promise<unknown>;
    invokeOperation(input: Readonly<{
        boundary: CliOperationBoundary;
        invocation: CliOperationInvocation;
    }>): Promise<unknown>;
    confirmAndInvokeHostOperation(input: Readonly<{
        interaction_session_id: string;
        invocation: CliOperationInvocation;
    }>): Promise<unknown>;
    confirmAndInvokeWorkspaceOperation(input: Readonly<{
        workspace_id: string;
        interaction_session_id: string;
        invocation: CliOperationInvocation;
    }>): Promise<unknown>;
}
/** The native broker, talking to the Bus at the configured URL. */
export declare function nativeOperationBroker(busHttpBase: string): NativeCliOperationAuthorityBroker;
/**
 * CLI projection over the same Bus-owned semantic operations used by the app
 * and Actors. A native broker owns authentication and sessions; this client
 * handles only discovered descriptors and invocation intent.
 */
export declare class CliOperationClient {
    private readonly broker;
    private readonly interactionSessionId;
    constructor(broker: CliOperationAuthorityBroker, interactionSessionId?: string);
    listLocalWorkspaces(): Promise<LocalWorkspaceProjection[]>;
    discover(input: DiscoverOperationsInput): Promise<CliOperationDescriptor[]>;
    describe(boundary: CliOperationBoundary, operationId: string, target?: OperationTarget | null): Promise<CliOperationDescriptor>;
    invokeSelected(input: InvokeSelectedOperationInput): Promise<unknown>;
}
/**
 * Obtain the Bus host-control credential from the native broker so the CLI can
 * boot the Bus as the trusted native owner the Bus requires at startup.
 *
 * The broker is the sole owner of this credential in the OS keyring. The
 * returned value must be injected into the Bus process environment only and
 * must never be logged, echoed into an error, or written to disk.
 */
export declare function fetchHostControlToken(busHttpBase: string): Promise<string>;
/**
 * The vault key that seals a device-protected identity, scoped to one Floe
 * home. Reading never mints one; `create` does, once. Only the identity agent
 * calls this, and the key never leaves its memory.
 */
export declare function fetchIdentityDeviceKey(home: string, create: boolean): Promise<Uint8Array | null>;
export declare function forgetIdentityDeviceKey(home: string): Promise<boolean>;
/**
 * Obtain the ephemeral Bridge service credential from the native broker so the
 * CLI can boot the Bridge as an authenticated transport peer of the Bus.
 *
 * The Bus is the sole issuer and its mint route is host-control authenticated,
 * so the broker (the only host-control owner) obtains the credential on the
 * same trust path as the host-control token. The returned value must be
 * injected into the Bridge process environment only and never logged or
 * persisted.
 */
export declare function fetchBridgeServiceToken(bridgeId: string, busHttpBase: string): Promise<string>;
/**
 * Register the current directory as a local Workspace and select it, through
 * the native broker. Registration is a host-control bootstrap route, so the CLI
 * authenticates through the broker rather than an unauthenticated HTTP call.
 */
export declare function registerLocalWorkspaceViaBroker(locator: string, initAuthorized: boolean, busHttpBase: string): Promise<{
    workspace_id: string;
    name: string;
}>;
export declare function selectLocalWorkspace(workspaces: readonly LocalWorkspaceProjection[], explicitWorkspaceId: string | undefined, cwd?: string): LocalWorkspaceProjection;
