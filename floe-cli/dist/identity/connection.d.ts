/**
 * Open an authenticated channel to the identity agent serving a Floe home:
 * connect to its fixed address, and run the mutual proof (protocol.ts). Used by
 * the surface client and by `floe start`/`floe status` to see whether an agent
 * is answering.
 */
import { type Socket } from "node:net";
export type AgentChannel = {
    socket: Socket;
    agentVersion: string | null;
    /** The state carried by the welcome message. */
    welcomeState: Record<string, unknown>;
    /** Replace the message handler once the handshake is complete. */
    onMessage(handler: (message: Record<string, unknown>) => void): void;
    send(message: unknown): void;
};
export declare class AgentUnavailableError extends Error {
    readonly reason: "not_running" | "refused" | "impostor";
    constructor(reason: "not_running" | "refused" | "impostor", message: string);
}
export declare function openAgentChannel(home: string, surface: string, options?: {
    probe?: boolean;
}): Promise<AgentChannel>;
/**
 * Is an agent answering for this home? Returns its version and state, or null.
 * A probe proves itself like any client but is not counted as a connected
 * surface, so checking status never extends how long the key stays unlocked.
 */
export declare function probeAgent(home: string): Promise<{
    version: string | null;
    state: Record<string, unknown>;
} | null>;
