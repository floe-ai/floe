export declare const PROTOCOL_VERSION = 1;
export declare const MAX_LINE_BYTES: number;
/** The home as the vault and the pipe name see it: absolute, case-folded on Windows. */
export declare function canonicalHome(home: string): string;
export declare function agentAddress(home: string): string;
export declare function runDir(home: string): string;
export declare function runFilePath(home: string): string;
export type RunFile = {
    protocol: number;
    pid: number;
    version: string | null;
    address: string;
    secret: string;
    started_at: string;
};
export declare function newAgentSecret(): string;
export declare function writeRunFile(home: string, run: RunFile): void;
export declare function readRunFile(home: string): RunFile | null;
export declare function newNonce(): string;
export declare function proof(secret: string, role: "agent" | "client", nonce: string): string;
export declare function proofMatches(expected: string, received: unknown): boolean;
/** Split a byte stream into JSON messages. Calls onError for oversize or bad JSON. */
export declare function lineReader(onMessage: (message: Record<string, unknown>) => void, onError: (reason: string) => void): (chunk: Buffer | string) => void;
export declare function frame(message: unknown): string;
