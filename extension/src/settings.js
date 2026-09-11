import { ConfigManager } from './config.js';
import { OpenWebUIClient } from './browser/openwebui.js';

const form = document.getElementById('settingsForm');
const serverUrlInput = document.getElementById('serverUrl');
const apiKeyInput = document.getElementById('apiKey');
const modelInput = document.getElementById('model');
const statusBanner = document.getElementById('statusMessage');
const btnTest = document.getElementById('btnTest');
const btnRefreshModels = document.getElementById('btnRefreshModels');

function showMessage(type, message) {
    statusBanner.className = `status-banner ${type}`;
    statusBanner.textContent = message;
    statusBanner.classList.remove('hidden');
}

function clearMessage() {
    statusBanner.textContent = '';
    statusBanner.classList.add('hidden');
}

async function loadSettings() {
    try {
        const config = await ConfigManager.getConfig();
        serverUrlInput.value = config.serverUrl || '';
        apiKeyInput.value = config.apiKey || '';
        modelInput.value = config.model || '';
    } catch (err) {
        showMessage('error', `Failed to load settings: ${err.message}`);
    }
}

async function saveSettings(e) {
    if (e) {
        e.preventDefault();
    }
    clearMessage();

    try {
        await ConfigManager.saveConfig({
            serverUrl: serverUrlInput.value,
            apiKey: apiKeyInput.value,
            model: modelInput.value
        });
        showMessage('success', 'Settings successfully saved to local storage.');
    } catch (err) {
        showMessage('error', `Save failed: ${err.message}`);
    }
}

async function testConnection() {
    clearMessage();
    btnTest.disabled = true;

    try {
        const client = new OpenWebUIClient({
            serverUrl: serverUrlInput.value,
            apiKey: apiKeyInput.value,
            model: modelInput.value
        });

        const result = await client.testConnection();
        if (result.success) {
            showMessage('success', result.message);
        } else {
            showMessage('error', result.message);
        }
    } catch (err) {
        showMessage('error', err.message);
    } finally {
        btnTest.disabled = false;
    }
}

async function refreshModels() {
    clearMessage();
    btnRefreshModels.disabled = true;

    try {
        const client = new OpenWebUIClient({
            serverUrl: serverUrlInput.value,
            apiKey: apiKeyInput.value
        });

        const models = await client.listModels();
        if (models.length > 0) {
            const vlModel = models.find((m) => m.toLowerCase().includes('vl'));
            if (vlModel) {
                modelInput.value = vlModel;
            } else {
                modelInput.value = models[0];
            }
            showMessage('success', `Discovered ${models.length} model(s) from Open WebUI.`);
        } else {
            showMessage('error', 'No models returned from Open WebUI.');
        }
    } catch (err) {
        showMessage('error', `Failed to refresh models: ${err.message}`);
    } finally {
        btnRefreshModels.disabled = false;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    loadSettings();
    form.addEventListener('submit', saveSettings);
    btnTest.addEventListener('click', testConnection);
    btnRefreshModels.addEventListener('click', refreshModels);
});
