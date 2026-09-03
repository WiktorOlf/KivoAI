import browserAPI from "./browser/api.js";

document.getElementById("scan").addEventListener("click", async () => {
    const result = document.getElementById("result");

    result.textContent = "Scanning...";

    const [tab] = await browserAPI.tabs.query({
        active: true,
        currentWindow: true
    });

    const response = await browserAPI.scripting.executeScript({
        target: {
            tabId: tab.id
        },

        func: () => {
            return {
                title: document.title,
                url: location.href,
                inputs: document.querySelectorAll("input").length,
                buttons: document.querySelectorAll("button").length,
                links: document.querySelectorAll("a").length,
                textLength: document.body.innerText.length
            };
        }
    });

    result.textContent = JSON.stringify(
        response[0].result,
        null,
        2
    );
});
