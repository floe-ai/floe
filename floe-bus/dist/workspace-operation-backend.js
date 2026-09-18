import { existsSync, mkdirSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { WorkspaceDirectoryNotFoundError, } from "./workspace-operations.js";
import { WorkspaceLocatorInvalidError } from "./workspace-identities.js";
/** Bus adapter shared by semantic Workspace operations and local bootstrap UI. */
export class BusWorkspaceOperationBackend {
    store;
    broadcast;
    constructor(store, broadcast) {
        this.store = store;
        this.broadcast = broadcast;
    }
    inspect(workspaceId) {
        return this.store.getRemoteWorkspace(workspaceId);
    }
    register(input) {
        if (!isAbsolute(input.locator)) {
            throw new WorkspaceLocatorInvalidError(this.store.localWorkspacePlatform, "an absolute path is required");
        }
        const locator = resolve(input.locator);
        if (!existsSync(locator)) {
            if (!input.create_directory)
                throw new WorkspaceDirectoryNotFoundError(locator);
            mkdirSync(locator, { recursive: true });
        }
        const workspace = this.store.registerWorkspace({ ...input, locator }, this.broadcast);
        return this.requireRemote(workspace.workspace_id);
    }
    rebind(input) {
        const workspace = this.store.rebindWorkspace(input, this.broadcast);
        return this.requireRemote(workspace.workspace_id);
    }
    restore(input) {
        const workspace = this.store.restoreWorkspaceIdentity(input, this.broadcast);
        return this.requireRemote(workspace.workspace_id);
    }
    derive(input) {
        const workspace = this.store.deriveWorkspaceIdentity(input, this.broadcast);
        return this.requireRemote(workspace.workspace_id);
    }
    requireRemote(workspaceId) {
        const workspace = this.store.getRemoteWorkspace(workspaceId);
        if (!workspace)
            throw new Error(`Workspace identity disappeared after operation: ${workspaceId}`);
        return workspace;
    }
}
