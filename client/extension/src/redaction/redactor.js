function redactImage(dataUrl, detections, viewport) {
    return new Promise((resolve, reject) => {
        const image = new Image();

        image.onload = () => {
            const canvas = document.createElement("canvas");

            canvas.width = image.naturalWidth;
            canvas.height = image.naturalHeight;

            const context = canvas.getContext("2d");

            context.drawImage(
                image,
                0,
                0,
                canvas.width,
                canvas.height
            );

            const scaleX = canvas.width / viewport.width;
            const scaleY = canvas.height / viewport.height;

            for (const detection of detections) {
                const bounds = detection.bounds;

                const x = bounds.x * scaleX;
                const y = bounds.y * scaleY;
                const width = bounds.width * scaleX;
                const height = bounds.height * scaleY;

                context.fillStyle = "black";

                context.fillRect(
                    x,
                    y,
                    width,
                    height
                );
            }

            resolve(canvas.toDataURL("image/png"));
        };

        image.onerror = () => {
            reject(new Error("Failed to load screenshot"));
        };

        image.src = dataUrl;
    });
}

export {
    redactImage
};
