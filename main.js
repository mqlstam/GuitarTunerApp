import { PitchDetector } from "https://esm.sh/pitchy@4";

document.addEventListener('DOMContentLoaded', () => {
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
    let input;

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

    function updateUI(noteData) {
        if (noteData) {
            // Add new data to history, redraw, and update text
            history.unshift(noteData.cents);
            history.pop();
            updateCanvas();
            frequencyReadout.textContent = noteData.frequency.toFixed(1);
            noteReadout.textContent = `${noteData.noteName}${noteData.octave}`;
            centsReadout.textContent = noteData.cents.toFixed(1);
        } else {
            // Freeze graph by only clearing text readouts
            frequencyReadout.textContent = '--';
            noteReadout.textContent = '--';
            centsReadout.textContent = '--';
        }
        // Always update the background color based on the latest data
        updateBackgroundColor(noteData ? noteData.cents : null);
    }

    function updateCanvas() {
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        const center = width / 2;
        const inTuneCents = 5;
        const inTuneBandWidth = (center * (inTuneCents / 50)) * 2;

        ctx.clearRect(0, 0, width, height);

        // Draw the "in tune" band
        ctx.fillStyle = 'rgba(0, 255, 0, 0.2)'; // Semi-transparent light green
        ctx.fillRect(center - (inTuneBandWidth / 2), 0, inTuneBandWidth, height);

        // Draw green center line
        ctx.fillStyle = 'green';
        ctx.fillRect(center - 1, 0, 2, height);

        const positions = history.map(cents => cents === null ? null : center + (center * (cents / 50)));

        // Draw red "out-of-tune" gaps first
        ctx.fillStyle = 'red';
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

        // Draw the white, interpolated line over the top
        ctx.strokeStyle = 'white';
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
            canvas.style.backgroundColor = '#023020'; // Dark muted green
        } else {
            canvas.style.backgroundColor = '#111'; // Default dark grey
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

    function processAudio() {
        const input = new Float32Array(detector.inputLength);
        analyser.getFloatTimeDomainData(input);

        // --- Volume Check ---
        let sumOfSquares = 0.0;
        for (const amplitude of input) {
            sumOfSquares += amplitude * amplitude;
        }
        const rms = Math.sqrt(sumOfSquares / input.length);
        const db = 20 * Math.log10(rms);

        // -50 dB is a reasonable threshold for silence.
        if (isFinite(db) && db > -200) {
            const [pitch, clarity] = detector.findPitch(input, audioContext.sampleRate);

            if (clarity > 0.95) {
                const noteData = getNoteData(pitch);
                updateUI(noteData);
            } else {
                updateUI(null);
            }
        } else {
            updateUI(null);
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
            startButton.classList.add('hidden');

            processAudio();
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
