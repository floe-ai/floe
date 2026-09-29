/**
 * The request/response and push plumbing every surface library on a Floe local
 * channel shares. A library subclasses it, adds its operations, and handles the
 * pushes it defines in onPush.
 */
import type { Channel } from "./connection.js";
import type { ChannelSpec } from "./protocol.js";
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
    onClose(listener: () => void): () => void;
    close(): void;
    /** A message the service pushed that is not a response. */
    protected abstract onPush(message: Record<string, unknown>): void;
    protected request<T = any>(op: string, args: Record<string, unknown>): Promise<T>;
    private receive;
    private handleClose;
}
