import browserAPI from "./browser/api.js";

const DEFAULT_SERVER_URL = "https://openwebui.microverse.diy";

const DEFAULT_MODEL = "";

async function getConfig() {
    const stored = await browserAPI.storage.local.get([
        "serverUrl",
        "apiKey",
        "model"
    ]);

    return {
        serverUrl: stored.serverUrl || DEFAULT_SERVER_URL,
        apiKey: stored.apiKey || "",
        model: stored.model || DEFAULT_MODEL
    };
}

export {
    DEFAULT_SERVER_URL,
    DEFAULT_MODEL,
    getConfig
};
