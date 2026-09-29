import { type ChannelSpec } from "./protocol.js";
/** One connected surface, as the service sees it. */
export interface ChannelPeer {
    readonly surface: string;
    send(message: Record<string, unknown>): void;
}
/** What a service provides to be served on a channel. */
export interface ChannelService<P extends ChannelPeer = ChannelPeer> {
    readonly version: string | null;
    /** Carried by the welcome message. */
    state(): unknown;
    attach(peer: P): void;
    detach(peer: P): void;
    handle(peer: P, op: string, args: Record<string, unknown>): Promise<unknown>;
}
export type ChannelServer = {
    address: string;
    close(): Promise<void>;
};
export declare class ChannelAddressInUseError extends Error {
    readonly address: string;
    constructor(address: string, label?: string);
}
export declare function serveChannel(spec: ChannelSpec, service: ChannelService, options: {
    home: string;
    log?: (line: string) => void;
    secret?: string;
}): Promise<ChannelServer>;
/** A refusal a service raises on purpose: a stable code, a safe message, optional details. */
export declare class ChannelError extends Error {
    readonly code: string;
    readonly details: Record<string, unknown>;
    constructor(code: string, message: string, details?: Record<string, unknown>);
}
