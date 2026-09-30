/**
 * `floe/engines` — whether an engine is ready to run work, and signing in
 * without the person typing a command.
 *
 *   import { connectEngines } from "floe/engines";
 *   const engines = await connectEngines({ surface: "my-surface" });
 *   render(engines.state);
 *   engines.onState(render);
 *   engines.onSignIn(renderSignInProgress);
 *   await engines.signIn("copilot"); // the vendor opens its own sign-in window
 *
 * The Bridge pushes every change; a surface never polls. Credentials never
 * reach a surface. The wire protocol is in docs/reference/engine-control-protocol.md.
 */
import { ChannelClient } from "../local-channel/client.js";
export type { RunningTurn, VersionSwitchOutcome } from "../local-channel/client.js";
import { type ChannelConnectOptions } from "../local-channel/connect.js";
import { ChannelUnavailableError, type Channel } from "../local-channel/connection.js";
import { type EngineModels, type EngineState, type SignInEvent, type SignInMode } from "./protocol.js";
export type { EngineAction, EngineModel, EngineModels, EnginePhase, EngineState, EnginesSnapshot, SignInEvent, SignInMode, SignInStatus } from "./protocol.js";
export { ChannelUnavailableError as EnginesUnavailableError };
/** A refusal from engine control, with a stable `code` (see the protocol reference). */
export declare class EnginesError extends Error {
    readonly code: string;
    readonly details: Record<string, unknown>;
    constructor(code: string, message: string, details?: Record<string, unknown>);
}
export type ConnectEnginesOptions = ChannelConnectOptions;
export declare function connectEngines(options: ConnectEnginesOptions): Promise<EnginesClient>;
export declare class EnginesClient extends ChannelClient {
    private engines;
    private readonly stateListeners;
    private readonly signInListeners;
    /** @internal Use connectEngines. */
    constructor(channel: Channel);
    /** Every engine this Floe runs work on, by name. */
    get state(): Record<string, EngineState>;
    /** Called with the full map and the engine that changed, on every change. */
    onState(listener: (state: Record<string, EngineState>, changed: EngineState) => void): () => void;
    /** Progress of every sign-in, from `starting` to `succeeded`, `failed` or `cancelled`. */
    onSignIn(listener: (event: SignInEvent) => void): () => void;
    /** Check an engine again now. The result also arrives through onState. */
    refresh(engine: string): Promise<EngineState>;
    /** The engine's own list of models for the signed-in account, to choose an Actor's model from. */
    models(engine: string): Promise<EngineModels>;
    /** Start the vendor's own sign-in. Progress arrives through onSignIn. */
    signIn(engine: string, options?: {
        mode?: SignInMode;
    }): Promise<{
        operation_id: string;
    }>;
    cancelSignIn(operationId: string): Promise<{
        cancelled: true;
    }>;
    protected onPush(message: Record<string, unknown>): void;
}
