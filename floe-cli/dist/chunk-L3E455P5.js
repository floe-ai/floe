import { createRequire as __floeCreateRequire } from 'node:module'; const require = __floeCreateRequire(import.meta.url);
import {
  ChannelClient,
  connectChannel
} from "./chunk-K6MQI5X7.js";
import {
  IDENTITY_CHANNEL
} from "./chunk-PQSQM3MJ.js";

// floe-cli/dist/identity/client.js
var IdentityError = class extends Error {
  code;
  details;
  constructor(code, message, details = {}) {
    super(message);
    this.code = code;
    this.details = details;
    this.name = "IdentityError";
  }
};
async function connectIdentity(options) {
  const channel = await connectChannel(IDENTITY_CHANNEL, options);
  if (Object.keys(channel.welcomeState).length === 0)
    channel.welcomeState = { kind: "none" };
  return new IdentityClient(channel);
}
var IdentityClient = class extends ChannelClient {
  current;
  stateListeners = /* @__PURE__ */ new Set();
  sessionListeners = /* @__PURE__ */ new Map();
  early = /* @__PURE__ */ new Map();
  /** @internal Use connectIdentity. */
  constructor(channel) {
    super(channel, IDENTITY_CHANNEL, (code, message, details) => new IdentityError(code, message, details));
    this.current = channel.welcomeState;
  }
  get state() {
    return this.current;
  }
  onState(listener) {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
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
      select: async (workspaceId) => {
        await this.request("select_workspace", { session_id: id, workspace_id: workspaceId });
      },
      end: async () => {
        await this.request("end_session", { session_id: id });
        this.sessionListeners.delete(id);
      }
    };
  }
  sessions() {
    return this.request("sessions", {});
  }
  revokeSession(sessionId) {
    return this.request("revoke_session", { session_id: sessionId });
  }
  /** Every identity Floe holds here: the current one and each one set aside. */
  listIdentities(input = {}) {
    return this.request("list_identities", input);
  }
  /**
   * Delete one identity for good. The current one also needs `revoke_admissions`
   * (the person's choice) and, when passphrase protected, its passphrase.
   */
  deleteIdentity(input) {
    return this.request("delete_identity", input);
  }
  onPush(message) {
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
      this.early.set(id, [...this.early.get(id) ?? [], event]);
      return;
    }
    if (event.status === "ended")
      this.sessionListeners.delete(id);
    listener(event);
  }
};

export {
  IdentityError,
  connectIdentity,
  IdentityClient
};
