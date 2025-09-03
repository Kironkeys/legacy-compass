// Enhanced Voice Recognition Handler for Legacy Compass
// Supports multiple browsers with fallback mechanisms

class VoiceHandler {
    constructor(app) {
        this.app = app;
        this.recognition = null;
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.stream = null;
        this.isRecording = false;
        this.startTime = null;
        this.interimTranscript = '';
        this.finalTranscript = '';
        
        this.init();
    }
    
    init() {
        // Check for Web Speech API support
        this.SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        this.hasSpeechRecognition = !!this.SpeechRecognition;
        
        // Check for MediaRecorder support (fallback)
        this.hasMediaRecorder = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
        
        console.log('Voice Handler initialized:', {
            speechRecognition: this.hasSpeechRecognition,
            mediaRecorder: this.hasMediaRecorder,
            browser: navigator.userAgent
        });
    }
    
    async requestMicrophonePermission() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error('Microphone access not supported in this browser');
        }
        
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                } 
            });
            
            // Store stream for later use
            this.stream = stream;
            return true;
        } catch (err) {
            if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                throw new Error('Microphone permission denied. Please allow access in browser settings.');
            } else if (err.name === 'NotFoundError') {
                throw new Error('No microphone found. Please connect a microphone.');
            } else {
                throw new Error('Microphone error: ' + err.message);
            }
        }
    }
    
    async startRecording() {
        try {
            // Request permission first
            await this.requestMicrophonePermission();
            
            this.isRecording = true;
            this.startTime = Date.now();
            this.interimTranscript = '';
            this.finalTranscript = '';
            
            // Add visual indicator
            this.showRecordingIndicator();
            
            // Try speech recognition first
            if (this.hasSpeechRecognition) {
                await this.startSpeechRecognition();
            } else if (this.hasMediaRecorder) {
                // Fallback to basic audio recording
                await this.startMediaRecording();
            } else {
                throw new Error('No recording method available');
            }
            
            return true;
        } catch (error) {
            this.isRecording = false;
            this.hideRecordingIndicator();
            throw error;
        }
    }
    
    async startSpeechRecognition() {
        this.recognition = new this.SpeechRecognition();
        
        // Configure recognition
        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.lang = 'en-US';
        this.recognition.maxAlternatives = 1;
        
        // Set up event handlers
        this.recognition.onstart = () => {
            console.log('Speech recognition started');
            this.app.showToast('🎤 Listening... Speak clearly', 'success');
        };
        
        this.recognition.onresult = (event) => {
            let interim = '';
            let final = '';
            
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript;
                
                if (event.results[i].isFinal) {
                    final += transcript + ' ';
                } else {
                    interim = transcript;
                }
            }
            
            if (final) {
                this.finalTranscript += final;
                this.updateTranscriptDisplay(this.finalTranscript);
            } else if (interim) {
                this.interimTranscript = interim;
                this.updateInterimDisplay(interim);
            }
        };
        
        this.recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            
            // Handle specific errors
            if (event.error === 'no-speech') {
                this.app.showToast('🔇 No speech detected. Try speaking louder.', 'warning');
            } else if (event.error === 'not-allowed') {
                this.app.showToast('🎤 Microphone access denied', 'error');
                this.stopRecording();
            } else if (event.error === 'network') {
                // Fallback to media recording
                this.app.showToast('🌐 Network error. Using offline recording.', 'warning');
                this.recognition.stop();
                this.startMediaRecording();
            } else if (event.error !== 'aborted') {
                this.app.showToast(`⚠️ ${event.error}`, 'error');
            }
        };
        
        this.recognition.onend = () => {
            console.log('Speech recognition ended');
            
            if (this.isRecording) {
                // Restart if still recording
                try {
                    this.recognition.start();
                } catch (e) {
                    console.log('Could not restart recognition');
                }
            }
        };
        
        // Start recognition
        try {
            await this.recognition.start();
        } catch (error) {
            if (error.message.includes('already started')) {
                // Already running, ignore
            } else {
                throw error;
            }
        }
    }
    
    async startMediaRecording() {
        if (!this.stream) {
            await this.requestMicrophonePermission();
        }
        
        this.audioChunks = [];
        this.mediaRecorder = new MediaRecorder(this.stream);
        
        this.mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                this.audioChunks.push(event.data);
            }
        };
        
        this.mediaRecorder.onstop = () => {
            const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
            this.handleAudioRecording(audioBlob);
        };
        
        this.mediaRecorder.start();
        this.app.showToast('🎤 Recording audio... (no live transcription)', 'info');
    }
    
    stopRecording() {
        this.isRecording = false;
        this.hideRecordingIndicator();
        
        // Stop speech recognition
        if (this.recognition) {
            try {
                this.recognition.stop();
            } catch (e) {
                // Already stopped
            }
            this.recognition = null;
        }
        
        // Stop media recording
        if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
            this.mediaRecorder.stop();
        }
        
        // Stop audio stream
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
        
        // Save the transcript if we have one
        if (this.finalTranscript) {
            this.saveTranscript(this.finalTranscript);
        }
        
        const duration = (Date.now() - this.startTime) / 1000;
        if (duration < 0.5) {
            this.app.showToast('🎤 Recording too short', 'warning');
        } else if (this.finalTranscript || this.audioChunks.length > 0) {
            this.app.showToast('✅ Recording saved', 'success');
        }
    }
    
    updateTranscriptDisplay(text) {
        // Update the note field with final transcript
        if (this.app.currentNote) {
            this.app.currentNote = (this.app.currentNote + ' ' + text).trim();
        } else {
            this.app.currentNote = text.trim();
        }
    }
    
    updateInterimDisplay(text) {
        // Show live transcription as placeholder
        const noteField = document.querySelector('input[x-model="currentNote"]');
        if (noteField) {
            noteField.placeholder = `"${text}"...`;
        }
    }
    
    saveTranscript(text) {
        if (!text || !text.trim()) return;
        
        // Auto-save to current property if selected
        if (this.app.selectedProperty) {
            this.app.currentNote = text.trim();
            this.app.saveCurrentNote();
        }
    }
    
    handleAudioRecording(audioBlob) {
        // For now, save as audio note indicator
        const timestamp = new Date().toISOString();
        const note = `[Audio recording - ${timestamp}]`;
        
        if (this.app.selectedProperty) {
            this.app.currentNote = note;
            this.app.saveCurrentNote();
        }
        
        // In production, you'd upload the blob to a server for transcription
        console.log('Audio blob created:', audioBlob.size, 'bytes');
    }
    
    showRecordingIndicator() {
        // Remove any existing indicator
        this.hideRecordingIndicator();
        
        // Create new indicator
        const indicator = document.createElement('div');
        indicator.id = 'voice-recording-indicator';
        indicator.className = 'voice-indicator-overlay';
        indicator.innerHTML = `
            <div class="voice-indicator-content">
                <div class="voice-pulse-ring"></div>
                <div class="voice-icon">🎤</div>
                <div class="voice-status">Recording...</div>
                <div class="voice-timer" id="voice-timer">0:00</div>
                <button class="voice-stop-btn" onclick="window.voiceHandler.stopRecording()">
                    Stop Recording
                </button>
            </div>
        `;
        
        document.body.appendChild(indicator);
        
        // Start timer
        this.timerInterval = setInterval(() => {
            if (!this.startTime) return;
            
            const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
            const minutes = Math.floor(elapsed / 60);
            const seconds = elapsed % 60;
            
            const timer = document.getElementById('voice-timer');
            if (timer) {
                timer.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
            }
        }, 100);
    }
    
    hideRecordingIndicator() {
        const indicator = document.getElementById('voice-recording-indicator');
        if (indicator) {
            indicator.remove();
        }
        
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
        
        // Reset note field placeholder
        const noteField = document.querySelector('input[x-model="currentNote"]');
        if (noteField) {
            noteField.placeholder = 'Type a note...';
        }
    }
}

// Initialize voice handler when ready
document.addEventListener('DOMContentLoaded', () => {
    // Wait for Alpine to be ready
    setTimeout(() => {
        // Create global voice handler instance
        if (window.Alpine && !window.voiceHandler) {
            const appElement = document.querySelector('[x-data="legacyCompass"]');
            if (appElement) {
                const app = Alpine.$data(appElement);
                window.voiceHandler = new VoiceHandler(app);
                console.log('Voice handler initialized');
            }
        }
    }, 1000);
});

// Export for global access
window.VoiceHandler = VoiceHandler;