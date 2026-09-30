/**
 * Is the process a service record names still the service Floe started?
 *
 * A pid is not an identity: after a reboot Windows may hand a recorded pid to
 * an unrelated program. So a record is trusted only on proof, strongest first:
 * - the service answers as itself: the Bus echoes the instance id it was
 *   started with, and the Bridge and identity agent answer their channel
 *   (proving the run-file secret) from the recorded pid;
 * - otherwise the operating system confirms the recorded pid is the same
 *   process: it started no later than the record, with the recorded command.
 * Anything else is "not_ours": treated as not running, and never stopped.
 */
import type { LocalConfig } from "./config.js";
export type RecordedService = {
    pid: number;
    started_at: string;
    command: string;
    args: string[];
    instance_id?: string;
};
/**
 * - "answering": the service answered as itself from the recorded process.
 * - "silent": the recorded process is provably the one Floe started, but it is not answering.
 * - "not_ours": nothing proves the recorded pid is still Floe's service.
 */
export type ServiceOwnership = "answering" | "silent" | "not_ours";
export declare function recordedServiceOwnership(configPath: string, config: LocalConfig, service: "bus" | "bridge" | "identity", record: RecordedService): Promise<ServiceOwnership>;
/** The recorded pid started no later than the record says, running the recorded command. */
export declare function operatingSystemConfirms(record: RecordedService): boolean;
