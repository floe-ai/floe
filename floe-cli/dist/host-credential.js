import { spawnSync } from "node:child_process";
const HOST_CREDENTIAL_TARGET = "local-bus-host-control.com.floe.console";
const MINIMUM_HOST_CREDENTIAL_LENGTH = 32;
/**
 * Read or create the desktop-owned host credential without putting it in a
 * command argument, environment variable, config file, or CLI output.
 *
 * The Windows target matches keyring::Entry::new(service, account), which the
 * installed desktop uses. The credential is returned only to the trusted CLI
 * transport or the Bus child-process hand-off.
 */
export function readOrCreateHostControlCredential(platform = process.platform, run = runCredentialCommand) {
    if (platform !== "win32") {
        throw new Error("Floe CLI operation authentication currently requires the Windows credential vault. "
            + "Use the desktop app on this platform until its native credential adapter is available.");
    }
    const script = windowsCredentialScript(HOST_CREDENTIAL_TARGET);
    const encodedScript = Buffer.from(script, "utf16le").toString("base64");
    const result = run("powershell.exe", [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-EncodedCommand",
        encodedScript,
    ]);
    if (result.error || result.status !== 0) {
        const detail = result.stderr.trim();
        throw new Error(detail
            ? `Floe could not access this computer's secure credential storage: ${detail}`
            : "Floe could not access this computer's secure credential storage.");
    }
    const credential = result.stdout.trim();
    if (credential.length < MINIMUM_HOST_CREDENTIAL_LENGTH || /[\r\n\u0000-\u001f\u007f]/.test(credential)) {
        throw new Error("Floe's secure credential storage returned an invalid host credential.");
    }
    return credential;
}
function runCredentialCommand(command, args) {
    return spawnSync(command, [...args], {
        encoding: "utf8",
        windowsHide: true,
        shell: false,
    });
}
function windowsCredentialScript(target) {
    return String.raw `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public static class FloeWindowsCredential {
{
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct CREDENTIAL
    {
        public UInt32 Flags;
        public UInt32 Type;
        public IntPtr TargetName;
        public IntPtr Comment;
        public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
        public UInt32 CredentialBlobSize;
        public IntPtr CredentialBlob;
        public UInt32 Persist;
        public UInt32 AttributeCount;
        public IntPtr Attributes;
        public IntPtr TargetAlias;
        public IntPtr UserName;
    }

    [DllImport("Advapi32.dll", EntryPoint = "CredReadW", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool CredRead(string target, UInt32 type, UInt32 flags, out IntPtr credential);

    [DllImport("Advapi32.dll", EntryPoint = "CredWriteW", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool CredWrite(ref CREDENTIAL credential, UInt32 flags);

    [DllImport("Advapi32.dll", SetLastError = false)]
    public static extern void CredFree(IntPtr credential);
}
'@

$target = '${target}'
$credentialPointer = [IntPtr]::Zero
$secret = $null
if ([FloeWindowsCredential]::CredRead($target, 1, 0, [ref]$credentialPointer)) {
    try {
        $credential = [Runtime.InteropServices.Marshal]::PtrToStructure(
            $credentialPointer,
            [type][FloeWindowsCredential+CREDENTIAL]
        )
        $bytes = New-Object byte[] $credential.CredentialBlobSize
        if ($bytes.Length -gt 0) {
            [Runtime.InteropServices.Marshal]::Copy($credential.CredentialBlob, $bytes, 0, $bytes.Length)
        }
        $secret = [Text.Encoding]::UTF8.GetString($bytes)
        [Array]::Clear($bytes, 0, $bytes.Length)
    }
    finally {
        [FloeWindowsCredential]::CredFree($credentialPointer)
    }
}
elseif ([Runtime.InteropServices.Marshal]::GetLastWin32Error() -eq 1168) {
    $random = New-Object byte[] 32
    $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $generator.GetBytes($random) } finally { $generator.Dispose() }
    $secret = 'floe_host_control_' + [Convert]::ToBase64String($random).TrimEnd('=').Replace('+', '-').Replace('/', '_')
    [Array]::Clear($random, 0, $random.Length)

    $targetPointer = [Runtime.InteropServices.Marshal]::StringToCoTaskMemUni($target)
    $commentPointer = [Runtime.InteropServices.Marshal]::StringToCoTaskMemUni('Floe local host control')
    $userPointer = [Runtime.InteropServices.Marshal]::StringToCoTaskMemUni('local-bus-host-control')
    $blob = [Text.Encoding]::UTF8.GetBytes($secret)
    $blobPointer = [Runtime.InteropServices.Marshal]::AllocCoTaskMem($blob.Length)
    try {
        [Runtime.InteropServices.Marshal]::Copy($blob, 0, $blobPointer, $blob.Length)
        $credential = New-Object FloeWindowsCredential+CREDENTIAL
        $credential.Flags = 0
        $credential.Type = 1
        $credential.TargetName = $targetPointer
        $credential.Comment = $commentPointer
        $credential.CredentialBlobSize = $blob.Length
        $credential.CredentialBlob = $blobPointer
        $credential.Persist = 3
        $credential.AttributeCount = 0
        $credential.Attributes = [IntPtr]::Zero
        $credential.TargetAlias = [IntPtr]::Zero
        $credential.UserName = $userPointer
        if (-not [FloeWindowsCredential]::CredWrite([ref]$credential, 0)) {
            throw "Windows credential write failed with code $([Runtime.InteropServices.Marshal]::GetLastWin32Error())."
        }
    }
    finally {
        [Array]::Clear($blob, 0, $blob.Length)
        [Runtime.InteropServices.Marshal]::FreeCoTaskMem($blobPointer)
        [Runtime.InteropServices.Marshal]::FreeCoTaskMem($targetPointer)
        [Runtime.InteropServices.Marshal]::FreeCoTaskMem($commentPointer)
        [Runtime.InteropServices.Marshal]::FreeCoTaskMem($userPointer)
    }
}
else {
    throw "Windows credential read failed with code $([Runtime.InteropServices.Marshal]::GetLastWin32Error())."
}

[Console]::Out.Write($secret)
`;
}
export const hostCredentialVaultContract = Object.freeze({
    target: HOST_CREDENTIAL_TARGET,
    minimum_length: MINIMUM_HOST_CREDENTIAL_LENGTH,
});
