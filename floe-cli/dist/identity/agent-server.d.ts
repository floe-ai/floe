import { type IdentityAgent } from "./agent.js";
export type AgentServer = {
    address: string;
    close(): Promise<void>;
};
export declare class AgentAddressInUseError extends Error {
    readonly address: string;
    constructor(address: string);
}
export declare function serveAgent(agent: IdentityAgent, options: {
    home: string;
    log?: (line: string) => void;
    secret?: string;
}): Promise<AgentServer>;
