/**
 * version-switch — a surface asks Floe to run the newest installed version,
 * without the person typing `floe restart`.
 *
 * The Floe that is running cannot do this itself: it is the older code, and it
 * runs from its own stage. The switch is performed by the copy the surface
 * ships, which is the newer code, using exactly the path `floe restart` uses
 * (restartAll: one start under the start lock, the same foreign-Bus check).
 *
 * Rules:
 * - Only a newer copy may switch: never a downgrade, never a same-version
 *   restart dressed up as an upgrade.
 * - Only this install's Floe is restarted; a foreign Bus is refused.
 * - A turn in progress is never interrupted silently. Without
 *   `interrupt_running_work`, the switch is declined and the running turns are
 *   named. With it, the interrupted turns are named in the result. The check is
 *   made under the start lock, immediately before anything stops. Queued and
 *   waiting work is durable and carries over.
 */
import { type LocalConfig } from "./config.js";
export type RunningTurn = {
    workspace_id: string;
    endpoint_id: string;
    name: string | null;
};
export type VersionSwitchOutcome = {
    kind: "switched";
    from: string | null;
    to: string;
    interrupted: RunningTurn[];
} | {
    kind: "already_serving";
    version: string;
} | {
    kind: "work_running";
    running: RunningTurn[];
    message: string;
} | {
    kind: "refused";
    reason: "not_running" | "would_downgrade" | "not_this_floe" | "unknown_version";
    message: string;
};
export type VersionSwitchOptions = {
    /** Defaults to ~/.floe/config.yaml. */
    configPath?: string;
    /** Switch even though turns are in progress. They are named in the result. */
    interrupt_running_work?: boolean;
};
export type VersionSwitchDependencies = {
    ownVersion(): string | null;
    servingVersion(config: LocalConfig): Promise<{
        running: boolean;
        version: string | null;
    }>;
    isThisFloe(configPath: string, config: LocalConfig): Promise<boolean>;
    runningTurns(config: LocalConfig): Promise<RunningTurn[]>;
    restart(configPath: string, config: LocalConfig, beforeStop: () => Promise<boolean>): Promise<boolean>;
};
export declare const defaultVersionSwitchDependencies: VersionSwitchDependencies;
export declare function switchToThisVersion(options?: VersionSwitchOptions, deps?: VersionSwitchDependencies): Promise<VersionSwitchOutcome>;
/** The Actors mid-turn right now, in every workspace: what a switch would interrupt. */
export declare function runningTurns(options?: {
    configPath?: string;
}): Promise<RunningTurn[]>;
