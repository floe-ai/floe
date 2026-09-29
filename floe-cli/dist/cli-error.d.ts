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
export declare function reportCliFailure(error: unknown, options: CliFailureOptions): CliFailureReport;
export declare function printCliFailure(report: CliFailureReport): void;
export {};
