export class BrowserAPI {
    static getAPI() {
        if (typeof globalThis.browser !== 'undefined' && globalThis.browser.runtime) {
            return globalThis.browser;
        }
        if (typeof globalThis.chrome !== 'undefined' && globalThis.chrome.runtime) {
            return globalThis.chrome;
        }
        throw new Error('WebExtension environment not detected.');
    }

    static async getStorage(keys) {
        const api = this.getAPI();
        if (!api.storage || !api.storage.local) return {};

        try {
            const res = api.storage.local.get(keys);
            if (res && typeof res.then === 'function') return await res;
        } catch (_) {}

        return new Promise((resolve, reject) => {
            api.storage.local.get(keys, (items) => {
                const err = api.runtime.lastError;
                if (err) reject(new Error(err.message));
                else resolve(items || {});
            });
        });
    }

    static async setStorage(items) {
        const api = this.getAPI();
        if (!api.storage || !api.storage.local) return;

        try {
            const res = api.storage.local.set(items);
            if (res && typeof res.then === 'function') return await res;
        } catch (_) {}

        return new Promise((resolve, reject) => {
            api.storage.local.set(items, () => {
                const err = api.runtime.lastError;
                if (err) reject(new Error(err.message));
                else resolve();
            });
        });
    }

    static async getActiveTab() {
        const api = this.getAPI();
        if (!api.tabs || !api.tabs.query) {
            throw new Error('tabs.query API unavailable.');
        }

        try {
            const res = api.tabs.query({ active: true, currentWindow: true });
            if (res && typeof res.then === 'function') {
                const tabs = await res;
                if (!tabs || tabs.length === 0) throw new Error('No active browser tab found.');
                return tabs[0];
            }
        } catch (err) {
            if (err.message === 'No active browser tab found.') throw err;
        }

        return new Promise((resolve, reject) => {
            api.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                const err = api.runtime.lastError;
                if (err) reject(new Error(err.message));
                else if (!tabs || tabs.length === 0) reject(new Error('No active browser tab found.'));
                else resolve(tabs[0]);
            });
        });
    }

    static async executeScript(tabId, func, args = []) {
        const api = this.getAPI();
        if (!api.scripting || !api.scripting.executeScript) {
            throw new Error('scripting.executeScript API unavailable.');
        }

        const injection = { target: { tabId }, func };
        if (Array.isArray(args) && args.length > 0) injection.args = args;

        try {
            const res = api.scripting.executeScript(injection);
            if (res && typeof res.then === 'function') {
                const results = await res;
                return (!results || results.length === 0) ? null : results[0].result;
            }
        } catch (err) {
            throw err;
        }

        return new Promise((resolve, reject) => {
            api.scripting.executeScript(injection, (results) => {
                const err = api.runtime.lastError;
                if (err) reject(new Error(err.message));
                else if (!results || results.length === 0) resolve(null);
                else resolve(results[0].result);
            });
        });
    }

    static async captureVisibleTab(windowId) {
        const api = this.getAPI();
        if (!api.tabs || !api.tabs.captureVisibleTab) {
            throw new Error('tabs.captureVisibleTab API unavailable.');
        }

        const options = { format: 'png' };
        const hasWindowId = typeof windowId === 'number' && windowId >= 0;

        try {
            const res = hasWindowId
                ? api.tabs.captureVisibleTab(windowId, options)
                : api.tabs.captureVisibleTab(options);

            if (res && typeof res.then === 'function') {
                const dataUrl = await res;
                if (!dataUrl) throw new Error('Screenshot capture returned empty image.');
                return dataUrl;
            }
        } catch (err) {
            if (err.message && !err.message.includes('callback')) throw err;
        }

        return new Promise((resolve, reject) => {
            const callback = (dataUrl) => {
                const err = api.runtime.lastError;
                if (err) reject(new Error(`Screenshot capture failed: ${err.message}`));
                else if (!dataUrl) reject(new Error('Screenshot capture returned empty image.'));
                else resolve(dataUrl);
            };

            if (hasWindowId) {
                api.tabs.captureVisibleTab(windowId, options, callback);
            } else {
                api.tabs.captureVisibleTab(options, callback);
            }
        });
    }
}
