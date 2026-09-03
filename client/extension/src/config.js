import browserAPI from "./browser/api.js";

const DEFAULT_SERVER_URL = "https://openwebui.microverse.diy";

const DEFAULT_MODEL = "Gemma-4-E4B-Uncensored-HauhauCS-Aggressive-Q4_K_M";

async function getConfig() {
    const stored = await browserAPI.storage.local.get([
        "serverUrl",
        "apiKey",
        "model"
    ]);

    let model =
        stored.model || DEFAULT_MODEL;

    // Migrate the old display-name value
    // to the actual Open WebUI model ID.
    if (model === "Gemma 4") {
        model = DEFAULT_MODEL;

        await browserAPI.storage.local.set({
            model: DEFAULT_MODEL
        });
    }

    return {
        serverUrl:
            stored.serverUrl || DEFAULT_SERVER_URL,
        apiKey:
            stored.apiKey || "",
        model
    };
}

export {
    DEFAULT_SERVER_URL,
    DEFAULT_MODEL,
    getConfig
};
