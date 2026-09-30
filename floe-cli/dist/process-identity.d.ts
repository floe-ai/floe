export type ProcessDescription = {
    /** When the operating system says this process started; null if it does not say. */
    started_at: Date | null;
    command_line: string;
};
/** Whether any process holds this pid. Says nothing about which process it is. */
export declare function isPidRunning(pid: number): boolean;
/** The start time and command line of the process holding `pid`, or null if none can be read. */
export declare function describeProcess(pid: number): ProcessDescription | null;
