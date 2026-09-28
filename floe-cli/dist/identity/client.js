/**
 * `floe/identity` — how a surface acts as the person without holding their key.
 *
 *   import { connectIdentity } from "floe/identity";
 *   const identity = await connectIdentity({ surface: "my-surface" });
 *   identity.onState((state) => render(state));
 *   const session = await identity.session({}, (event) => {
 *     if (event.status === "ready") useBearer(event.bearer_token);
 *   });
 *
 * The agent pushes identity state on every change and each session's bearer
 * when minted and again before it expires. A surface never polls. The wire
 * protocol is documented in docs/reference/identity-agent-protocol.md.
 */
import { ensureConfig } from "../config.js";
import { thisInstallation } from "../installation.js";
import { ensureSubstrateForClient, floeHome } from "../startup.js";
import { AgentUnavailableError, openAgentChannel } from "./connection.js";
/** A refusal from the agent, with a stable `code` (see the protocol reference). */
export class IdentityError extends Error {
    code;
    details;
    constructor(code, message, details = {}) {
        super(message);
        this.code = code;
        this.details = details;
        this.name = "IdentityError";
    }
}
export { AgentUnavailableError };
export async function connectIdentity(options) {
    const { configPath, config } = ensureConfig(options.configPath);
    const home = floeHome(configPath, config);
    let channel;
    try {
        channel = await openAgentChannel(home, options.surface);
    }
    catch (error) {
        if (!(error instanceof AgentUnavailableError) || error.reason !== "not_running" || options.start === false)
            throw error;
        await startFloe(configPath, config);
        channel = await openAgentChannel(home, options.surface);
    }
    return new IdentityClient(channel);
}
async function startFloe(configPath, config) {
    const plan = await ensureSubstrateForClient(configPath, config);
    if (plan === "blocked") {
        throw new AgentUnavailableError("not_running", "Floe's identity agent is not running, and this machine does not let a surface start Floe "
            + "(services.start_on_demand is false). Start Floe with `floe start`.");
    }
}
export class IdentityClient {
    channel;
    current;
    nextId = 1;
    pending = new Map();
    stateListeners = new Set();
    closeListeners = new Set();
    sessionListeners = new Map();
    early = new Map();
    closed = false;
    /** @internal Use connectIdentity. */
    constructor(channel) {
        this.channel = channel;
        this.current = channel.welcomeState;
        channel.onMessage((message) => this.receive(message));
        channel.socket.on("close", () => this.handleClose());
    }
    get state() {
        return this.current;
    }
    /** The Floe version of the agent serving this machine. */
    get agentVersion() {
        return this.channel.agentVersion;
    }
    /**
     * Set when the agent is a different Floe version from the copy this surface
     * depends on. Connect-first: the running agent is used as is, never restarted.
     */
    get versionNote() {
        const own = thisInstallation().version;
        const agent = this.channel.agentVersion;
        if (!own || agent === own)
            return null;
        return `Connected to the identity agent of ${agent ? `Floe ${agent}` : "an older Floe"}, but this surface ships Floe ${own}. `
            + "It was already running, so it is left as is.";
    }
    onState(listener) {
        this.stateListeners.add(listener);
        return () => this.stateListeners.delete(listener);
    }
    onClose(listener) {
        this.closeListeners.add(listener);
        return () => this.closeListeners.delete(listener);
    }
    /** Create an identity. An empty passphrase protects it with this device instead. */
    create(input) {
        return this.request("create", input);
    }
    unlock(passphrase = "") {
        return this.request("unlock", { passphrase });
    }
    lock() {
        return this.request("lock", {});
    }
    restore(input) {
        return this.request("restore", input);
    }
    /** The backup: the recovery phrase, or an nsec for an identity that has none. */
    reveal(input) {
        return this.request("reveal", input);
    }
    /** Forgot the passphrase and have no phrase: a new identity, carried into the old one's workspaces. */
    replace(input) {
        return this.request("replace", input);
    }
    /** Import an identity file written by an earlier surface. Pass its parsed JSON. */
    importLegacy(input) {
        return this.request("import_legacy", input);
    }
    /** Create or join the workspace for a folder. Sessions waiting for a workspace then receive a bearer. */
    joinFolder(input) {
        return this.request("join_folder", input);
    }
    /**
     * Ask for a bearer. The listener receives `ready` with the bearer, then `ready`
     * again with a fresh one before each expiry, until the session ends.
     */
    async session(options, listener) {
        const { session_id: id } = await this.request("session", options);
        this.sessionListeners.set(id, listener);
        for (const event of this.early.get(id) ?? [])
            this.dispatchSession(id, event);
        this.early.delete(id);
        return {
            id,
            select: async (workspaceId) => { await this.request("select_workspace", { session_id: id, workspace_id: workspaceId }); },
            end: async () => {
                await this.request("end_session", { session_id: id });
                this.sessionListeners.delete(id);
            },
        };
    }
    sessions() {
        return this.request("sessions", {});
    }
    revokeSession(sessionId) {
        return this.request("revoke_session", { session_id: sessionId });
    }
    close() {
        this.channel.socket.end();
    }
    request(op, args) {
        if (this.closed)
            return Promise.reject(new AgentUnavailableError("not_running", "The connection to Floe's identity agent is closed."));
        const id = this.nextId++;
        return new Promise((resolve, reject) => {
            this.pending.set(id, { resolve, reject });
            this.channel.send({ type: "request", id, op, args });
        });
    }
    receive(message) {
        if (message.type === "response") {
            const pending = this.pending.get(message.id);
            if (!pending)
                return;
            this.pending.delete(message.id);
            if (message.ok) {
                pending.resolve(message.result);
            }
            else {
                const { code, message: text, ...details } = (message.error ?? {});
                pending.reject(new IdentityError(String(code ?? "failed"), String(text ?? "The identity agent refused."), details));
            }
            return;
        }
        if (message.type === "state") {
            this.current = message.state;
            for (const listener of this.stateListeners)
                listener(this.current);
            return;
        }
        if (message.type === "session" && typeof message.session_id === "string") {
            const { type: _type, session_id: id, ...event } = message;
            this.dispatchSession(id, event);
        }
    }
    dispatchSession(id, event) {
        const listener = this.sessionListeners.get(id);
        if (!listener) {
            // The push can overtake the reply that names the session.
            this.early.set(id, [...(this.early.get(id) ?? []), event]);
            return;
        }
        if (event.status === "ended")
            this.sessionListeners.delete(id);
        listener(event);
    }
    handleClose() {
        if (this.closed)
            return;
        this.closed = true;
        for (const pending of this.pending.values()) {
            pending.reject(new AgentUnavailableError("not_running", "The connection to Floe's identity agent closed."));
        }
        this.pending.clear();
        for (const listener of this.closeListeners)
            listener();
    }
}
