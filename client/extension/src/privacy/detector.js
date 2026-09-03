function detectPII() {
    const detections = [];

    const inputs = document.querySelectorAll("input, textarea");

    for (const element of inputs) {
        const type = (element.type || "").toLowerCase();
        const name = (element.name || "").toLowerCase();
        const id = (element.id || "").toLowerCase();
        const autocomplete = (element.autocomplete || "").toLowerCase();

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

export {
    detectPII
};
