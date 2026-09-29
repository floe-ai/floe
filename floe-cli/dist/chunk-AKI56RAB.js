import { createRequire as __floeCreateRequire } from 'node:module'; const require = __floeCreateRequire(import.meta.url);

// floe-cli/dist/local-channel/protocol.js
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
var PROTOCOL_VERSION = 1;
var MAX_LINE_BYTES = 1024 * 1024;
function canonicalHome(home) {
  const absolute = resolve(home);
  return process.platform === "win32" ? absolute.toLowerCase() : absolute;
}
function channelAddress(spec, home) {
  if (process.platform === "win32") {
    const digest = createHash("sha256").update(canonicalHome(home)).digest("hex").slice(0, 24);
    return `\\\\.\\pipe\\floe-${spec.name}-${digest}`;
  }
  return join(home, "run", spec.socketFile);
}
function runDir(home) {
  return join(home, "run");
}
function channelRunFilePath(spec, home) {
  return join(runDir(home), spec.runFile);
}
function newChannelSecret() {
  return randomBytes(32).toString("hex");
}
function ensureRunDir(home) {
  const dir = runDir(home);
  mkdirSync(dir, { recursive: true });
  try {
    chmodSync(dir, 448);
  } catch {
  }
}
function writeChannelRunFile(spec, home, run) {
  ensureRunDir(home);
  const path = channelRunFilePath(spec, home);
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, JSON.stringify(run, null, 2) + "\n", { encoding: "utf8", mode: 384 });
  renameSync(temporary, path);
}
function readChannelRunFile(spec, home) {
  const path = channelRunFilePath(spec, home);
  if (!existsSync(path))
    return null;
  try {
    const value = JSON.parse(readFileSync(path, "utf8"));
    if (typeof value.secret !== "string" || typeof value.address !== "string" || typeof value.pid !== "number")
      return null;
    return value;
  } catch {
    return null;
  }
}
function newNonce() {
  return randomBytes(16).toString("hex");
}
function channelProof(spec, secret, role, nonce) {
  return createHmac("sha256", Buffer.from(secret, "hex")).update(`floe-${spec.name}:${role}:${nonce}`).digest("hex");
}
function proofMatches(expected, received) {
  if (typeof received !== "string" || received.length !== expected.length)
    return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(received));
}
function lineReader(onMessage, onError) {
  let buffer = "";
  return (chunk) => {
    buffer += chunk.toString();
    if (Buffer.byteLength(buffer) > MAX_LINE_BYTES && !buffer.includes("\n")) {
      buffer = "";
      onError("message too large");
      return;
    }
    let index;
    while ((index = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      if (!line)
        continue;
      let parsed;
      try {
        parsed = JSON.parse(line);
      } catch {
        onError("invalid JSON");
        return;
      }
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        onError("message is not an object");
        return;
      }
      onMessage(parsed);
    }
  };
}
function frame(message) {
  return JSON.stringify(message) + "\n";
}

// floe-cli/dist/identity/protocol.js
var IDENTITY_CHANNEL = {
  name: "identity",
  label: "Floe's identity agent",
  runFile: "identity-agent.json",
  socketFile: "identity.sock"
};
function runFilePath(home) {
  return channelRunFilePath(IDENTITY_CHANNEL, home);
}
function readRunFile(home) {
  return readChannelRunFile(IDENTITY_CHANNEL, home);
}

// floe-cli/dist/installation.js
import { existsSync as existsSync3, readFileSync as readFileSync3, realpathSync as realpathSync2 } from "node:fs";
import { basename as basename2, dirname as dirname2, join as join3 } from "node:path";
import { fileURLToPath } from "node:url";

// floe-cli/dist/staging.js
import { existsSync as existsSync2, mkdirSync as mkdirSync2, readdirSync, readFileSync as readFileSync2, realpathSync, renameSync as renameSync2, rmSync, statSync, writeFileSync as writeFileSync2 } from "node:fs";
import { copyFile, link } from "node:fs/promises";
import { createHash as createHash2, randomBytes as randomBytes2 } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { basename, dirname, join as join2, relative, sep } from "node:path";
var STAGE_MANIFEST = "stage.json";
function isNpmInstalled(packageDir) {
  return realpathSync(packageDir).split(sep).includes("node_modules");
}
function runtimeDir(home) {
  return join2(home, "runtime");
}
function readJson(path) {
  try {
    return JSON.parse(readFileSync2(path, "utf8"));
  } catch {
    return null;
  }
}
function resolvePackage(name, fromDir) {
  let dir = fromDir;
  for (; ; ) {
    if (basename(dir) !== "node_modules") {
      const candidate = join2(dir, "node_modules", ...name.split("/"));
      if (existsSync2(join2(candidate, "package.json")))
        return realpathSync(candidate);
    }
    const parent = dirname(dir);
    if (parent === dir)
      return null;
    dir = parent;
  }
}
function dependencyClosure(packageDir) {
  const root = realpathSync(packageDir);
  const seen = /* @__PURE__ */ new Set([root]);
  const queue = [root];
  while (queue.length > 0) {
    const dir = queue.shift();
    const pkg = readJson(join2(dir, "package.json")) ?? {};
    const names = /* @__PURE__ */ new Set([
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.optionalDependencies ?? {}),
      ...Object.keys(pkg.peerDependencies ?? {})
    ]);
    for (const name of names) {
      const found = resolvePackage(name, dir);
      if (found && !seen.has(found)) {
        seen.add(found);
        queue.push(found);
      }
    }
  }
  return [...seen].sort();
}
function commonAncestor(dirs) {
  let common = dirs[0].split(sep);
  for (const dir of dirs.slice(1)) {
    const parts = dir.split(sep);
    let i = 0;
    while (i < common.length && i < parts.length && common[i].toLowerCase() === parts[i].toLowerCase())
      i++;
    common = common.slice(0, i);
  }
  let ancestor = common.join(sep) || sep;
  const at = ancestor.split(sep).indexOf("node_modules");
  if (at >= 0)
    ancestor = ancestor.split(sep).slice(0, at).join(sep);
  return ancestor;
}
function* packageFiles(dir, top = dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join2(dir, entry.name);
    if (entry.isDirectory()) {
      if (dir === top && entry.name === "node_modules")
        continue;
      yield* packageFiles(path, top);
    } else if (entry.isFile()) {
      yield { path, entry };
    }
  }
}
function fingerprint(closure, root, packageDir) {
  const hash = createHash2("sha256");
  for (const dir of closure) {
    hash.update(`${relative(root, dir)}@${readJson(join2(dir, "package.json"))?.version ?? ""}
`);
  }
  for (const { path } of packageFiles(packageDir)) {
    const stat = statSync(path);
    hash.update(`${relative(packageDir, path)}:${stat.size}:${stat.mtimeMs}
`);
  }
  return hash.digest("hex").slice(0, 12);
}
async function placeFile(from, to) {
  try {
    await link(from, to);
  } catch (error) {
    if (error?.code === "EEXIST")
      return;
    await copyFile(from, to);
  }
}
async function buildTree(closure, root, tree) {
  const files = [];
  for (const dir of closure) {
    for (const { path } of packageFiles(dir))
      files.push([path, join2(tree, relative(root, path))]);
  }
  for (const target of new Set(files.map(([, to]) => dirname(to))))
    mkdirSync2(target, { recursive: true });
  let next = 0;
  const worker = async () => {
    while (next < files.length) {
      const [from, to] = files[next++];
      await placeFile(from, to);
    }
  };
  await Promise.all(Array.from({ length: 16 }, worker));
}
function makeStage(dir, manifest) {
  const tree = join2(dir, "tree");
  return {
    dir,
    manifest,
    map(path) {
      const real = realpathSync(path);
      const rel = relative(manifest.root, real);
      if (rel.startsWith(".."))
        throw new Error(`Floe cannot stage ${real}: it is outside ${manifest.root}.`);
      return join2(tree, rel);
    }
  };
}
async function ensureStage(home, source) {
  const packageDir = realpathSync(source.packageDir);
  const closure = dependencyClosure(packageDir);
  const root = commonAncestor(closure);
  const id = `${source.version ?? "unversioned"}-${fingerprint(closure, root, packageDir)}`;
  const runtime = runtimeDir(home);
  const dir = join2(runtime, id);
  const existing = readJson(join2(dir, STAGE_MANIFEST));
  if (existing?.kind === "floe-stage")
    return makeStage(dir, existing);
  const manifest = {
    kind: "floe-stage",
    version: source.version,
    source: packageDir,
    dependency_of: source.dependencyOf,
    root,
    created_at: (/* @__PURE__ */ new Date()).toISOString()
  };
  const partial = join2(runtime, `.partial-${id}-${randomBytes2(4).toString("hex")}-${process.pid}`);
  mkdirSync2(partial, { recursive: true });
  await buildTree(closure, root, join2(partial, "tree"));
  writeFileSync2(join2(partial, STAGE_MANIFEST), `${JSON.stringify(manifest, null, 2)}
`, "utf8");
  const placed = await placeStage(partial, dir);
  return makeStage(dir, placed ?? manifest);
}
var RENAME_PATIENCE_MS = 3e4;
async function placeStage(partial, dir) {
  const deadline = Date.now() + RENAME_PATIENCE_MS;
  for (let wait = 25; ; wait = Math.min(wait * 2, 1e3)) {
    try {
      renameSync2(partial, dir);
      return null;
    } catch (error) {
      const placed = readJson(join2(dir, STAGE_MANIFEST));
      if (placed?.kind === "floe-stage") {
        discard(partial);
        return placed;
      }
      if (!["EPERM", "EACCES", "EBUSY", "ENOTEMPTY", "EEXIST"].includes(error?.code) || Date.now() >= deadline) {
        discard(partial);
        throw new Error(`Floe could not finish preparing its runtime copy in ${dir}: another program kept its files in use (${error?.code ?? "unknown"}). Close anything scanning or using that folder, then start Floe again.`, { cause: error });
      }
      await sleep(wait);
    }
  }
}
function discard(partial) {
  try {
    rmSync(partial, { recursive: true, force: true, maxRetries: 3 });
  } catch {
  }
}
function stageOf(path) {
  let dir = path;
  for (; ; ) {
    const parent = dirname(dir);
    if (parent === dir)
      return null;
    if (basename(dir) === "tree") {
      const manifest = readJson(join2(parent, STAGE_MANIFEST));
      if (manifest?.kind === "floe-stage")
        return manifest;
    }
    dir = parent;
  }
}
function pruneStages(home, keep, inUse) {
  const runtime = runtimeDir(home);
  if (!existsSync2(runtime))
    return [];
  const removed = [];
  const live = inUse.map((p) => p.toLowerCase());
  for (const name of readdirSync(runtime)) {
    const dir = join2(runtime, name);
    if (dir.toLowerCase() === keep.toLowerCase())
      continue;
    const partialPid = /^\.partial-.*-(\d+)$/.exec(name)?.[1];
    if (partialPid && isAlive(Number(partialPid)))
      continue;
    const prefix = `${dir}${sep}`.toLowerCase();
    if (live.some((p) => p.startsWith(prefix)))
      continue;
    try {
      rmSync(dir, { recursive: true, force: true });
      removed.push(dir);
    } catch {
    }
  }
  return removed;
}
function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// floe-cli/dist/installation.js
function nearestPackageDir(start) {
  let dir = start;
  for (; ; ) {
    if (existsSync3(join3(dir, "package.json")))
      return dir;
    const parent = dirname2(dir);
    if (parent === dir)
      return null;
    dir = parent;
  }
}
function readPackage(dir) {
  try {
    return JSON.parse(readFileSync3(join3(dir, "package.json"), "utf8"));
  } catch {
    return {};
  }
}
function classifyPackageDir(packageDir) {
  const pkg = readPackage(packageDir);
  const version = typeof pkg.version === "string" ? pkg.version : null;
  let holder = dirname2(packageDir);
  if (basename2(holder).startsWith("@"))
    holder = dirname2(holder);
  if (basename2(holder) !== "node_modules")
    return { packageDir, version, dependencyOf: null };
  const owner = dirname2(holder);
  if (!existsSync3(join3(owner, "package.json")))
    return { packageDir, version, dependencyOf: null };
  const ownerName = readPackage(owner).name;
  return { packageDir, version, dependencyOf: typeof ownerName === "string" ? ownerName : owner };
}
var cached;
function thisInstallation() {
  if (cached)
    return cached;
  const moduleDir = realpathSync2(dirname2(fileURLToPath(import.meta.url)));
  const packageDir = nearestPackageDir(moduleDir) ?? moduleDir;
  const stage = stageOf(packageDir);
  cached = stage ? { packageDir: stage.source, version: stage.version, dependencyOf: stage.dependency_of } : classifyPackageDir(packageDir);
  return cached;
}
function directInstallRequiredMessage(installation) {
  return `This copy of Floe was installed as part of ${installation.dependencyOf}, so it cannot set up
start-at-login: uninstalling ${installation.dependencyOf} would remove it and silently break
start-at-login. Install Floe directly for that, then run \`floe service install\`:
  npm install -g github:floe-ai/floe`;
}

// floe-cli/dist/operation-client.js
import { isAbsolute, relative as relative2, resolve as resolve2, dirname as dirname3 } from "node:path";
import { randomBytes as randomBytes3 } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync as existsSync4 } from "node:fs";
import { fileURLToPath as fileURLToPath2 } from "node:url";
var CliAuthorityBrokerUnavailableError = class extends Error {
  constructor() {
    super("Floe CLI cannot open a trusted local operation session: the native authority broker binary was not found. Build it with `npm run build --workspace floe-cli` (requires Rust/cargo), which compiles floe-native-authority and installs the broker into floe-cli/native/.");
    this.name = "CliAuthorityBrokerUnavailableError";
  }
};
var NativeCliOperationAuthorityBroker = class {
  run;
  constructor(run) {
    this.run = run;
  }
  listLocalWorkspaces() {
    return this.run({ command: "list_local_workspaces" });
  }
  discoverOperations(input) {
    return this.run({
      command: "discover_operations",
      boundary: input.boundary,
      ...input.query ? { query: input.query } : {},
      ...input.category ? { category: input.category } : {},
      ...input.target ? { target: input.target } : {}
    });
  }
  invokeOperation(input) {
    return this.run({ command: "invoke_operation", ...input });
  }
  confirmAndInvokeHostOperation(input) {
    return this.run({ command: "confirm_and_invoke_host_operation", ...input });
  }
  confirmAndInvokeWorkspaceOperation(input) {
    return this.run({ command: "confirm_and_invoke_workspace_operation", ...input });
  }
};
function nativeOperationBroker(busHttpBase) {
  return new NativeCliOperationAuthorityBroker((command) => runNativeAuthorityCommand(command, busHttpBase));
}
var CliOperationClient = class {
  broker;
  interactionSessionId;
  constructor(broker, interactionSessionId) {
    this.broker = broker;
    this.interactionSessionId = interactionSessionId ?? `cli_${randomBytes3(18).toString("base64url")}`;
  }
  async listLocalWorkspaces() {
    const response = await this.broker.listLocalWorkspaces();
    if (!isRecord(response) || !Array.isArray(response.workspaces)) {
      throw new Error("Floe returned an invalid local Workspace list.");
    }
    return response.workspaces.map(parseLocalWorkspace);
  }
  async discover(input) {
    const response = await this.broker.discoverOperations(input);
    if (!isRecord(response) || !Array.isArray(response.operations)) {
      throw new Error("Floe returned an invalid semantic operation catalogue.");
    }
    return response.operations.map(parseOperationDescriptor);
  }
  async describe(boundary, operationId, target) {
    const descriptors = await this.discover({ boundary, query: operationId, target });
    const descriptor = descriptors.find((candidate) => candidate.operation_id === operationId);
    if (!descriptor)
      throw new Error(`Semantic operation '${operationId}' is not available in this authority boundary.`);
    return descriptor;
  }
  async invokeSelected(input) {
    const descriptor = await this.describe(input.boundary, input.operation_id, input.target);
    const invocation = {
      operation_id: descriptor.operation_id,
      operation_version: descriptor.operation_version,
      input_schema_version: descriptor.input.version,
      target: input.target ?? null,
      ...optionalIdempotencyKey(descriptor, input.idempotency_key),
      input: input.input,
      ...input.expected_resource_revision !== void 0 ? { expected_resource_revision: input.expected_resource_revision } : {}
    };
    const confirmation = descriptor.interaction_constraints.confirmation;
    if (confirmation?.required) {
      if (!input.confirm || !await input.confirm(confirmation)) {
        return {
          kind: "cancelled",
          operation_id: descriptor.operation_id,
          prompt_id: confirmation.prompt_id
        };
      }
      return input.boundary.kind === "workspace" ? this.broker.confirmAndInvokeWorkspaceOperation({
        workspace_id: input.boundary.workspace_id,
        interaction_session_id: this.interactionSessionId,
        invocation
      }) : this.broker.confirmAndInvokeHostOperation({
        interaction_session_id: this.interactionSessionId,
        invocation
      });
    }
    return this.broker.invokeOperation({
      boundary: input.boundary,
      invocation
    });
  }
};
async function runNativeAuthorityCommand(command, busHttpBase) {
  const helper = resolveNativeAuthorityBrokerPath();
  if (!helper)
    throw new CliAuthorityBrokerUnavailableError();
  const payload = JSON.stringify(command);
  const { FLOE_BUS_HTTP_BASE: _inherited, ...inherited } = process.env;
  return new Promise((resolveResult, reject) => {
    const child = spawn(helper, [], {
      shell: false,
      windowsHide: true,
      stdio: ["pipe", "pipe", "ignore"],
      env: busHttpBase ? { ...inherited, FLOE_BUS_HTTP_BASE: busHttpBase } : inherited
    });
    const chunks = [];
    let bytes = 0;
    let settled = false;
    const timeout = setTimeout(() => {
      child.kill();
      if (!settled) {
        settled = true;
        reject(new Error("Floe's native authority broker did not respond."));
      }
    }, 2e4);
    child.stdout.on("data", (chunk) => {
      bytes += chunk.byteLength;
      if (bytes > 2 * 1024 * 1024) {
        child.kill();
        return;
      }
      chunks.push(Buffer.from(chunk));
    });
    child.once("error", () => {
      clearTimeout(timeout);
      if (!settled) {
        settled = true;
        reject(new CliAuthorityBrokerUnavailableError());
      }
    });
    child.once("close", () => {
      clearTimeout(timeout);
      if (settled)
        return;
      settled = true;
      if (bytes > 2 * 1024 * 1024) {
        reject(new Error("Floe's native authority response was invalid."));
        return;
      }
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        if (!isRecord(parsed) || typeof parsed.ok !== "boolean")
          throw new Error();
        if (!parsed.ok) {
          const message = isRecord(parsed.error) && typeof parsed.error.message === "string" ? parsed.error.message : "Floe's native authority broker refused the request.";
          reject(new Error(message));
          return;
        }
        resolveResult(parsed.result);
      } catch {
        reject(new Error("Floe's native authority response was invalid."));
      }
    });
    child.stdin.end(payload, "utf8");
  });
}
async function fetchHostControlToken(busHttpBase) {
  const result = await runNativeAuthorityCommand({ command: "provide_host_control_token" }, busHttpBase);
  if (!isRecord(result) || typeof result.token !== "string" || !result.token) {
    throw new Error("Floe's native authority broker did not provide a host-control credential.");
  }
  return result.token;
}
async function fetchIdentityDeviceKey(home, create) {
  const result = await runNativeAuthorityCommand({ command: "identity_device_key", home, create }, null);
  if (!isRecord(result) || !("key" in result))
    throw new Error("Floe's native authority broker returned no device key answer.");
  if (result.key === null)
    return null;
  if (typeof result.key !== "string")
    throw new Error("Floe's native authority broker returned an invalid device key.");
  const key = new Uint8Array(Buffer.from(result.key, "base64url"));
  if (key.length !== 32)
    throw new Error("Floe's native authority broker returned an invalid device key.");
  return key;
}
async function forgetIdentityDeviceKey(home) {
  const result = await runNativeAuthorityCommand({ command: "forget_identity_device_key", home }, null);
  return isRecord(result) && result.removed === true;
}
async function fetchBridgeServiceToken(bridgeId, busHttpBase) {
  const result = await runNativeAuthorityCommand({
    command: "provide_bridge_service_token",
    bridge_id: bridgeId
  }, busHttpBase);
  if (!isRecord(result) || typeof result.token !== "string" || !result.token) {
    throw new Error("Floe's native authority broker did not provide a Bridge service credential.");
  }
  return result.token;
}
async function registerLocalWorkspaceViaBroker(locator, initAuthorized, busHttpBase) {
  const result = await runNativeAuthorityCommand({
    command: "register_workspace",
    locator,
    init_authorized: initAuthorized
  }, busHttpBase);
  if (!isRecord(result) || !isRecord(result.workspace) || typeof result.workspace.workspace_id !== "string" || typeof result.workspace.name !== "string") {
    throw new Error("Floe returned an invalid Workspace registration.");
  }
  return { workspace_id: result.workspace.workspace_id, name: result.workspace.name };
}
function resolveNativeAuthorityBrokerPath() {
  const executable = process.platform === "win32" ? "floe-authority-broker.exe" : "floe-authority-broker";
  const moduleDirectory = dirname3(fileURLToPath2(import.meta.url));
  const candidates = [
    resolve2(moduleDirectory, "..", "native", executable),
    resolve2(dirname3(process.execPath), executable)
  ];
  return candidates.find((candidate) => existsSync4(candidate)) ?? null;
}
function selectLocalWorkspace(workspaces, explicitWorkspaceId, cwd = process.cwd()) {
  if (explicitWorkspaceId) {
    const exact = workspaces.find((workspace) => workspace.workspace_id === explicitWorkspaceId);
    if (!exact)
      throw new Error(`Workspace '${explicitWorkspaceId}' is not attached to this Floe host.`);
    return exact;
  }
  const resolvedCwd = resolve2(cwd);
  const matches = workspaces.filter((workspace) => {
    if (!workspace.binding || workspace.binding.state === "superseded")
      return false;
    const resolvedLocator = resolve2(workspace.binding.locator);
    const rel = relative2(resolvedLocator, resolvedCwd);
    return rel === "" || !rel.startsWith("..") && !isAbsolute(rel);
  }).sort((left, right) => resolve2(right.binding.locator).length - resolve2(left.binding.locator).length);
  if (matches.length > 0)
    return matches[0];
  throw new Error("No attached Workspace contains the current directory. Use --workspace <workspace-id>.");
}
function parseLocalWorkspace(value) {
  if (!isRecord(value) || typeof value.workspace_id !== "string" || typeof value.name !== "string") {
    throw new Error("Floe returned an invalid local Workspace list.");
  }
  let binding = null;
  if (value.binding_id !== null) {
    if (typeof value.binding_id !== "string" || !value.binding_id || typeof value.locator !== "string" || !value.locator) {
      throw new Error("Floe returned an invalid local Workspace binding.");
    }
    binding = { locator: value.locator };
  } else if (value.locator !== null) {
    throw new Error("Floe returned a locator without a current local Workspace binding.");
  }
  return { workspace_id: value.workspace_id, name: value.name, binding };
}
function parseOperationDescriptor(value) {
  if (!isRecord(value) || typeof value.operation_id !== "string" || typeof value.operation_version !== "string" || typeof value.category !== "string" || typeof value.title !== "string" || typeof value.description !== "string" || !isRecord(value.effects) || !isRecord(value.target) || !isVersionedSchema(value.input) || !isVersionedSchema(value.result) || !isRecord(value.interaction_constraints) || !isRecord(value.availability) || typeof value.availability.available !== "boolean") {
    throw new Error("Floe returned an invalid semantic operation descriptor.");
  }
  const confirmation = value.interaction_constraints.confirmation;
  if (confirmation !== void 0 && !isOperationConfirmation(confirmation)) {
    throw new Error("Floe returned an invalid semantic operation confirmation.");
  }
  return value;
}
function isVersionedSchema(value) {
  return isRecord(value) && typeof value.version === "string" && isRecord(value.schema);
}
function isOperationConfirmation(value) {
  return isRecord(value) && typeof value.required === "boolean" && typeof value.prompt_id === "string" && typeof value.title === "string" && typeof value.description === "string";
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function requireText(value, label) {
  if (!value.trim() || /[\u0000-\u001f\u007f]/.test(value))
    throw new Error(`The ${label} is invalid.`);
  return value;
}
function optionalIdempotencyKey(descriptor, provided) {
  if (provided !== void 0 && provided.trim()) {
    return { idempotency_key: requireText(provided, "idempotency key") };
  }
  if (descriptor.effects.mode === "write") {
    throw new Error(`Operation '${descriptor.operation_id}' writes, so it needs --idempotency-key <stable key> \u2014 a stable key lets a retry replay safely instead of applying twice.`);
  }
  return {};
}

export {
  PROTOCOL_VERSION,
  canonicalHome,
  channelAddress,
  channelRunFilePath,
  newChannelSecret,
  ensureRunDir,
  writeChannelRunFile,
  readChannelRunFile,
  newNonce,
  channelProof,
  proofMatches,
  lineReader,
  frame,
  IDENTITY_CHANNEL,
  runFilePath,
  readRunFile,
  isNpmInstalled,
  ensureStage,
  pruneStages,
  thisInstallation,
  directInstallRequiredMessage,
  nativeOperationBroker,
  CliOperationClient,
  fetchHostControlToken,
  fetchIdentityDeviceKey,
  forgetIdentityDeviceKey,
  fetchBridgeServiceToken,
  registerLocalWorkspaceViaBroker,
  selectLocalWorkspace
};
