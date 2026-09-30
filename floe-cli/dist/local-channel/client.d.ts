/**
 * The request/response and push plumbing every surface library on a Floe local
 * channel shares. A library subclasses it, adds its operations, and handles the
 * pushes it defines in onPush.
 */
import type { Channel } from "./connection.js";
import type { ChannelSpec } from "./protocol.js";
import { type RunningTurn, type VersionSwitchOutcome } from "../version-switch.js";
export type { RunningTurn, VersionSwitchOutcome };
export declare abstract class ChannelClient {
    protected readonly channel: Channel;
    private readonly spec;
    private readonly refusal;
    private nextId;
    private readonly pending;
    private readonly closeListeners;
    private closed;
    protected constructor(channel: Channel, spec: ChannelSpec, refusal: (code: string, message: string, details: Record<string, unknown>) => Error);
    /** The Floe version of the process serving this channel. */
    get agentVersion(): string | null;
    /**
     * Set when the serving process is a different Floe version from the copy this
     * surface depends on. Connect-first: it is used as is, never restarted.
     */
    get versionNote(): string | null;
    /**
     * Ask Floe to run this surface's copy, which must be newer than the one
     * serving. It uses the same path as `floe restart`, and it never interrupts a
     * turn in progress unless `interrupt_running_work` is set: otherwise it
     * returns `work_running` naming the turns. After `switched`, this connection
     * has closed; connect again to reach the new version.
     */
    switchToThisVersion(options?: {
        interrupt_running_work?: boolean;
    }): Promise<VersionSwitchOutcome>;
    /** The Actors mid-turn right now, in every workspace: what a switch would interrupt. */
    runningTurns(): Promise<RunningTurn[]>;
    onClose(listener: () => void): () => void;
    close(): void;
    /** A message the service pushed that is not a response. */
    protected abstract onPush(message: Record<string, unknown>): void;
    protected request<T = any>(op: string, args: Record<string, unknown>): Promise<T>;
    private receive;
    private handleClose;
}
