import { BrowserAPI } from './browser/api.js';
import { ConfigManager } from './config.js';
import { OpenWebUIClient } from './browser/openwebui.js';
import { ActionValidator } from './agent/validator.js';
import { TabCapture } from './browser/capture.js';
import { AutofillProfileManager, EMPTY_PROFILE } from './privacy/profile.js';

const viewMain = document.getElementById('viewMain');
const viewSettings = document.getElementById('viewSettings');
const viewAutofill = document.getElementById('viewAutofill');

const btnOpenSettings = document.getElementById('btnOpenSettings');
const btnCloseSettings = document.getElementById('btnCloseSettings');
const btnOpenAutofill = document.getElementById('btnOpenAutofill');
const btnCloseAutofill = document.getElementById('btnCloseAutofill');

const pageDomainEl = document.getElementById('pageDomain');
const userInstructionEl = document.getElementById('userInstruction');
const aiAnswerCard = document.getElementById('aiAnswerCard');
const aiAnswerContent = document.getElementById('aiAnswerContent');
const btnCloseAnswer = document.getElementById('btnCloseAnswer');
const activitySpinner = document.getElementById('activitySpinner');
const activityStepCounter = document.getElementById('activityStepCounter');
const activityCurrentStep = document.getElementById('activityCurrentStep');
const btnToggleDetails = document.getElementById('btnToggleDetails');
const activityDetails = document.getElementById('activityDetails');
const actionHistoryList = document.getElementById('actionHistoryList');
const actionPreview = document.getElementById('actionPreview');
const actionBadge = document.getElementById('actionBadge');
const actionText = document.getElementById('actionText');
const errorBanner = document.getElementById('errorMessage');
const btnAskPage = document.getElementById('btnAskPage');
const btnRunAgent = document.getElementById('btnRunAgent');
const btnStopAgent = document.getElementById('btnStopAgent');

const autofillForm = document.getElementById('autofillForm');
const profileSelector = document.getElementById('profileSelector');
const btnNewProfile = document.getElementById('btnNewProfile');
const btnDeleteProfile = document.getElementById('btnDeleteProfile');
const afProfileName = document.getElementById('afProfileName');
const afUsername = document.getElementById('afUsername');
const afFirstName = document.getElementById('afFirstName');
const afMiddleName = document.getElementById('afMiddleName');
const afLastName = document.getElementById('afLastName');
const afEmail = document.getElementById('afEmail');
const afPhone = document.getElementById('afPhone');
const afAddress1 = document.getElementById('afAddress1');
const afCity = document.getElementById('afCity');
const afState = document.getElementById('afState');
const afPostalCode = document.getElementById('afPostalCode');
const afCountry = document.getElementById('afCountry');
const autofillStatus = document.getElementById('autofillStatus');

const settingsForm = document.getElementById('settingsForm');
const settingTheme = document.getElementById('settingTheme');
const settingMaxSteps = document.getElementById('settingMaxSteps');
const serverUrlInput = document.getElementById('serverUrl');
const apiKeyInput = document.getElementById('apiKey');
const modelInput = document.getElementById('model');
const settingsStatus = document.getElementById('settingsStatus');
const btnTestConfig = document.getElementById('btnTestConfig');
const btnRefreshModels = document.getElementById('btnRefreshModels');
const viewSlider = document.getElementById('viewSlider');

let isAgentRunning = false;
let shouldStopAgent = false;
let currentLoadedProfileId = '';

function applyTheme(themeName) {
    document.documentElement.setAttribute('data-theme', themeName);
}

function openSettingsView() {
    clearError();
    loadSettingsIntoForm();
    viewSlider.setAttribute('data-active-view', 'settings');
}

function closeSettingsView() {
    viewSlider.setAttribute('data-active-view', 'main');
}

function openAutofillView() {
    clearError();
    loadAutofillProfilesUI();
    viewSlider.setAttribute('data-active-view', 'autofill');
}

function closeAutofillView() {
    viewSlider.setAttribute('data-active-view', 'main');
}

function showError(msg) {
    errorBanner.textContent = msg;
    errorBanner.classList.remove('hidden');
    activitySpinner.classList.add('hidden');
}

function clearError() {
    errorBanner.textContent = '';
    errorBanner.classList.add('hidden');
}

function addHistoryEntry(step, text) {
    const item = document.createElement('div');
    item.className = 'history-item';
    item.textContent = `${step}. ${text}`;
    actionHistoryList.appendChild(item);
    actionHistoryList.scrollTop = actionHistoryList.scrollHeight;
}

function renderMarkdown(text) {
    if (!text || typeof text !== 'string') return '';

    let clean = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    clean = clean.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    clean = clean.replace(/__(.*?)__/g, '<strong>$1</strong>');
    clean = clean.replace(/(^|[^\*])\*(?!\*)(.*?)\*/g, '$1<em>$2</em>');
    clean = clean.replace(/`([^`]+)`/g, '<code>$1</code>');
    clean = clean.replace(/^\s*[-*]\s+(.*)$/gm, '<li>$1</li>');
    clean = clean.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');

    const paragraphs = clean
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p) => (p.startsWith('<ul') || p.startsWith('<li') ? p : `<p>${p.replace(/\n/g, '<br>')}</p>`));

    return paragraphs.join('');
}

function inPageScanner() {
    const selector = [
        'button',
        'a[href]',
        'input',
        'textarea',
        'select',
        '[role="button"]',
        '[role="link"]',
        '[role="textbox"]',
        '[role="menuitem"]',
        '[role="tab"]',
        '[role="combobox"]',
        '[role="option"]',
        '[contenteditable="true"]'
    ].join(', ');

    const sensitiveKeywords = ['password', 'passwd', 'secret', 'ssn', 'card', 'token', 'auth', 'cvv', 'cvc'];
    const detections = [];

    const inputs = document.querySelectorAll('input, textarea');
    for (const el of inputs) {
        const type = String(el.getAttribute('type') || '').toLowerCase();
        const name = String(el.getAttribute('name') || '').toLowerCase();
        const id = typeof el.id === 'string' ? el.id.toLowerCase() : '';

        const isSensitive = type === 'password' || sensitiveKeywords.some((k) => name.includes(k) || id.includes(k));
        if (isSensitive) {
            const rect = el.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
                detections.push({
                    type: 'sensitive_input',
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

    const elements = [];
    const candidates = Array.from(document.querySelectorAll(selector));

    let index = 1;
    for (const el of candidates) {
        const rect = el.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) continue;

        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity || '1') <= 0.05) {
            continue;
        }

        const tag = String(el.tagName || '').toLowerCase();
        const inputType = String(el.getAttribute('type') || '').toLowerCase();

        if (tag === 'input' && inputType === 'file') {
            el.setAttribute('data-kivo-index', String(index));
            elements.push({
                index: Number(index),
                type: 'file_upload',
                role: 'file_attachment',
                label: 'File Upload (Attachment field - manual only)',
                text: '[FILE INPUT]',
                id: typeof el.id === 'string' ? el.id : null
            });
            index++;
            continue;
        }

        el.setAttribute('data-kivo-index', String(index));

        const role = String(el.getAttribute('role') || tag);
        const isPassword = inputType === 'password';
        const isContentEditable = el.getAttribute('contenteditable') === 'true';

        let safeText = '';
        if (isPassword) {
            safeText = (el.value && el.value.length > 0) ? '[FILLED PASSWORD]' : '[REDACTED PASSWORD]';
        } else if (tag === 'button' || tag === 'a') {
            safeText = String(el.textContent || '').trim().replace(/\s+/g, ' ').substring(0, 50);
        } else if (isContentEditable) {
            safeText = String(el.textContent || '').trim().length > 0 ? '[FILLED]' : '';
        } else if (el.value && el.value.trim().length > 0) {
            safeText = '[FILLED]';
        }

        const label = String(el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.getAttribute('name') || '');
        const idString = typeof el.id === 'string' ? el.id : '';

        elements.push({
            index: Number(index),
            type: isContentEditable ? 'editable_textbox' : tag,
            role: role,
            label: label.substring(0, 50),
            text: safeText,
            id: idString || null
        });

        index++;
    }

    const payload = {
        title: String(document.title || ''),
        url: String(window.location.origin + window.location.pathname),
        viewport: {
            width: Number(window.innerWidth || 1280),
            height: Number(window.innerHeight || 800)
        },
        sensitiveRegions: detections,
        elements: elements.slice(0, 75)
    };

    return JSON.parse(JSON.stringify(payload));
}

function inPageExecutor(action) {
    if (!action || !action.action) return { success: false, reason: 'Invalid action payload.' };

    function getElement() {
        if (typeof action.index === 'number') {
            const indexed = document.querySelector(`[data-kivo-index="${action.index}"]`);
            if (indexed) return indexed;
        }

        const target = String(action.target || '').toLowerCase().trim();
        const all = Array.from(document.querySelectorAll('button, a[href], input, textarea, select, [role="button"], [role="link"], [role="textbox"], [contenteditable="true"]'));
        return all.find((el) => {
            const text = String(el.textContent || '').toLowerCase().trim();
            const aria = String(el.getAttribute('aria-label') || '').toLowerCase().trim();
            const id = typeof el.id === 'string' ? el.id.toLowerCase().trim() : '';
            return text === target || aria === target || id === target || text.includes(target);
        });
    }

    try {
        switch (action.action) {
            case 'click': {
                let el = getElement();
                if (!el) return { success: false, reason: `Target "${action.target || action.index}" not found.` };

                const clickableParent = el.closest('button, a, [role="button"]');
                if (clickableParent) el = clickableParent;

                try { el.focus(); } catch (_) {}
                el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
                el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
                el.click();
                return { success: true, reason: `Clicked "${action.target || action.index}".` };
            }

            case 'hover': {
                const el = getElement();
                if (!el) return { success: false, reason: `Target "${action.target || action.index}" not found.` };
                const opts = { bubbles: true, cancelable: true };
                el.dispatchEvent(new MouseEvent('mouseenter', opts));
                el.dispatchEvent(new MouseEvent('mouseover', opts));
                el.dispatchEvent(new MouseEvent('mousemove', opts));
                return { success: true, reason: `Hovered over "${action.target || action.index}".` };
            }

            case 'type': {
                const el = getElement();
                if (!el) return { success: false, reason: `Input target "${action.target || action.index}" not found.` };

                const tag = el.tagName.toLowerCase();
                const type = (el.getAttribute('type') || '').toLowerCase();

                if (tag === 'input' && type === 'file') {
                    return { success: false, reason: 'File input fields cannot be typed into via script.' };
                }

                try { el.focus(); } catch (_) {}
                const textToType = String(action.text || '');

                if (el.isContentEditable || el.getAttribute('contenteditable') === 'true') {
                    el.innerText = action.clearFirst ? textToType : el.innerText + textToType;
                    el.dispatchEvent(new InputEvent('input', { bubbles: true, data: textToType }));
                    return { success: true, reason: `Typed into editable field "${action.target || action.index}".` };
                }

                if (tag === 'textarea' || el instanceof window.HTMLTextAreaElement) {
                    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
                    if (setter) setter.call(el, action.clearFirst ? textToType : el.value + textToType);
                    else el.value = action.clearFirst ? textToType : el.value + textToType;
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                    return { success: true, reason: `Typed into textarea "${action.target || action.index}".` };
                }

                if (tag === 'input' || el instanceof window.HTMLInputElement) {
                    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
                    if (setter) setter.call(el, action.clearFirst ? textToType : el.value + textToType);
                    else el.value = action.clearFirst ? textToType : el.value + textToType;
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                    return { success: true, reason: `Typed into input "${action.target || action.index}".` };
                }

                if ('value' in el) el.value = action.clearFirst ? textToType : el.value + textToType;
                else el.textContent = action.clearFirst ? textToType : el.textContent + textToType;
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
                return { success: true, reason: `Updated field "${action.target || action.index}".` };
            }

            case 'select': {
                const el = getElement();
                if (!el || el.tagName.toLowerCase() !== 'select') return { success: false, reason: 'Dropdown element not found.' };
                const valLower = String(action.value || '').toLowerCase().trim();
                const option = Array.from(el.options).find(
                    (o) => o.value.toLowerCase() === valLower || o.text.toLowerCase().includes(valLower)
                );
                if (!option) return { success: false, reason: `Option "${action.value}" not found in dropdown.` };
                el.value = option.value;
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
                return { success: true, reason: `Selected "${option.text}".` };
            }

            case 'press_key': {
                const target = document.activeElement || document.body;
                const opts = { key: String(action.key), code: String(action.key), bubbles: true, cancelable: true };
                target.dispatchEvent(new KeyboardEvent('keydown', opts));
                target.dispatchEvent(new KeyboardEvent('keyup', opts));
                if (action.key === 'Enter' && target.form) {
                    if (typeof target.form.requestSubmit === 'function') target.form.requestSubmit();
                    else target.form.submit();
                }
                return { success: true, reason: `Pressed key [${action.key}].` };
            }

            case 'scroll': {
                const delta = action.direction === 'down' ? Number(action.amount) : -Number(action.amount);
                window.scrollBy({ top: delta, behavior: 'smooth' });
                return { success: true, reason: `Scrolled ${action.direction} ${action.amount}px.` };
            }

            case 'wait': {
                return { success: true, reason: `Waited ${action.duration}ms.` };
            }

            case 'navigate': {
                window.location.href = String(action.path);
                return { success: true, reason: `Navigated to ${action.path}.` };
            }

            case 'answer': {
                return { success: true, reason: String(action.message) };
            }

            case 'finish': {
                return { success: true, reason: String(action.message || 'Task complete.') };
            }

            default:
                return { success: false, reason: `Unknown action: ${action.action}` };
        }
    } catch (err) {
        return { success: false, reason: `In-page execution error: ${err.message}` };
    }
}

async function askQuestionAboutPage() {
    clearError();
    const question = userInstructionEl.value.trim();
    if (!question) {
        showError('Please type a question in the box above.');
        return;
    }

    btnAskPage.disabled = true;
    btnRunAgent.disabled = true;
    activitySpinner.classList.remove('hidden');
    activityCurrentStep.textContent = 'Analyzing page visually...';

    try {
        const activeTab = await BrowserAPI.getActiveTab();
        if (!activeTab?.id) throw new Error('No active browser tab found.');

        const scanResult = await BrowserAPI.executeScript(activeTab.id, inPageScanner);
        if (!scanResult) throw new Error('DOM inspection failed. Reload page.');

        const redactedScreenshot = await TabCapture.captureAndRedact(scanResult.sensitiveRegions, activeTab.windowId);

        activityCurrentStep.textContent = 'Formulating explanation...';
        const config = await ConfigManager.getConfig();
        const client = new OpenWebUIClient(config);

        const explanation = await client.chatAboutPage({
            sanitizedScreenshot: redactedScreenshot,
            sanitizedDom: scanResult,
            userQuestion: question
        });

        aiAnswerContent.innerHTML = renderMarkdown(explanation);
        aiAnswerCard.classList.remove('hidden');
        activityCurrentStep.textContent = 'Explanation ready.';
    } catch (err) {
        showError(err.message);
    } finally {
        btnAskPage.disabled = false;
        btnRunAgent.disabled = false;
        activitySpinner.classList.add('hidden');
    }
}

async function runAutonomousLoop() {
    clearError();
    aiAnswerCard.classList.add('hidden');
    actionHistoryList.innerHTML = '';

    const instruction = userInstructionEl.value.trim();
    if (!instruction) {
        showError('Please enter a goal for the agent.');
        return;
    }

    const config = await ConfigManager.getConfig();
    const maxSteps = config.maxSteps || 20;
    const client = new OpenWebUIClient(config);
    const profile = await AutofillProfileManager.getActiveProfile();

    isAgentRunning = true;
    shouldStopAgent = false;
    btnRunAgent.classList.add('hidden');
    btnAskPage.classList.add('hidden');
    btnStopAgent.classList.remove('hidden');
    activitySpinner.classList.remove('hidden');
    activityStepCounter.classList.remove('hidden');

    const history = [];

    try {
        for (let step = 1; step <= maxSteps; step++) {
            if (shouldStopAgent) {
                activityCurrentStep.textContent = 'Agent stopped by user.';
                break;
            }

            activityStepCounter.textContent = `Step ${step}/${maxSteps}`;
            activityCurrentStep.textContent = 'Inspecting page state...';

            const activeTab = await BrowserAPI.getActiveTab();
            if (!activeTab?.id) throw new Error('No active browser tab found.');

            const scanResult = await BrowserAPI.executeScript(activeTab.id, inPageScanner);
            if (!scanResult) throw new Error('DOM inspection failed. Reload page.');

            activityCurrentStep.textContent = 'Redacting visual PII...';
            const redactedScreenshot = await TabCapture.captureAndRedact(scanResult.sensitiveRegions, activeTab.windowId);

            activityCurrentStep.textContent = 'Deciding next action...';
            const rawAiOutput = await client.queryVisionAgent({
                sanitizedScreenshot: redactedScreenshot,
                sanitizedDom: scanResult,
                userInstruction: instruction,
                history,
                currentStep: step,
                maxSteps
            });

            const parsedJson = ActionValidator.parseJson(rawAiOutput);
            const validation = ActionValidator.validate(parsedJson);
            if (!validation.isValid) {
                throw new Error(`AI generated invalid action: ${validation.error}`);
            }

            const validAction = validation.action;

            if (validAction.action === 'type' && validAction.text) {
                validAction.text = AutofillProfileManager.resolveTemplateLocally(validAction.text, profile);
            }

            if (validAction.action === 'answer') {
                aiAnswerContent.innerHTML = renderMarkdown(validAction.message);
                aiAnswerCard.classList.remove('hidden');
                addHistoryEntry(step, `Answer: ${validAction.message.substring(0, 50)}...`);
                activityCurrentStep.textContent = 'Answered question.';
                break;
            }

            actionPreview.classList.remove('hidden');
            actionBadge.textContent = validAction.action;
            actionText.textContent = validAction.thought
                ? validAction.thought
                : (validAction.text || validAction.target || validAction.value || validAction.message || `Index [${validAction.index}]`);

            if (validAction.action === 'finish') {
                addHistoryEntry(step, `Complete: ${validAction.message}`);
                activityCurrentStep.textContent = validAction.message || 'Task finished!';
                break;
            }

            activityCurrentStep.textContent = `Executing: ${validAction.action}...`;
            const execResult = await BrowserAPI.executeScript(activeTab.id, inPageExecutor, [validAction]);

            if (!execResult || !execResult.success) {
                throw new Error(execResult ? execResult.reason : 'Execution failed in tab.');
            }

            addHistoryEntry(step, execResult.reason);
            history.push(`${validAction.action}: ${execResult.reason}`);

            await new Promise((r) => setTimeout(r, 800));
        }
    } catch (err) {
        showError(err.message);
    } finally {
        isAgentRunning = false;
        btnRunAgent.classList.remove('hidden');
        btnAskPage.classList.remove('hidden');
        btnStopAgent.classList.add('hidden');
        activitySpinner.classList.add('hidden');
    }
}

async function loadAutofillProfilesUI() {
    try {
        const { profiles, activeProfileId } = await AutofillProfileManager.getAllData();
        profileSelector.innerHTML = '';

        for (const p of profiles) {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = p.profileName + (p.id === activeProfileId ? ' (Active)' : '');
            if (p.id === activeProfileId) opt.selected = true;
            profileSelector.appendChild(opt);
        }

        const currentProfile = profiles.find((p) => p.id === activeProfileId) || profiles[0];
        populateProfileFields(currentProfile);
    } catch (err) {
        showAutofillStatus('error', err.message);
    }
}

function populateProfileFields(p) {
    currentLoadedProfileId = p.id;
    afProfileName.value = p.profileName || '';
    afUsername.value = p.username || '';
    afFirstName.value = p.firstName || '';
    afMiddleName.value = p.middleName || '';
    afLastName.value = p.lastName || '';
    afEmail.value = p.email || '';
    afPhone.value = p.phone || '';
    afAddress1.value = p.address1 || '';
    afCity.value = p.city || '';
    afState.value = p.state || '';
    afPostalCode.value = p.postalCode || '';
    afCountry.value = p.country || '';
}

function showAutofillStatus(type, msg) {
    autofillStatus.className = `status-banner ${type}`;
    autofillStatus.textContent = msg;
    autofillStatus.classList.remove('hidden');
}

async function saveCurrentProfile(e) {
    if (e) e.preventDefault();
    autofillStatus.classList.add('hidden');

    try {
        const profileToSave = {
            id: currentLoadedProfileId || `profile_${Date.now()}`,
            profileName: afProfileName.value.trim() || 'My Profile',
            username: afUsername.value.trim(),
            firstName: afFirstName.value.trim(),
            middleName: afMiddleName.value.trim(),
            lastName: afLastName.value.trim(),
            email: afEmail.value.trim(),
            phone: afPhone.value.trim(),
            address1: afAddress1.value.trim(),
            city: afCity.value.trim(),
            state: afState.value.trim(),
            postalCode: afPostalCode.value.trim(),
            country: afCountry.value.trim()
        };

        await AutofillProfileManager.saveProfile(profileToSave);
        await AutofillProfileManager.setActiveProfileId(profileToSave.id);
        showAutofillStatus('success', 'Profile saved.');
        await loadAutofillProfilesUI();
        setTimeout(() => closeAutofillView(), 500);
    } catch (err) {
        showAutofillStatus('error', `Save failed: ${err.message}`);
    }
}

async function handleProfileSelectionChange() {
    const selectedId = profileSelector.value;
    const { profiles } = await AutofillProfileManager.getAllData();
    const profile = profiles.find((p) => p.id === selectedId);
    if (profile) {
        await AutofillProfileManager.setActiveProfileId(profile.id);
        populateProfileFields(profile);
        await loadAutofillProfilesUI();
    }
}

function createNewProfile() {
    const newId = `profile_${Date.now()}`;
    populateProfileFields({
        ...EMPTY_PROFILE,
        id: newId,
        profileName: 'New Profile'
    });
    afProfileName.focus();
    showAutofillStatus('success', 'Enter profile details and click Save.');
}

async function deleteCurrentProfile() {
    if (!currentLoadedProfileId) return;
    const { profiles } = await AutofillProfileManager.getAllData();
    if (profiles.length <= 1) {
        showAutofillStatus('error', 'Cannot delete the only remaining profile.');
        return;
    }

    try {
        await AutofillProfileManager.deleteProfile(currentLoadedProfileId);
        showAutofillStatus('success', 'Profile removed.');
        await loadAutofillProfilesUI();
    } catch (err) {
        showAutofillStatus('error', `Delete failed: ${err.message}`);
    }
}

/* --- SETTINGS CONTROLLER --- */
async function loadSettingsIntoForm() {
    try {
        const config = await ConfigManager.getConfig();
        serverUrlInput.value = config.serverUrl || '';
        apiKeyInput.value = config.apiKey || '';
        modelInput.value = config.model || '';
        settingTheme.value = config.theme || 'graphite-dark';
        settingMaxSteps.value = config.maxSteps || 20;
    } catch (err) {
        showSettingsStatus('error', err.message);
    }
}

function showSettingsStatus(type, msg) {
    settingsStatus.className = `status-banner ${type}`;
    settingsStatus.textContent = msg;
    settingsStatus.classList.remove('hidden');
}

async function saveSettings(e) {
    if (e) e.preventDefault();
    settingsStatus.classList.add('hidden');

    try {
        const parsedSteps = parseInt(settingMaxSteps.value, 10);
        const maxSteps = !isNaN(parsedSteps) ? Math.min(Math.max(parsedSteps, 1), 999) : 20;

        await ConfigManager.saveConfig({
            serverUrl: serverUrlInput.value,
            apiKey: apiKeyInput.value,
            model: modelInput.value,
            theme: settingTheme.value,
            maxSteps: maxSteps,
            maxTokens: 3000
        });
        applyTheme(settingTheme.value);
        showSettingsStatus('success', 'Settings saved.');
        setTimeout(() => closeSettingsView(), 500);
    } catch (err) {
        showSettingsStatus('error', `Save failed: ${err.message}`);
    }
}

async function testConnection() {
    settingsStatus.classList.add('hidden');
    btnTestConfig.disabled = true;

    try {
        const client = new OpenWebUIClient({
            serverUrl: serverUrlInput.value,
            apiKey: apiKeyInput.value,
            model: modelInput.value
        });
        const res = await client.testConnection();
        showSettingsStatus(res.success ? 'success' : 'error', res.message);
    } catch (err) {
        showSettingsStatus('error', err.message);
    } finally {
        btnTestConfig.disabled = false;
    }
}

async function refreshModels() {
    settingsStatus.classList.add('hidden');
    btnRefreshModels.disabled = true;

    try {
        const client = new OpenWebUIClient({
            serverUrl: serverUrlInput.value,
            apiKey: apiKeyInput.value
        });
        const models = await client.listModels();
        if (models.length > 0) {
            const vlModel = models.find((m) => m.toLowerCase().includes('vl'));
            modelInput.value = vlModel || models[0];
            showSettingsStatus('success', `Found ${models.length} model(s).`);
        } else {
            showSettingsStatus('error', 'No models found.');
        }
    } catch (err) {
        showSettingsStatus('error', err.message);
    } finally {
        btnRefreshModels.disabled = false;
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    viewSlider.setAttribute('data-active-view', 'main');
    const config = await ConfigManager.getConfig();
    applyTheme(config.theme);

    try {
        const tab = await BrowserAPI.getActiveTab();
        if (tab && tab.url && !tab.url.startsWith('about:') && !tab.url.startsWith('chrome:')) {
            pageDomainEl.textContent = new URL(tab.url).hostname;
        } else {
            pageDomainEl.textContent = 'Ready';
        }
    } catch {
        pageDomainEl.textContent = 'Ready';
    }

    btnOpenSettings.addEventListener('click', openSettingsView);
    btnCloseSettings.addEventListener('click', closeSettingsView);
    btnOpenAutofill.addEventListener('click', openAutofillView);
    btnCloseAutofill.addEventListener('click', closeAutofillView);

    btnAskPage.addEventListener('click', askQuestionAboutPage);
    btnRunAgent.addEventListener('click', runAutonomousLoop);
    btnStopAgent.addEventListener('click', () => { shouldStopAgent = true; });

    btnCloseAnswer.addEventListener('click', () => {
        aiAnswerCard.classList.add('hidden');
    });

    btnToggleDetails.addEventListener('click', () => {
        activityDetails.classList.toggle('collapsed');
        btnToggleDetails.textContent = activityDetails.classList.contains('collapsed') ? 'Steps' : 'Hide';
    });

    profileSelector.addEventListener('change', handleProfileSelectionChange);
    btnNewProfile.addEventListener('click', createNewProfile);
    btnDeleteProfile.addEventListener('click', deleteCurrentProfile);
    autofillForm.addEventListener('submit', saveCurrentProfile);

    settingsForm.addEventListener('submit', saveSettings);
    btnTestConfig.addEventListener('click', testConnection);
    btnRefreshModels.addEventListener('click', refreshModels);
    settingTheme.addEventListener('change', (e) => applyTheme(e.target.value));
});
