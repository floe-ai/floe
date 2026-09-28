export declare const STAGE_MANIFEST = "stage.json";
export type StageManifest = {
    kind: "floe-stage";
    version: string | null;
    /** The installed package directory this stage snapshots. */
    source: string;
    /** The package whose node_modules held that copy, when it was a dependency. */
    dependency_of: string | null;
    /** Directory the mirrored tree is relative to. */
    root: string;
    created_at: string;
};
export type Stage = {
    dir: string;
    manifest: StageManifest;
    /** Map a file inside the snapshotted closure to its staged path. */
    map(path: string): string;
};
export type StageSource = {
    packageDir: string;
    version: string | null;
    dependencyOf: string | null;
};
/** Whether this copy runs from an npm install (and so must stage) rather than a checkout. */
export declare function isNpmInstalled(packageDir: string): boolean;
export declare function runtimeDir(home: string): string;
/** The package and every package it can load at runtime, as real directories. */
export declare function dependencyClosure(packageDir: string): string[];
/** Create (or reuse) the stage for this copy of Floe. */
export declare function ensureStage(home: string, source: StageSource): Promise<Stage>;
/**
 * The stage a module path runs from, if any: the nearest ancestor holding a
 * stage manifest with a `tree` beside it that contains the path.
 */
export declare function stageOf(path: string): StageManifest | null;
/**
 * Remove stages nothing runs from. `inUse` holds paths live services run from;
 * a stage containing any of them, or the current stage, is kept. Removal that
 * fails means a process still holds it; the next start tries again.
 */
export declare function pruneStages(home: string, keep: string, inUse: readonly string[]): string[];
