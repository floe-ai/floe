import { Buffer } from "node:buffer";
import { describe, expect, it, vi } from "vitest";
import { hostCredentialVaultContract, readOrCreateHostControlCredential, } from "./host-credential.js";
describe("CLI host-control credential boundary", () => {
    it("uses the desktop Credential Manager target without putting bearer material in arguments", () => {
        const bearer = `floe_host_control_${"a".repeat(48)}`;
        const run = vi.fn(() => ({
            status: 0,
            stdout: bearer,
            stderr: "",
            error: undefined,
        }));
        expect(readOrCreateHostControlCredential("win32", run)).toBe(bearer);
        expect(run).toHaveBeenCalledOnce();
        const [command, args] = run.mock.calls[0];
        expect(command).toBe("powershell.exe");
        expect(args).toContain("-NonInteractive");
        expect(args.join(" ")).not.toContain(bearer);
        const encoded = args[args.indexOf("-EncodedCommand") + 1];
        const script = Buffer.from(encoded, "base64").toString("utf16le");
        expect(script).toContain(hostCredentialVaultContract.target);
        expect(script).toContain("CredRead");
        expect(script).toContain("CredWrite");
        expect(script).not.toContain(bearer);
    });
    it("does not accept an environment variable or CLI-provided bearer fallback", () => {
        const original = process.env.FLOE_HOST_CONTROL_TOKEN;
        process.env.FLOE_HOST_CONTROL_TOKEN = `untrusted_${"x".repeat(48)}`;
        try {
            const run = vi.fn(() => ({
                status: 0,
                stdout: `vault_${"v".repeat(48)}`,
                stderr: "",
                error: undefined,
            }));
            expect(readOrCreateHostControlCredential("win32", run)).toBe(`vault_${"v".repeat(48)}`);
        }
        finally {
            if (original === undefined)
                delete process.env.FLOE_HOST_CONTROL_TOKEN;
            else
                process.env.FLOE_HOST_CONTROL_TOKEN = original;
        }
    });
    it("refuses unsupported platform and invalid vault output", () => {
        const unused = vi.fn();
        expect(() => readOrCreateHostControlCredential("linux", unused)).toThrow("Windows credential vault");
        expect(unused).not.toHaveBeenCalled();
        const invalid = vi.fn(() => ({
            status: 0,
            stdout: "short",
            stderr: "",
            error: undefined,
        }));
        expect(() => readOrCreateHostControlCredential("win32", invalid)).toThrow("invalid host credential");
    });
    it("reports vault failures without returning captured output as a credential", () => {
        const failed = vi.fn(() => ({
            status: 1,
            stdout: "",
            stderr: "Windows credential read failed.",
            error: undefined,
        }));
        expect(() => readOrCreateHostControlCredential("win32", failed))
            .toThrow("secure credential storage: Windows credential read failed.");
    });
});
