/**
 * Watches which turns are executing across every workspace on this host, by
 * push: one host-control Bus stream, the Bus's `running_turns_changed` push on
 * every change, and one snapshot read after the stream is live so nothing that
 * changed while it opened is missed. No polling and no hidden reconnect: when
 * the stream ends, the watcher reports it and stops.
 */
import type { RunningTurn } from "../version-switch.js";
export type RunningTurnsWatch = {
    close(): void;
};
export type RunningTurnsListener = {
    running(turns: RunningTurn[]): void;
    /** The stream ended or could not start; the watch is over. */
    ended(reason: string): void;
};
export type WatchRunningTurns = (listener: RunningTurnsListener) => RunningTurnsWatch;
type SocketLike = {
    send(data: string): void;
    close(): void;
    addEventListener(type: string, fn: (event: any) => void): void;
};
export declare function busRunningTurnsWatcher(options: {
    busUrl: string;
    hostToken: () => Promise<string>;
    fetch?: typeof fetch;
    socket?: (url: string) => SocketLike;
}): WatchRunningTurns;
export {};
