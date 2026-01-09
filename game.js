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

// GATE SETTINGS
const GATE_DATA = {
    'E': { minTime: 2, maxTime: 10, xp: 50, gold: 10, maxMana: 5, chance: 0.9 },
    'D': { minTime: 2, maxTime: 10, xp: 100, gold: 15, maxMana: 8, chance: 0.8 },
    'C': { minTime: 5, maxTime: 12, xp: 150, gold: 20, maxMana: 14, chance: 0.8 },
    'B': { minTime: 12, maxTime: 15, xp: 200, gold: 25, maxMana: 17, chance: 0.75 },
    'A': { minTime: 15, maxTime: 20, xp: 250, gold: 30, maxMana: 20, chance: 0.75 },
    'S': { minTime: 30, maxTime: 30, xp: 300, gold: 40, maxMana: 50, chance: 0.75 },
    'SS': { minTime: 60, maxTime: 60, xp: 400, gold: 50, maxMana: 100, chance: 0.70 },
    'SSS': { minTime: 120, maxTime: 120, xp: 1000, gold: 100, maxMana: 250, chance: 0.60 },
    'RED': { time: 0.1, xp: 200, gold: 0, minMana: 20, maxMana: 150, chance: 0.25 },
    'BLUE': { time: 0.1, chance: 1.0 }
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
        
        // FIX: Check of de specifieke quest er is. Zo niet, voeg toe.
        const hasBrushQuest = playerData.quests && playerData.quests.some(q => q.title === "Brush Teeth");
        if (!hasBrushQuest) {
            if (!playerData.quests) playerData.quests = [];
            playerData.quests.push({ id: Date.now(), title: "Brush Teeth", type: "DAILY", xp: 20, gold: 1, mana: 0, completed: false });
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
            logbook: [],
            activeGates: [] // NIEUW: Array voor meerdere gates
        };
        await setDoc(docRef, playerData);
    }

    // Migratie fix: Als oud account nog enkele 'activeGate' heeft, zet om naar array
    if (playerData.activeGate && !playerData.activeGates) {
        playerData.activeGates = [playerData.activeGate];
        delete playerData.activeGate;
        await saveToDB();
    }
    if (!playerData.activeGates) playerData.activeGates = [];

    checkDailyReset();
    updateUI();
    startTimerLoop();
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

// --- MULTI GATE SYSTEM ---
window.startGate = async (rank) => {
    // Geen limiet meer op aantal gates, maar je mag maar 1 van dezelfde rank tegelijk doen (optioneel)
    
    // Tijd berekenen
    let durationMinutes = 5; 
    if (GATE_DATA[rank]) {
        const min = GATE_DATA[rank].minTime || GATE_DATA[rank].time;
        const max = GATE_DATA[rank].maxTime || GATE_DATA[rank].time;
        durationMinutes = Math.floor(Math.random() * (max - min + 1)) + min;
    }

    const endTime = Date.now() + (durationMinutes * 60 * 1000);
    
    // Voeg toe aan ARRAY
    playerData.activeGates.push({
        id: Date.now(), // Unieke ID voor deze raid
        rank: rank,
        endTime: endTime
    });

    addToLog(`Gate: Started ${rank}-Rank Gate (${durationMinutes} min).`);
    await saveToDB();
    updateUI();
    startTimerLoop();
};

window.claimGateReward = async (raidId) => {
    const raidIndex = playerData.activeGates.findIndex(g => g.id === raidId);
    if (raidIndex === -1) return;
    
    const raid = playerData.activeGates[raidIndex];
    const rank = raid.rank;
    const gateInfo = GATE_DATA[rank];
    
    // Loot Check
    const success = Math.random() <= gateInfo.chance;
    
    if (success) {
        const mana = Math.floor(Math.random() * (gateInfo.maxMana || 5)) + 1;
        addRewards(gateInfo.xp, gateInfo.gold, mana, `Gate Cleared: ${rank}-Rank`);
    } else {
        addToLog(`Gate Failed: ${rank}-Rank (No Loot).`);
        showNotification("Raid Failed...");
    }

    // Verwijder uit array
    playerData.activeGates.splice(raidIndex, 1);
    
    await saveToDB();
    updateUI();
};

function startTimerLoop() {
    if (gateTimerInterval) clearInterval(gateTimerInterval);
    gateTimerInterval = setInterval(() => {
        if (!playerData.activeGates || playerData.activeGates.length === 0) {
            // Niet stoppen, want misschien start je er zo een
            return; 
        }
        renderActiveRaids();
    }, 1000);
    renderActiveRaids();
}

function renderActiveRaids() {
    const container = document.getElementById('active-raids-container');
    container.innerHTML = "";
    
    if (!playerData.activeGates || playerData.activeGates.length === 0) return;

    const now = Date.now();

    playerData.activeGates.forEach(raid => {
        const timeLeft = raid.endTime - now;
        let html = "";
        
        if (timeLeft <= 0) {
            // READY TO CLAIM
            html = `
            <div class="raid-card">
                <div class="raid-info">
                    <span class="raid-title">${raid.rank}-Rank Gate</span>
                    <span class="raid-timer" style="color:#f1c40f">DONE</span>
                </div>
                <button class="claim-btn" onclick="claimGateReward(${raid.id})">CLAIM</button>
            </div>`;
        } else {
            // RUNNING
            const m = Math.floor((timeLeft / 1000 / 60) % 60);
            const s = Math.floor((timeLeft / 1000) % 60);
            const timeString = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
            
            html = `
            <div class="raid-card">
                <div class="raid-info">
                    <span class="raid-title">${raid.rank}-Rank Gate</span>
                    <span class="raid-timer">${timeString}</span>
                </div>
                <span style="color:#888; font-size:0.8em;">EXPLORING...</span>
            </div>`;
        }
        container.innerHTML += html;
    });
}

// --- MANA & SHOP ---
window.convertMana = async () => {
    const amount = parseInt(document.getElementById('convert-amount').value);
    if (!amount || amount <= 0) return;
    if (playerData.manaCrystals < amount) return alert("Not enough Mana!");
    const usedMana = amount - (amount % 3);
    const goldGained = usedMana / 3;
    if (goldGained === 0) return alert("Need at least 3 Mana.");

    playerData.manaCrystals -= usedMana;
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
    const newQuest = { id: Date.now(), title, type, xp, gold, mana, completed: false };
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

// --- HELPERS (LOG FIX: Nu met details!) ---
function addRewards(xp, gold, mana, reason) {
    playerData.xp += xp;
    playerData.gold += gold;
    if (mana) playerData.manaCrystals += mana;

    const curRank = RANKS.find(r => r.name === playerData.rank);
    if (curRank && playerData.xp >= curRank.max) {
        const next = RANKS.find(r => r.min === curRank.max);
        if (next) {
            playerData.rank = next.name;
            showNotification(`RANK UP! ${next.name}`);
            addToLog(`Promoted to ${next.name}`);
        }
    }
    
    let notifText = `+${xp} XP | +${gold} Gold`;
    if (mana > 0) notifText += ` | +${mana} Mana`;
    showNotification(notifText);
    
    // LOGBOEK DETAIL FIX
    const details = `(+${xp} XP, +${gold} Gold${mana ? `, +${mana} Mana` : ''})`;
    addToLog(`${reason} ${details}`);
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
    document.getElementById('display-rank').innerText = playerData.rank;
    document.getElementById('display-xp').innerText = playerData.xp;
    document.getElementById('display-gold').innerText = playerData.gold;
    document.getElementById('display-mana').innerText = (playerData.manaCrystals || 0) + " 💎";
    
    const currentRank = RANKS.find(r => r.name === playerData.rank);
    if (currentRank) document.getElementById('display-next').innerText = currentRank.max;

    document.getElementById('shop-gold').innerText = playerData.gold;
    document.getElementById('shop-mana').innerText = (playerData.manaCrystals || 0);

    if (playerData.quests) {
        renderList('list-daily', 'DAILY');
        renderList('list-special', 'SPECIAL');
        renderList('list-onetime', 'ONE_TIME');
    }
    
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
window.switchTab = (tabName) => {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active-tab'));
    document.getElementById('tab-' + tabName).classList.add('active-tab');
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    document.getElementById('nav-' + tabName).classList.add('active');
    document.getElementById('nav-menu').classList.remove('active');
};
document.getElementById('hamburger-btn').addEventListener('click', () => document.getElementById('nav-menu').classList.toggle('active'));