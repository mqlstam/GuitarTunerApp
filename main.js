import { PitchDetector } from "https://esm.sh/pitchy@4";
import KalmanFilter from "https://esm.sh/kalmanjs@1.1.0";

document.addEventListener('DOMContentLoaded', () => {
    const startOverlay = document.getElementById('start-overlay');
    const startButton = document.getElementById('start-button');
    const permissionMessage = document.getElementById('permission-message');
    const statusIndicator = document.getElementById('status-indicator');
    const frequencyReadout = document.getElementById('frequency-readout');
    const noteReadout = document.getElementById('note-readout');
    const centsReadout = document.getElementById('cents-readout');
    const canvas = document.getElementById('tuner-canvas');
    const ctx = canvas.getContext('2d');

    let audioContext;
    let analyser;
    let detector;

    const A4 = 440;
    const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

    function getNoteData(frequency) {
        const midiNote = 69 + 12 * (Math.log(frequency / A4) / Math.log(2));
        const roundedMidiNote = Math.round(midiNote);
        const noteIndex = roundedMidiNote % 12;
        const noteName = NOTE_NAMES[noteIndex];
        const octave = Math.floor(roundedMidiNote / 12) - 1;
        const targetFrequency = A4 * Math.pow(2, (roundedMidiNote - 69) / 12);
        const cents = 1200 * Math.log(frequency / targetFrequency) / Math.log(2);

        return {
            noteName,
            octave,
            frequency,
            cents
        };
    }

    let history; // Initialized in resizeCanvas
    let lastFrameTime = 0;
    let scrollAccumulator = 0;
    const SCROLL_DURATION_MS = 4000; // 4 seconds

    function updateUI(noteData, deltaTime) {
        if (noteData) {
            // A clear note is detected: update text and scroll the graph
            frequencyReadout.textContent = noteData.frequency.toFixed(1);
            noteReadout.textContent = `${noteData.noteName}${noteData.octave}`;
            centsReadout.textContent = noteData.cents.toFixed(1);
            updateBackgroundColor(noteData.cents);

            // Scroll the canvas based on elapsed time
            if (deltaTime > 0) {
                const scrollSpeed = canvas.clientHeight / SCROLL_DURATION_MS; // pixels per millisecond
                scrollAccumulator += scrollSpeed * deltaTime;
                const pixelsToShift = Math.floor(scrollAccumulator);

                if (pixelsToShift > 0) {
                    for (let i = 0; i < pixelsToShift; i++) {
                        history.unshift(noteData.cents);
                        history.pop();
                    }
                    scrollAccumulator -= pixelsToShift;
                    updateCanvas(); // Redraw canvas only when history changes
                }
            } else if (deltaTime === 0) {
                // On the first frame, just draw the initial state
                updateCanvas();
            }
        } else {
            // No clear note detected: clear text and freeze the graph
            frequencyReadout.textContent = '--';
            noteReadout.textContent = '--';
            centsReadout.textContent = '--';
            updateBackgroundColor(null);
            // Crucially, we DO NOT update history or redraw the canvas,
            // which leaves the graph frozen in its last state.
        }
    }

    function updateCanvas() {
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        const center = width / 2;
        const inTuneCents = 5;
        const maxCentsDisplay = 20; // Squeezes the horizontal space, effectively zooming in
        const inTuneBandWidth = (center * (inTuneCents / maxCentsDisplay)) * 2;

        ctx.clearRect(0, 0, width, height);

        // Draw the "in tune" band
        ctx.fillStyle = 'rgba(16, 185, 129, 0.15)'; // Emerald-500 at 15% opacity
        ctx.fillRect(center - (inTuneBandWidth / 2), 0, inTuneBandWidth, height);

        // Draw emerald center line
        ctx.fillStyle = '#10b981'; // Emerald-500
        ctx.fillRect(center - 1, 0, 2, height);

        const positions = history.map(cents => cents === null ? null : center + (center * (cents / maxCentsDisplay)));

        // Draw out-of-tune gaps: a soft red for both sharp and flat
        ctx.fillStyle = '#f43f5e'; // Rose-500
        for (let y = 0; y < positions.length; y++) {
            const cents = history[y];
            if (cents !== null && Math.abs(cents) >= inTuneCents) {
                const pos = positions[y];
                if (cents > 0) { // Sharp
                    ctx.fillRect(center + 1, y, pos - (center + 1), 1);
                } else { // Flat
                    ctx.fillRect(pos, y, center - 1 - pos, 1);
                }
            }
        }

        // Draw the main scrolling line
        ctx.strokeStyle = '#f1f5f9'; // Slate-100
        ctx.lineWidth = 2;
        ctx.beginPath();

        let isLineActive = false;
        for (let y = 0; y < positions.length; y++) {
            const pos = positions[y];
            if (pos !== null) {
                if (!isLineActive) {
                    ctx.moveTo(pos, y);
                    isLineActive = true;
                } else {
                    ctx.lineTo(pos, y);
                }
            } else if (isLineActive) {
                ctx.stroke();
                isLineActive = false;
                ctx.beginPath();
            }
        }
        if (isLineActive) {
            ctx.stroke();
        }
    }

    function clearCanvas() {
        history = new Array(canvas.clientHeight).fill(null);
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        ctx.clearRect(0, 0, width, height);
    }

    function updateBackgroundColor(cents) {
        if (cents !== null && Math.abs(cents) < 5) {
            canvas.style.backgroundColor = '#064e3b'; // Dark emerald-800
        } else {
            canvas.style.backgroundColor = '#1e293b'; // Default slate-800
        }
    }

    function resizeCanvas() {
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;

        ctx.scale(dpr, dpr);

        const newHistory = new Array(Math.round(rect.height)).fill(null);
        if (history) {
            const slice = history.slice(0, newHistory.length);
            for(let i = 0; i < slice.length; i++) {
                newHistory[i] = slice[i];
            }
        }
        history = newHistory;
        updateCanvas();
    }

    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    const centsKalman = new KalmanFilter({R: 0.1, Q: 2});
    const freqKalman = new KalmanFilter({R: 0.1, Q: 2});

    function processAudio(currentTime) {
        const deltaTime = currentTime - lastFrameTime;
        lastFrameTime = currentTime;

        const input = new Float32Array(detector.inputLength);
        analyser.getFloatTimeDomainData(input);

        // --- Volume Check ---
        let sumOfSquares = 0.0;
        for (const amplitude of input) {
            sumOfSquares += amplitude * amplitude;
        }
        const rms = Math.sqrt(sumOfSquares / input.length);
        const db = 20 * Math.log10(rms);

        if (isFinite(db) && db > -1000) {
            const [pitch, clarity] = detector.findPitch(input, audioContext.sampleRate);

            if (clarity > 0.9) {
                const noteData = getNoteData(pitch);
                noteData.cents = centsKalman.filter(noteData.cents);
                noteData.frequency = freqKalman.filter(noteData.frequency);
                updateUI(noteData, deltaTime);
            } else {
                updateUI(null, deltaTime);
            }
        } else {
            updateUI(null, deltaTime);
        }

        requestAnimationFrame(processAudio);
    }

    async function start() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            permissionMessage.textContent = 'getUserMedia() not supported on your browser. Please use a modern browser and serve the page over HTTPS or localhost.';
            permissionMessage.classList.remove('hidden');
            startButton.classList.add('hidden');
            return;
        }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            analyser = audioContext.createAnalyser();
            analyser.fftSize = 4096;
            detector = PitchDetector.forFloat32Array(analyser.fftSize);
            const source = audioContext.createMediaStreamSource(stream);
            source.connect(analyser);

            statusIndicator.classList.remove('status-indicator-off');
            statusIndicator.classList.add('status-indicator-on');
            
            // Start the fade-out animation for the overlay
            startOverlay.classList.add('opacity-0');
            
            // After the animation finishes, hide it completely
            setTimeout(() => {
                startOverlay.classList.add('hidden');
            }, 300); // This duration should match the transition duration in the CSS

            lastFrameTime = performance.now();
            requestAnimationFrame(processAudio);
        } catch (err) {
            console.error(err);
            permissionMessage.classList.remove('hidden');
            startButton.classList.add('hidden');
        }
    }

    startButton.addEventListener('click', start);

    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/sw.js').then(registration => {
                console.log('SW registered: ', registration);
            }).catch(registrationError => {
                console.log('SW registration failed: ', registrationError);
            });
        });
    }
});
