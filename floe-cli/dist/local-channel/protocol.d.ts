export declare const PROTOCOL_VERSION = 1;
export declare const MAX_LINE_BYTES: number;
export type ChannelSpec = {
    /** Short name. The pipe name and the proof label derive from it. */
    name: string;
    /** How a message to a person names the service, e.g. "Floe's identity agent". */
    label: string;
    /** Run file name inside <home>/run. */
    runFile: string;
    /** Unix socket name inside <home>/run (not used on Windows). */
    socketFile: string;
};
/** The home as the run file and the pipe name see it: absolute, case-folded on Windows. */
export declare function canonicalHome(home: string): string;
export declare function channelAddress(spec: ChannelSpec, home: string): string;
export declare function runDir(home: string): string;
export declare function channelRunFilePath(spec: ChannelSpec, home: string): string;
export type RunFile = {
    protocol: number;
    pid: number;
    version: string | null;
    address: string;
    secret: string;
    started_at: string;
};
export declare function newChannelSecret(): string;
/** The run directory holds the run files and, off Windows, the sockets. */
export declare function ensureRunDir(home: string): void;
export declare function writeChannelRunFile(spec: ChannelSpec, home: string, run: RunFile): void;
export declare function readChannelRunFile(spec: ChannelSpec, home: string): RunFile | null;
export declare function newNonce(): string;
export declare function channelProof(spec: ChannelSpec, secret: string, role: "agent" | "client", nonce: string): string;
export declare function proofMatches(expected: string, received: unknown): boolean;
/** Split a byte stream into JSON messages. Calls onError for oversize or bad JSON. */
export declare function lineReader(onMessage: (message: Record<string, unknown>) => void, onError: (reason: string) => void): (chunk: Buffer | string) => void;
export declare function frame(message: unknown): string;
