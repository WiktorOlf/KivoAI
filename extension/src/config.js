import { BrowserAPI } from './browser/api.js';

export const DEFAULT_CONFIG = {
    serverUrl: 'https://openwebui.example.com',
    apiKey: '',
    model: 'Gemma 4',
    theme: 'graphite-dark',
    maxSteps: 20,
    maxTokens: 3000,
    temperature: 0.1,
    timeoutMs: 60000
};

export class ConfigManager {
    static async getConfig() {
        const stored = await BrowserAPI.getStorage(['kivo_config']);
        return {
            ...DEFAULT_CONFIG,
            ...(stored.kivo_config || {})
        };
    }

    static async saveConfig(partialConfig) {
        const current = await this.getConfig();
        const updated = {
            ...current,
            ...partialConfig
        };

        if (typeof updated.maxSteps === 'number') {
            updated.maxSteps = Math.min(Math.max(updated.maxSteps, 1), 999);
        }

        if (typeof updated.maxTokens === 'number') {
            updated.maxTokens = Math.min(Math.max(updated.maxTokens, 100), 3000);
        }

        await BrowserAPI.setStorage({ kivo_config: updated });
        return updated;
    }
}
