type CliFailureOptions = Readonly<{
    argv: readonly string[];
    debug: boolean;
}>;
export type CliFailureReport = Readonly<{
    summary: string;
    nextAction: string;
    logFile: string;
    debugDetail: string | null;
}>;
/**
 * The caller's own mistake (bad input, conflicting flags, an unknown name).
 * Its message is written for the person and is always shown verbatim.
 */
export declare class CliRequestError extends Error {
    readonly nextAction: string;
    constructor(message: string, nextAction?: string);
}
export declare function reportCliFailure(error: unknown, options: CliFailureOptions): CliFailureReport;
export declare function printCliFailure(report: CliFailureReport): void;
export {};
