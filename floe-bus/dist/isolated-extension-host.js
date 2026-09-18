import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { realpathSync } from "node:fs";
import { ExtensionSandboxError, authorizeExtensionHostCall, parseExtensionHostCall, verifyInstalledExtensionPackage, } from "./isolated-extension-runtime.js";
const DEFAULT_START_TIMEOUT_MS = 10_000;
const DEFAULT_STOP_TIMEOUT_MS = 5_000;
const DEFAULT_INVOCATION_TIMEOUT_MS = 20_000;
/**
 * Owns isolated child processes only. Canonical Extension identity and
 * lifecycle remain in ExtensionStore.
 */
export class IsolatedExtensionProcessHost {
    launcher;
    broker;
    audit;
    events;
    isolation_host_id;
    limits;
    active = new Map();
    constructor(launcher, broker, audit, events, limits = {}, isolationHostId = "extension-host:quickjs-process:v1") {
        this.launcher = launcher;
        this.broker = broker;
        this.audit = audit;
        this.events = events;
        this.isolation_host_id = isolationHostId;
        this.limits = {
            memory_limit_bytes: limits.memory_limit_bytes ?? 32 * 1024 * 1024,
            stack_limit_bytes: limits.stack_limit_bytes ?? 512 * 1024,
            execution_timeout_ms: limits.execution_timeout_ms ?? 15_000,
            parent_invocation_timeout_ms: limits.parent_invocation_timeout_ms ?? DEFAULT_INVOCATION_TIMEOUT_MS,
            start_timeout_ms: limits.start_timeout_ms ?? DEFAULT_START_TIMEOUT_MS,
            stop_timeout_ms: limits.stop_timeout_ms ?? DEFAULT_STOP_TIMEOUT_MS,
            variant: limits.variant ?? "release",
        };
    }
    /** Verify exact installed bytes without running package code. */
    inspect(input) {
        return verifyInstalledExtensionPackage({
            workspace_root: input.workspace_root,
            installation_locator: input.installation.installation_locator,
            package_version: input.package_version,
        });
    }
    isActive(input) {
        const record = this.active.get(input.extension_installation_id);
        return Boolean(record
            && record.ready
            && !record.intentional_stop
            && record.package_version.extension_package_version_id === input.extension_package_version_id);
    }
    /**
     * Start a candidate before stopping the previous package. A failed candidate
     * therefore leaves the current package untouched. The swap occurs only after
     * the exact candidate reports ready.
     */
    async activate(input) {
        const verified = this.inspect(input);
        const current = this.active.get(input.installation.extension_installation_id);
        if (current?.package_version.extension_package_version_id === input.package_version.extension_package_version_id
            && current.ready && !current.intentional_stop) {
            return activationClaim(input, this.isolation_host_id, "enabled");
        }
        const candidate = await this.startCandidate(input, verified);
        if (current) {
            const stopped = await this.stopRecord(current);
            if (!stopped) {
                await this.stopRecord(candidate);
                throw new ExtensionSandboxError("extension_upgrade_previous_host_uncertain", "The previous Extension host could not be proven stopped; the candidate was discarded.");
            }
        }
        this.active.set(input.installation.extension_installation_id, candidate);
        return activationClaim(input, this.isolation_host_id, "enabled");
    }
    async deactivate(input) {
        const record = this.active.get(input.installation.extension_installation_id);
        if (!record)
            return null;
        if (record.workspace_id !== input.installation.workspace_id
            || record.package_version.extension_package_version_id !== input.package_version.extension_package_version_id)
            return null;
        const stopped = await this.stopRecord(record);
        if (!stopped)
            return null;
        this.active.delete(input.installation.extension_installation_id);
        return {
            receipt_ref: `extension-host-deactivation:${randomUUID()}`,
            workspace_id: input.installation.workspace_id,
            extension_installation_id: input.installation.extension_installation_id,
            extension_package_version_id: input.package_version.extension_package_version_id,
            isolation_host_id: this.isolation_host_id,
            result: "disabled",
        };
    }
    async invoke(input) {
        const record = this.active.get(input.extension_installation_id);
        if (!record || !record.ready || record.intentional_stop) {
            throw new ExtensionSandboxError("extension_not_active", "The exact Extension package is not active.");
        }
        if (record.package_version.extension_package_version_id !== input.extension_package_version_id
            || input.context.extension_package_version_id !== input.extension_package_version_id
            || input.context.workspace_id !== record.workspace_id
            || input.context.extension_id !== record.package_version.extension_id) {
            throw new ExtensionSandboxError("extension_execution_context_denied", "Extension invocation does not match the active package.");
        }
        if (record.busy)
            throw new ExtensionSandboxError("extension_host_busy", "The isolated Extension host is already processing an invocation.");
        record.busy = true;
        record.active_context = input.context;
        try {
            return await this.request(record, {
                type: "invoke",
                entry_point_id: input.entry_point_id,
                request: input.request,
                context: input.context,
            }, this.limits.parent_invocation_timeout_ms);
        }
        catch (error) {
            if (error.code === "extension_host_timeout") {
                record.intentional_stop = false;
                record.child.kill();
            }
            throw error;
        }
        finally {
            record.active_context = null;
            record.busy = false;
        }
    }
    async dispose() {
        const records = [...this.active.values()];
        this.active.clear();
        await Promise.all(records.map((record) => this.stopRecord(record)));
    }
    cancelExecutionAttempt(attemptId) {
        for (const record of this.active.values()) {
            if (record.active_context?.execution_attempt_id !== attemptId || record.intentional_stop)
                continue;
            record.intentional_stop = true;
            for (const pending of record.pending.values()) {
                clearTimeout(pending.timer);
                pending.reject(new ExtensionSandboxError("extension_execution_cancelled", "The Extension Command attempt was cancelled."));
            }
            record.pending.clear();
            record.child.kill();
            return true;
        }
        return false;
    }
    /**
     * Synchronous shutdown boundary for a BusStore that must close SQLite in the
     * same call. Child processes receive no chance to keep running after their
     * canonical owner has stopped.
     */
    terminateAll() {
        const records = [...this.active.values()];
        this.active.clear();
        for (const record of records) {
            record.intentional_stop = true;
            for (const pending of record.pending.values()) {
                clearTimeout(pending.timer);
                pending.reject(new ExtensionSandboxError("extension_host_stopped", "The isolated Extension host stopped with its Bus owner."));
            }
            record.pending.clear();
            record.child.kill();
        }
    }
    async startCandidate(input, verified) {
        const allowRead = [...new Set([
                realpathSync(this.launcher.script_path),
                ...this.launcher.allow_fs_read.map((path) => realpathSync(path)),
            ])];
        const args = [
            "--permission",
            ...allowRead.map((path) => `--allow-fs-read=${path}`),
            this.launcher.script_path,
            ...(this.launcher.script_arguments ?? []),
        ];
        const child = spawn(this.launcher.executable_path, args, {
            cwd: undefined,
            env: minimalChildEnvironment(),
            stdio: ["ignore", "ignore", "ignore", "ipc"],
            windowsHide: true,
        });
        const record = {
            child,
            installation_id: input.installation.extension_installation_id,
            workspace_id: input.installation.workspace_id,
            package_version: input.package_version,
            isolation_host_id: this.isolation_host_id,
            pending: new Map(),
            ready: false,
            intentional_stop: false,
            active_context: null,
            busy: false,
        };
        this.attachProcess(record);
        try {
            await this.waitForReady(record);
            await this.request(record, {
                type: "activate",
                package_version: input.package_version,
                entry_points: verified.entry_points,
                limits: {
                    variant: this.limits.variant,
                    memory_limit_bytes: this.limits.memory_limit_bytes,
                    stack_limit_bytes: this.limits.stack_limit_bytes,
                    execution_timeout_ms: this.limits.execution_timeout_ms,
                },
            }, this.limits.start_timeout_ms);
            record.ready = true;
            return record;
        }
        catch (error) {
            record.intentional_stop = true;
            record.child.kill();
            await waitForExit(record.child, this.limits.stop_timeout_ms);
            throw error;
        }
    }
    attachProcess(record) {
        record.child.on("message", (raw) => {
            if (raw?.type === "ready" && raw.process_protocol === 1) {
                record.ready = true;
                return;
            }
            if (raw?.type === "response" && typeof raw.request_id === "string") {
                const pending = record.pending.get(raw.request_id);
                if (!pending)
                    return;
                record.pending.delete(raw.request_id);
                clearTimeout(pending.timer);
                if (raw.ok)
                    pending.resolve((raw.result ?? null));
                else
                    pending.reject(new ExtensionSandboxError(typeof raw.error?.code === "string" ? raw.error.code : "extension_host_failed", typeof raw.error?.message === "string" ? raw.error.message : "Extension host failed."));
                return;
            }
            if (raw?.type === "broker_call" && typeof raw.request_id === "string") {
                void this.handleBrokerCall(record, raw.request_id, raw.call);
            }
        });
        record.child.once("exit", (code, signal) => {
            for (const pending of record.pending.values()) {
                clearTimeout(pending.timer);
                pending.reject(new ExtensionSandboxError("extension_host_exited", "The isolated Extension host exited."));
            }
            record.pending.clear();
            const isCurrent = this.active.get(record.installation_id) === record;
            if (isCurrent)
                this.active.delete(record.installation_id);
            if (!record.intentional_stop && (isCurrent || record.ready)) {
                void this.events.onUnexpectedExit({
                    workspace_id: record.workspace_id,
                    extension_installation_id: record.installation_id,
                    extension_package_version_id: record.package_version.extension_package_version_id,
                    isolation_host_id: record.isolation_host_id,
                    code,
                    signal,
                });
            }
        });
    }
    async handleBrokerCall(record, requestId, rawCall) {
        try {
            if (!record.active_context) {
                throw new ExtensionSandboxError("extension_execution_context_missing", "Extension broker call has no active invocation.");
            }
            const call = parseExtensionHostCall(JSON.stringify(rawCall));
            const result = await authorizeExtensionHostCall({
                package_version: record.package_version,
                call,
                context: record.active_context,
                broker: this.broker,
            });
            await this.audit.record({ context: record.active_context, call, outcome: "completed", code: "completed" });
            record.child.send?.({ type: "broker_result", request_id: requestId, ok: true, result });
        }
        catch (error) {
            const normalized = normalizeError(error, "extension_broker_failed");
            if (record.active_context && rawCall && typeof rawCall === "object") {
                try {
                    const call = parseExtensionHostCall(JSON.stringify(rawCall));
                    await this.audit.record({
                        context: record.active_context,
                        call,
                        outcome: normalized.code.endsWith("denied") ? "refused" : "failed",
                        code: normalized.code,
                    });
                }
                catch { /* invalid calls carry no trusted audit shape */ }
            }
            record.child.send?.({ type: "broker_result", request_id: requestId, ok: false, error: normalized });
        }
    }
    waitForReady(record) {
        if (record.ready)
            return Promise.resolve();
        return new Promise((resolveReady, rejectReady) => {
            const timer = setTimeout(() => {
                record.child.off("message", onMessage);
                record.child.off("exit", onExit);
                rejectReady(new ExtensionSandboxError("extension_host_start_timeout", "The isolated Extension host did not start in time."));
            }, this.limits.start_timeout_ms);
            const onMessage = (message) => {
                if (message?.type !== "ready" || message.process_protocol !== 1)
                    return;
                clearTimeout(timer);
                record.child.off("message", onMessage);
                record.child.off("exit", onExit);
                resolveReady();
            };
            const onExit = () => {
                clearTimeout(timer);
                record.child.off("message", onMessage);
                rejectReady(new ExtensionSandboxError("extension_host_start_failed", "The isolated Extension host exited before it was ready."));
            };
            record.child.on("message", onMessage);
            record.child.once("exit", onExit);
        });
    }
    request(record, message, timeoutMs) {
        if (!record.child.connected) {
            return Promise.reject(new ExtensionSandboxError("extension_host_exited", "The isolated Extension host is not connected."));
        }
        return new Promise((resolveRequest, rejectRequest) => {
            const requestId = `host_${randomUUID()}`;
            const timer = setTimeout(() => {
                record.pending.delete(requestId);
                rejectRequest(new ExtensionSandboxError("extension_host_timeout", "The isolated Extension host exceeded its parent deadline."));
            }, timeoutMs);
            record.pending.set(requestId, { resolve: resolveRequest, reject: rejectRequest, timer });
            record.child.send?.({ ...message, request_id: requestId }, (error) => {
                if (!error)
                    return;
                const pending = record.pending.get(requestId);
                if (!pending)
                    return;
                record.pending.delete(requestId);
                clearTimeout(pending.timer);
                pending.reject(new ExtensionSandboxError("extension_host_send_failed", error.message));
            });
        });
    }
    async stopRecord(record) {
        if (record.child.exitCode !== null || record.child.signalCode !== null)
            return true;
        record.intentional_stop = true;
        try {
            await this.request(record, { type: "deactivate" }, this.limits.stop_timeout_ms);
            return await waitForExit(record.child, this.limits.stop_timeout_ms);
        }
        catch {
            record.child.kill();
            return await waitForExit(record.child, this.limits.stop_timeout_ms);
        }
    }
}
/**
 * Production ExtensionStore assurance. Approval verification is injected from
 * the canonical ApprovalReceipt store and defaults to no authority.
 */
export class IsolatedExtensionActivationAssurance {
    host;
    activationAuthority;
    compatibilityVerifier;
    workspaceRoot;
    constructor(host, activationAuthority, compatibilityVerifier, workspaceRoot) {
        this.host = host;
        this.activationAuthority = activationAuthority;
        this.compatibilityVerifier = compatibilityVerifier;
        this.workspaceRoot = workspaceRoot;
    }
    async assess(input) {
        const unresolved = [];
        const compatibility = this.compatibilityVerifier.verify(input.package_version.definition.compatibility);
        if (!compatibility.compatible) {
            unresolved.push({
                kind: "compatibility",
                binding_key: input.package_version.extension_package_version_id,
                reason_code: compatibility.reason_code ?? "extension_incompatible",
                message: compatibility.message ?? "The exact Extension package is not compatible with this Floe host.",
            });
        }
        const workspaceRoot = this.workspaceRoot(input.workspace_id);
        if (!workspaceRoot) {
            unresolved.push({
                kind: "isolation_host",
                binding_key: input.workspace_id,
                reason_code: "extension_workspace_binding_unavailable",
                message: "The Workspace has no verified local locator for this Extension installation.",
            });
        }
        if (input.package_version.definition.required_isolation_level !== "process_sandbox") {
            unresolved.push({
                kind: "isolation_host",
                binding_key: input.package_version.definition.required_isolation_level,
                reason_code: "extension_isolation_level_unavailable",
                message: "This host supports process_sandbox packages only.",
            });
        }
        if (unresolved.length > 0 || !workspaceRoot) {
            return { permission_approvals: [], isolation_hosts: [], unresolved_bindings: unresolved };
        }
        const installation = {
            extension_installation_id: input.extension_installation_id,
            workspace_id: input.workspace_id,
            installation_locator: input.installation_locator,
        };
        let reservation;
        try {
            reservation = this.activationAuthority.reserve({
                invocation_id: input.invocation_id,
                workspace_id: input.workspace_id,
                extension_installation_id: input.extension_installation_id,
                package_version: input.package_version,
                operation_id: input.operation_id,
                authorized_principal_id: input.authorized_principal_id,
                requested_lifecycle: input.requested_lifecycle,
                installation_locator: input.installation_locator,
                approval_receipt_refs: input.approval_receipt_refs,
                approval_policy_ref: input.approval_policy_ref,
                capability_grant_ids: input.capability_grant_ids,
            });
        }
        catch (error) {
            const normalized = normalizeError(error, "extension_permission_approval_invalid");
            return {
                permission_approvals: [],
                isolation_hosts: [],
                unresolved_bindings: [{
                        kind: "permission_approval",
                        binding_key: input.package_version.permission_digest,
                        reason_code: normalized.code,
                        message: normalized.message,
                    }],
            };
        }
        if (reservation.replay) {
            const completed = reservation.attempt.state === "completed" && reservation.attempt.host_claim;
            const stillActive = input.requested_lifecycle === "installed" || this.host.isActive({
                extension_installation_id: input.extension_installation_id,
                extension_package_version_id: input.package_version.extension_package_version_id,
            });
            if (completed && stillActive) {
                return {
                    permission_approvals: [reservation.approval],
                    isolation_hosts: [reservation.attempt.host_claim],
                    unresolved_bindings: [],
                };
            }
            return {
                permission_approvals: [reservation.approval],
                isolation_hosts: [],
                unresolved_bindings: [{
                        kind: "isolation_host",
                        binding_key: input.package_version.extension_package_version_id,
                        reason_code: "extension_activation_reconciliation_required",
                        message: "This activation attempt may already have run. Floe refused to run it again until the host state is reconciled.",
                    }],
            };
        }
        try {
            const activation = { workspace_root: workspaceRoot, installation, package_version: input.package_version };
            const verified = this.host.inspect(activation);
            if (verified.package_version.extension_package_version_id !== input.package_version.extension_package_version_id) {
                throw new ExtensionSandboxError("extension_package_identity_mismatch", "Installed Extension bytes do not match the activation target.");
            }
            this.activationAuthority.markRunning(reservation.attempt.extension_activation_attempt_id);
            const hostClaim = input.requested_lifecycle === "installed"
                ? activationClaim(activation, this.host.isolation_host_id, "installed")
                : await this.host.activate(activation);
            try {
                this.activationAuthority.complete(reservation.attempt.extension_activation_attempt_id, hostClaim);
            }
            catch (error) {
                if (input.requested_lifecycle === "enabled") {
                    await this.host.deactivate({ installation, package_version: input.package_version });
                }
                throw error;
            }
            return {
                permission_approvals: [reservation.approval],
                isolation_hosts: [hostClaim],
                unresolved_bindings: [],
            };
        }
        catch (error) {
            const normalized = normalizeError(error, "extension_activation_failed");
            try {
                this.activationAuthority.fail(reservation.attempt.extension_activation_attempt_id, normalized.code, normalized.message);
            }
            catch {
                // A concurrent or durable terminal record is stronger evidence than a
                // secondary failure transition. Never mask the original host outcome.
            }
            return {
                permission_approvals: [reservation.approval],
                isolation_hosts: [],
                unresolved_bindings: [{
                        kind: "isolation_host",
                        binding_key: input.package_version.extension_package_version_id,
                        reason_code: normalized.code,
                        message: normalized.message,
                    }],
            };
        }
    }
    deactivate(input) {
        return this.host.deactivate({ installation: input.installation, package_version: input.package_version });
    }
}
function activationClaim(input, isolationHostId, lifecycle) {
    return {
        host_id: isolationHostId,
        workspace_id: input.installation.workspace_id,
        supported_isolation_levels: ["process_sandbox"],
        status: "available",
        receipt_ref: `extension-host-activation:${randomUUID()}`,
        subject_content_digest: input.package_version.content_digest,
        installation_locator: input.installation.installation_locator,
        result_lifecycle: lifecycle,
    };
}
function minimalChildEnvironment() {
    const names = process.platform === "win32"
        ? ["SystemRoot", "WINDIR", "TEMP", "TMP", "PATHEXT"]
        : ["TMPDIR", "LANG"];
    const env = { FLOE_ISOLATED_EXTENSION_HOST: "1" };
    for (const name of names)
        if (process.env[name])
            env[name] = process.env[name];
    return env;
}
function waitForExit(child, timeoutMs) {
    if (child.exitCode !== null || child.signalCode !== null)
        return Promise.resolve(true);
    return new Promise((resolveExit) => {
        const timer = setTimeout(() => {
            child.off("exit", onExit);
            resolveExit(false);
        }, timeoutMs);
        const onExit = () => {
            clearTimeout(timer);
            resolveExit(true);
        };
        child.once("exit", onExit);
    });
}
function normalizeError(error, fallbackCode) {
    return {
        code: typeof error?.code === "string" ? error.code : fallbackCode,
        message: error instanceof Error ? error.message : String(error),
    };
}
