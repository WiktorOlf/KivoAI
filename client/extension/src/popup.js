import browserAPI from "./browser/api.js";
import { captureVisibleTab } from "./browser/capture.js";
import { redactImage } from "./redaction/redactor.js";
import {
    DEFAULT_SERVER_URL,
    DEFAULT_MODEL
} from "./config.js";

document.getElementById("scan").addEventListener("click", async () => {
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
                        const type = (element.type || "").toLowerCase();
                        const name = (element.name || "").toLowerCase();
                        const id = (element.id || "").toLowerCase();
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
                            autocomplete.includes("street-address") ||
                            name.includes("address") ||
                            id.includes("address")
                        ) {
                            piiType = "address";
                        }

                        if (piiType !== null) {
                            const rect = element.getBoundingClientRect();

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
                        inputs: document.querySelectorAll("input").length,
                        buttons: document.querySelectorAll("button").length,
                        links: document.querySelectorAll("a").length,
                        textLength: document.body.innerText.length
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

        result.innerHTML = `
            <strong>Page:</strong> ${scanResult.page.title}

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
        `;
    } catch (error) {
        result.textContent = `Error: ${error.message}`;
    }
});
