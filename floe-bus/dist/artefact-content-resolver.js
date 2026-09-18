import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { extname } from "node:path";
import { resolveWithinRoot } from "./fs/resolveWithinRoot.js";
export const MAX_ARTEFACT_CONTENT_BYTES = 20 * 1024 * 1024;
export class ArtefactContentNotFoundError extends Error {
    code = "artefact_content_not_found";
    constructor() {
        super("The exact ArtefactVersion content is not available in this Workspace.");
        this.name = "ArtefactContentNotFoundError";
    }
}
export class ArtefactContentUnresolvedError extends Error {
    resolver_id;
    code = "artefact_content_unresolved";
    constructor(resolver_id) {
        super("This exact ArtefactVersion requires a content resolver that is not available on this host.");
        this.resolver_id = resolver_id;
        this.name = "ArtefactContentUnresolvedError";
    }
}
export class ArtefactContentMismatchError extends Error {
    reason;
    code = "artefact_content_mismatch";
    constructor(reason) {
        super("The Workspace file does not match the required content identity. Floe will not substitute different bytes.");
        this.reason = reason;
        this.name = "ArtefactContentMismatchError";
    }
}
export class ArtefactContentTooLargeError extends Error {
    code = "artefact_content_too_large";
    constructor() {
        super("The exact ArtefactVersion content is too large to transfer through this preview surface.");
        this.name = "ArtefactContentTooLargeError";
    }
}
/**
 * Resolve the bytes named by one exact ArtefactVersion. A workspace-relative
 * path is only a hint: its bytes must still match the immutable digest before
 * they may be returned to any client.
 */
export function resolveArtefactVersionContent(input) {
    const version = input.store.getVersion(input.artefact_version_id);
    const artefact = version ? input.store.getArtefact(version.artefact_id) : null;
    if (!version || !artefact || artefact.workspace_id !== input.workspace_id) {
        throw new ArtefactContentNotFoundError();
    }
    if (version.content_ref.kind !== "workspace-relative") {
        throw new ArtefactContentUnresolvedError(version.content_ref.resolver_id);
    }
    return {
        artefact_version_id: version.artefact_version_id,
        ...resolveWorkspaceArtefactContent({
            workspace_locator: input.workspace_locator,
            content_ref: version.content_ref,
            maximum_bytes: input.maximum_bytes,
        }),
    };
}
/** Read and verify one local content reference before publication or transfer. */
export function resolveWorkspaceArtefactContent(input) {
    const contentRef = input.content_ref;
    let resolved;
    try {
        resolved = resolveWithinRoot(input.workspace_locator, contentRef.path);
    }
    catch {
        throw new ArtefactContentNotFoundError();
    }
    const maximumBytes = input.maximum_bytes ?? MAX_ARTEFACT_CONTENT_BYTES;
    let fileSize;
    try {
        const stat = statSync(resolved);
        if (!stat.isFile())
            throw new ArtefactContentNotFoundError();
        fileSize = stat.size;
    }
    catch (error) {
        if (error instanceof ArtefactContentNotFoundError)
            throw error;
        throw new ArtefactContentNotFoundError();
    }
    if (fileSize > maximumBytes)
        throw new ArtefactContentTooLargeError();
    if (contentRef.size_bytes != null && contentRef.size_bytes !== fileSize) {
        throw new ArtefactContentMismatchError("size");
    }
    let bytes;
    try {
        bytes = readFileSync(resolved);
    }
    catch {
        throw new ArtefactContentNotFoundError();
    }
    if (bytes.length > maximumBytes)
        throw new ArtefactContentTooLargeError();
    if (contentRef.size_bytes != null && contentRef.size_bytes !== bytes.length) {
        throw new ArtefactContentMismatchError("size");
    }
    const actualDigest = createHash("sha256").update(bytes).digest("hex");
    if (actualDigest !== contentRef.digest.value) {
        throw new ArtefactContentMismatchError("digest");
    }
    return {
        media_type: safeMediaType(contentRef),
        digest: contentRef.digest,
        size_bytes: bytes.length,
        bytes,
    };
}
function safeMediaType(contentRef) {
    const declared = contentRef.media_type?.toLowerCase().split(";", 1)[0]?.trim() ?? "";
    if (SAFE_MEDIA_TYPES.has(declared))
        return declared;
    return MEDIA_TYPE_BY_EXTENSION.get(extname(contentRef.path).toLowerCase()) ?? "application/octet-stream";
}
const SAFE_MEDIA_TYPES = new Set([
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/gif",
    "text/plain",
    "text/html",
    "text/markdown",
    "text/csv",
    "application/json",
    "model/gltf-binary",
]);
const MEDIA_TYPE_BY_EXTENSION = new Map([
    [".png", "image/png"],
    [".jpg", "image/jpeg"],
    [".jpeg", "image/jpeg"],
    [".webp", "image/webp"],
    [".gif", "image/gif"],
    [".txt", "text/plain"],
    [".html", "text/html"],
    [".htm", "text/html"],
    [".md", "text/markdown"],
    [".csv", "text/csv"],
    [".json", "application/json"],
    [".glb", "model/gltf-binary"],
]);
