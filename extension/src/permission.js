document.getElementById('btnGrant').addEventListener('click', async () => {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((track) => track.stop());
        alert('Microphone access granted! You can close this tab and dictate from the popup.');
        window.close();
    } catch (err) {
        alert(`Permission denied: ${err.message}`);
    }
});
