export class ScreenshotRedactor {
    static async redactScreenshot(dataUrl, sensitiveRegions = [], devicePixelRatio = 1) {
        if (!dataUrl || typeof dataUrl !== 'string') {
            throw new Error('Invalid image data provided for redaction.');
        }

        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';

            img.onload = () => {
                try {
                    const MAX_DIMENSION = 1024;
                    let targetWidth = img.width;
                    let targetHeight = img.height;

                    if (targetWidth > MAX_DIMENSION || targetHeight > MAX_DIMENSION) {
                        if (targetWidth > targetHeight) {
                            targetHeight = Math.round((targetHeight * MAX_DIMENSION) / targetWidth);
                            targetWidth = MAX_DIMENSION;
                        } else {
                            targetWidth = Math.round((targetWidth * MAX_DIMENSION) / targetHeight);
                            targetHeight = MAX_DIMENSION;
                        }
                    }

                    const canvas = document.createElement('canvas');
                    canvas.width = targetWidth;
                    canvas.height = targetHeight;

                    const ctx = canvas.getContext('2d');
                    if (!ctx) {
                        reject(new Error('Unable to create canvas context.'));
                        return;
                    }

                    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

                    const scaleX = targetWidth / (img.width / (devicePixelRatio || 1));
                    const scaleY = targetHeight / (img.height / (devicePixelRatio || 1));

                    ctx.fillStyle = '#000000';
                    for (const region of sensitiveRegions) {
                        if (!region || !region.bounds) continue;
                        const b = region.bounds;

                        const rx = Math.max(0, Math.floor(b.x * scaleX));
                        const ry = Math.max(0, Math.floor(b.y * scaleY));
                        const rw = Math.ceil(b.width * scaleX);
                        const rh = Math.ceil(b.height * scaleY);

                        if (rw > 0 && rh > 0) {
                            ctx.fillRect(rx, ry, rw, rh);
                        }
                    }

                    const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.70);

                    canvas.width = 0;
                    canvas.height = 0;

                    resolve(compressedDataUrl);
                } catch (err) {
                    reject(new Error(`Screenshot redaction failure: ${err.message}`));
                }
            };

            img.onerror = () => {
                reject(new Error('Failed to load image buffer for redaction.'));
            };

            img.src = dataUrl;
        });
    }
}
