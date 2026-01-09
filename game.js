import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --- CONFIG ---
        const firebaseConfig = {
        apiKey: "AIzaSyAoP9XAGIu5sBxLHx8vjWCWjWS41ZURX30",
        authDomain: "solo-leveling-app-57b38.firebaseapp.com",
        projectId: "solo-leveling-app-57b38",
        storageBucket: "solo-leveling-app-57b38.firebasestorage.app",
        messagingSenderId: "715704809890",
        appId: "1:715704809890:web:69e2ba6af16d0933e39afb"
        };

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- GLOBAL VARIABLES ---
let playerData = null;
let gateTimerInterval = null;

// GATE SETTINGS (Tijd in minuten, Crystals)
const GATE_DATA = {
    'E': { minTime: 2, maxTime: 10, xp: 50, gold: 10, maxMana: 5, chance: 0.9 },
    'D': { minTime: 2, maxTime: 10, xp: 100, gold: 15, maxMana: 8, chance: 0.8 },
    'C': { minTime: 5, maxTime: 12, xp: 150, gold: 20, maxMana: 14, chance: 0.8 },
    'B': { minTime: 12, maxTime: 15, xp: 200, gold: 25, maxMana: 17, chance: 0.75 },
    'A': { minTime: 15, maxTime: 20, xp: 250, gold: 30, maxMana: 20, chance: 0.75 },
    'S': { minTime: 30, maxTime: 30, xp: 300, gold: 40, maxMana: 50, chance: 0.75 },
    'SS': { minTime: 60, maxTime: 60, xp: 400, gold: 50, maxMana: 100, chance: 0.70 },
    'SSS': { minTime: 120, maxTime: 120, xp: 1000, gold: 100, maxMana: 250, chance: 0.60 },
    'RED': { time: 0.1, xp: 200, gold: 0, minMana: 20, maxMana: 150, chance: 0.25 }, // Test: 0.1 min (6 sec)
    'BLUE': { time: 0.1, chance: 1.0 } // Random rewards logic apart
};

const RANKS = [
    { name: "E-Rank", min: 0, max: 3000 },
    { name: "D-Rank", min: 3000, max: 6000 },
    { name: "C-Rank", min: 6000, max: 10000 },
    { name: "B-Rank", min: 10000, max: 14000 },
    { name: "A-Rank", min: 14000, max: 20000 },
    { name: "S-Rank", min: 20000, max: 35000 },
    { name: "SS-Rank", min: 35000, max: 60000 },
    { name: "SSS-Rank", min: 60000, max: 150000 }
];

// --- AUTH ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('app-screen').classList.remove('hidden');
        loadPlayerData(user.uid);
    } else {
        document.getElementById('login-screen').classList.remove('hidden');
        document.getElementById('app-screen').classList.add('hidden');
    }
});

// --- DATA & RESET ---
async function loadPlayerData(userId) {
    const docRef = doc(db, "players", userId);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
        playerData = docSnap.data();
        
        // FIX: Als quests leeg zijn (oud account), voeg Brush Teeth toe
        if (!playerData.quests || playerData.quests.length === 0) {
            playerData.quests = [
                { id: Date.now(), title: "Brush Teeth", type: "DAILY", xp: 20, gold: 1, mana: 0, completed: false }
            ];
            await saveToDB();
        }

    } else {
        playerData = {
            rank: "E-Rank",
            xp: 0,
            gold: 0,
            manaCrystals: 0,
            lastLoginDate: new Date().toDateString(),
            quests: [
                { id: Date.now(), title: "Brush Teeth", type: "DAILY", xp: 20, gold: 1, mana: 0, completed: false }
            ],
            logbook: []
        };
        await setDoc(docRef, playerData);
    }

    checkDailyReset();
    updateUI();
    
    // Start Timer Interval als er een gate actief is
    if (playerData.activeGate) {
        startTimerLoop();
    }
}

async function checkDailyReset() {
    const today = new Date().toDateString();
    if (playerData.lastLoginDate !== today) {
        let count = 0;
        if (playerData.quests) {
            playerData.quests.forEach(q => {
                if (q.type === 'DAILY') { q.completed = false; count++; }
            });
        }
        if (count > 0) addToLog(`System Reset: ${count} Daily Quests restored.`);
        playerData.lastLoginDate = today;
        await saveToDB();
    }
}

// --- GATE SYSTEM (LOGIC) ---
window.startGate = async (rank) => {
    // 1. Check if busy
    if (playerData.activeGate) {
        return alert("You are already exploring a gate!");
    }

    // 2. Check Logic (Hier later Rank check toevoegen)
    
    // 3. Bereken Tijd (Simpel gehouden voor nu)
    let durationMinutes = 5; // Default
    if (GATE_DATA[rank]) {
        // Pak een random tijd tussen min en max
        const min = GATE_DATA[rank].minTime || GATE_DATA[rank].time;
        const max = GATE_DATA[rank].maxTime || GATE_DATA[rank].time;
        durationMinutes = Math.floor(Math.random() * (max - min + 1)) + min;
    }

    // 4. Start Gate
    const endTime = Date.now() + (durationMinutes * 60 * 1000);
    
    playerData.activeGate = {
        rank: rank,
        endTime: endTime
    };

    addToLog(`Gate: Started ${rank}-Rank Gate (${durationMinutes} min).`);
    await saveToDB();
    updateUI();
    startTimerLoop();
};

window.claimGateReward = async () => {
    if (!playerData.activeGate) return;
    
    const rank = playerData.activeGate.rank;
    const gateInfo = GATE_DATA[rank];
    
    // Bereken Loot
    const success = Math.random() <= gateInfo.chance;
    
    if (success) {
        const mana = Math.floor(Math.random() * (gateInfo.maxMana || 5)) + 1;
        addRewards(gateInfo.xp, gateInfo.gold, mana, `Gate Cleared: ${rank}-Rank`);
    } else {
        addToLog(`Gate Failed: ${rank}-Rank (No Loot).`);
        showNotification("Raid Failed...");
    }

    // Reset Gate
    playerData.activeGate = null;
    await saveToDB();
    updateUI();
};

function startTimerLoop() {
    if (gateTimerInterval) clearInterval(gateTimerInterval);
    
    gateTimerInterval = setInterval(() => {
        if (!playerData.activeGate) {
            clearInterval(gateTimerInterval);
            return;
        }
        updateGateUI();
    }, 1000);
    updateGateUI(); // Direct 1x aanroepen
}

function updateGateUI() {
    const now = Date.now();
    const timeLeft = playerData.activeGate.endTime - now;
    
    const timerDisplay = document.getElementById('gate-timer');
    const claimBtn = document.getElementById('btn-claim-gate');
    const title = document.getElementById('gate-timer-title');

    if (timeLeft <= 0) {
        // KLAAR!
        timerDisplay.innerText = "00:00";
        title.innerText = "Dungeon Cleared!";
        claimBtn.classList.remove('hidden');
    } else {
        // NOG BEZIG
        const m = Math.floor((timeLeft / 1000 / 60) % 60);
        const s = Math.floor((timeLeft / 1000) % 60);
        timerDisplay.innerText = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        title.innerText = `Exploring ${playerData.activeGate.rank}-Rank Gate...`;
        claimBtn.classList.add('hidden');
    }
}

// --- MANA FIX ---
window.convertMana = async () => {
    const amount = parseInt(document.getElementById('convert-amount').value);
    if (!amount || amount <= 0) return;
    
    if (playerData.manaCrystals < amount) return alert("Not enough Mana!");

    // Bereken hoeveel we ECHT gebruiken (veelvouden van 3)
    const usedMana = amount - (amount % 3); // 7 -> 6
    const goldGained = usedMana / 3;        // 6 / 3 = 2
    
    if (goldGained === 0) return alert("Need at least 3 Mana to trade.");

    playerData.manaCrystals -= usedMana; // We pakken alleen de 6 af
    playerData.gold += goldGained;
    
    addToLog(`Shop: Traded ${usedMana} Mana for ${goldGained} Gold.`);
    showNotification(`+${goldGained} Gold`);
    
    await saveToDB();
    closeModal('modal-convert');
    updateUI();
};

// --- QUESTS ---
window.saveNewQuest = async () => {
    const title = document.getElementById('new-quest-title').value;
    const xp = parseInt(document.getElementById('new-quest-xp').value) || 0;
    const gold = parseInt(document.getElementById('new-quest-gold').value) || 0;
    const mana = parseInt(document.getElementById('new-quest-mana').value) || 0;
    const type = document.getElementById('new-quest-type').value;

    if (!title) return alert("Title required");

    const newQuest = {
        id: Date.now(), title, type, xp, gold, mana, completed: false
    };

    if (!playerData.quests) playerData.quests = [];
    playerData.quests.push(newQuest);
    await saveToDB();
    closeModal('modal-quest');
    updateUI();
};

window.toggleQuest = async (id) => {
    const q = playerData.quests.find(x => x.id === id);
    if (!q || q.completed) return;
    q.completed = true;
    addRewards(q.xp, q.gold, q.mana, `Quest: ${q.title}`);
    await saveToDB();
    updateUI();
};

// --- HELPERS ---
function addRewards(xp, gold, mana, reason) {
    playerData.xp += xp;
    playerData.gold += gold;
    if (mana) playerData.manaCrystals += mana;

    // Check Rank logic (verkort voor overzicht)
    const curRank = RANKS.find(r => r.name === playerData.rank);
    if (curRank && playerData.xp >= curRank.max) {
        const next = RANKS.find(r => r.min === curRank.max);
        if (next) {
            playerData.rank = next.name;
            showNotification(`RANK UP! ${next.name}`);
            addToLog(`Promoted to ${next.name}`);
        }
    }
    
    // FIX: Notificatie toont nu ook Mana
    let notifText = `+${xp} XP | +${gold} Gold`;
    if (mana > 0) notifText += ` | +${mana} Mana`;
    showNotification(notifText);
    
    addToLog(reason);
}

function addToLog(msg) {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (!playerData.logbook) playerData.logbook = [];
    playerData.logbook.push({ time, msg });
    if (playerData.logbook.length > 50) playerData.logbook.shift();
}

async function saveToDB() {
    const docRef = doc(db, "players", auth.currentUser.uid);
    await updateDoc(docRef, playerData);
}

function showNotification(text) {
    const n = document.getElementById('notification-bar');
    document.getElementById('notif-text').innerText = text;
    n.classList.remove('hidden');
    setTimeout(() => n.classList.add('hidden'), 5000);
}

// --- UI UPDATE ---
function updateUI() {
    // Stats
    document.getElementById('display-rank').innerText = playerData.rank;
    document.getElementById('display-xp').innerText = playerData.xp;
    document.getElementById('display-gold').innerText = playerData.gold;
    document.getElementById('display-mana').innerText = (playerData.manaCrystals || 0) + " 💎";
    
    // Shop
    document.getElementById('shop-gold').innerText = playerData.gold;
    document.getElementById('shop-mana').innerText = (playerData.manaCrystals || 0);

    // Gate UI Toggle
    if (playerData.activeGate) {
        document.getElementById('active-gate-panel').classList.remove('hidden');
        document.getElementById('gate-selection-grid').classList.add('hidden');
        updateGateUI(); // Direct timer updaten
    } else {
        document.getElementById('active-gate-panel').classList.add('hidden');
        document.getElementById('gate-selection-grid').classList.remove('hidden');
    }

    // Quests
    if (playerData.quests) {
        renderList('list-daily', 'DAILY');
        renderList('list-special', 'SPECIAL');
        renderList('list-onetime', 'ONE_TIME');
    }
    
    // Logs
    const logList = document.getElementById('logbook-list');
    logList.innerHTML = "";
    if (playerData.logbook) {
        playerData.logbook.slice().reverse().forEach(e => {
            logList.innerHTML += `<div class='log-entry'><span class="time">${e.time}</span> <span class="text">${e.msg}</span></div>`;
        });
    }
}

function renderList(id, type) {
    const list = document.getElementById(id);
    list.innerHTML = "";
    const items = playerData.quests.filter(q => q.type === type);
    if (items.length === 0) { list.innerHTML = `<p class="empty-msg">No quests.</p>`; return; }
    
    items.forEach(q => {
        const cls = q.completed ? 'completed' : '';
        let rewards = `XP: ${q.xp} | Gold: ${q.gold}`;
        if (q.mana > 0) rewards += ` | Mana: ${q.mana}`;
        
        list.innerHTML += `
            <div class="quest-item ${cls}">
                <div class="quest-info"><h4>${q.title}</h4><div class="quest-rewards">${rewards}</div></div>
                <button class="checkbox-btn" onclick="toggleQuest(${q.id})"></button>
            </div>`;
    });
}

// --- EVENTS ---
window.openQuestModal = (t) => { document.getElementById('new-quest-type').value = t; document.getElementById('modal-quest').classList.remove('hidden'); };
window.openConvertModal = () => { document.getElementById('convert-available').innerText = playerData.manaCrystals || 0; document.getElementById('modal-convert').classList.remove('hidden'); };
window.closeModal = (id) => document.getElementById(id).classList.add('hidden');

document.getElementById('btn-login').addEventListener('click', () => {
    const email = document.getElementById('email').value; const pass = document.getElementById('password').value;
    signInWithEmailAndPassword(auth, email, pass).catch(e => alert(e.message));
});
window.logout = () => signOut(auth);

// NAV SWITCH FIX
window.switchTab = (tabName) => {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active-tab'));
    document.getElementById('tab-' + tabName).classList.add('active-tab');
    
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    document.getElementById('nav-' + tabName).classList.add('active'); // GEBRUIKT NU DE ID
    
    document.getElementById('nav-menu').classList.remove('active');
};
document.getElementById('hamburger-btn').addEventListener('click', () => document.getElementById('nav-menu').classList.toggle('active'));