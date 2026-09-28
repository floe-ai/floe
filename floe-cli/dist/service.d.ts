/** How the running CLI re-invokes itself unattended. `command` is the node
 *  binary; `prefixArgs` are the args that reproduce "run this CLI" — the node
 *  exec args (e.g. `--import tsx` when run from source) followed by the entry
 *  script; `workingDirectory` is where it runs, so bare module specifiers (the
 *  entry's imports and any `--import` loader) resolve against node_modules. */
export interface CliInvocation {
    command: string;
    prefixArgs: string[];
    workingDirectory: string;
}
/** The default Windows Scheduled Task name. Overridable so tests use a throwaway. */
export declare const WINDOWS_TASK_NAME = "FloeSubstrate";
export interface ServiceStatus {
    platform: NodeJS.Platform;
    /** Is an auto-start mechanism actually built for this platform? */
    supported: boolean;
    /** Is Floe currently installed to auto-start? */
    installed: boolean;
    detail: string;
}
export interface ServiceResult {
    ok: boolean;
    message: string;
}
export declare function serviceStatus(taskName?: string): ServiceStatus;
export declare function installService(configPath: string, cli: CliInvocation, taskName?: string): ServiceResult;
export declare function uninstallService(taskName?: string): ServiceResult;
/**
 * A per-user logon task that runs the CLI directly, in its own directory so
 * bare module specifiers resolve. LeastPrivilege + InteractiveToken means it
 * needs no administrator rights; it runs as the logged-in person, exactly as
 * if they had typed `floe start` themselves.
 */
export declare function buildWindowsTaskXml(account: string, command: string, argumentLine: string, workingDirectory: string): string;
