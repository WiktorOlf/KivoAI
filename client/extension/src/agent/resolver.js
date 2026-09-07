export class DOMResolver {
    static normalize(str) {
        if (!str || typeof str !== 'string') {
            return '';
        }
        return str.toLowerCase().replace(/\s+/g, ' ').trim();
    }

    static isVisible(el, win) {
        if (!el || !el.getBoundingClientRect) {
            return false;
        }

        const rect = el.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) {
            return false;
        }

        if (win && win.getComputedStyle) {
            const style = win.getComputedStyle(el);
            if (
                style.display === 'none' ||
                style.visibility === 'hidden' ||
                parseFloat(style.opacity || '1') <= 0.05
            ) {
                return false;
            }
        }

        return true;
    }

    static isEnabled(el) {
        if (!el) {
            return false;
        }
        if (el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true') {
            return false;
        }
        return true;
    }

    static resolveTarget(target, doc, win) {
        if (!target || !doc) {
            return { success: false, element: null, error: 'Target and Document are required.' };
        }

        const interactiveSelector = [
            'button',
            'a[href]',
            'input',
            'textarea',
            'select',
            '[role="button"]',
            '[role="link"]',
            '[role="textbox"]',
            '[role="tab"]'
        ].join(', ');

        const allCandidates = Array.from(doc.querySelectorAll(interactiveSelector));

        const candidates = allCandidates.filter((el) => this.isVisible(el, win) && this.isEnabled(el));

        if (candidates.length === 0) {
            return { success: false, element: null, error: 'No visible and enabled interactive elements found.' };
        }

        if (typeof target === 'object' && target !== null) {
            const targetRole = target.role ? this.normalize(target.role) : null;
            const targetName = target.name ? this.normalize(target.name) : null;

            const matched = candidates.filter((el) => {
                const elRole = this.normalize(el.getAttribute('role') || el.tagName);
                const elText = this.normalize(el.textContent);
                const elAria = this.normalize(el.getAttribute('aria-label') || '');

                const roleMatch = !targetRole || elRole.includes(targetRole);
                const nameMatch = !targetName || elText.includes(targetName) || elAria.includes(targetName);
                return roleMatch && nameMatch;
            });

            if (matched.length === 0) {
                return { success: false, element: null, error: `Target element not found: ${JSON.stringify(target)}` };
            }
            if (matched.length > 1) {
                return {
                    success: false,
                    element: null,
                    error: `Ambiguous target. ${matched.length} matching elements found for: ${JSON.stringify(target)}`
                };
            }
            return { success: true, element: matched[0], error: null };
        }

        const query = this.normalize(String(target));

        const exactIdMatch = candidates.filter((el) => this.normalize(el.id) === query);
        if (exactIdMatch.length === 1) {
            return { success: true, element: exactIdMatch[0], error: null };
        }

        const exactAriaMatch = candidates.filter((el) => this.normalize(el.getAttribute('aria-label')) === query);
        if (exactAriaMatch.length === 1) {
            return { success: true, element: exactAriaMatch[0], error: null };
        }

        const exactTextMatch = candidates.filter((el) => this.normalize(el.textContent) === query);
        if (exactTextMatch.length === 1) {
            return { success: true, element: exactTextMatch[0], error: null };
        }

        const partialMatches = candidates.filter((el) => {
            const text = this.normalize(el.textContent);
            const aria = this.normalize(el.getAttribute('aria-label') || '');
            const placeholder = this.normalize(el.getAttribute('placeholder') || '');
            const nameAttr = this.normalize(el.getAttribute('name') || '');

            return text.includes(query) || aria.includes(query) || placeholder.includes(query) || nameAttr.includes(query);
        });

        if (partialMatches.length === 0) {
            return { success: false, element: null, error: `Target "${target}" not found on page.` };
        }

        if (partialMatches.length > 1) {
            return {
                success: false,
                element: null,
                error: `Ambiguous target. Found ${partialMatches.length} matching elements for "${target}". Action rejected for safety.`
            };
        }

        return { success: true, element: partialMatches[0], error: null };
    }
}
