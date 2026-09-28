import type { LocalConfig } from "./config.js";
export type ServiceName = "bus" | "bridge" | "identity";
/** Start order; stop in reverse. */
export declare const SERVICE_NAMES: readonly ServiceName[];
type ServiceRecord = {
    pid: number;
    started_at: string;
    command: string;
    args: string[];
    log_file: string;
    /** Identity of this exact process, echoed by the bus at /health (bus only). */
    instance_id?: string;
};
type ServiceRecords = Partial<Record<ServiceName, ServiceRecord>>;
export declare function recordsPath(configPath: string, config: LocalConfig): string;
export declare function readRecords(configPath: string, config: LocalConfig): ServiceRecords;
export declare function writeRecords(configPath: string, config: LocalConfig, records: ServiceRecords): void;
export declare function serviceLogPath(configPath: string, config: LocalConfig, service: ServiceName): string;
export declare function isPidRunning(pid: number): boolean;
export declare function serviceEntry(service: ServiceName): string;
export declare function startService(configPath: string, config: LocalConfig, service: ServiceName, extraEnv?: Readonly<Record<string, string>>, instanceId?: string): Promise<ServiceRecord>;
export declare function stopService(configPath: string, config: LocalConfig, service: ServiceName): boolean;
export declare function clearRecords(configPath: string, config: LocalConfig): void;
export {};
