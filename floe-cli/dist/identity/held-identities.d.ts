import { type IdentityFile } from "./identity-file.js";
export declare const CURRENT_IDENTITY_ID = "current";
export type HeldIdentity = {
    /** `current`, or `set-aside-<when>` for one set aside. */
    id: string;
    current: boolean;
    file_name: string;
    /** Null when the file cannot be read; it can still be deleted. */
    file: IdentityFile | null;
    set_aside_at: string | null;
};
export declare function listHeldIdentities(home: string): HeldIdentity[];
export declare function findHeldIdentity(home: string, id: string): HeldIdentity | null;
/** Delete one identity file for good, with any half-written copy of the current one. */
export declare function deleteHeldIdentityFile(home: string, entry: HeldIdentity): void;
/** Does any identity still held need the device key to open? An unreadable one might, so it counts. */
export declare function anyNeedsDeviceKey(home: string): boolean;
