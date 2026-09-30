/** The Bus's own answer to "who is serving here?", read from its /health. */
export type BusHealth = {
    ok: boolean;
    instance_id: string | null;
    version: string | null;
};
export declare function fetchBusHealth(baseUrl: string): Promise<BusHealth | null>;
