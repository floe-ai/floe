import { listSurfaces } from "./surfaces.js";
import { detectPackageSurfaces, globalPackageRoot } from "./surface-manifests.js";
export function buildSurfaceCatalog(configPath, config, packageRoot = globalPackageRoot()) {
    const registry = listSurfaces(configPath, config);
    const detected = detectPackageSurfaces(packageRoot);
    const byName = new Map();
    for (const surface of detected.surfaces) {
        byName.set(surface.name, [...(byName.get(surface.name) ?? []), surface]);
    }
    const surfaces = [];
    const conflicts = [];
    for (const [name, claims] of byName) {
        if (claims.length > 1) {
            conflicts.push({ name, packages: claims.map((c) => c.package).sort() });
            continue;
        }
        const { package: pkg, packageDir: _dir, ...entry } = claims[0];
        surfaces.push({ ...entry, source: { kind: "package", package: pkg } });
    }
    const shadowed = [];
    for (const entry of registry.surfaces) {
        const claims = byName.get(entry.name);
        if (claims) {
            if (claims.length === 1)
                shadowed.push({ name: entry.name, byPackage: claims[0].package });
            continue; // a conflicted name is not rescued by a registry file either
        }
        surfaces.push({ ...entry, source: { kind: "registry" } });
    }
    surfaces.sort((a, b) => a.name.localeCompare(b.name));
    return { surfaces, brokenFiles: registry.broken, brokenManifests: detected.broken, shadowed, conflicts };
}
