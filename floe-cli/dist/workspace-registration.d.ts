/**
 * @invariant A folder Floe registers belongs to the person signed in on this
 * machine: when the identity agent holds an identity that can act without a
 * prompt, registration goes through it, so that person is admitted and their
 * access is what the Workspace's Actors act with. With nobody signed in, the
 * folder is registered through the host broker and the CLI says plainly that
 * its Actors have no access until a person joins.
 */
import { type IdentityClient, type IdentityState } from "./identity/client.js";
export declare const NO_PERSON_NOTE: string;
type Dependencies = Readonly<{
    connect: () => Promise<IdentityClient>;
    register_via_broker: (locator: string) => Promise<unknown>;
    log: (line: string) => void;
}>;
export type FolderRegistration = Readonly<{
    as: "person";
    display_name: string;
    workspace_id: string;
} | {
    as: "host";
}>;
/** True when the held identity can sign for the person without asking them anything. */
export declare function canActWithoutPrompt(state: IdentityState): state is Exclude<IdentityState, {
    kind: "none";
}>;
export declare function registerFolder(locator: string, deps: Dependencies): Promise<FolderRegistration>;
/** The production wiring: the identity agent is never started just to register a folder. */
export declare function defaultRegistrationDependencies(configPath: string | undefined, busHttpBase: string): Dependencies;
export {};
