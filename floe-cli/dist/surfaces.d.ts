import { z } from "zod";
import { type LocalConfig } from "./config.js";
/** A typeable, stable id: lowercase, starts alphanumeric, words joined by '-'. */
export declare const SURFACE_NAME: RegExp;
declare const SurfaceEntrySchema: z.ZodObject<{
    name: z.ZodString;
    label: z.ZodString;
    launch: z.ZodObject<{
        command: z.ZodString;
        args: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        command: string;
        args: string[];
    }, {
        command: string;
        args?: string[] | undefined;
    }>;
}, "strict", z.ZodTypeAny, {
    name: string;
    label: string;
    launch: {
        command: string;
        args: string[];
    };
}, {
    name: string;
    label: string;
    launch: {
        command: string;
        args?: string[] | undefined;
    };
}>;
export type SurfaceEntry = z.infer<typeof SurfaceEntrySchema>;
/** A registry file that could not be read as a valid surface, kept visible rather than hidden. */
export type BrokenSurface = {
    file: string;
    reason: string;
};
export declare function surfacesDir(configPath: string, config: LocalConfig): string;
/**
 * Every valid surface on disk, sorted by name, plus any files that failed to
 * parse. Broken entries are surfaced (not silently dropped) because this is
 * configuration a person may have to fix by hand.
 */
export declare function listSurfaces(configPath: string, config: LocalConfig): {
    surfaces: SurfaceEntry[];
    broken: BrokenSurface[];
};
export declare function getSurface(configPath: string, config: LocalConfig, name: string): SurfaceEntry | null;
/**
 * Write (or overwrite) a surface's registry entry. This is the mechanism a
 * surface's own installer calls to self-register; Floe writes exactly what it
 * is told and hardcodes nothing about any particular surface.
 */
export declare function registerSurface(configPath: string, config: LocalConfig, entry: SurfaceEntry): SurfaceEntry;
export declare function removeSurface(configPath: string, config: LocalConfig, name: string): boolean;
/**
 * Hand the terminal to a surface and wait for it to exit. The surface owns the
 * session from here; Floe's job was only to make sure the substrate was up
 * first. Resolves with the surface's exit code so a caller can propagate it.
 *
 * No shell: the command and its arguments are passed as a real argv array, so
 * nothing is re-parsed or needs escaping. The OS resolves an executable (or an
 * interpreter like `node`) from PATH. A surface that is only reachable through
 * a shell shim should register the interpreter or the real executable as its
 * launch command.
 */
/**
 * Appended as the last argument when Floe launches a surface, so the surface can
 * tell a launch from Floe apart from one started by its own command in a folder.
 */
export declare const LAUNCHED_BY_FLOE_ARG = "--launched-by=floe";
export declare function launchSurface(entry: SurfaceEntry): Promise<number>;
export {};
