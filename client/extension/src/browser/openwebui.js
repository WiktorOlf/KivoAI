import { AutofillProfileManager } from '../privacy/profile.js';

export class OpenWebUIClient {
    constructor(config) {
        this.serverUrl = (config.serverUrl || '').trim().replace(/\/+$/, '');
        this.apiKey = (config.apiKey || '').trim();
        this.model = (config.model || '').trim();
        this.maxTokens = config.maxTokens || 1024;
        this.temperature = config.temperature !== undefined ? config.temperature : 0.1;
        this.timeoutMs = config.timeoutMs || 45000;
    }

    async testConnection() {
        if (!this.serverUrl) throw new Error('Server URL is not configured.');
        const endpoint = `${this.serverUrl}/api/models`;
        const headers = { 'Content-Type': 'application/json' };
        if (this.apiKey) headers['Authorization'] = `Bearer ${this.apiKey}`;

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 10000);

        try {
            const res = await fetch(endpoint, { method: 'GET', headers, signal: controller.signal });
            clearTimeout(timer);
            if (res.ok) return { success: true, message: 'Connected to Open WebUI successfully.' };
            return { success: false, message: `HTTP ${res.status}: Check URL and API Key.` };
        } catch (err) {
            clearTimeout(timer);
            throw new Error(err.name === 'AbortError' ? 'Connection timed out.' : 'Network connection failed.');
        }
    }

    async listModels() {
        if (!this.serverUrl) throw new Error('Server URL is not configured.');
        const endpoint = `${this.serverUrl}/api/models`;
        const headers = { 'Content-Type': 'application/json' };
        if (this.apiKey) headers['Authorization'] = `Bearer ${this.apiKey}`;

        const res = await fetch(endpoint, { method: 'GET', headers });
        if (!res.ok) throw new Error(`HTTP ${res.status} retrieving models.`);
        const data = await res.json();
        const list = Array.isArray(data.data) ? data.data : Array.isArray(data) ? data : [];
        return list.map((m) => m.id || m.name).filter(Boolean);
    }

    static extractContent(data) {
        if (!data) return '';
        if (typeof data === 'string' && data.trim().length > 0) return data.trim();

        const choice = data.choices?.[0] || {};
        const msg = choice.message || choice.delta || {};

        if (typeof msg.content === 'string' && msg.content.trim().length > 0) {
            return msg.content.trim();
        }

        if (Array.isArray(msg.content)) {
            const textPart = msg.content.find((p) => p.type === 'text' && p.text);
            if (textPart && textPart.text.trim().length > 0) return textPart.text.trim();
        }

        if (typeof msg.reasoning_content === 'string' && msg.reasoning_content.trim().length > 0) {
            return msg.reasoning_content.trim();
        }

        if (typeof choice.text === 'string' && choice.text.trim().length > 0) {
            return choice.text.trim();
        }

        if (typeof data.response === 'string' && data.response.trim().length > 0) {
            return data.response.trim();
        }

        return '';
    }

    async chatAboutPage({ sanitizedScreenshot, sanitizedDom, userQuestion }) {
        if (!this.serverUrl) throw new Error('Server URL is not configured.');
        if (!this.model) throw new Error('Vision model is not selected.');

        const endpoint = `${this.serverUrl}/api/chat/completions`;
        const headers = { 'Content-Type': 'application/json' };
        if (this.apiKey) headers['Authorization'] = `Bearer ${this.apiKey}`;

        const elementsSummary = (sanitizedDom.elements || [])
            .slice(0, 50)
            .map((el) => `[${el.index}] <${el.type}> "${el.label || el.text || ''}"`)
            .join('\n');

        const promptText = [
            `Question: "${userQuestion}"`,
            `Page Title: "${sanitizedDom.title || ''}"`,
            `Page URL: "${sanitizedDom.url || ''}"`,
            `Interactive Elements:\n${elementsSummary}`,
            '',
            'Answer the question directly and concisely based on the webpage information above.'
        ].join('\n');

        const imageUrl = sanitizedScreenshot && sanitizedScreenshot.startsWith('data:image/')
            ? sanitizedScreenshot
            : `data:image/jpeg;base64,${sanitizedScreenshot}`;

        const payload = {
            model: this.model,
            messages: [
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: promptText },
                        { type: 'image_url', image_url: { url: imageUrl } }
                    ]
                }
            ],
            max_tokens: this.maxTokens,
            temperature: 0.2,
            stream: false
        };

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);

        try {
            let res = await fetch(endpoint, {
                method: 'POST',
                headers,
                body: JSON.stringify(payload),
                signal: controller.signal
            });

            if (!res.ok) {
                const textFallbackPayload = {
                    model: this.model,
                    messages: [{ role: 'user', content: promptText }],
                    max_tokens: this.maxTokens,
                    temperature: 0.2,
                    stream: false
                };
                res = await fetch(endpoint, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(textFallbackPayload),
                    signal: controller.signal
                });
            }

            clearTimeout(timer);

            if (!res.ok) {
                const errText = await res.text().catch(() => '');
                throw new Error(`Open WebUI HTTP ${res.status}: ${errText.substring(0, 120)}`);
            }

            const data = await res.json();
            const content = OpenWebUIClient.extractContent(data);

            if (!content) {
                throw new Error('Empty response from model. Please verify your Open WebUI model status.');
            }

            return content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
        } catch (err) {
            clearTimeout(timer);
            if (err.name === 'AbortError') throw new Error(`Request timed out after ${this.timeoutMs / 1000}s.`);
            throw err;
        }
    }

    async queryVisionAgent({ sanitizedScreenshot, sanitizedDom, userInstruction, history = [], currentStep = 1, maxSteps = 10 }) {
        if (!this.serverUrl) throw new Error('Server URL is not configured in Settings.');
        if (!this.model) throw new Error('Vision model is not selected.');

        const endpoint = `${this.serverUrl}/api/chat/completions`;
        const headers = { 'Content-Type': 'application/json' };
        if (this.apiKey) headers['Authorization'] = `Bearer ${this.apiKey}`;

        const tokens = AutofillProfileManager.getAvailableTokens().join(', ');

        const systemPrompt = [
            'You are KivoAI, an accurate autonomous web navigation agent.',
            'Given the page screenshot and UI element list, output ONE raw JSON action to advance the user goal.',
            '',
            '### CRITICAL FORM & LOGIN RULES:',
            '1. DO NOT OVERWRITE FILLED FIELDS: If an input field already has text, shows "[FILLED]", or has user input, NEVER type into it unless explicitly asked to replace it.',
            '2. SUBMIT / SIGN-IN INTENT: If the user says "sign in", "log in", or "submit", and fields are already filled, DO NOT type. Directly CLICK the submit or sign-in button.',
            '3. AUTOFILL TEMPLATE TOKENS: When filling identity, contact, or address forms, use these symbolic placeholders (the browser replaces them locally with user data):',
            tokens,
            'Example: {"thought": "typing name", "action": "type", "index": 1, "text": "{{fullName}}"}',
            'Example: {"thought": "typing address", "action": "type", "index": 2, "text": "{{address1}}"}',
            '4. INDEX ACCURACY: Always use the exact integer "index" from the elements list.',
            '',
            '### OUTPUT JSON FORMAT:',
            '{',
            '  "thought": "brief reasoning (1-2 sentences)",',
            '  "action": "click" | "type" | "select" | "hover" | "press_key" | "scroll" | "wait" | "finish",',
            '  "index": <integer index from list>,',
            '  "text": "string to type",',
            '  "key": "Enter" | "Tab",',
            '  "message": "completion message"',
            '}',
            '',
            'Return raw JSON only. No markdown fences.'
        ].join('\n');

        const elementsSummary = (sanitizedDom.elements || [])
            .slice(0, 60)
            .map((el) => {
                const status = el.text ? ` [${el.text}]` : '';
                return `[${el.index}] <${el.type}> "${el.label || el.text || ''}"${status} ${el.id ? '#' + el.id : ''}`;
            })
            .join('\n');

        const historySummary = history.length > 0
            ? `Actions already completed in this run:\n${history.map((h, i) => `${i + 1}. ${h}`).join('\n')}\n`
            : '';

        const userPrompt = [
            `User Goal: "${userInstruction}"`,
            historySummary,
            `Current Page: "${sanitizedDom.title || ''}" (${sanitizedDom.url || ''})`,
            `Interactive Elements:\n${elementsSummary}`,
            '',
            `Step ${currentStep} of ${maxSteps}. What is the next single JSON action?`
        ].join('\n');

        const imageUrl = sanitizedScreenshot && sanitizedScreenshot.startsWith('data:image/')
            ? sanitizedScreenshot
            : `data:image/jpeg;base64,${sanitizedScreenshot}`;

        const payload = {
            model: this.model,
            messages: [
                { role: 'system', content: systemPrompt },
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: userPrompt },
                        { type: 'image_url', image_url: { url: imageUrl } }
                    ]
                }
            ],
            max_tokens: this.maxTokens,
            temperature: this.temperature,
            stream: false
        };

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);

        try {
            const res = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(payload), signal: controller.signal });
            clearTimeout(timer);

            if (!res.ok) {
                const errText = await res.text().catch(() => '');
                throw new Error(`Open WebUI HTTP ${res.status}: ${errText.substring(0, 120)}`);
            }

            const data = await res.json();
            const content = OpenWebUIClient.extractContent(data);
            if (!content) throw new Error('Empty AI response received.');
            return content;
        } catch (err) {
            clearTimeout(timer);
            if (err.name === 'AbortError') throw new Error(`AI request timed out after ${this.timeoutMs / 1000}s.`);
            throw err;
        }
    }
}
