export type Installation = {
    /** Directory of the package this copy shipped in. */
    packageDir: string;
    version: string | null;
    /** The package whose node_modules holds this copy, when it is a dependency. */
    dependencyOf: string | null;
};
/** Classify a package directory by its location. Exported for tests. */
export declare function classifyPackageDir(packageDir: string): Installation;
export declare function thisInstallation(): Installation;
export declare function directInstallRequiredMessage(installation: Installation): string;
