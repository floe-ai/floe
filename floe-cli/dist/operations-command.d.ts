import type { Command } from "commander";
import { CliOperationClient, type CliOperationDescriptor, type OperationConfirmation, type OperationTarget } from "./operation-client.js";
type CommonOptions = {
    host?: boolean;
    workspace?: string;
    query?: string;
    category?: string;
    targetKind?: string;
    targetId?: string;
    json?: boolean;
};
export type OperationsCommandDependencies = Readonly<{
    cwd?: () => string;
    client?: () => CliOperationClient;
    confirm?: (confirmation: OperationConfirmation) => Promise<boolean>;
    output?: (message: string) => void;
    read_file?: (path: string) => string;
}>;
export declare function registerOperationsCommand(program: Command, dependencies: OperationsCommandDependencies): void;
export declare function parseTarget(options: Pick<CommonOptions, "targetKind" | "targetId">): OperationTarget | null;
export declare function parseJsonIntent(value: string, readFile?: ((path: string) => string) | undefined): unknown;
export declare function formatOperationList(descriptors: readonly CliOperationDescriptor[]): string;
export declare function confirmInTerminal(confirmation: OperationConfirmation): Promise<boolean>;
export {};
