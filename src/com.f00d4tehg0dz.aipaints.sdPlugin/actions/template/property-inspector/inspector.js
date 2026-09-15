/// <reference path="../../../libs/js/property-inspector.js" />
const ACTION_UUID = 'com.f00d4tehg0dz.aipaints.action';
let actionSettings = { positivePrompt: '', negativePrompt: '', lastImage: '' };
let isGenerating = false;

function element(id) {
    return document.getElementById(id);
}

function setStatus(message, details) {
    const status = element('currentText');
    let text = message || '';

    if (details) {
        const lines = [];
        if (details.code) lines.push(`Code: ${details.code}`);
        if (details.httpStatus) lines.push(`HTTP: ${details.httpStatus}`);
        if (details.message && details.message !== message) {
            lines.push(`Details: ${details.message}`);
        }
        if (lines.length) text += `\n\n${lines.join('\n')}`;
    }

    status.textContent = text.trim();
    status.style.whiteSpace = 'pre-wrap';
    status.style.display = text ? 'block' : 'none';
}

function showImage(image) {
    if (!image) return;
    const imageElement = element('currentImage');
    const viewButton = element('viewButton');
    imageElement.src = image;
    imageElement.style.display = 'block';
    viewButton.style.display = 'block';
    viewButton.onclick = () => viewImage(image);
}

function viewImage(imageUrl) {
    const width = 960;
    const height = 720;
    const left = (window.screenLeft || window.screenX || 0) + (window.outerWidth - width) / 2;
    const top = (window.screenTop || window.screenY || 0) + (window.outerHeight - height) / 2;
    const popupUrl = `popup.html?image=${encodeURIComponent(imageUrl)}`;
    window.open(popupUrl, 'GeneratedImage', `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`);
}

function readPrompts() {
    return {
        positivePrompt: element('positivePrompt').value.trim(),
        negativePrompt: element('negativePrompt').value.trim()
    };
}

function readCredentials() {
    return {
        cloudflareAccountId: element('cloudflareAccountId').value.trim(),
        cloudflareApiToken: element('cloudflareApiToken').value.trim()
    };
}

function saveGlobalCredentials() {
    $PI.setGlobalSettings(readCredentials());
}

$PI.onConnected((event) => {
    const settings = event.actionInfo && event.actionInfo.payload && event.actionInfo.payload.settings || {};
    actionSettings = {
        positivePrompt: settings.positivePrompt || settings.positive || '',
        negativePrompt: settings.negativePrompt || settings.negative || '',
        lastImage: settings.lastImage || settings.base64Image || ''
    };
    element('positivePrompt').value = actionSettings.positivePrompt;
    element('negativePrompt').value = actionSettings.negativePrompt;
    showImage(actionSettings.lastImage);
    $PI.getGlobalSettings();
});

$PI.onDidReceiveGlobalSettings((event) => {
    const settings = event.payload && event.payload.settings || {};
    element('cloudflareAccountId').value = settings.cloudflareAccountId || '';
    element('cloudflareApiToken').value = settings.cloudflareApiToken || '';
});

$PI.onSendToPropertyInspector(ACTION_UUID, (event) => {
    const payload = event.payload || {};
    if (payload.type !== 'generationUpdate') return;
    setStatus(payload.status || '', payload.details || null);
    showImage(payload.image);
    isGenerating = payload.status === 'Generating image...';
    element('update').disabled = isGenerating;
    if (payload.image) actionSettings.lastImage = payload.image;
});

document.addEventListener('DOMContentLoaded', () => {
    element('github').addEventListener('click', () => {
        $PI.openUrl('https://github.com/f00d4tehg0dz/elgato-streamdeck-ai-paints');
    });

    element('cloudflareAccountId').addEventListener('change', saveGlobalCredentials);
    element('cloudflareApiToken').addEventListener('change', saveGlobalCredentials);

    element('update').addEventListener('click', (event) => {
        event.preventDefault();
        if (isGenerating) return;

        const prompts = readPrompts();
        const credentials = readCredentials();
        if (!credentials.cloudflareAccountId || !credentials.cloudflareApiToken) {
            setStatus('Cloudflare credentials missing.');
            return;
        }
        if (!prompts.positivePrompt) {
            setStatus('Prompt is required.');
            return;
        }

        actionSettings = { ...actionSettings, ...prompts };
        $PI.setSettings(actionSettings);
        $PI.setGlobalSettings(credentials);
        $PI.sendToPlugin({ type: 'generate', ...prompts });
        isGenerating = true;
        element('update').disabled = true;
        setStatus('Generating image...');
    });
});
