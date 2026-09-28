#!/usr/bin/env node
import { createRequire as __floeCreateRequire } from 'node:module'; const require = __floeCreateRequire(import.meta.url);
import {
  QuickJsExtensionSandbox
} from "./chunk-SURB55YT.js";
import "./chunk-ZPY7FGTK.js";
import "./chunk-63Z3FA2N.js";
import "./chunk-KLFRYGKH.js";
import "./chunk-ULQ5F6OI.js";
import "./chunk-ATBT25V3.js";

// floe-bus/dist/isolated-extension-host-child.js
import process from "node:process";
async function runIsolatedExtensionHostChild() {
  if (!process.send)
    throw new Error("The isolated Extension host requires a private IPC channel.");
  let sandbox = null;
  const pendingBrokerCalls = /* @__PURE__ */ new Map();
  let sequence = 0;
  let work = Promise.resolve();
  const send = (message) => {
    process.send?.(message);
  };
  const parentCall = (call) => new Promise((resolve, reject) => {
    const requestId = `broker_${process.pid}_${++sequence}`;
    pendingBrokerCalls.set(requestId, { resolve, reject });
    send({ type: "broker_call", request_id: requestId, call });
  });
  const broker = {
    invokeOperation: ({ context: _context, ...call }) => parentCall({ kind: "operation", ...call }),
    accessFilesystem: ({ context: _context, ...call }) => parentCall({ kind: "filesystem", ...call }),
    requestNetwork: ({ context: _context, ...call }) => parentCall({ kind: "network", ...call })
  };
  const respond = (requestId, result) => {
    send({ type: "response", request_id: requestId, ok: true, result });
  };
  const fail = (requestId, error) => {
    const normalized = normalizeError(error);
    send({ type: "response", request_id: requestId, ok: false, error: normalized });
  };
  process.on("message", (raw) => {
    const message = raw;
    if (message?.type === "broker_result") {
      const pending = pendingBrokerCalls.get(message.request_id);
      if (!pending)
        return;
      pendingBrokerCalls.delete(message.request_id);
      if (message.ok)
        pending.resolve(message.result ?? null);
      else
        pending.reject(Object.assign(new Error(message.error?.message ?? "Extension broker call failed."), {
          code: message.error?.code ?? "extension_broker_failed"
        }));
      return;
    }
    work = work.then(async () => {
      if (message?.type === "activate") {
        if (sandbox)
          throw new Error("An Extension package is already active in this host.");
        sandbox = new QuickJsExtensionSandbox(message.package_version, broker, { record: () => void 0 }, message.limits);
        await sandbox.activate(message.entry_points);
        respond(message.request_id, {
          extension_package_version_id: message.package_version.extension_package_version_id,
          content_digest: message.package_version.content_digest
        });
        return;
      }
      if (message?.type === "invoke") {
        if (!sandbox)
          throw new Error("No Extension package is active in this host.");
        respond(message.request_id, await sandbox.invoke({
          entry_point_id: message.entry_point_id,
          request: message.request,
          context: message.context
        }));
        return;
      }
      if (message?.type === "deactivate") {
        sandbox?.dispose();
        sandbox = null;
        respond(message.request_id, { disabled: true });
        setImmediate(() => process.exit(0));
        return;
      }
      throw new Error("Unsupported isolated Extension host message.");
    }).catch((error) => {
      const requestId = typeof message?.request_id === "string" ? message.request_id : "unknown";
      fail(requestId, error);
    });
  });
  process.on("disconnect", () => {
    sandbox?.dispose();
    process.exit(0);
  });
  send({ type: "ready", process_protocol: 1 });
}
function normalizeError(error) {
  return {
    code: typeof error?.code === "string" ? error.code : "extension_host_failed",
    message: error instanceof Error ? error.message : String(error)
  };
}

// floe-bus/dist/isolated-extension-host-process.js
await runIsolatedExtensionHostChild();
