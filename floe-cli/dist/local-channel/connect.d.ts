import { type Channel } from "./connection.js";
import type { ChannelSpec } from "./protocol.js";
export type ChannelConnectOptions = {
    /** Shown to the person, so they can tell surfaces apart. */
    surface: string;
    /** Defaults to ~/.floe/config.yaml. */
    configPath?: string;
    /**
     * Start Floe when the service is not answering, if the machine's
     * services.start_on_demand allows it. Default true.
     */
    start?: boolean;
};
export declare function connectChannel(spec: ChannelSpec, options: ChannelConnectOptions): Promise<Channel>;
/** Set when the serving process is a different Floe version from this copy. */
export declare function versionNote(spec: ChannelSpec, servingVersion: string | null): string | null;
