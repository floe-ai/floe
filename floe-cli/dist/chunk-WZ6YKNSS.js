import { createRequire as __floeCreateRequire } from 'node:module'; const require = __floeCreateRequire(import.meta.url);
import {
  IDENTITY_CHANNEL,
  PROTOCOL_VERSION,
  canonicalHome,
  channelAddress,
  channelProof,
  ensureRunDir,
  ensureStage,
  fetchBridgeServiceToken,
  fetchHostControlToken,
  frame,
  isNpmInstalled,
  lineReader,
  newNonce,
  proofMatches,
  pruneStages,
  readChannelRunFile,
  readRunFile,
  runFilePath,
  thisInstallation
} from "./chunk-AKI56RAB.js";
import {
  ensureConfig,
  resolveLocalPath
} from "./chunk-WLSAFSRN.js";

// floe-cli/dist/process-manager.js
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, unlinkSync, writeFileSync, writeSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { spawn, spawnSync } from "node:child_process";
var SERVICE_NAMES = ["bus", "bridge", "identity"];
function recordsPath(configPath, config) {
  return join(resolveLocalPath(configPath, config.home, "."), "services.json");
}
function readRecords(configPath, config) {
  const path = recordsPath(configPath, config);
  if (!existsSync(path))
    return {};
  return JSON.parse(readFileSync(path, "utf8"));
}
function writeRecords(configPath, config, records) {
  const path = recordsPath(configPath, config);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(records, null, 2), "utf8");
}
function serviceLogPath(configPath, config, service) {
  const dir = service === "bus" ? config.bus.log_dir : service === "bridge" ? config.bridge.log_dir : "./logs/identity";
  return join(resolveLocalPath(configPath, config.home, dir), `${service}.log`);
}
function isPidRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
function serviceEntry(service) {
  if (service === "identity") {
    const here = dirname(fileURLToPath(import.meta.url));
    const entry = join(here, "identity", "agent-main.js");
    const built = resolve(here, "..", "dist", "identity", "agent-main.js");
    if (existsSync(entry))
      return entry;
    if (existsSync(built))
      return built;
    throw new Error(`Floe cannot find its identity agent at ${entry}. The install is incomplete. In a dev checkout, run \`npm run build --workspace floe-cli\`; a released install already includes it.`);
  }
  const pkg = service === "bus" ? "floe-bus" : "floe-bridge";
  const require2 = createRequire(import.meta.url);
  try {
    return require2.resolve(`${pkg}/dist/index.js`);
  } catch {
    const moduleDirectory = dirname(fileURLToPath(import.meta.url));
    const artifactRoot = resolve(moduleDirectory, "..", "..");
    const bundled = join(artifactRoot, pkg, "dist", "index.js");
    if (existsSync(bundled))
      return bundled;
    throw new Error(`Floe cannot find the ${pkg} service. Its built entry (${pkg}/dist/index.js) is not resolvable from the floe CLI, and no bundled copy was found at ${bundled}. This means the install is incomplete: ${pkg} must ship with the CLI. In a dev checkout, run \`npm install\` then \`npm run build\`; a released install already bundles the bus and bridge alongside the CLI.`);
  }
}
async function startService(configPath, config, service, extraEnv = {}, instanceId) {
  const records = readRecords(configPath, config);
  const existing = records[service];
  if (existing && isPidRunning(existing.pid))
    return existing;
  const entry = await runnableEntry(configPath, config, records, serviceEntry(service));
  const command = process.execPath;
  const args = [entry, "daemon", "--config", configPath, ...service === "bus" && instanceId ? ["--instance-id", instanceId] : []];
  const defaultLogFile = serviceLogPath(configPath, config, service);
  mkdirSync(dirname(defaultLogFile), { recursive: true });
  const { logFile, logFd } = openServiceLog(defaultLogFile, service);
  const child = spawn(command, args, {
    cwd: dirname(entry),
    detached: true,
    stdio: ["ignore", logFd, logFd],
    windowsHide: true,
    // Services read everything from the config named by --config. The only
    // values passed through the environment are per-start secrets (extraEnv),
    // which must not appear on a command line.
    env: {
      ...process.env,
      ...extraEnv
    }
  });
  closeSync(logFd);
  child.unref();
  const record = {
    pid: child.pid ?? 0,
    started_at: (/* @__PURE__ */ new Date()).toISOString(),
    command,
    args,
    log_file: logFile,
    ...service === "bus" && instanceId ? { instance_id: instanceId } : {}
  };
  records[service] = record;
  writeRecords(configPath, config, records);
  return record;
}
async function runnableEntry(configPath, config, records, entry) {
  const installation = thisInstallation();
  if (!isNpmInstalled(installation.packageDir))
    return entry;
  const home = resolveLocalPath(configPath, config.home, ".");
  const stage = await ensureStage(home, installation);
  const inUse = Object.values(records).filter((record) => Boolean(record && isPidRunning(record.pid))).map((record) => record.args[0] ?? "");
  pruneStages(home, stage.dir, inUse);
  return stage.map(entry);
}
function openServiceLog(defaultLogFile, service) {
  const marker = `
[${(/* @__PURE__ */ new Date()).toISOString()}] starting ${service}
`;
  try {
    const fd = openSync(defaultLogFile, "a");
    writeSync(fd, marker);
    return { logFile: defaultLogFile, logFd: fd };
  } catch (error) {
    if (error?.code !== "EBUSY" && error?.code !== "EPERM")
      throw error;
    const fallback = join(dirname(defaultLogFile), `${service}-${Date.now()}.log`);
    const fd = openSync(fallback, "a");
    writeSync(fd, marker);
    return { logFile: fallback, logFd: fd };
  }
}
function stopService(configPath, config, service) {
  const records = readRecords(configPath, config);
  const record = records[service];
  if (!record)
    return false;
  let stopped = false;
  if (isPidRunning(record.pid)) {
    try {
      if (process.platform === "win32") {
        spawnSync("taskkill", ["/PID", String(record.pid), "/T", "/F"], { stdio: "ignore" });
      } else {
        process.kill(-record.pid, "SIGTERM");
      }
      stopped = true;
    } catch {
      try {
        process.kill(record.pid);
        stopped = true;
      } catch {
        stopped = false;
      }
    }
  }
  delete records[service];
  writeRecords(configPath, config, records);
  if (service === "identity") {
    const home = resolveLocalPath(configPath, config.home, ".");
    if (readRunFile(home)?.pid === record.pid)
      rmSync(runFilePath(home), { force: true });
  }
  return stopped;
}
function clearRecords(configPath, config) {
  const path = recordsPath(configPath, config);
  if (existsSync(path))
    unlinkSync(path);
}

// floe-cli/dist/local-channel/connection.js
import { createConnection } from "node:net";
var ChannelUnavailableError = class extends Error {
  reason;
  constructor(reason, message) {
    super(message);
    this.reason = reason;
    this.name = "ChannelUnavailableError";
  }
};
var HANDSHAKE_TIMEOUT_MS = 5e3;
function openChannel(spec, home, surface, options = {}) {
  const label = spec.label;
  const run = readChannelRunFile(spec, home);
  if (!run)
    return Promise.reject(new ChannelUnavailableError("not_running", `${label} is not running.`));
  return new Promise((resolve2, reject) => {
    const socket = createConnection(run.address);
    const clientNonce = newNonce();
    let stage = "challenge";
    let agentVersion = null;
    let handler = () => {
    };
    let settled = false;
    const fail = (error) => {
      if (settled)
        return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      reject(error);
    };
    const timer = setTimeout(() => fail(new ChannelUnavailableError("refused", `${label} did not complete the handshake.`)), HANDSHAKE_TIMEOUT_MS);
    socket.once("connect", () => {
      socket.write(frame({ type: "hello", protocol: PROTOCOL_VERSION, client_nonce: clientNonce, surface, ...options.probe ? { probe: true } : {} }));
    });
    socket.on("error", (error) => {
      const missing = error.code === "ENOENT" || error.code === "ECONNREFUSED";
      fail(new ChannelUnavailableError(missing ? "not_running" : "refused", missing ? `${label} is not running.` : `${label} could not be reached (${error.message}).`));
    });
    socket.on("data", lineReader((message) => {
      if (stage === "open") {
        handler(message);
        return;
      }
      if (message.type === "error") {
        const detail = message.error?.message ?? "refused";
        fail(new ChannelUnavailableError("refused", `${label} refused this connection (${detail}).`));
        return;
      }
      if (stage === "challenge") {
        if (message.type !== "challenge" || !proofMatches(channelProof(spec, run.secret, "agent", clientNonce), message.server_proof)) {
          fail(new ChannelUnavailableError("impostor", `Something answered at the address of ${label} but could not prove it is Floe. Nothing was sent to it.`));
          return;
        }
        agentVersion = typeof message.agent_version === "string" ? message.agent_version : null;
        stage = "welcome";
        socket.write(frame({ type: "prove", client_proof: channelProof(spec, run.secret, "client", String(message.server_nonce)) }));
        return;
      }
      if (message.type !== "welcome") {
        fail(new ChannelUnavailableError("refused", `${label} answered unexpectedly.`));
        return;
      }
      stage = "open";
      settled = true;
      clearTimeout(timer);
      resolve2({
        socket,
        agentVersion,
        welcomeState: message.state ?? {},
        onMessage: (next) => {
          handler = next;
        },
        send: (outgoing) => {
          if (!socket.destroyed)
            socket.write(frame(outgoing));
        }
      });
    }, (reason) => fail(new ChannelUnavailableError("refused", `${label} sent an invalid message (${reason}).`))));
  });
}
async function probeChannel(spec, home) {
  try {
    const channel = await openChannel(spec, home, "floe-probe", { probe: true });
    channel.socket.end();
    return { version: channel.agentVersion, state: channel.welcomeState };
  } catch {
    return null;
  }
}

// floe-cli/dist/identity/connection.js
function probeAgent(home) {
  return probeChannel(IDENTITY_CHANNEL, home);
}

// floe-cli/dist/engines/protocol.js
var ENGINES_CHANNEL = {
  name: "engines",
  label: "Floe's engine control",
  runFile: "engines.json",
  socketFile: "engines.sock"
};

// floe-cli/dist/startup.js
import { randomUUID } from "node:crypto";
import { existsSync as existsSync2, readFileSync as readFileSync2 } from "node:fs";

// floe-cli/dist/start-lock.js
import { createConnection as createConnection2, createServer } from "node:net";
import { unlinkSync as unlinkSync2 } from "node:fs";
var START_CHANNEL = {
  name: "start",
  label: "Floe start",
  runFile: "start.json",
  socketFile: "start.sock"
};
var WAIT_LIMIT_MS = 18e4;
var StartInProgressError = class extends Error {
  home;
  code = "E_START_IN_PROGRESS";
  constructor(home) {
    super(`Another start of Floe for ${home} has not finished after ${WAIT_LIMIT_MS / 6e4} minutes. If nothing else is starting Floe, run \`floe stop\` and start it again.`);
    this.home = home;
    this.name = "StartInProgressError";
  }
};
async function withStartLock(home, start, waitLimitMs = WAIT_LIMIT_MS) {
  const release = await acquire(home, waitLimitMs);
  try {
    return await start();
  } finally {
    await release();
  }
}
async function acquire(home, waitLimitMs) {
  ensureRunDir(home);
  const address = channelAddress(START_CHANNEL, home);
  const deadline = Date.now() + waitLimitMs;
  for (; ; ) {
    const release = await hold(address);
    if (release)
      return release;
    const outcome = await waitForRelease(address, deadline - Date.now());
    if (outcome === "timeout")
      throw new StartInProgressError(home);
    if (outcome === "stale") {
      try {
        unlinkSync2(address);
      } catch {
      }
    }
  }
}
function hold(address) {
  const waiting = /* @__PURE__ */ new Set();
  const server = createServer((socket) => {
    waiting.add(socket);
    socket.on("error", () => {
    });
    socket.on("close", () => waiting.delete(socket));
  });
  return new Promise((resolve2, reject) => {
    server.once("error", (error) => {
      if (error.code === "EADDRINUSE")
        resolve2(null);
      else
        reject(error);
    });
    server.listen(address, () => {
      resolve2(() => new Promise((done) => {
        server.close(() => done());
        for (const socket of waiting)
          socket.destroy();
      }));
    });
  });
}
function waitForRelease(address, remainingMs) {
  if (remainingMs <= 0)
    return Promise.resolve("timeout");
  return new Promise((resolve2) => {
    let connected = false;
    const socket = createConnection2(address);
    const timer = setTimeout(() => {
      socket.destroy();
      resolve2("timeout");
    }, remainingMs);
    const finish = (outcome) => {
      clearTimeout(timer);
      resolve2(outcome);
    };
    socket.once("connect", () => {
      connected = true;
    });
    socket.on("data", () => {
    });
    socket.once("error", (error) => {
      if (connected)
        return;
      finish(process.platform !== "win32" && error.code === "ECONNREFUSED" ? "stale" : "released");
    });
    socket.once("close", () => finish("released"));
  });
}

// floe-cli/dist/startup.js
var ForeignBusError = class extends Error {
  url;
  code = "E_FOREIGN_BUS";
  constructor(url, detail) {
    super(`Something is already answering at ${url}, but it is not this install's Floe bus (${detail}). Refusing to register or seed into it. If this is a stale Floe process, stop it and retry; if another Floe install owns this URL, change bus.http_base_url in your config.`);
    this.url = url;
    this.name = "ForeignBusError";
  }
};
async function fetchBusHealth(baseUrl) {
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/health`);
    if (!response.ok)
      return null;
    const body = await response.json();
    return { ok: body.ok === true, instance_id: body.instance_id ?? null, version: body.version ?? null };
  } catch {
    return null;
  }
}
async function isHealthy(baseUrl) {
  return await fetchBusHealth(baseUrl) !== null;
}
async function runningBusVersion(baseUrl) {
  return (await fetchBusHealth(baseUrl))?.version ?? null;
}
function describeVersionMismatch(url, ownVersion, busVersion) {
  if (!ownVersion || busVersion === ownVersion)
    return null;
  if (busVersion && compareVersions(ownVersion, busVersion) > 0) {
    return `Note: a newer Floe is installed. Floe ${busVersion} is still running at ${url};
this copy is Floe ${ownVersion}. It is left as is and keeps serving until it restarts.
To switch to Floe ${ownVersion}, run \`floe restart\`.`;
  }
  const serving = busVersion ? `Floe ${busVersion}` : "an older Floe that does not report its version";
  return `Note: connected to ${serving} at ${url}, but this copy is Floe ${ownVersion}.
It was already running, so it is left as is. To run this version instead, run
\`floe restart\`.`;
}
function compareVersions(a, b) {
  const parts = (v) => v.split("-")[0].split(".").map((n) => Number.parseInt(n, 10) || 0);
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0)
      return d;
  }
  return 0;
}
async function classifyRunningBus(configPath, config) {
  const health = await fetchBusHealth(config.bus.http_base_url);
  if (!health)
    return { state: "absent" };
  const record = readRecords(configPath, config).bus;
  if (record && record.instance_id && isPidRunning(record.pid) && health.instance_id === record.instance_id) {
    return { state: "mine" };
  }
  const detail = !record ? "no local record shows this install started it" : health.instance_id !== record.instance_id ? "its instance id does not match the bus this install started" : "the bus process this install started is no longer running";
  return { state: "foreign", detail };
}
async function waitForBusHealth(configPath, config) {
  const baseUrl = config.bus.http_base_url;
  const started = Date.now();
  while (Date.now() - started < 3e4) {
    if (await isHealthy(baseUrl))
      return;
    const record2 = readRecords(configPath, config).bus;
    if (record2 && record2.pid && !isPidRunning(record2.pid)) {
      const logPath2 = record2.log_file ?? serviceLogPath(configPath, config, "bus");
      throw new Error(`floe-bus started but exited before becoming healthy (pid ${record2.pid}). Last lines of ${logPath2}:
${readLogTail(logPath2)}`);
    }
    await sleep(500);
  }
  const record = readRecords(configPath, config).bus;
  const logPath = record?.log_file ?? serviceLogPath(configPath, config, "bus");
  const running = record ? isPidRunning(record.pid) : false;
  throw new Error(`floe-bus did not become healthy at ${baseUrl} within 30s (process ${running ? "is still running but not answering" : "is not running"}). Last lines of ${logPath}:
${readLogTail(logPath)}`);
}
function readLogTail(path, lines = 25) {
  try {
    if (!existsSync2(path))
      return "(no log output was written)";
    const text = readFileSync2(path, "utf8").trimEnd();
    if (!text)
      return "(log file is empty)";
    return text.split(/\r?\n/).slice(-lines).join("\n");
  } catch {
    return "(log file could not be read)";
  }
}
function planSubstrateStart(reachable, startOnDemand) {
  if (reachable)
    return "connect";
  return startOnDemand ? "start" : "blocked";
}
function ensureSubstrateForClient(configPath, config) {
  return withStartLock(floeHome(configPath, config), () => ensureSubstrateHeld(configPath, config));
}
async function ensureSubstrateHeld(configPath, config) {
  const reachable = await isHealthy(config.bus.http_base_url);
  const plan = planSubstrateStart(reachable, config.services.start_on_demand);
  if (plan === "start")
    await startAllHeld(configPath, config);
  if (plan === "connect" && config.services.start_on_demand) {
    await ensureIdentityAgent(configPath, config);
    if ((await classifyRunningBus(configPath, config)).state === "mine")
      await ensureBridge(configPath, config);
  }
  return plan;
}
function floeHome(configPath, config) {
  return canonicalHome(resolveLocalPath(configPath, config.home, "."));
}
async function ensureIdentityAgent(configPath, config) {
  const home = floeHome(configPath, config);
  if (await probeAgent(home))
    return;
  const record = await startService(configPath, config, "identity");
  await waitUntilAnswering("Floe's identity agent", record, () => probeAgent(home));
}
async function waitUntilAnswering(label, record, probe) {
  const started = Date.now();
  while (Date.now() - started < 15e3) {
    if (await probe())
      return;
    if (record.pid && !isPidRunning(record.pid)) {
      throw new Error(`${label} exited before it was ready (pid ${record.pid}). Last lines of ${record.log_file}:
${readLogTail(record.log_file)}`);
    }
    await sleep(200);
  }
  throw new Error(`${label} did not become ready within 15s. Last lines of ${record.log_file}:
${readLogTail(record.log_file)}`);
}
function startAll(configPath, config) {
  return withStartLock(floeHome(configPath, config), () => startAllHeld(configPath, config));
}
async function startAllHeld(configPath, config) {
  const busUrl = config.bus.http_base_url;
  const before = await classifyRunningBus(configPath, config);
  if (before.state === "foreign")
    throw new ForeignBusError(busUrl, before.detail);
  if (before.state === "absent") {
    const instanceId = randomUUID();
    const hostControlToken = await fetchHostControlToken(busUrl);
    await startService(configPath, config, "bus", { FLOE_HOST_CONTROL_TOKEN: hostControlToken }, instanceId);
    await waitForBusHealth(configPath, config);
    const after = await classifyRunningBus(configPath, config);
    if (after.state !== "mine") {
      throw new ForeignBusError(busUrl, after.state === "foreign" ? after.detail : "it stopped answering immediately after start");
    }
  }
  await ensureIdentityAgent(configPath, config);
  await ensureBridge(configPath, config);
}
async function ensureBridge(configPath, config) {
  const home = floeHome(configPath, config);
  if (await probeChannel(ENGINES_CHANNEL, home))
    return;
  const bridgeServiceToken = await fetchBridgeServiceToken("bridge:local", config.bus.http_base_url);
  const bridge = await startService(configPath, config, "bridge", { FLOE_BRIDGE_SERVICE_TOKEN: bridgeServiceToken });
  await waitUntilAnswering("Floe's bridge", bridge, () => probeChannel(ENGINES_CHANNEL, home));
}
function sleep(ms) {
  return new Promise((resolve2) => setTimeout(resolve2, ms));
}

// floe-cli/dist/local-channel/connect.js
async function connectChannel(spec, options) {
  const { configPath, config } = ensureConfig(options.configPath);
  const home = floeHome(configPath, config);
  try {
    return await openChannel(spec, home, options.surface);
  } catch (error) {
    if (!(error instanceof ChannelUnavailableError) || error.reason !== "not_running" || options.start === false)
      throw error;
  }
  const plan = await ensureSubstrateForClient(configPath, config);
  if (plan === "blocked") {
    throw new ChannelUnavailableError("not_running", `${spec.label} is not running, and this machine does not let a surface start Floe (services.start_on_demand is false). Start Floe with \`floe start\`.`);
  }
  return openChannel(spec, home, options.surface);
}
function versionNote(spec, servingVersion) {
  const own = thisInstallation().version;
  if (!own || servingVersion === own)
    return null;
  return `Connected to ${spec.label} from ${servingVersion ? `Floe ${servingVersion}` : "an older Floe"}, but this surface ships Floe ${own}. It was already running, so it is left as is and keeps serving until Floe restarts.`;
}

// floe-cli/dist/local-channel/client.js
var ChannelClient = class {
  channel;
  spec;
  refusal;
  nextId = 1;
  pending = /* @__PURE__ */ new Map();
  closeListeners = /* @__PURE__ */ new Set();
  closed = false;
  constructor(channel, spec, refusal) {
    this.channel = channel;
    this.spec = spec;
    this.refusal = refusal;
    channel.onMessage((message) => this.receive(message));
    channel.socket.on("close", () => this.handleClose());
  }
  /** The Floe version of the process serving this channel. */
  get agentVersion() {
    return this.channel.agentVersion;
  }
  /**
   * Set when the serving process is a different Floe version from the copy this
   * surface depends on. Connect-first: it is used as is, never restarted.
   */
  get versionNote() {
    return versionNote(this.spec, this.channel.agentVersion);
  }
  onClose(listener) {
    this.closeListeners.add(listener);
    return () => this.closeListeners.delete(listener);
  }
  close() {
    this.channel.socket.end();
  }
  request(op, args) {
    if (this.closed)
      return Promise.reject(new ChannelUnavailableError("not_running", `The connection to ${this.spec.label} is closed.`));
    const id = this.nextId++;
    return new Promise((resolve2, reject) => {
      this.pending.set(id, { resolve: resolve2, reject });
      this.channel.send({ type: "request", id, op, args });
    });
  }
  receive(message) {
    if (message.type !== "response") {
      this.onPush(message);
      return;
    }
    const pending = this.pending.get(message.id);
    if (!pending)
      return;
    this.pending.delete(message.id);
    if (message.ok) {
      pending.resolve(message.result);
      return;
    }
    const { code, message: text, ...details } = message.error ?? {};
    pending.reject(this.refusal(String(code ?? "failed"), String(text ?? `${this.spec.label} refused.`), details));
  }
  handleClose() {
    if (this.closed)
      return;
    this.closed = true;
    for (const pending of this.pending.values()) {
      pending.reject(new ChannelUnavailableError("not_running", `The connection to ${this.spec.label} closed.`));
    }
    this.pending.clear();
    for (const listener of this.closeListeners)
      listener();
  }
};

export {
  SERVICE_NAMES,
  recordsPath,
  readRecords,
  serviceLogPath,
  isPidRunning,
  stopService,
  clearRecords,
  ChannelUnavailableError,
  probeAgent,
  ENGINES_CHANNEL,
  isHealthy,
  runningBusVersion,
  describeVersionMismatch,
  waitForBusHealth,
  ensureSubstrateForClient,
  floeHome,
  startAll,
  connectChannel,
  ChannelClient
};
