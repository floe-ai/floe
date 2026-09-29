/**
 * Open an authenticated channel to the identity agent serving a Floe home. Used
 * by the surface client and by `floe start`/`floe status` to see whether an
 * agent is answering. The mechanism is the shared local channel.
 */
import { ChannelUnavailableError, type Channel } from "../local-channel/connection.js";
export type AgentChannel = Channel;
export { ChannelUnavailableError as AgentUnavailableError };
export declare function openAgentChannel(home: string, surface: string, options?: {
    probe?: boolean;
}): Promise<AgentChannel>;
/**
 * Is an agent answering for this home? Returns its version and state, or null.
 * A probe is not counted as a connected surface, so checking status never
 * extends how long the key stays unlocked.
 */
export declare function probeAgent(home: string): Promise<{
    version: string | null;
    state: Record<string, unknown>;
} | null>;
