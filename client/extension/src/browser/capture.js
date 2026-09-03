import browserAPI from "./api.js";

async function captureVisibleTab() {
    const dataUrl = await browserAPI.tabs.captureVisibleTab(
        null,
        {
            format: "png"
        }
    );

    return dataUrl;
}

export {
    captureVisibleTab
};
