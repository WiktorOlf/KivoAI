import { BrowserAPI } from './api.js';
import { ScreenshotRedactor } from '../redaction/redactor.js';

export class TabCapture {
    static async captureAndRedact(sensitiveRegions = [], windowId) {
        const rawDataUrl = await BrowserAPI.captureVisibleTab(windowId);
        const dpr = typeof window !== 'undefined' && window.devicePixelRatio ? window.devicePixelRatio : 1;

        return await ScreenshotRedactor.redactScreenshot(
            rawDataUrl,
            sensitiveRegions,
            dpr
        );
    }
}
