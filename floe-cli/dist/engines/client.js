import { createRequire as __floeCreateRequire } from 'node:module'; const require = __floeCreateRequire(import.meta.url);
import {
  ChannelClient,
  ChannelUnavailableError,
  ENGINES_CHANNEL,
  connectChannel
} from "../chunk-J5UZI7CZ.js";
import "../chunk-NJBTFYD2.js";
import "../chunk-IO6DTE5U.js";

// floe-cli/dist/engines/client.js
var EnginesError = class extends Error {
  code;
  details;
  constructor(code, message, details = {}) {
    super(message);
    this.code = code;
    this.details = details;
    this.name = "EnginesError";
  }
};
async function connectEngines(options) {
  return new EnginesClient(await connectChannel(ENGINES_CHANNEL, options));
}
var EnginesClient = class extends ChannelClient {
  engines;
  stateListeners = /* @__PURE__ */ new Set();
  signInListeners = /* @__PURE__ */ new Set();
  /** @internal Use connectEngines. */
  constructor(channel) {
    super(channel, ENGINES_CHANNEL, (code, message, details) => new EnginesError(code, message, details));
    this.engines = { ...channel.welcomeState.engines ?? {} };
  }
  /** Every engine this Floe runs work on, by name. */
  get state() {
    return this.engines;
  }
  /** Called with the full map and the engine that changed, on every change. */
  onState(listener) {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }
  /** Progress of every sign-in, from `starting` to `succeeded`, `failed` or `cancelled`. */
  onSignIn(listener) {
    this.signInListeners.add(listener);
    return () => this.signInListeners.delete(listener);
  }
  /** Check an engine again now. The result also arrives through onState. */
  refresh(engine) {
    return this.request("refresh", { engine });
  }
  /** Start the vendor's own sign-in. Progress arrives through onSignIn. */
  signIn(engine, options = {}) {
    return this.request("sign_in", { engine, ...options.mode ? { mode: options.mode } : {} });
  }
  cancelSignIn(operationId) {
    return this.request("cancel_sign_in", { operation_id: operationId });
  }
  onPush(message) {
    if (message.type === "state" && message.state && typeof message.state === "object") {
      const changed = message.state;
      this.engines = { ...this.engines, [changed.engine]: changed };
      for (const listener of this.stateListeners)
        listener(this.engines, changed);
      return;
    }
    if (message.type === "sign_in" && typeof message.operation_id === "string") {
      const { type: _type, ...event } = message;
      for (const listener of this.signInListeners)
        listener(event);
    }
  }
};
export {
  EnginesClient,
  EnginesError,
  ChannelUnavailableError as EnginesUnavailableError,
  connectEngines
};
