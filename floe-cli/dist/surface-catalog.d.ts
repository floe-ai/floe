/**
 * surface-catalog — the one list of surfaces `floe` offers, merged from two
 * sources:
 *
 *   1. installed packages that declare `floe.surface` in their package.json;
 *   2. registry files under <floe home>/surfaces (surfaces that are not packages).
 *
 * Rule when both describe the same name: the installed package wins. A package
 * manifest describes what is actually installed right now; a registry file is a
 * record written earlier that can go stale (the same reason start-at-login is
 * read from the OS rather than recorded). The shadowed file is kept visible in
 * `floe surface list`, not silently hidden.
 *
 * Two installed packages claiming the same name are ambiguous, so neither is
 * offered and the conflict is reported — Floe does not guess.
 */
import type { LocalConfig } from "./config.js";
import { type BrokenSurface, type SurfaceEntry } from "./surfaces.js";
import { type BrokenManifest } from "./surface-manifests.js";
export type SurfaceSource = {
    kind: "package";
    package: string;
} | {
    kind: "registry";
};
export type CatalogSurface = SurfaceEntry & {
    source: SurfaceSource;
};
export type SurfaceCatalog = {
    surfaces: CatalogSurface[];
    /** Registry files unreadable as a surface. */
    brokenFiles: BrokenSurface[];
    /** Packages whose `floe.surface` declaration is malformed. */
    brokenManifests: BrokenManifest[];
    /** Registry entries hidden because an installed package declares the same name. */
    shadowed: {
        name: string;
        byPackage: string;
    }[];
    /** Names claimed by more than one installed package; none of them is offered. */
    conflicts: {
        name: string;
        packages: string[];
    }[];
};
export declare function buildSurfaceCatalog(configPath: string, config: LocalConfig, packageRoot?: string | null): SurfaceCatalog;
