import browserAPI from "./browser/api.js";
import { captureVisibleTab } from "./browser/capture.js";
import { redactImage } from "./redaction/redactor.js";
import { getConfig } from "./config.js";
import { getModels, requestServerPermission, testConnection, sendVisionRequest } from "./browser/openwebui.js";

document.getElementById("scan").addEventListener(
    "click",
    async () => {
        const result = document.getElementById("result");

        result.textContent = "Scanning...";

        try {
            const [tab] = await browserAPI.tabs.query({
                active: true,
                currentWindow: true
            });

            const response = await browserAPI.scripting.executeScript({
                target: {
                    tabId: tab.id
                },

                func: () => {
                    function detectPII() {
                        const detections = [];

                        const inputs = document.querySelectorAll(
                            "input, textarea"
                        );

                        for (const element of inputs) {
                            const type =
                                (element.type || "").toLowerCase();

                            const name =
                                (element.name || "").toLowerCase();

                            const id =
                                (element.id || "").toLowerCase();

                            const autocomplete = (
                                element.autocomplete || ""
                            ).toLowerCase();

                            let piiType = null;

                            if (
                                type === "password" ||
                                name.includes("password") ||
                                id.includes("password")
                            ) {
                                piiType = "password";
                            } else if (
                                type === "email" ||
                                autocomplete.includes("email") ||
                                name.includes("email") ||
                                id.includes("email")
                            ) {
                                piiType = "email";
                            } else if (
                                autocomplete.includes("tel") ||
                                name.includes("phone") ||
                                name.includes("tel") ||
                                id.includes("phone") ||
                                id.includes("tel")
                            ) {
                                piiType = "phone";
                            } else if (
                                autocomplete.includes(
                                    "street-address"
                                ) ||
                                name.includes("address") ||
                                id.includes("address")
                            ) {
                                piiType = "address";
                            }

                            if (piiType !== null) {
                                const rect =
                                    element.getBoundingClientRect();

                                detections.push({
                                    type: piiType,
                                    source: "dom",
                                    confidence: 1.0,
                                    bounds: {
                                        x: rect.x,
                                        y: rect.y,
                                        width: rect.width,
                                        height: rect.height
                                    }
                                });
                            }
                        }

                        return detections;
                    }

                    return {
                        page: {
                            title: document.title,
                            url: location.href,
                            inputs:
                                document.querySelectorAll(
                                    "input"
                                ).length,
                            buttons:
                                document.querySelectorAll(
                                    "button"
                                ).length,
                            links:
                                document.querySelectorAll(
                                    "a"
                                ).length,
                            textLength:
                                document.body.innerText.length
                        },

                        viewport: {
                            width: window.innerWidth,
                            height: window.innerHeight
                        },

                        pii: detectPII()
                    };
                }
            });

            const scanResult = response[0].result;

            const screenshot = await captureVisibleTab();

            const sanitizedScreenshot = await redactImage(
                screenshot,
                scanResult.pii,
                scanResult.viewport
            );

            const config = await getConfig();

            if (!config.apiKey) {
                throw new Error(
                    "Enter and save your Open WebUI API key first."
                );
            }

            if (!config.model) {
                throw new Error(
                    "No AI model is selected."
                );
            }

            result.textContent =
                "Sending sanitized screenshot to Gemma...";

            const visionResponse = await sendVisionRequest(
                config.serverUrl,
                config.apiKey,
                config.model,
                sanitizedScreenshot,
                "Analyze this webpage screenshot. Describe what is visible, identify the important UI elements, and explain what a browser agent could interact with. Do not attempt to infer or reconstruct any redacted information."
            );

            const aiMessage =
                visionResponse.choices?.[0]?.message?.content ||
                "No response from the vision model.";

            result.innerHTML = `
                <strong>Page:</strong>
                ${scanResult.page.title}

                <br>

                <strong>PII detections:</strong>

                <pre>${JSON.stringify(
                    scanResult.pii,
                    null,
                    2
                )}</pre>

                <strong>Original screenshot:</strong>

                <br>

                <img
                    src="${screenshot}"
                    style="width: 100%; margin-top: 10px;"
                >

                <br>

                <strong>Sanitized screenshot:</strong>

                <br>

                <img
                    src="${sanitizedScreenshot}"
                    style="width: 100%; margin-top: 10px;"
                >

                <br>

                <strong>Gemma 4 analysis:</strong>

                <br>

                <pre>${aiMessage}</pre>
            `;
        } catch (error) {
            result.textContent =
                `Error: ${error.message}`;
        }
    }
);

document.getElementById("testConnection").addEventListener(
    "click",
    async () => {
        const status =
            document.getElementById("settingsStatus");

        try {
            const serverUrl =
                "https://openwebui.microverse.diy";

            await requestServerPermission(
                serverUrl
            );

            const config = await getConfig();

            if (!config.apiKey) {
                status.textContent =
                    "Enter and save your API key first.";

                return;
            }

            status.textContent =
                "Connecting...";

            const data = await testConnection(
                config.serverUrl,
                config.apiKey
            );

            const modelCount =
                data.data
                    ? data.data.length
                    : 0;

            status.textContent =
                `Connected. Found ${modelCount} model(s).`;
        } catch (error) {
            status.textContent =
                `Connection failed: ${error.message}`;
        }
    }
);
async function loadSettings() {
    const config = await getConfig();

    document.getElementById("apiKey").value =
        config.apiKey;

    document.getElementById("serverUrl").value =
        config.serverUrl;

    document.getElementById("model").value =
        config.model;
}

loadSettings();

document.getElementById("saveSettings").addEventListener(
    "click",
    async () => {
        const serverUrl =
            document.getElementById("serverUrl").value.trim();

        const apiKey =
            document.getElementById("apiKey").value.trim();

        const model =
            document.getElementById("model").value.trim();

        await browserAPI.storage.local.set({
            serverUrl,
            apiKey,
            model
        });

        document.getElementById("settingsStatus").textContent =
            "Settings saved.";
    }
);

document.getElementById("advancedSettings").addEventListener(
    "click",
    () => {
        document.getElementById("advancedPanel").style.display =
            "block";

        document.getElementById("advancedSettings").style.display =
            "none";
    }
);

document.getElementById("closeAdvancedSettings").addEventListener(
    "click",
    () => {
        document.getElementById("advancedPanel").style.display =
            "none";

        document.getElementById("advancedSettings").style.display =
            "block";
    }
);

document.getElementById("fetchModels").addEventListener(
    "click",
    async () => {
        const status =
            document.getElementById("settingsStatus");

        const serverUrl =
            document.getElementById("serverUrl").value.trim();

        if (!serverUrl) {
            status.textContent =
                "Enter an Open WebUI server URL.";

            return;
        }

        let url;

        try {
            url = new URL(serverUrl);
        } catch (error) {
            status.textContent =
                "Invalid server URL.";

            return;
        }

        const origin =
            `${url.protocol}//${url.host}/*`;

        try {
            const granted =
                await browserAPI.permissions.request({
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

            if (!config.apiKey) {
                status.textContent =
                    "Enter and save your API key first.";

                return;
            }

            status.textContent =
                "Fetching models...";

            const models = await getModels(
                serverUrl,
                config.apiKey
            );

            const modelSelect =
                document.getElementById("model");

            modelSelect.innerHTML = "";

            for (const model of models) {
                const option =
                    document.createElement("option");

                option.value = model.id;

                option.textContent =
                    model.name || model.id;

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
