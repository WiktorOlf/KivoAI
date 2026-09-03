import browserAPI from "./api.js";

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

export {
    testConnection
};

