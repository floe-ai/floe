export declare class StartInProgressError extends Error {
    readonly home: string;
    readonly code: "E_START_IN_PROGRESS";
    constructor(home: string);
}
/** Run `start` while holding this home's start lock, waiting for any other start first. */
export declare function withStartLock<T>(home: string, start: () => Promise<T>, waitLimitMs?: number): Promise<T>;
