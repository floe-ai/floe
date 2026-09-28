import { createRequire as __floeCreateRequire } from 'node:module'; const require = __floeCreateRequire(import.meta.url);

// floe-bus/dist/isolated-extension-runtime.js
import { createHash } from "node:crypto";
import { readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

// node_modules/@jitl/quickjs-singlefile-mjs-release-asyncify/dist/index.mjs
var variant = { type: "async", importFFI: () => import("./ffi-PWNDEFKJ.js").then((mod) => mod.QuickJSAsyncFFI), importModuleLoader: () => import("./emscripten-module-XPXY3VN7-NN4G3NTD.js").then((mod) => mod.default) };
var src_default = variant;

// node_modules/quickjs-emscripten-core/dist/index.mjs
async function newQuickJSAsyncWASMModuleFromVariant(variantOrPromise) {
  let variant2 = smartUnwrap(await variantOrPromise), [wasmModuleLoader, QuickJSAsyncFFI, { QuickJSAsyncWASMModule: QuickJSAsyncWASMModule2 }] = await Promise.all([variant2.importModuleLoader().then(smartUnwrap), variant2.importFFI(), import("./module-asyncify-2EFITU5U-BOSR3CGA.js").then(smartUnwrap)]), wasmModule = await wasmModuleLoader();
  wasmModule.type = "async";
  let ffi = new QuickJSAsyncFFI(wasmModule);
  return new QuickJSAsyncWASMModule2(wasmModule, ffi);
}
function smartUnwrap(val) {
  return val && "default" in val && val.default ? val.default && "default" in val.default && val.default.default ? val.default.default : val.default : val;
}

// floe-bus/dist/isolated-extension-runtime.js
var MAX_SOURCE_BYTES = 1048576;
var MAX_MESSAGE_BYTES = 1048576;
var DEFAULT_MEMORY_BYTES = 32 * 1024 * 1024;
var DEFAULT_STACK_BYTES = 512 * 1024;
var DEFAULT_EXECUTION_MS = 15e3;
var INSTALLATION_SCHEMA = "floe.extension-installation.v1";
var EXECUTABLE_DIGEST_DOMAIN = "floe.extension-executable.v1";
var ENTRY_EXPORT = "default";
function inspectExtensionSandbox() {
  return {
    isolation_level: "process_sandbox",
    entry_point: {
      module_format: "esm",
      export_name: ENTRY_EXPORT,
      arguments: ["input", "floe"],
      result: "JSON-compatible value or Promise of one",
      imports_allowed: false,
      ambient_node_access: false
    },
    limits: { source_bytes: MAX_SOURCE_BYTES, message_bytes: MAX_MESSAGE_BYTES },
    installation_descriptor: { schema: INSTALLATION_SCHEMA, fields: ["schema", "extension_package_version_id"] },
    content_digest: {
      algorithm: "sha256",
      domain: EXECUTABLE_DIGEST_DOMAIN,
      covers: "Exact entry-point IDs, kinds, normalized package paths and executable bytes; not the package archive checksum."
    }
  };
}
var ExtensionSandboxError = class extends Error {
  code;
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = "ExtensionSandboxError";
  }
};
function extensionExecutableContentDigest(entries) {
  const hash = createHash("sha256");
  hash.update(`${EXECUTABLE_DIGEST_DOMAIN}\0`);
  for (const item of [...entries].sort((left, right) => left.entry_point.entry_point_id.localeCompare(right.entry_point.entry_point_id))) {
    appendHashField(hash, item.entry_point.entry_point_id);
    appendHashField(hash, item.entry_point.kind);
    appendHashField(hash, normalizePackagePath(item.entry_point.package_path));
    appendHashBytes(hash, item.source);
  }
  return `sha256:${hash.digest("hex")}`;
}
function verifyInstalledExtensionPackage(input) {
  if (!isAbsolute(input.workspace_root)) {
    throw new ExtensionSandboxError("extension_workspace_locator_invalid", "Workspace locator must be absolute.");
  }
  const workspaceRoot = realpathSync(input.workspace_root);
  const installationRoot = confinedRealPath(workspaceRoot, input.installation_locator, "Extension installation");
  const descriptorPath = confinedRealPath(installationRoot, "extension.json", "Extension installation descriptor");
  const descriptor = parseObject(readBoundedFile(descriptorPath), "Extension installation descriptor");
  const descriptorKeys = Object.keys(descriptor).filter((key) => !["schema", "extension_package_version_id"].includes(key));
  if (descriptorKeys.length > 0) {
    throw new ExtensionSandboxError("extension_installation_descriptor_invalid", `Extension installation descriptor contains unsupported field '${descriptorKeys.sort()[0]}'.`);
  }
  if (descriptor.schema !== INSTALLATION_SCHEMA) {
    throw new ExtensionSandboxError("extension_installation_descriptor_invalid", "Extension installation descriptor has an unsupported schema.");
  }
  if (descriptor.extension_package_version_id !== input.package_version.extension_package_version_id) {
    throw new ExtensionSandboxError("extension_installation_package_mismatch", "Extension installation descriptor does not identify the requested package version.");
  }
  const entries = input.package_version.definition.entry_points.map((entryPoint) => {
    const path = confinedRealPath(installationRoot, entryPoint.package_path, `Extension entry point '${entryPoint.entry_point_id}'`);
    const bytes = readBoundedBytes(path);
    return { entry_point: entryPoint, source: bytes };
  });
  const actualDigest = extensionExecutableContentDigest(entries);
  if (actualDigest !== input.package_version.content_digest) {
    throw new ExtensionSandboxError("extension_package_digest_mismatch", `Extension package content did not match ${input.package_version.content_digest}.`);
  }
  return {
    package_version: input.package_version,
    installation_root: installationRoot,
    entry_points: entries.map((item) => ({
      entry_point: item.entry_point,
      source: Buffer.from(item.source).toString("utf8")
    }))
  };
}
var QuickJsExtensionSandbox = class {
  packageVersion;
  broker;
  audit;
  options;
  runtime = null;
  context = null;
  deadline = 0;
  disposed = false;
  constructor(packageVersion, broker, audit, options = {}) {
    this.packageVersion = packageVersion;
    this.broker = broker;
    this.audit = audit;
    this.options = options;
  }
  async activate(entries) {
    if (this.runtime)
      throw new ExtensionSandboxError("extension_already_active", "Extension package is already active.");
    const variant2 = this.options.variant === "debug" ? (await import("@jitl/quickjs-singlefile-mjs-debug-asyncify")).default : src_default;
    const quickJs = await newQuickJSAsyncWASMModuleFromVariant(variant2);
    const runtime = quickJs.newRuntime();
    runtime.setMemoryLimit(this.options.memory_limit_bytes ?? DEFAULT_MEMORY_BYTES);
    runtime.setMaxStackSize(this.options.stack_limit_bytes ?? DEFAULT_STACK_BYTES);
    runtime.setInterruptHandler(() => Date.now() > this.deadline);
    runtime.setModuleLoader(() => {
      throw new ExtensionSandboxError("extension_import_denied", "Extension package imports are not allowed.");
    });
    const context = runtime.newContext();
    this.runtime = runtime;
    this.context = context;
    try {
      this.installBrokerFunction(context);
      await this.evaluate(context, brokerBootstrapSource(), "floe:broker-bootstrap", 1e3);
      const entryRegistry = context.newObject();
      context.setProp(context.global, "__floe_entries", entryRegistry);
      entryRegistry.dispose();
      for (const entry of entries) {
        if (Buffer.byteLength(entry.source, "utf8") > MAX_SOURCE_BYTES) {
          throw new ExtensionSandboxError("extension_source_too_large", "Extension entry point exceeds the source limit.");
        }
        const moduleResult = await this.evaluate(context, entry.source, `floe-extension://${this.packageVersion.extension_package_version_id}/${entry.entry_point.package_path}`, 1e3, true);
        const handler = context.getProp(moduleResult, ENTRY_EXPORT);
        try {
          if (context.typeof(handler) !== "function") {
            throw new ExtensionSandboxError("extension_entry_contract_invalid", `Entry point '${entry.entry_point.entry_point_id}' must default-export a function.`);
          }
          const registry = context.getProp(context.global, "__floe_entries");
          try {
            context.setProp(registry, entry.entry_point.entry_point_id, handler);
          } finally {
            registry.dispose();
          }
        } finally {
          handler.dispose();
          moduleResult.dispose();
        }
      }
    } catch (error) {
      this.dispose();
      throw normalizeSandboxError(error, "extension_activation_failed");
    }
  }
  async invoke(input) {
    const context = this.requireContext();
    const entry = this.packageVersion.definition.entry_points.find((candidate) => candidate.entry_point_id === input.entry_point_id);
    if (!entry) {
      throw new ExtensionSandboxError("extension_entry_point_not_found", "Extension entry point is not declared by this package.");
    }
    const contextJson = checkedJson(input.context);
    const requestJson = checkedJson(input.request);
    const invocationSource = `
      globalThis.__floe_active_context = JSON.parse(${JSON.stringify(contextJson)});
      globalThis.__floe_active_result = await globalThis.__floe_entries[${JSON.stringify(input.entry_point_id)}](
        JSON.parse(${JSON.stringify(requestJson)}),
        globalThis.floe,
      );
    `;
    let result = null;
    try {
      result = await this.evaluate(context, `(async () => { ${invocationSource} return globalThis.__floe_active_result; })()`, `floe-invocation://${this.packageVersion.extension_package_version_id}/${input.entry_point_id}`, this.options.execution_timeout_ms ?? DEFAULT_EXECUTION_MS, false);
      const value = await this.resolveGuestPromise(context, result);
      result.dispose();
      result = null;
      try {
        const dumped = context.dump(value);
        const json = checkedJson(dumped);
        return JSON.parse(json);
      } finally {
        value.dispose();
      }
    } catch (error) {
      throw normalizeSandboxError(error, "extension_invocation_failed");
    } finally {
      result?.dispose();
      context.setProp(context.global, "__floe_active_context", context.undefined);
      context.setProp(context.global, "__floe_active_result", context.undefined);
    }
  }
  dispose() {
    if (this.disposed)
      return;
    this.disposed = true;
    const context = this.context;
    const runtime = this.runtime;
    this.context = null;
    this.runtime = null;
    try {
      context?.dispose();
    } catch {
    }
    try {
      runtime?.dispose();
    } catch {
    }
  }
  installBrokerFunction(context) {
    const call = context.newAsyncifiedFunction("__floe_host_call", async (requestHandle) => {
      let request;
      try {
        const raw = context.getString(requestHandle);
        if (Buffer.byteLength(raw, "utf8") > MAX_MESSAGE_BYTES) {
          throw new ExtensionSandboxError("extension_request_too_large", "Extension host request exceeds the message limit.");
        }
        request = parseExtensionHostCall(raw);
        const brokerContext = this.activeBrokerContext(context);
        const result = await authorizeExtensionHostCall({
          package_version: this.packageVersion,
          call: request,
          context: brokerContext,
          broker: this.broker
        });
        await this.audit.record({ context: brokerContext, call: request, outcome: "completed", code: "completed" });
        return context.newString(checkedJson({ ok: true, result }));
      } catch (error) {
        const normalized = normalizeSandboxError(error, "extension_host_call_failed");
        let brokerContext = null;
        try {
          brokerContext = this.activeBrokerContext(context);
        } catch {
        }
        if (brokerContext && request !== void 0) {
          await this.audit.record({
            context: brokerContext,
            call: request,
            outcome: normalized.code.endsWith("denied") ? "refused" : "failed",
            code: normalized.code
          });
        }
        return context.newString(checkedJson({ ok: false, error: { code: normalized.code, message: normalized.message } }));
      }
    });
    context.setProp(context.global, "__floe_host_call", call);
    call.dispose();
  }
  activeBrokerContext(context) {
    const handle = context.getProp(context.global, "__floe_active_context");
    try {
      const value = context.dump(handle);
      if (!value || value.extension_package_version_id !== this.packageVersion.extension_package_version_id) {
        throw new ExtensionSandboxError("extension_execution_context_missing", "Extension host call has no valid execution context.");
      }
      return value;
    } finally {
      handle.dispose();
    }
  }
  async evaluate(context, source, filename, timeoutMs, module = false) {
    this.deadline = Date.now() + timeoutMs;
    const result = await context.evalCodeAsync(source, filename, module ? { type: "module" } : void 0);
    if (result.error) {
      const dumped = context.dump(result.error);
      result.error.dispose();
      const message = typeof dumped?.message === "string" ? dumped.message : checkedJson(dumped);
      const code = /interrupted/i.test(message) ? "extension_execution_limit" : "extension_code_failed";
      throw new ExtensionSandboxError(code, message);
    }
    return result.value;
  }
  async resolveGuestPromise(context, promise) {
    for (; ; ) {
      const state = context.getPromiseState(promise);
      if (state.type === "fulfilled")
        return state.value;
      if (state.type === "rejected") {
        const dumped = context.dump(state.error);
        state.error.dispose();
        const code = typeof dumped?.code === "string" ? dumped.code : "extension_code_failed";
        const message = typeof dumped?.message === "string" ? dumped.message : checkedJson(dumped);
        throw new ExtensionSandboxError(code, message);
      }
      const jobs = context.runtime.executePendingJobs();
      if (jobs.error) {
        const dumped = context.dump(jobs.error);
        jobs.error.dispose();
        const message = typeof dumped?.message === "string" ? dumped.message : checkedJson(dumped);
        const code = /interrupted/i.test(message) ? "extension_execution_limit" : "extension_code_failed";
        throw new ExtensionSandboxError(code, message);
      }
      await new Promise((resolvePromise) => setImmediate(resolvePromise));
    }
  }
  requireContext() {
    if (this.disposed || !this.context) {
      throw new ExtensionSandboxError("extension_not_active", "Extension package is not active.");
    }
    return this.context;
  }
};
async function authorizeExtensionHostCall(input) {
  if (input.context.workspace_id !== input.package_version.workspace_id || input.context.extension_id !== input.package_version.extension_id || input.context.extension_package_version_id !== input.package_version.extension_package_version_id) {
    throw new ExtensionSandboxError("extension_execution_context_denied", "Extension execution context does not match its exact package.");
  }
  const permissions = input.package_version.definition.permissions;
  const call = input.call;
  if (call.kind === "operation") {
    const permission2 = permissions.actions.find((candidate) => candidate.permission_id === call.permission_id);
    if (!permission2 || permission2.operation_id !== call.operation_id)
      deny(call.permission_id);
    return input.broker.invokeOperation({ context: input.context, ...call });
  }
  if (call.kind === "filesystem") {
    const permission2 = permissions.filesystem.find((candidate) => candidate.permission_id === call.permission_id);
    if (!permission2 || permission2.scope !== call.scope || !accessAllows(permission2.access, call.action) || !matchesRelativePattern(call.path, permission2.relative_pattern))
      deny(call.permission_id);
    return input.broker.accessFilesystem({ context: input.context, ...call });
  }
  const permission = permissions.network.find((candidate) => candidate.permission_id === call.permission_id);
  if (!permission || permission.origin !== call.origin || !permission.methods.includes(call.method))
    deny(call.permission_id);
  let secret = null;
  if (call.secret) {
    const secretPermission = permissions.secrets.find((candidate) => candidate.permission_id === call.secret.permission_id);
    if (!secretPermission || secretPermission.secret_ref_id !== call.secret.secret_ref_id || secretPermission.purpose !== call.secret.purpose)
      deny(call.secret.permission_id);
    secret = call.secret;
  }
  return input.broker.requestNetwork({
    context: input.context,
    permission_id: call.permission_id,
    origin: call.origin,
    method: call.method,
    path: call.path,
    headers: call.headers ?? {},
    body: call.body ?? null,
    secret
  });
}
function brokerBootstrapSource() {
  return `
    (() => {
      const hostCall = globalThis.__floe_host_call;
      const call = async request => {
        const envelope = JSON.parse(await hostCall(JSON.stringify(request)));
        if (!envelope.ok) {
          const error = new Error(envelope.error.message);
          error.code = envelope.error.code;
          throw error;
        }
        return envelope.result;
      };
      globalThis.floe = Object.freeze({
        invokeOperation: request => call({ kind: "operation", ...request }),
        readFile: request => call({ kind: "filesystem", action: "read", ...request }),
        writeFile: request => call({ kind: "filesystem", action: "write", ...request }),
        request: request => call({ kind: "network", ...request }),
      });
      delete globalThis.__floe_host_call;
    })();
  `;
}
function parseExtensionHostCall(raw) {
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new ExtensionSandboxError("extension_host_call_invalid", "Extension host call must be valid JSON.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ExtensionSandboxError("extension_host_call_invalid", "Extension host call must be an object.");
  }
  const call = value;
  if (call.kind === "operation") {
    assertExactKeys(call, ["kind", "permission_id", "operation_id", "target", "input"], "Operation host call");
    nonEmptyString(call.permission_id, "permission_id");
    nonEmptyString(call.operation_id, "operation_id");
    if (!call.input || typeof call.input !== "object" || Array.isArray(call.input))
      invalid("operation input");
    if (call.target !== null)
      validateTarget(call.target);
    return call;
  }
  if (call.kind === "filesystem") {
    assertExactKeys(call, ["kind", "permission_id", "action", "scope", "path", "content"], "Filesystem host call");
    nonEmptyString(call.permission_id, "permission_id");
    nonEmptyString(call.path, "path");
    if (!["read", "write"].includes(call.action))
      invalid("filesystem action");
    if (!["workspace", "extension_data", "temporary"].includes(call.scope))
      invalid("filesystem scope");
    if (call.action === "write" && typeof call.content !== "string")
      invalid("filesystem write content");
    return call;
  }
  if (call.kind === "network") {
    assertExactKeys(call, ["kind", "permission_id", "origin", "method", "path", "headers", "body", "secret"], "Network host call");
    nonEmptyString(call.permission_id, "permission_id");
    nonEmptyString(call.origin, "origin");
    nonEmptyString(call.path, "path");
    if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(call.method))
      invalid("network method");
    const origin = new URL(call.origin);
    if (origin.origin !== call.origin || origin.username || origin.password)
      invalid("network origin");
    if (call.headers !== void 0)
      validateStringRecord(call.headers, "network headers");
    if (call.body !== void 0 && call.body !== null && typeof call.body !== "string")
      invalid("network body");
    if (call.secret !== void 0 && call.secret !== null)
      validateSecretRequest(call.secret);
    return call;
  }
  throw new ExtensionSandboxError("extension_host_call_invalid", "Extension host call kind is unsupported.");
}
function validateTarget(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    invalid("operation target");
  const target = value;
  assertExactKeys(target, ["kind", "id", "revision"], "Operation target");
  nonEmptyString(target.kind, "target kind");
  nonEmptyString(target.id, "target id");
  if (target.revision !== void 0 && target.revision !== null && typeof target.revision !== "string")
    invalid("target revision");
}
function validateSecretRequest(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    invalid("secret request");
  const secret = value;
  assertExactKeys(secret, ["permission_id", "secret_ref_id", "purpose"], "Secret request");
  nonEmptyString(secret.permission_id, "secret permission_id");
  nonEmptyString(secret.secret_ref_id, "secret_ref_id");
  nonEmptyString(secret.purpose, "secret purpose");
}
function validateStringRecord(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.values(value).some((item) => typeof item !== "string"))
    invalid(label);
}
function accessAllows(access, action) {
  return access === "read_write" || access === action;
}
function matchesRelativePattern(pathValue, patternValue) {
  const path = normalizeRelativePath(pathValue);
  const pattern = normalizeRelativePath(patternValue);
  const source = pattern.split("/").map((segment) => {
    if (segment === "**")
      return "(?:[^/]+/)*[^/]*";
    return segment.split("").map((char) => char === "*" ? "[^/]*" : escapeRegex(char)).join("");
  }).join("/");
  return new RegExp(`^${source}$`).test(path);
}
function normalizeRelativePath(value) {
  const normalized = value.replaceAll("\\", "/").replace(/^\.\//, "");
  if (!normalized || normalized.startsWith("/") || /^[a-z]:\//i.test(normalized) || normalized.split("/").includes("..")) {
    throw new ExtensionSandboxError("extension_path_denied", "Extension path must stay within its declared scope.");
  }
  return normalized;
}
function confinedRealPath(root, relativePath, label) {
  const normalized = normalizeRelativePath(relativePath);
  const candidate = realpathSync(resolve(root, normalized));
  const within = relative(root, candidate);
  if (!within || within === ".." || within.startsWith(`..${sep}`) || isAbsolute(within)) {
    throw new ExtensionSandboxError("extension_path_denied", `${label} escapes its allowed root.`);
  }
  const stat = statSync(candidate);
  if (label.endsWith("installation") ? !stat.isDirectory() : !stat.isFile()) {
    throw new ExtensionSandboxError("extension_path_invalid", `${label} has the wrong filesystem type.`);
  }
  return candidate;
}
function readBoundedFile(path) {
  return readBoundedBytes(path).toString("utf8");
}
function readBoundedBytes(path) {
  const stat = statSync(path);
  if (!stat.isFile() || stat.size > MAX_SOURCE_BYTES) {
    throw new ExtensionSandboxError("extension_source_too_large", "Extension package file exceeds the source limit.");
  }
  return readFileSync(path);
}
function parseObject(raw, label) {
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new ExtensionSandboxError("extension_installation_descriptor_invalid", `${label} must be valid JSON.`);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ExtensionSandboxError("extension_installation_descriptor_invalid", `${label} must be an object.`);
  }
  return value;
}
function checkedJson(value) {
  let serialized;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new ExtensionSandboxError("extension_value_not_json", "Extension values must be JSON serializable.");
  }
  if (serialized === void 0 || Buffer.byteLength(serialized, "utf8") > MAX_MESSAGE_BYTES) {
    throw new ExtensionSandboxError("extension_value_too_large", "Extension value exceeds the message limit.");
  }
  return serialized;
}
function normalizePackagePath(value) {
  return normalizeRelativePath(value);
}
function appendHashField(hash, value) {
  appendHashBytes(hash, Buffer.from(value, "utf8"));
}
function appendHashBytes(hash, value) {
  const size = Buffer.allocUnsafe(8);
  size.writeBigUInt64BE(BigInt(value.byteLength));
  hash.update(size);
  hash.update(value);
}
function nonEmptyString(value, label) {
  if (typeof value !== "string" || !value.trim())
    invalid(label);
}
function assertExactKeys(value, allowed, label) {
  const unsupported = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unsupported.length > 0) {
    throw new ExtensionSandboxError("extension_host_call_invalid", `${label} contains unsupported field '${unsupported.sort()[0]}'.`);
  }
}
function invalid(label) {
  throw new ExtensionSandboxError("extension_host_call_invalid", `Invalid ${label}.`);
}
function deny(permissionId) {
  throw new ExtensionSandboxError("extension_permission_denied", `Extension permission '${permissionId}' is not declared by the exact package version.`);
}
function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function normalizeSandboxError(error, fallbackCode) {
  if (error instanceof ExtensionSandboxError)
    return error;
  return new ExtensionSandboxError(fallbackCode, error instanceof Error ? error.message : String(error));
}

export {
  inspectExtensionSandbox,
  ExtensionSandboxError,
  verifyInstalledExtensionPackage,
  QuickJsExtensionSandbox,
  authorizeExtensionHostCall,
  parseExtensionHostCall
};
