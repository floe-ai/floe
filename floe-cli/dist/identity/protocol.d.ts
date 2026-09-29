/**
 * The identity agent's local channel. The mechanism (address, run file, mutual
 * proof, framing) is the shared Floe local channel (../local-channel/protocol.ts);
 * this names the identity agent's instance of it.
 */
import { type ChannelSpec, type RunFile } from "../local-channel/protocol.js";
export { MAX_LINE_BYTES, PROTOCOL_VERSION, canonicalHome, ensureRunDir, frame, lineReader, newChannelSecret as newAgentSecret, newNonce, proofMatches, runDir, type RunFile, } from "../local-channel/protocol.js";
export declare const IDENTITY_CHANNEL: ChannelSpec;
export declare function agentAddress(home: string): string;
export declare function runFilePath(home: string): string;
export declare function writeRunFile(home: string, run: RunFile): void;
export declare function readRunFile(home: string): RunFile | null;
export declare function proof(secret: string, role: "agent" | "client", nonce: string): string;
