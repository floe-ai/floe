/**
 * Hook registry — lifecycle hook points for extensions.
 *
 * Extensions register handlers via `ExtensionContext.hooks.on(...)`.
 * The adapter fires hooks at the appropriate lifecycle points.
 * Handlers run sequentially in registration order; failures are
 * caught and logged, never crashing the adapter.
 */
export class HookRegistry {
    handlers = new Map();
    /** Register a handler for a hook. */
    on(hook, extensionName, handler) {
        if (!this.handlers.has(hook)) {
            this.handlers.set(hook, []);
        }
        this.handlers.get(hook).push({ extensionName, handler });
    }
    /** Remove all handlers registered by an extension. */
    removeAll(extensionName) {
        for (const [, handlers] of this.handlers) {
            const filtered = handlers.filter(h => h.extensionName !== extensionName);
            // Mutate in-place via splice so the Map entry stays valid
            handlers.length = 0;
            handlers.push(...filtered);
        }
    }
    /** Fire a hook — runs all handlers sequentially, collects results. */
    async fire(hook, payload) {
        const handlers = this.handlers.get(hook) ?? [];
        const results = [];
        for (const { extensionName, handler } of handlers) {
            try {
                const result = await handler(payload);
                if (result && typeof result === "object" && "inject" in result) {
                    results.push(result);
                }
            }
            catch (error) {
                console.error(`[hooks] ${hook} handler from extension '${extensionName}' failed`, error);
            }
        }
        return results;
    }
    /** Check if any handlers are registered for a hook. */
    hasHandlers(hook) {
        return (this.handlers.get(hook)?.length ?? 0) > 0;
    }
    /** List all hooks that have registered handlers with their counts. */
    listRegistered() {
        const result = [];
        for (const [hook, handlers] of this.handlers) {
            if (handlers.length > 0) {
                result.push({ hook, count: handlers.length });
            }
        }
        return result;
    }
}
