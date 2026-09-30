#!/usr/bin/env node
import { createRequire as __floeCreateRequire } from 'node:module'; const require = __floeCreateRequire(import.meta.url);
import {
  __toESM,
  require_dist,
  resolveConfigPath,
  resolveLocalPath
} from "./chunk-WLSAFSRN.js";

// floe-cli/dist/cli-error.js
var import_yaml = __toESM(require_dist(), 1);
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
function reportCliFailure(error, options) {
  const configPath = configPathFromArgv(options.argv);
  const detail = fullErrorDetail(error);
  const logFile = writeFailureLog(configPath, detail);
  const { summary, nextAction } = explainFailure(error, configPath);
  return {
    summary,
    nextAction,
    logFile,
    debugDetail: options.debug ? detail : null
  };
}
function printCliFailure(report) {
  console.error(report.summary);
  console.error(`Next: ${report.nextAction}`);
  console.error(`Full error details were saved to ${report.logFile}`);
  if (report.debugDetail)
    console.error(`
Debug details:
${report.debugDetail}`);
}
function configPathFromArgv(argv) {
  for (let index = 2; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--config" && argv[index + 1])
      return resolveConfigPath(argv[index + 1]);
    if (value.startsWith("--config="))
      return resolveConfigPath(value.slice("--config=".length));
  }
  return resolveConfigPath();
}
function cliLogPath(configPath) {
  try {
    const raw = import_yaml.default.parse(readFileSync(configPath, "utf8"));
    if (typeof raw?.home === "string") {
      return join(resolveLocalPath(configPath, raw.home, "."), "logs", "cli.log");
    }
  } catch {
  }
  return join(dirname(configPath), "logs", "cli.log");
}
function writeFailureLog(configPath, detail) {
  const preferred = cliLogPath(configPath);
  try {
    append(preferred, detail);
    return preferred;
  } catch (preferredError) {
    const fallback = join(tmpdir(), "floe-cli.log");
    append(fallback, `${detail}

CLI log fallback reason:
${fullErrorDetail(preferredError)}`);
    return fallback;
  }
}
function append(path, detail) {
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `
[${(/* @__PURE__ */ new Date()).toISOString()}] Floe command failed
${detail}
`, "utf8");
}
function explainFailure(error, configPath) {
  const record = asRecord(error);
  const detail = fullErrorDetail(error);
  if (record.code === "E_FOREIGN_BUS") {
    return {
      summary: "Floe could not start because another Floe bus is already using its configured address.",
      nextAction: "Stop the stale Floe process, or choose a different bus address in the config, then try again."
    };
  }
  if (hasCode(error, "EADDRINUSE")) {
    return {
      summary: "Floe could not start because its configured address is already in use.",
      nextAction: "Stop the program using that address, or choose a different address in the config, then try again."
    };
  }
  if (record.name === "ChannelUnavailableError" && record.reason === "not_running") {
    return {
      summary: "Floe could not complete this command because the required local service is not running.",
      nextAction: "Start Floe through the normal app or service for this machine, then try again."
    };
  }
  if (record.name === "YAMLParseError" || detail.includes(`Floe config at ${configPath}`) || detail.includes("Implicit keys need to be on a single line")) {
    return {
      summary: "Floe could not read its config file.",
      nextAction: `Fix or replace ${configPath}, then try again.`
    };
  }
  const message = error instanceof Error ? error.message.trim().split(/\r?\n/, 1)[0] : "";
  const safeMessage = message && message.length <= 240 && !/\b(?:at |E[A-Z]{3,}|node:|file:)/.test(message) ? `: ${message}` : " because an internal error occurred.";
  return {
    summary: `Floe could not complete this command${safeMessage}`,
    nextAction: "Try again. If it still fails, use the log below to diagnose the problem."
  };
}
function hasCode(error, code) {
  let current = error;
  const seen = /* @__PURE__ */ new Set();
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const record = current;
    if (record.code === code)
      return true;
    current = record.cause;
  }
  return fullErrorDetail(error).includes(code);
}
function fullErrorDetail(error) {
  if (!(error instanceof Error))
    return String(error);
  const parts = [];
  let current = error;
  const seen = /* @__PURE__ */ new Set();
  while (current instanceof Error && !seen.has(current)) {
    seen.add(current);
    parts.push(current.stack ?? `${current.name}: ${current.message}`);
    current = current.cause;
    if (current instanceof Error)
      parts.push("Caused by:");
  }
  return parts.join("\n");
}
function asRecord(value) {
  return value && typeof value === "object" ? value : {};
}

// floe-cli/dist/index.js
try {
  const { runCli } = await import("./cli-Z3B45KN3.js");
  await runCli(process.argv);
} catch (error) {
  printCliFailure(reportCliFailure(error, {
    argv: process.argv,
    debug: process.argv.includes("--debug")
  }));
  process.exitCode = 1;
}
