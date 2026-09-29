/**
 * Open an authenticated connection to a Floe local channel: connect to its
 * fixed address and run the mutual proof (protocol.ts).
 */
import { type Socket } from "node:net";
import { type ChannelSpec } from "./protocol.js";
export type Channel = {
    socket: Socket;
    /** The Floe version of the process serving the channel. */
    agentVersion: string | null;
    /** The state carried by the welcome message. */
    welcomeState: Record<string, unknown>;
    /** Replace the message handler once the handshake is complete. */
    onMessage(handler: (message: Record<string, unknown>) => void): void;
    send(message: unknown): void;
};
export declare class ChannelUnavailableError extends Error {
    readonly reason: "not_running" | "refused" | "impostor";
    constructor(reason: "not_running" | "refused" | "impostor", message: string);
}
export declare function openChannel(spec: ChannelSpec, home: string, surface: string, options?: {
    probe?: boolean;
}): Promise<Channel>;
/**
 * Is the service answering for this home? Returns its version and state, or
 * null. A probe proves itself like any client but is not attached as a surface.
 */
export declare function probeChannel(spec: ChannelSpec, home: string): Promise<{
    version: string | null;
    state: Record<string, unknown>;
} | null>;
