import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { CanonicalExtensionActivationAuthority } from "./extension-activation-authority.js";
import { IsolatedExtensionActivationAssurance, IsolatedExtensionProcessHost, } from "./isolated-extension-host.js";
import { ExtensionSandboxError, inspectExtensionSandbox, } from "./isolated-extension-runtime.js";
export const FLOE_EXTENSION_CONTRACT_VERSION = "1";
/**
 * One native boundary owns activation assurance and invocation. Canonical
 * Extension records remain in ExtensionStore; the process host is execution
 * infrastructure only.
 */
export class CanonicalExtensionRuntime {
    assurance;
    entry_point_execution;
    host;
    floeVersion;
    contractVersions;
    broker;
    constructor(input) {
        this.floeVersion = input.floe_version ?? "0.1.0";
        this.contractVersions = [...(input.operation_contract_versions ?? [FLOE_EXTENSION_CONTRACT_VERSION])];
        this.broker = input.broker;
        const audit = new SqliteExtensionRuntimeAudit(input.db);
        this.host = new IsolatedExtensionProcessHost({
            executable_path: process.execPath,
            script_path: fileURLToPath(new URL("./isolated-extension-host-process.js", import.meta.url)),
            allow_fs_read: [
                fileURLToPath(new URL("./", import.meta.url)),
                fileURLToPath(new URL("../package.json", import.meta.url)),
                fileURLToPath(new URL("../../package.json", import.meta.url)),
                fileURLToPath(new URL("../../node_modules/", import.meta.url)),
                // Source builds load npm dependencies; desktop bundles contain them.
                // Absent source-tree paths are not prerequisites for an installed host.
            ].filter((path) => existsSync(path)),
        }, input.broker, audit, {
            onUnexpectedExit: (event) => input.quarantine({
                ...event,
                failure_code: "extension_host_unexpected_exit",
                failure_message: `The isolated Extension host stopped unexpectedly (${event.signal ?? event.code ?? "unknown"}).`,
            }),
        }, input.limits);
        const authority = new CanonicalExtensionActivationAuthority(input.db, input.approvals);
        const compatibility = new CurrentExtensionCompatibilityVerifier(this.floeVersion, this.contractVersions);
        this.assurance = new IsolatedExtensionActivationAssurance(this.host, authority, compatibility, input.workspace_root);
        this.entry_point_execution = this.host;
    }
    inspect() {
        const status = (available) => available === undefined ? "unknown" : available ? "configured" : "unavailable";
        return {
            ...inspectExtensionSandbox(),
            floe_version: this.floeVersion,
            operation_contract_versions: [...this.contractVersions],
            brokers: {
                operations: status(this.broker.availability?.operations),
                filesystem: status(this.broker.availability?.filesystem),
                network: status(this.broker.availability?.network),
            },
            authority: "Configured brokers still require exact declared package permissions and current caller grants. This is configuration, not proof of successful activation or invocation.",
        };
    }
    terminateAll() {
        this.host.terminateAll();
    }
}
export class CurrentExtensionCompatibilityVerifier {
    floeVersion;
    operationContractVersions;
    constructor(floeVersion, operationContractVersions) {
        this.floeVersion = floeVersion;
        this.operationContractVersions = operationContractVersions;
    }
    verify(input) {
        if (!input.operation_contract_versions.some((version) => this.operationContractVersions.includes(version))) {
            return {
                compatible: false,
                reason_code: "extension_operation_contract_incompatible",
                message: "The Extension does not declare an operation contract supported by this Floe host.",
            };
        }
        if (!satisfiesComparatorRange(this.floeVersion, input.floe_version_range)) {
            return {
                compatible: false,
                reason_code: "extension_floe_version_incompatible",
                message: `The Extension does not support Floe ${this.floeVersion}.`,
            };
        }
        return { compatible: true };
    }
}
export class DeniedExtensionHostBroker {
    availability = { operations: false, filesystem: false, network: false };
    invokeOperation() {
        return Promise.reject(new ExtensionSandboxError("extension_operation_broker_unavailable", "The canonical operation broker is not available to this Extension host."));
    }
    accessFilesystem() {
        return Promise.reject(new ExtensionSandboxError("extension_filesystem_broker_unavailable", "No canonical filesystem grant broker is available to this Extension host."));
    }
    requestNetwork() {
        return Promise.reject(new ExtensionSandboxError("extension_network_broker_unavailable", "No canonical Connector broker is available to this Extension host."));
    }
}
export class SqliteExtensionRuntimeAudit {
    db;
    now;
    constructor(db, now = () => new Date().toISOString()) {
        this.db = db;
        this.now = now;
        applyExtensionRuntimeAuditSchema(db);
    }
    record(input) {
        this.db.prepare(`
      INSERT INTO extension_runtime_audit (
        extension_runtime_audit_id, workspace_id, authorized_principal_id,
        operation_invocation_id, execution_attempt_id, extension_package_version_id,
        entry_point_id, call_kind, permission_id, outcome, code, recorded_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(`extraudit_${randomUUID()}`, input.context.workspace_id, input.context.authorized_principal_id, input.context.operation_invocation_id, input.context.execution_attempt_id, input.context.extension_package_version_id, input.context.entry_point_id, input.call.kind, input.call.permission_id, input.outcome, input.code, this.now());
    }
    listForInvocation(operationInvocationId) {
        return this.db.prepare(`
      SELECT * FROM extension_runtime_audit WHERE operation_invocation_id = ?
      ORDER BY recorded_at, extension_runtime_audit_id
    `).all(operationInvocationId);
    }
}
export function applyExtensionRuntimeAuditSchema(db) {
    db.exec(`
    CREATE TABLE IF NOT EXISTS extension_runtime_audit (
      extension_runtime_audit_id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      authorized_principal_id TEXT NOT NULL,
      operation_invocation_id TEXT NOT NULL,
      execution_attempt_id TEXT,
      extension_package_version_id TEXT NOT NULL REFERENCES extension_package_versions(extension_package_version_id),
      entry_point_id TEXT NOT NULL,
      call_kind TEXT NOT NULL CHECK (call_kind IN ('operation', 'filesystem', 'network')),
      permission_id TEXT NOT NULL,
      outcome TEXT NOT NULL CHECK (outcome IN ('completed', 'refused', 'failed')),
      code TEXT NOT NULL,
      recorded_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_extension_runtime_audit_invocation
      ON extension_runtime_audit(operation_invocation_id, recorded_at, extension_runtime_audit_id);
  `);
}
function satisfiesComparatorRange(version, range) {
    const actual = parseVersion(version);
    if (!actual)
        return false;
    const normalized = range.trim();
    if (normalized === "*" || normalized.toLowerCase() === "latest")
        return true;
    const comparators = normalized.split(/\s+/).filter(Boolean);
    if (comparators.length === 0)
        return false;
    return comparators.every((part) => {
        const match = /^(>=|<=|>|<|=|\^|~)?(\d+)(?:\.(\d+))?(?:\.(\d+))?$/.exec(part);
        if (!match)
            return false;
        const target = [Number(match[2]), Number(match[3] ?? 0), Number(match[4] ?? 0)];
        const relation = compareVersion(actual, target);
        switch (match[1] ?? "=") {
            case ">=": return relation >= 0;
            case "<=": return relation <= 0;
            case ">": return relation > 0;
            case "<": return relation < 0;
            case "=": return relation === 0;
            case "^": return relation >= 0 && compareVersion(actual, caretUpperBound(target)) < 0;
            case "~": return relation >= 0 && actual[0] === target[0] && actual[1] === target[1];
            default: return false;
        }
    });
}
function caretUpperBound(version) {
    if (version[0] > 0)
        return [version[0] + 1, 0, 0];
    if (version[1] > 0)
        return [0, version[1] + 1, 0];
    return [0, 0, version[2] + 1];
}
function parseVersion(value) {
    const match = /^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:[-+].*)?$/.exec(value.trim());
    return match ? [Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0)] : null;
}
function compareVersion(left, right) {
    for (let index = 0; index < 3; index += 1) {
        if (left[index] < right[index])
            return -1;
        if (left[index] > right[index])
            return 1;
    }
    return 0;
}
