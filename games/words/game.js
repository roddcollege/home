// Retro Arcade Sound Engine (Web Audio API Synthesizer)
const AudioFX = {
    ctx: null,
    init() { if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)(); },
    play(type) {
        this.init();
        if (this.ctx.state === 'suspended') this.ctx.resume();
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        const now = this.ctx.currentTime;

        if (type === 'type') { // Clean wooden tile select click
            osc.type = 'triangle'; osc.frequency.setValueAtTime(400, now);
            gain.gain.setValueAtTime(0.15, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
            osc.start(now); osc.stop(now + 0.05);
        } else if (type === 'twist') { // Soft arcade swoop pitch slide
            osc.type = 'sine'; osc.frequency.setValueAtTime(200, now);
            osc.frequency.exponentialRampToValueAtTime(600, now + 0.15);
            gain.gain.setValueAtTime(0.2, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
            osc.start(now); osc.stop(now + 0.15);
        } else if (type === 'correct') { // Happy musical arpeggio
            osc.type = 'sine';
            [523.25, 659.25, 783.99].forEach((freq, idx) => {
                const noteOsc = this.ctx.createOscillator();
                const noteGain = this.ctx.createGain();
                noteOsc.type = 'sine'; noteOsc.frequency.setValueAtTime(freq, now + (idx * 0.06));
                noteGain.gain.setValueAtTime(0.15, now + (idx * 0.06));
                noteGain.gain.exponentialRampToValueAtTime(0.01, now + (idx * 0.06) + 0.2);
                noteOsc.connect(noteGain); noteGain.connect(this.ctx.destination);
                noteOsc.start(now + (idx * 0.06)); noteOsc.stop(now + (idx * 0.06) + 0.2);
            });
        } else if (type === 'combo') { // Hyper bright retro blast
            osc.type = 'square'; osc.frequency.setValueAtTime(587.33, now);
            osc.frequency.setValueAtTime(880.00, now + 0.08);
            gain.gain.setValueAtTime(0.1, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
            osc.start(now); osc.stop(now + 0.2);
        } else if (type === 'wrong') { // Downward buzzer error drop
            osc.type = 'sawtooth'; osc.frequency.setValueAtTime(150, now);
            osc.frequency.linearRampToValueAtTime(90, now + 0.25);
            gain.gain.setValueAtTime(0.15, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
            osc.start(now); osc.stop(now + 0.25);
        } else if (type === 'tick') { // Sharp digital metallic warning step
            osc.type = 'square'; osc.frequency.setValueAtTime(1200, now);
            gain.gain.setValueAtTime(0.05, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.02);
            osc.start(now); osc.stop(now + 0.02);
        }
    }
};

// Application State Variables
let currentScore = 0, currentTimer = 120, mainClockInterval = null;
let anagramRootStr = "", validWordsList = [], correctlyGuessedList = [];
let comboLevel = 1, consecutiveHitsCounter = 0;
let generatedPoolSequence = [], currentTypingInputsArray = [];

// DOM Elements Link
const elTriggerBtn = document.getElementById("btn-game-trigger");
const elTwistBtn = document.getElementById("btn-twist");
const elClearBtn = document.getElementById("btn-clear");
const elTimer = document.getElementById("timer-val");
const elScore = document.getElementById("score-val");
const elComboBadge = document.getElementById("combo-meter");
const elMatrixBoard = document.getElementById("matrix-board");
const elTypingTray = document.getElementById("typing-tray-row");
const elDockPool = document.getElementById("tile-dock-pool");
const elSummaryOverlay = document.getElementById("summary-overlay");

// Event Core Hooks
elTriggerBtn.addEventListener("click", startChallengeCycle);
elTwistBtn.addEventListener("click", performTwistShuffle);
elClearBtn.addEventListener("click", clearTypingTrayComposition);
document.getElementById("btn-modal-close").addEventListener("click", () => elSummaryOverlay.classList.add("hidden-view"));

// Universal Physical Keyboard Handler (Intercepts Raw Typos)
document.addEventListener("keydown", (e) => {
    if (mainClockInterval === null) return; // Prevent interaction when clock is idle
    const inputChar = e.key.toUpperCase();

    if (inputChar === "ENTER") {
        submitCurrentGuessString();
    } else if (inputChar === "ESCAPE") {
        clearTypingTrayComposition();
    } else if (e.key === " ") {
        e.preventDefault();
        performTwistShuffle();
    } else if (e.key === "Backspace") {
        popLastLetterFromTray();
	} else if (/^[A-Z]$/.test(inputChar)) {
        // Find the first matching letter tile regardless of whether it's been used
        const matchIndex = generatedPoolSequence.findIndex(item => item.letter === inputChar);
        if (matchIndex !== -1) appendLetterToTray(matchIndex);
    }
});

function startChallengeCycle() {
    currentScore = 0; currentTimer = 120; comboLevel = 1; consecutiveHitsCounter = 0;
    correctlyGuessedList = []; currentTypingInputsArray = [];
    
    elScore.textContent = currentScore;
    elTimer.textContent = currentTimer;
    elComboBadge.textContent = "COMBO x1";
    elComboBadge.className = "hud-item-box bg-orange pulse-idle";
    elSummaryOverlay.classList.add("hidden-view");

    // Select random base puzzle set array
    const clusterKeys = Object.keys(WORD_DICTIONARY);
    anagramRootStr = clusterKeys[Math.floor(Math.random() * clusterKeys.length)];
    validWordsList = [...WORD_DICTIONARY[anagramRootStr]].sort((a,b) => a.length - b.length || a.localeCompare(b));

    buildStructuralSlotsMatrix();
    compileScrambledStateArray(true);
    
    elTriggerBtn.disabled = true;
    elTwistBtn.disabled = false;
    elClearBtn.disabled = false;

    mainClockInterval = setInterval(() => {
        currentTimer--;
        elTimer.textContent = currentTimer;
        if (currentTimer <= 15) AudioFX.play('tick'); // Panic clock alerts
        if (currentTimer <= 0) terminateSessionInstance();
    }, 1000);
}

function buildStructuralSlotsMatrix() {
    elMatrixBoard.innerHTML = "";
    validWordsList.forEach(word => {
        let div = document.createElement("div");
        div.className = "matrix-slot-block";
        div.id = `slot-id-${word}`;
        div.textContent = "_ ".repeat(word.length).trim();
        elMatrixBoard.appendChild(div);
    });
}

function compileScrambledStateArray(isFirstBoot = false) {
    let sourceChars = anagramRootStr.split('');
    // Fast array sorting randomizer
    sourceChars.sort(() => 0.5 - Math.random());
    generatedPoolSequence = sourceChars.map((letter, index) => ({ letter, originalIndex: index, isTyped: false }));
    
    if (!isFirstBoot) AudioFX.play('twist');
    refreshDockLayoutView();
}

function refreshDockLayoutView() {
    elDockPool.innerHTML = "";
    generatedPoolSequence.forEach((item, index) => {
        let tile = document.createElement("div");
        // We removed the 'is-typed-out' class logic since tiles are never exhausted
        tile.className = "interactive-tile";
        tile.textContent = item.letter;
        // Tiles can now be clicked infinitely
        tile.addEventListener("click", () => appendLetterToTray(index));
        elDockPool.appendChild(tile);
    });
}

function appendLetterToTray(poolIndex) {
    AudioFX.play('type');
    // We no longer set generatedPoolSequence[poolIndex].isTyped = true;
    currentTypingInputsArray.push(poolIndex);
    updateTrayDisplayView();
    // We also don't need to refresh the dock view anymore since tiles don't change state!
}

function popLastLetterFromTray() {
    if (currentTypingInputsArray.length === 0) return;
    AudioFX.play('type');
    currentTypingInputsArray.pop();
    // We no longer set isTyped = false;
    updateTrayDisplayView();
}

function clearTypingTrayComposition() {
    currentTypingInputsArray = [];
    // We no longer loop through and reset isTyped = false;
    updateTrayDisplayView();
}

function updateTrayDisplayView() {
    if (currentTypingInputsArray.length === 0) {
        elTypingTray.innerHTML = `<span class="tray-placeholder">TYPE LETTERS WITH KEYBOARD...</span>`;
        return;
    }
    elTypingTray.innerHTML = "";
    currentTypingInputsArray.forEach(poolIdx => {
        let block = document.createElement("div");
        block.className = "interactive-tile";
        block.textContent = generatedPoolSequence[poolIdx].letter;
        elTypingTray.appendChild(block);
    });
}

function performTwistShuffle() {
    // Collect letters currently untyped, shuffle them, and merge back
    let availableItems = generatedPoolSequence.filter(item => !item.isTyped);
    let lettersOnly = availableItems.map(i => i.letter).sort(() => 0.5 - Math.random());
    
    let letterPointer = 0;
    generatedPoolSequence.forEach(item => {
        if (!item.isTyped) {
            item.letter = lettersOnly[letterPointer++];
        }
    });
    compileScrambledStateArray(false);
}

function submitCurrentGuessString() {
    const activeGuessStr = currentTypingInputsArray.map(idx => generatedPoolSequence[idx].letter).join('');
    if (!activeGuessStr) return;

    if (validWordsList.includes(activeGuessStr) && !correctlyGuessedList.includes(activeGuessStr)) {
        correctlyGuessedList.push(activeGuessStr);
        
        // Reveal item within layout template grids
        const targetedDomNode = document.getElementById(`slot-id-${activeGuessStr}`);
        if (targetedDomNode) {
            targetedDomNode.textContent = activeGuessStr;
            targetedDomNode.classList.add("solved-reveal");
        }

        // Handle Playfish score multipliers
        consecutiveHitsCounter++;
        if (consecutiveHitsCounter >= 3) {
            comboLevel = Math.min(comboLevel + 1, 5);
            consecutiveHitsCounter = 0;
            AudioFX.play('combo');
        } else {
            AudioFX.play('correct');
        }

        currentScore += (activeGuessStr.length * 15) * comboLevel;
        if (activeGuessStr.length >= 5) currentTimer += 5; // Bonus seconds
        
        elScore.textContent = currentScore;
        elTimer.textContent = currentTimer;
        elComboBadge.textContent = `COMBO x${comboLevel}`;

        // --- NEW: EARLY VICTORY & TIME BONUS LOGIC ---
        if (correctlyGuessedList.length === validWordsList.length) {
            // Stop the clock immediately
            clearInterval(mainClockInterval);
            mainClockInterval = null;
            
            // Calculate time bonus (e.g., 25 points per remaining second, multiplied by combo)
            const timeBonus = currentTimer * 25 * comboLevel; 
            currentScore += timeBonus;
            elScore.textContent = currentScore;
            
            // Wait half a second so the final word's green pop animation finishes before ending
            setTimeout(() => {
                terminateSessionInstance();
            }, 500); 
        }

    } else {
        // Clear combo values immediately on error matches
        AudioFX.play('wrong');
        consecutiveHitsCounter = 0;
        comboLevel = 1;
        elComboBadge.textContent = "COMBO x1";
    }
    clearTypingTrayComposition();
}

function evaluateFinalDictionaryRank(score) {
    if (score < 300) return "🎭 Mime";
    if (score < 800) return "🎪 Circus Juggler";
    if (score < 1800) return "✍️ Town Poet";
    if (score < 3500) return "🎓 Scholar of Letters";
    return "🎸 Anagram Rock Star";
}

function terminateSessionInstance() {
    clearInterval(mainClockInterval);
    mainClockInterval = null;
    
    elTwistBtn.disabled = true;
    elClearBtn.disabled = true;
    elTriggerBtn.disabled = false;

    const omittedWordsArray = validWordsList.filter(w => !correctlyGuessedList.includes(w));
    
    document.getElementById("final-score-txt").textContent = currentScore;
    document.getElementById("badge-rank-title").textContent = evaluateFinalDictionaryRank(currentScore);
    
    const displayBox = document.getElementById("missed-words-grid");
    displayBox.innerHTML = omittedWordsArray.length > 0 ? omittedWordsArray.join(", ") : "Flawless Board Mastery! 🌟";
    
    elSummaryOverlay.classList.remove("hidden-view");
    clearTypingTrayComposition();
}