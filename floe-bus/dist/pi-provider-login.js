import { getSupportedThinkingLevels } from "@earendil-works/pi-ai";
import { builtinModels } from "@earendil-works/pi-ai/providers/all";
/** A login owns its material only until the existing broker consumes it. */
export class EphemeralCredentialStore {
    credentials = new Map();
    async read(provider) { return this.credentials.get(provider); }
    async list() {
        return [...this.credentials].map(([providerId, credential]) => ({ providerId, type: credential.type }));
    }
    async modify(provider, fn) {
        const next = await fn(this.credentials.get(provider));
        if (next === undefined)
            this.credentials.delete(provider);
        else
            this.credentials.set(provider, next);
        return next;
    }
    async delete(provider) { this.credentials.delete(provider); }
    clear() { this.credentials.clear(); }
}
/** Pi is a provider adapter. Canonical identity, grants and secret storage stay in Floe. */
export class PiProviderLogin {
    async list() {
        const storage = new EphemeralCredentialStore();
        try {
            return builtinModels({ credentials: storage }).getProviders()
                .filter(provider => provider.auth.oauth?.isSubscription === true)
                .map(provider => ({
                type: "provider_status", provider: provider.id,
                name: provider.id === "openai-codex" ? "ChatGPT" : provider.id === "anthropic" ? "Claude" : provider.name,
                auth_name: provider.auth.oauth?.name ?? provider.name,
                connected: false, profile_id: `${provider.id}-subscription`,
                models: provider.getModels().map((model, index) => ({
                    id: model.id, name: model.name, is_default: index === 0,
                    reasoning_efforts: getSupportedThinkingLevels(model).filter(level => level !== "off"),
                })),
            }));
        }
        finally {
            storage.clear();
        }
    }
    async login(providerId, interaction, consume) {
        const storage = new EphemeralCredentialStore();
        try {
            const models = builtinModels({ credentials: storage });
            if (!models.getProviders().some(provider => provider.id === providerId && provider.auth.oauth?.isSubscription === true)) {
                throw new Error("This subscription provider is unavailable.");
            }
            await models.login(providerId, "oauth", interaction);
            interaction.signal?.throwIfAborted();
            const credential = await storage.read(providerId);
            if (!credential)
                throw new Error("Sign-in did not return a credential.");
            const material = Buffer.from(JSON.stringify(credential));
            try {
                await consume(material);
            }
            finally {
                material.fill(0);
            }
        }
        finally {
            storage.clear();
        }
    }
}
