import { PIIDetector } from './detector.js';

export class DOMSanitizer {
    static INTERACTIVE_SELECTOR = [
        'button',
        'a[href]',
        'input',
        'textarea',
        'select',
        '[role="button"]',
        '[role="link"]',
        '[role="textbox"]',
        '[role="checkbox"]',
        '[role="radio"]',
        '[role="combobox"]',
        '[role="tab"]'
    ].join(', ');

    static cleanText(str, maxLength = 80) {
        if (!str || typeof str !== 'string') {
            return '';
        }
        const cleaned = str.replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
        if (cleaned.length <= maxLength) {
            return cleaned;
        }
        return cleaned.substring(0, maxLength) + '...';
    }

    static getAccessibleLabel(el, doc) {
        if (!el) {
            return '';
        }

        const ariaLabel = el.getAttribute('aria-label');
        if (ariaLabel && ariaLabel.trim()) {
            return this.cleanText(ariaLabel);
        }

        const labelledBy = el.getAttribute('aria-labelledby');
        if (labelledBy && doc) {
            const refEl = doc.getElementById(labelledBy.trim());
            if (refEl && refEl.textContent) {
                return this.cleanText(refEl.textContent);
            }
        }

        if (el.id && doc) {
            const labelEl = doc.querySelector(`label[for="${CSS.escape(el.id)}"]`);
            if (labelEl && labelEl.textContent) {
                return this.cleanText(labelEl.textContent);
            }
        }

        const parentLabel = el.closest('label');
        if (parentLabel && parentLabel.textContent) {
            return this.cleanText(parentLabel.textContent);
        }

        const placeholder = el.getAttribute('placeholder');
        if (placeholder && placeholder.trim()) {
            return this.cleanText(placeholder);
        }

        const title = el.getAttribute('title');
        if (title && title.trim()) {
            return this.cleanText(title);
        }

        const name = el.getAttribute('name');
        if (name && name.trim()) {
            return this.cleanText(name);
        }

        return '';
    }

    static sanitizeElement(el, doc, win) {
        if (!el || !el.getBoundingClientRect) {
            return null;
        }

        const rect = el.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) {
            return null;
        }

        if (win && win.getComputedStyle) {
            const style = win.getComputedStyle(el);
            if (
                style.display === 'none' ||
                style.visibility === 'hidden' ||
                parseFloat(style.opacity || '1') <= 0.05
            ) {
                return null;
            }
        }

        const tag = el.tagName.toLowerCase();
        const role = (el.getAttribute('role') || '').toLowerCase();
        const inputType = (el.getAttribute('type') || '').toLowerCase();
        const label = this.getAccessibleLabel(el, doc);
        const nameAttr = el.getAttribute('name') || '';
        const idAttr = el.getAttribute('id') || '';

        let elementType = 'interactive';
        if (tag === 'button' || role === 'button') {
            elementType = 'button';
        } else if (tag === 'a' || role === 'link') {
            elementType = 'link';
        } else if (tag === 'input') {
            elementType = 'input';
        } else if (tag === 'textarea' || role === 'textbox') {
            elementType = 'textarea';
        } else if (tag === 'select' || role === 'combobox') {
            elementType = 'select';
        }

        const disabled = el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true';

        const isPassword = inputType === 'password';
        const isSensitive =
        isPassword ||
        PIIDetector.isSensitiveName(nameAttr) ||
        PIIDetector.isSensitiveName(idAttr) ||
        PIIDetector.isSensitiveName(label);

        let safeText = '';
        if (isSensitive) {
            safeText = '[REDACTED]';
        } else if (elementType === 'button' || elementType === 'link') {
            const rawText = el.textContent || '';
            const detected = PIIDetector.detectInText(rawText);
            if (detected.length > 0) {
                safeText = '[REDACTED]';
            } else {
                safeText = this.cleanText(rawText);
            }
        } else {
            if (el.value && el.value.length > 0) {
                safeText = '[FILLED]';
            } else {
                safeText = '';
            }
        }

        if (safeText !== '[REDACTED]' && safeText !== '[FILLED]' && safeText.length > 0) {
            if (PIIDetector.detectInText(safeText).length > 0) {
                safeText = '[REDACTED]';
            }
        }

        let safeLabel = label;
        if (PIIDetector.detectInText(safeLabel).length > 0) {
            safeLabel = '[REDACTED]';
        }

        return {
            type: elementType,
            role: role || (elementType === 'button' ? 'button' : elementType === 'link' ? 'link' : ''),
            label: safeLabel,
            text: safeText,
            enabled: !disabled,
            id: idAttr ? this.cleanText(idAttr, 40) : undefined
        };
    }

    static sanitizeDocument(doc, win) {
        if (!doc) {
            return {
                title: '',
                url: '',
                viewport: { width: 0, height: 0 },
                elements: []
            };
        }

        const sanitizedUrl = PIIDetector.sanitizeUrl(doc.location ? doc.location.href : '');
        const rawTitle = doc.title || '';
        const sanitizedTitle = PIIDetector.detectInText(rawTitle).length > 0
        ? '[REDACTED TITLE]'
        : this.cleanText(rawTitle, 100);

        const viewport = {
            width: win && win.innerWidth ? win.innerWidth : 1280,
            height: win && win.innerHeight ? win.innerHeight : 800
        };

        const candidates = doc.querySelectorAll(this.INTERACTIVE_SELECTOR);
        const elements = [];

        for (const candidate of candidates) {
            const sanitized = this.sanitizeElement(candidate, doc, win);
            if (sanitized) {
                elements.push(sanitized);
            }
        }

        return {
            title: sanitizedTitle,
            url: sanitizedUrl,
            viewport,
            elements
        };
    }
}
