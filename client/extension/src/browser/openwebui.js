import browserAPI from "./api.js";

async function requestServerPermission(serverUrl) {
    const url = new URL(serverUrl);

    const origin = `${url.protocol}//${url.host}/*`;

    const granted = await browserAPI.permissions.request({
        origins: [
            origin
        ]
    });

    if (!granted) {
        throw new Error(
            "Permission to access the Open WebUI server was denied."
        );
    }

    return true;
}

async function testConnection(serverUrl, apiKey) {
    const response = await fetch(
        `${serverUrl}/api/models`,
        {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${apiKey}`
            }
        }
    );

    if (!response.ok) {
        throw new Error(
            `Open WebUI returned HTTP ${response.status}`
        );
    }

    return await response.json();
}

async function getModels(serverUrl, apiKey) {
    const response = await fetch(
        `${serverUrl}/api/models`,
        {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${apiKey}`
            }
        }
    );

    if (!response.ok) {
        throw new Error(
            `Open WebUI returned HTTP ${response.status}`
        );
    }

    const data = await response.json();

    return data.data || [];
}

async function sendVisionRequest(
    serverUrl,
    apiKey,
    model,
    imageDataUrl,
    prompt
) {
    const response = await fetch(
        `${serverUrl}/api/chat/completions`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model,
                messages: [
                    {
                        role: "user",
                        content: [
                            {
                                type: "text",
                                text: "Look at this webpage screenshot. Reply with exactly one short sentence describing what you see."
                            },
                            {
                                type: "image_url",
                                image_url: {
                                    url: imageDataUrl
                                }
                            }
                        ]
                    }
                ],
                max_tokens: 50,
                chat_template_kwargs: {
                    enable_thinking: false
                }
            })
        }
    );

    if (!response.ok) {
        const errorText = await response.text();

        throw new Error(
            `Open WebUI returned HTTP ${response.status}: ${errorText}`
        );
    }

    const data = await response.json();

    return data;
}

export {
    requestServerPermission,
    testConnection,
    getModels,
    sendVisionRequest
};
