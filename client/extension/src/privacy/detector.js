export class PIIDetector {
    static PATTERNS = {
        email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,

        phone: /(?:(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{2,4}\)?[-.\s]?)?\d{3,4}[-.\s]?\d{4})\b/g,

        creditCard: /\b(?:\d[ -]*?){13,19}\b/g,

        ssn: /\b\d{3}-\d{2}-\d{4}\b/g,

        authToken: /\b(?:bearer\s+[a-zA-Z0-9_\-\.]{16,}|ghp_[a-zA-Z0-9]{36}|sk-[a-zA-Z0-9]{20,}|AKIA[0-9A-Z]{16})\b/gi,

        credentialUrl: /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^/:]+:[^/@]+@/i
    };

    static SENSITIVE_NAMES = [
        'password',
        'passwd',
        'pwd',
        'secret',
        'passphrase',
        'token',
        'apikey',
        'api_key',
        'auth',
        'ssn',
        'socialsecurity',
        'cvv',
        'cvc',
        'cardnumber',
        'creditcard'
    ];

    static isCredentialBearingUrl(urlString) {
        if (!urlString || typeof urlString !== 'string') {
            return false;
        }
        return this.PATTERNS.credentialUrl.test(urlString.trim());
    }

    static sanitizeUrl(urlString) {
        if (!urlString || typeof urlString !== 'string') {
            return '';
        }
        try {
            const parsed = new URL(urlString);
            if (parsed.username || parsed.password) {
                parsed.username = '[REDACTED]';
                parsed.password = '[REDACTED]';
            }
            return parsed.toString();
        } catch {
            return urlString.replace(this.PATTERNS.credentialUrl, 'https://[REDACTED]:[REDACTED]@');
        }
    }

    static isSensitiveName(attrValue) {
        if (!attrValue || typeof attrValue !== 'string') {
            return false;
        }
        const lower = attrValue.toLowerCase();
        return this.SENSITIVE_NAMES.some((keyword) => lower.includes(keyword));
    }

    static validateLuhn(candidate) {
        const clean = candidate.replace(/\D/g, '');
        if (clean.length < 13 || clean.length > 19) {
            return false;
        }
        let sum = 0;
        let shouldDouble = false;
        for (let i = clean.length - 1; i >= 0; i--) {
            let digit = parseInt(clean.charAt(i), 10);
            if (shouldDouble) {
                digit *= 2;
                if (digit > 9) {
                    digit -= 9;
                }
            }
            sum += digit;
            shouldDouble = !shouldDouble;
        }
        return sum % 10 === 0;
    }

    static detectInText(text) {
        if (!text || typeof text !== 'string') {
            return [];
        }
        const detections = [];

        const ssnMatches = text.match(this.PATTERNS.ssn) || [];
        for (const match of ssnMatches) {
            detections.push({ type: 'ssn', match });
        }

        const emailMatches = text.match(this.PATTERNS.email) || [];
        for (const match of emailMatches) {
            detections.push({ type: 'email', match });
        }

        const authMatches = text.match(this.PATTERNS.authToken) || [];
        for (const match of authMatches) {
            detections.push({ type: 'token', match });
        }

        const rawCardMatches = text.match(this.PATTERNS.creditCard) || [];
        for (const candidate of rawCardMatches) {
            const digitsOnly = candidate.replace(/\D/g, '');
            if (digitsOnly.length >= 13 && digitsOnly.length <= 19 && this.validateLuhn(candidate)) {
                detections.push({ type: 'credit_card', match: candidate.trim() });
            }
        }

        const phoneMatches = text.match(this.PATTERNS.phone) || [];
        for (const candidate of phoneMatches) {
            const digitsOnly = candidate.replace(/\D/g, '');
            if (digitsOnly.length >= 7 && digitsOnly.length <= 15) {
                const alreadyMatched = detections.some((d) => d.match.includes(candidate));
                if (!alreadyMatched) {
                    detections.push({ type: 'phone', match: candidate.trim() });
                }
            }
        }

        return detections;
    }

    static scanDOM(doc, win) {
        const detections = [];
        if (!doc || !doc.body) {
            return detections;
        }

        const elements = doc.querySelectorAll('input, textarea, select, [contenteditable="true"]');
        for (const el of elements) {
            const tag = el.tagName.toLowerCase();
            const inputType = (el.getAttribute('type') || '').toLowerCase();
            const nameAttr = el.getAttribute('name') || '';
            const idAttr = el.getAttribute('id') || '';
            const autocompleteAttr = el.getAttribute('autocomplete') || '';
            const rect = el.getBoundingClientRect();

            if (rect.width <= 0 || rect.height <= 0) {
                continue;
            }

            const bounds = {
                x: Math.round(rect.left),
                y: Math.round(rect.top),
                width: Math.round(rect.width),
                height: Math.round(rect.height)
            };

            if (inputType === 'password') {
                detections.push({
                    type: 'password',
                    confidence: 1.0,
                    bounds
                });
                continue;
            }

            if (
                this.isSensitiveName(nameAttr) ||
                this.isSensitiveName(idAttr) ||
                this.isSensitiveName(autocompleteAttr)
            ) {
                detections.push({
                    type: 'sensitive_field',
                    confidence: 0.95,
                    bounds
                });
                continue;
            }

            const liveValue = el.value || (tag === 'textarea' ? el.textContent : '');
            if (liveValue && typeof liveValue === 'string') {
                const textMatches = this.detectInText(liveValue);
                if (textMatches.length > 0) {
                    detections.push({
                        type: textMatches[0].type,
                        confidence: 0.9,
                        bounds
                    });
                }
            }
        }

        const walker = doc.createTreeWalker(doc.body, win.NodeFilter.SHOW_TEXT, null);
        let currentNode = walker.nextNode();

        while (currentNode) {
            const rawContent = currentNode.textContent;
            if (rawContent && rawContent.trim().length > 3) {
                const piiFound = this.detectInText(rawContent);
                if (piiFound.length > 0) {
                    const parent = currentNode.parentElement;
                    if (parent && parent.tagName.toLowerCase() !== 'script' && parent.tagName.toLowerCase() !== 'style') {
                        const rect = parent.getBoundingClientRect();
                        if (rect.width > 0 && rect.height > 0) {
                            detections.push({
                                type: piiFound[0].type,
                                confidence: 0.85,
                                bounds: {
                                    x: Math.round(rect.left),
                                            y: Math.round(rect.top),
                                            width: Math.round(rect.width),
                                            height: Math.round(rect.height)
                                }
                            });
                        }
                    }
                }
            }
            currentNode = walker.nextNode();
        }

        return detections;
    }
}
