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

export {
    requestServerPermission,
    testConnection,
    getModels
};
