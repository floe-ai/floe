import { type SurfaceEntry } from "./surfaces.js";
export type PackageSurface = SurfaceEntry & {
    package: string;
    packageDir: string;
};
export type BrokenManifest = {
    package: string;
    reason: string;
};
/** The global node_modules directory, or null when npm cannot say. */
export declare function globalPackageRoot(): string | null;
/** Surfaces declared by packages installed under `root`, plus declarations that are malformed. */
export declare function detectPackageSurfaces(root: string | null): {
    surfaces: PackageSurface[];
    broken: BrokenManifest[];
};
