import browserAPI from "./browser/api.js";
import { getConfig } from "./config.js";
import { getModels } from "./browser/openwebui.js";

async function loadSettings() {
    const config = await getConfig();

    document.getElementById("serverUrl").value =
    config.serverUrl;

    document.getElementById("model").value =
    config.model;
}

document.getElementById("fetchModels").addEventListener(
    "click",
    async () => {
        const status = document.getElementById("settingsStatus");

        const serverUrl = document.getElementById("serverUrl").value.trim();

        if (!serverUrl) {
            status.textContent = "Enter an Open WebUI server URL.";
            return;
        }

        let url;

        try {
            url = new URL(serverUrl);
        } catch (error) {
            status.textContent = "Invalid server URL.";
            return;
        }

        const origin = `${url.protocol}//${url.host}/*`;

        try {
            const granted = await browserAPI.permissions.request({
                origins: [
                    origin
                ]
            });

            if (!granted) {
                status.textContent =
                "Permission to access this server was denied.";

            return;
            }

            const config = await getConfig();

            status.textContent = "Fetching models...";

            const models = await getModels(
                serverUrl,
                config.apiKey
            );

            const modelSelect = document.getElementById("model");

            modelSelect.innerHTML = "";

            for (const model of models) {
                const option = document.createElement("option");

                option.value = model.id;
                option.textContent = model.name || model.id;

                modelSelect.appendChild(option);
            }

            status.textContent =
            `Found ${models.length} model(s).`;
        } catch (error) {
            status.textContent =
            `Failed to fetch models: ${error.message}`;
        }
    }
);

loadSettings();
