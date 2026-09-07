import { ALLOWED_ACTIONS, SCROLL_DIRECTIONS, ALLOWED_KEYS, ACTION_CONSTRAINTS } from './schema.js';

export class ActionValidator {
    static parseJson(rawOutput) {
        if (!rawOutput || typeof rawOutput !== 'string') {
            throw new Error('Empty AI response received.');
        }

        let cleaned = rawOutput.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

        if (cleaned.includes('```')) {
            const matches = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
            if (matches && matches[1]) {
                cleaned = matches[1].trim();
            } else {
                cleaned = cleaned.replace(/^```[a-z]*\s*/i, '').replace(/```\s*$/, '').trim();
            }
        }

        const firstBrace = cleaned.indexOf('{');
        const lastBrace = cleaned.lastIndexOf('}');
        if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
            return {
                action: ALLOWED_ACTIONS.ANSWER,
                message: cleaned
            };
        }

        try {
            return JSON.parse(cleaned.substring(firstBrace, lastBrace + 1));
        } catch (err) {
            throw new Error(`Malformed JSON from AI: ${err.message}`);
        }
    }

    static validate(actionObj) {
        if (!actionObj || typeof actionObj !== 'object' || Array.isArray(actionObj)) {
            return { isValid: false, action: null, error: 'Action must be a valid JSON object.' };
        }

        let actionType = actionObj.action || actionObj.type;
        if (typeof actionType === 'string') {
            actionType = actionType.toLowerCase().trim();
        }

        if (actionType === 'input' || actionType === 'fill') {
            actionType = ALLOWED_ACTIONS.TYPE;
        }

        if (!actionType || !Object.values(ALLOWED_ACTIONS).includes(actionType)) {
            return {
                isValid: false,
                action: null,
                error: `Unknown action type "${actionType}". Allowed actions: ${Object.values(ALLOWED_ACTIONS).join(', ')}.`
            };
        }

        const thought = typeof actionObj.thought === 'string'
            ? actionObj.thought.trim().substring(0, ACTION_CONSTRAINTS.MAX_THOUGHT_LENGTH)
            : typeof actionObj.reasoning === 'string'
                ? actionObj.reasoning.trim().substring(0, ACTION_CONSTRAINTS.MAX_THOUGHT_LENGTH)
                : undefined;

        const index = typeof actionObj.index === 'number'
            ? actionObj.index
            : (actionObj.index && !isNaN(parseInt(actionObj.index, 10)) ? parseInt(actionObj.index, 10) : undefined);

        const target = actionObj.target ? String(actionObj.target).trim().substring(0, ACTION_CONSTRAINTS.MAX_TARGET_LENGTH) : undefined;

        switch (actionType) {
            case ALLOWED_ACTIONS.CLICK:
            case ALLOWED_ACTIONS.HOVER: {
                if (!target && index === undefined) {
                    return { isValid: false, action: null, error: `${actionType} requires an "index" or "target".` };
                }
                return { isValid: true, action: { thought, action: actionType, index, target }, error: null };
            }

            case ALLOWED_ACTIONS.TYPE: {
                const textVal = actionObj.text !== undefined ? actionObj.text : actionObj.value;
                if (textVal === undefined || textVal === null) {
                    return { isValid: false, action: null, error: 'Type action requires a "text" or "value" property.' };
                }
                const text = String(textVal).substring(0, ACTION_CONSTRAINTS.MAX_INPUT_TEXT_LENGTH);
                const clearFirst = actionObj.clearFirst !== undefined ? Boolean(actionObj.clearFirst) : true;

                if (!target && index === undefined) {
                    return { isValid: false, action: null, error: 'Type action requires an "index" or "target".`' };
                }
                return { isValid: true, action: { thought, action: ALLOWED_ACTIONS.TYPE, index, target, text, clearFirst }, error: null };
            }

            case ALLOWED_ACTIONS.SELECT: {
                const selectVal = actionObj.value !== undefined ? actionObj.value : actionObj.text;
                if (!selectVal) {
                    return { isValid: false, action: null, error: 'Select action requires a "value" property.' };
                }
                if (!target && index === undefined) {
                    return { isValid: false, action: null, error: 'Select action requires an "index" or "target".' };
                }
                return { isValid: true, action: { thought, action: ALLOWED_ACTIONS.SELECT, index, target, value: String(selectVal).trim() }, error: null };
            }

            case ALLOWED_ACTIONS.PRESS_KEY: {
                const key = actionObj.key || actionObj.text;
                if (!ALLOWED_KEYS.includes(key)) {
                    return { isValid: false, action: null, error: `Unsupported key "${key}". Allowed: ${ALLOWED_KEYS.join(', ')}.` };
                }
                return { isValid: true, action: { thought, action: ALLOWED_ACTIONS.PRESS_KEY, key }, error: null };
            }

            case ALLOWED_ACTIONS.SCROLL: {
                const direction = String(actionObj.direction || 'down').toLowerCase();
                if (!SCROLL_DIRECTIONS.includes(direction)) {
                    return { isValid: false, action: null, error: `Invalid scroll direction "${direction}".` };
                }
                const amount = Number(actionObj.amount || 600);
                return {
                    isValid: true,
                    action: {
                        thought,
                        action: ALLOWED_ACTIONS.SCROLL,
                        direction,
                        amount: Math.min(Math.max(amount, ACTION_CONSTRAINTS.MIN_SCROLL), ACTION_CONSTRAINTS.MAX_SCROLL)
                    },
                    error: null
                };
            }

            case ALLOWED_ACTIONS.WAIT: {
                const duration = Number(actionObj.duration || 1000);
                return {
                    isValid: true,
                    action: {
                        thought,
                        action: ALLOWED_ACTIONS.WAIT,
                        duration: Math.min(Math.max(duration, ACTION_CONSTRAINTS.MIN_WAIT_MS), ACTION_CONSTRAINTS.MAX_WAIT_MS)
                    },
                    error: null
                };
            }

            case ALLOWED_ACTIONS.NAVIGATE: {
                const path = String(actionObj.path || '').trim();
                if (!path.startsWith('/') && !path.startsWith('./') && !path.startsWith('#')) {
                    return { isValid: false, action: null, error: 'Navigate path must start with /, ./, or #.' };
                }
                return { isValid: true, action: { thought, action: ALLOWED_ACTIONS.NAVIGATE, path }, error: null };
            }

            case ALLOWED_ACTIONS.ANSWER: {
                const msg = String(actionObj.message || actionObj.text || actionObj.answer || 'No explanation provided.');
                return { isValid: true, action: { thought, action: ALLOWED_ACTIONS.ANSWER, message: msg }, error: null };
            }

            case ALLOWED_ACTIONS.FINISH: {
                return {
                    isValid: true,
                    action: { thought, action: ALLOWED_ACTIONS.FINISH, message: String(actionObj.message || 'Task complete.') },
                    error: null
                };
            }

            default:
                return { isValid: false, action: null, error: `Unsupported action "${actionType}".` };
        }
    }
}
