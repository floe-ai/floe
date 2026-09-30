import { z } from "zod";
declare const LocalConfigSchema: z.ZodObject<{
    schema: z.ZodLiteral<"floe.local.v1">;
    version: z.ZodNumber;
    home: z.ZodString;
    services: z.ZodObject<{
        start_on_demand: z.ZodBoolean;
        manager: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        start_on_demand: boolean;
        manager: string;
    }, {
        start_on_demand: boolean;
        manager: string;
    }>;
    bus: z.ZodObject<{
        listen: z.ZodString;
        http_base_url: z.ZodString;
        ws_base_url: z.ZodString;
        data_dir: z.ZodString;
        log_dir: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        listen: string;
        http_base_url: string;
        ws_base_url: string;
        data_dir: string;
        log_dir: string;
    }, {
        listen: string;
        http_base_url: string;
        ws_base_url: string;
        data_dir: string;
        log_dir: string;
    }>;
    bridge: z.ZodObject<{
        data_dir: z.ZodString;
        log_dir: z.ZodString;
        bus_url: z.ZodString;
        workspace_access: z.ZodObject<{
            local_paths: z.ZodBoolean;
        }, "strip", z.ZodTypeAny, {
            local_paths: boolean;
        }, {
            local_paths: boolean;
        }>;
        runtime_adapter: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        data_dir: string;
        log_dir: string;
        bus_url: string;
        workspace_access: {
            local_paths: boolean;
        };
        runtime_adapter?: string | undefined;
    }, {
        data_dir: string;
        log_dir: string;
        bus_url: string;
        workspace_access: {
            local_paths: boolean;
        };
        runtime_adapter?: string | undefined;
    }>;
    library: z.ZodObject<{
        configs_dir: z.ZodString;
        skills_dir: z.ZodString;
        extensions_dir: z.ZodString;
        mcp_dir: z.ZodString;
        templates_dir: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        configs_dir: string;
        skills_dir: string;
        extensions_dir: string;
        mcp_dir: string;
        templates_dir: string;
    }, {
        configs_dir: string;
        skills_dir: string;
        extensions_dir: string;
        mcp_dir: string;
        templates_dir: string;
    }>;
    runtime: z.ZodOptional<z.ZodObject<{
        default_auth_profile: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        default_auth_profile?: string | undefined;
    }, {
        default_auth_profile?: string | undefined;
    }>>;
    identity: z.ZodOptional<z.ZodObject<{
        lock_after_idle_minutes: z.ZodNumber;
    }, "strict", z.ZodTypeAny, {
        lock_after_idle_minutes: number;
    }, {
        lock_after_idle_minutes: number;
    }>>;
}, "strict", z.ZodTypeAny, {
    version: number;
    schema: "floe.local.v1";
    home: string;
    services: {
        start_on_demand: boolean;
        manager: string;
    };
    bus: {
        listen: string;
        http_base_url: string;
        ws_base_url: string;
        data_dir: string;
        log_dir: string;
    };
    bridge: {
        data_dir: string;
        log_dir: string;
        bus_url: string;
        workspace_access: {
            local_paths: boolean;
        };
        runtime_adapter?: string | undefined;
    };
    library: {
        configs_dir: string;
        skills_dir: string;
        extensions_dir: string;
        mcp_dir: string;
        templates_dir: string;
    };
    runtime?: {
        default_auth_profile?: string | undefined;
    } | undefined;
    identity?: {
        lock_after_idle_minutes: number;
    } | undefined;
}, {
    version: number;
    schema: "floe.local.v1";
    home: string;
    services: {
        start_on_demand: boolean;
        manager: string;
    };
    bus: {
        listen: string;
        http_base_url: string;
        ws_base_url: string;
        data_dir: string;
        log_dir: string;
    };
    bridge: {
        data_dir: string;
        log_dir: string;
        bus_url: string;
        workspace_access: {
            local_paths: boolean;
        };
        runtime_adapter?: string | undefined;
    };
    library: {
        configs_dir: string;
        skills_dir: string;
        extensions_dir: string;
        mcp_dir: string;
        templates_dir: string;
    };
    runtime?: {
        default_auth_profile?: string | undefined;
    } | undefined;
    identity?: {
        lock_after_idle_minutes: number;
    } | undefined;
}>;
export declare const DEFAULT_IDENTITY_LOCK_AFTER_IDLE_MINUTES = 15;
export type LocalConfig = z.infer<typeof LocalConfigSchema>;
export declare function defaultConfig(home?: string): LocalConfig;
export declare function expandHome(pathValue: string): string;
export declare function resolveConfigPath(explicitPath?: string): string;
export declare function resolveLocalPath(configPath: string, home: string, pathValue: string): string;
export declare function ensureConfig(explicitPath?: string): {
    configPath: string;
    config: LocalConfig;
    created: boolean;
};
export declare function saveConfig(configPath: string, config: LocalConfig): void;
export declare function ensureLocalDirs(configPath: string, config: LocalConfig): void;
export {};
