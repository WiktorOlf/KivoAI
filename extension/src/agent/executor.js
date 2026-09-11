import { ALLOWED_ACTIONS } from './schema.js';

export class ActionExecutor {
    static findTarget(targetStr, doc) {
        if (!targetStr || !doc) return null;
        const query = targetStr.toLowerCase().trim();

        const candidates = Array.from(
            doc.querySelectorAll('button, a[href], input, textarea, select, [role="button"], [role="link"], [role="menuitem"], [role="tab"], [contenteditable="true"]')
        );

        const visible = candidates.filter((el) => {
            const rect = el.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) return false;
            const style = window.getComputedStyle(el);
            return style.display !== 'none' && style.visibility !== 'hidden' && parseFloat(style.opacity || '1') > 0.05;
        });

        const byId = visible.find((el) => (el.id || '').toLowerCase() === query);
        if (byId) return byId;

        const byAttr = visible.find((el) => {
            const name = (el.getAttribute('name') || '').toLowerCase();
            const aria = (el.getAttribute('aria-label') || '').toLowerCase();
            const placeholder = (el.getAttribute('placeholder') || '').toLowerCase();
            return name === query || aria === query || placeholder === query;
        });
        if (byAttr) return byAttr;

        const byExactText = visible.find((el) => (el.textContent || '').trim().toLowerCase() === query);
        if (byExactText) return byExactText;

        const byIncludesText = visible.find((el) => (el.textContent || '').toLowerCase().includes(query));
        if (byIncludesText) return byIncludesText;

        const labelEl = Array.from(doc.querySelectorAll('label')).find((l) =>
            (l.textContent || '').toLowerCase().includes(query)
        );
        if (labelEl) {
            if (labelEl.htmlFor) {
                const targetInput = doc.getElementById(labelEl.htmlFor);
                if (targetInput) return targetInput;
            }
            const nestedInput = labelEl.querySelector('input, textarea, select');
            if (nestedInput) return nestedInput;
        }

        return null;
    }

    static setInputValue(element, text, clearFirst = false) {
        element.focus();

        if (element.isContentEditable) {
            if (clearFirst) element.innerText = '';
            document.execCommand('insertText', false, text);
            element.dispatchEvent(new Event('input', { bubbles: true }));
            return;
        }

        const prototype = Object.getPrototypeOf(element);
        const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value') ||
                           Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value') ||
                           Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');

        const currentValue = clearFirst ? '' : (element.value || '');
        const nextValue = currentValue + text;

        if (descriptor && descriptor.set) {
            descriptor.set.call(element, nextValue);
        } else {
            element.value = nextValue;
        }

        element.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
        element.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
    }

    static setSelectOption(selectEl, optionText) {
        if (!selectEl || selectEl.tagName.toLowerCase() !== 'select') return false;
        selectEl.focus();

        const query = optionText.toLowerCase().trim();
        let matchedIndex = -1;

        for (let i = 0; i < selectEl.options.length; i++) {
            const opt = selectEl.options[i];
            const optVal = (opt.value || '').toLowerCase().trim();
            const optText = (opt.textContent || '').toLowerCase().trim();
            if (optVal === query || optText === query || optText.includes(query)) {
                matchedIndex = i;
                break;
            }
        }

        if (matchedIndex === -1) return false;

        selectEl.selectedIndex = matchedIndex;
        selectEl.dispatchEvent(new Event('input', { bubbles: true }));
        selectEl.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
    }

    static simulateHover(element) {
        const rect = element.getBoundingClientRect();
        const clientX = rect.left + rect.width / 2;
        const clientY = rect.top + rect.height / 2;

        const opts = { bubbles: true, cancelable: true, clientX, clientY, view: window };
        element.dispatchEvent(new MouseEvent('pointerover', opts));
        element.dispatchEvent(new MouseEvent('mouseenter', opts));
        element.dispatchEvent(new MouseEvent('mouseover', opts));
        element.dispatchEvent(new MouseEvent('mousemove', opts));
    }

    static simulateKeyPress(targetEl, key) {
        const el = targetEl || document.activeElement || document.body;
        const eventOpts = { key, code: key, bubbles: true, cancelable: true, view: window };

        el.dispatchEvent(new KeyboardEvent('keydown', eventOpts));
        el.dispatchEvent(new KeyboardEvent('keypress', eventOpts));
        el.dispatchEvent(new KeyboardEvent('keyup', eventOpts));
    }

    static executeInPage(action, doc) {
        if (!action || !action.action) {
            return { success: false, reason: 'Invalid action payload.' };
        }

        switch (action.action) {
            case ALLOWED_ACTIONS.CLICK: {
                const targetEl = this.findTarget(action.target, doc);
                if (!targetEl) {
                    return { success: false, reason: `Target "${action.target}" not found on page.` };
                }
                if (targetEl.hasAttribute('disabled') || targetEl.getAttribute('aria-disabled') === 'true') {
                    return { success: false, reason: `Target "${action.target}" is currently disabled.` };
                }

                try { targetEl.focus(); } catch (_) {}
                targetEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
                targetEl.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
                targetEl.click();
                return { success: true, reason: `Clicked "${action.target}".` };
            }

            case ALLOWED_ACTIONS.TYPE: {
                const targetEl = this.findTarget(action.target, doc);
                if (!targetEl) {
                    return { success: false, reason: `Input target "${action.target}" not found.` };
                }
                this.setInputValue(targetEl, action.text, action.clear);
                return { success: true, reason: `Typed into "${action.target}".` };
            }

            case ALLOWED_ACTIONS.SELECT: {
                const targetEl = this.findTarget(action.target, doc);
                if (!targetEl) {
                    return { success: false, reason: `Dropdown "${action.target}" not found.` };
                }
                const selected = this.setSelectOption(targetEl, action.option);
                if (!selected) {
                    return { success: false, reason: `Option "${action.option}" not found in dropdown "${action.target}".` };
                }
                return { success: true, reason: `Selected "${action.option}".` };
            }

            case ALLOWED_ACTIONS.HOVER: {
                const targetEl = this.findTarget(action.target, doc);
                if (!targetEl) {
                    return { success: false, reason: `Hover target "${action.target}" not found.` };
                }
                this.simulateHover(targetEl);
                return { success: true, reason: `Hovered over "${action.target}".` };
            }

            case ALLOWED_ACTIONS.PRESS_KEY: {
                const targetEl = action.target ? this.findTarget(action.target, doc) : null;
                this.simulateKeyPress(targetEl, action.key);
                return { success: true, reason: `Pressed key [${action.key}].` };
            }

            case ALLOWED_ACTIONS.SCROLL: {
                const delta = action.direction === 'down' ? action.amount : -action.amount;
                window.scrollBy({ top: delta, behavior: 'smooth' });
                return { success: true, reason: `Scrolled ${action.direction} by ${action.amount}px.` };
            }

            case ALLOWED_ACTIONS.WAIT: {
                return { success: true, reason: `Waited ${action.duration}ms.` };
            }

            case ALLOWED_ACTIONS.FINISH: {
                return { success: true, reason: action.message || 'Task complete.' };
            }

            default:
                return { success: false, reason: `Unsupported action: ${action.action}` };
        }
    }
}
