import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --- CONFIGURATIE (Plak hier je Key) ---
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

// --- SPEL DATA (Gates & Ranks) ---
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

const GATE_DATA = {
    'E': { minTime: 2, maxTime: 10, xp: 50, gold: 10, maxMana: 5, chance: 0.9, reqRankIdx: 0 },
    'D': { minTime: 2, maxTime: 10, xp: 100, gold: 15, maxMana: 8, chance: 0.8, reqRankIdx: 1 },
    'C': { minTime: 5, maxTime: 12, xp: 150, gold: 20, maxMana: 14, chance: 0.8, reqRankIdx: 2 },
    'B': { minTime: 12, maxTime: 15, xp: 200, gold: 25, maxMana: 17, chance: 0.75, reqRankIdx: 3 },
    'A': { minTime: 15, maxTime: 20, xp: 250, gold: 30, maxMana: 20, chance: 0.75, reqRankIdx: 4 },
    'S': { minTime: 30, maxTime: 30, xp: 300, gold: 40, maxMana: 50, chance: 0.75, reqRankIdx: 5 },
    'SS': { minTime: 60, maxTime: 60, xp: 400, gold: 50, maxMana: 100, chance: 0.70, reqRankIdx: 6 },
    'SSS': { minTime: 120, maxTime: 120, xp: 1000, gold: 100, maxMana: 250, chance: 0.60, reqRankIdx: 7 },
    'RED': { time: 10, chance: 0.25 },
    'BLUE': { time: 0.1 }
};

// --- AUTHENTICATIE LOGICA ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        // Ingelogd
        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('app-screen').classList.remove('hidden');
        // We geven nu het hele user object mee (zodat we het emailadres hebben)
        loadPlayerData(user);
    } else {
        // Uitgelogd
        document.getElementById('login-screen').classList.remove('hidden');
        document.getElementById('app-screen').classList.add('hidden');
    }
});

// --- ACCOUNT MAKEN & INLOGGEN ---
// Deze staan nu expliciet hier om zeker te zijn dat ze laden
document.getElementById('btn-login').addEventListener('click', () => {
    const email = document.getElementById('email').value;
    const pass = document.getElementById('password').value;
    if(!email || !pass) return alert("Please fill in email and password.");
    signInWithEmailAndPassword(auth, email, pass).catch(e => alert("Login Failed: " + e.message));
});

document.getElementById('btn-signup').addEventListener('click', () => {
    const email = document.getElementById('email').value;
    const pass = document.getElementById('password').value;
    if(!email || !pass) return alert("Please fill in email and password.");
    
    // Maak account in Firebase Auth
    createUserWithEmailAndPassword(auth, email, pass)
        .then((userCredential) => {
            alert("Account Created! System Initializing...");
            // onAuthStateChanged pikt dit vanzelf op
        })
        .catch((error) => {
            alert("Signup Failed: " + error.message);
        });
});

// --- DATA LADEN ---
async function loadPlayerData(user) {
    const userId = user.uid;
    const userEmail = user.email; // Hier pakken we het emailadres
    
    const docRef = doc(db, "players", userId);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
        playerData = docSnap.data();
        
        // --- CHECK: Sla email op als die nog niet bestaat ---
        if (!playerData.email) {
            playerData.email = userEmail;
            await saveToDB(); // Update database met email
        }

        // --- SANITIZER (NaN Fixes) ---
        if (isNaN(playerData.xp)) playerData.xp = 0; 
        if (isNaN(playerData.gold)) playerData.gold = 0;
        if (isNaN(playerData.manaCrystals)) playerData.manaCrystals = 0;

        // Array checks
        if (!playerData.activeGates) playerData.activeGates = [];
        if (!playerData.quests) playerData.quests = [];
        
        // Brush Teeth check
        if (!playerData.quests.some(q => q.title === "Brush Teeth")) {
            playerData.quests.push({ id: Date.now(), title: "Brush Teeth", type: "DAILY", xp: 20, gold: 1, mana: 0, completed: false });
            await saveToDB();
        }

    } else {
        // --- NIEUWE SPELER AANMAKEN ---
        playerData = {
            email: userEmail, // HIER SLAAN WE HET EMAILADRES OP!
            rank: "E-Rank",
            xp: 0,
            gold: 0,
            manaCrystals: 0,
            lastLoginDate: new Date().toDateString(),
            lastBlueGateDate: "",
            quests: [
                { id: Date.now(), title: "Brush Teeth", type: "DAILY", xp: 20, gold: 1, mana: 0, completed: false }
            ],
            logbook: [],
            activeGates: []
        };
        await setDoc(docRef, playerData);
    }

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

// --- GATE SYSTEM ---
window.startGate = async (rank) => {
    const userRankIndex = RANKS.findIndex(r => r.name === playerData.rank);
    
    // Rank Check
    if (rank !== 'RED' && rank !== 'BLUE') {
        const gateInfo = GATE_DATA[rank];
        if (userRankIndex < gateInfo.reqRankIdx) {
            return alert(`Rank too low! Require: ${RANKS[gateInfo.reqRankIdx].name}.`);
        }
    }

    // Blue Gate Check
    if (rank === 'BLUE') {
        const today = new Date().toDateString();
        if (playerData.lastBlueGateDate === today) {
            return alert("Daily Limit Reached (1/day). Reset at 00:00.");
        }
    }

    // Tijd
    let durationMinutes = 5; 
    if (GATE_DATA[rank]) {
        const min = GATE_DATA[rank].minTime || GATE_DATA[rank].time;
        const max = GATE_DATA[rank].maxTime || GATE_DATA[rank].time;
        durationMinutes = Math.floor(Math.random() * (max - min + 1)) + min;
    }

    const endTime = Date.now() + (durationMinutes * 60 * 1000);
    
    playerData.activeGates.push({
        id: Date.now(),
        rank: rank,
        endTime: endTime
    });

    if (rank === 'BLUE') playerData.lastBlueGateDate = new Date().toDateString();

    addToLog(`Gate: Started ${rank}-Rank Gate (${durationMinutes} min).`);
    await saveToDB();
    updateUI();
    renderActiveRaids(); 
};

window.claimGateReward = async (raidId) => {
    const raidIndex = playerData.activeGates.findIndex(g => g.id === raidId);
    if (raidIndex === -1) return;
    
    const raid = playerData.activeGates[raidIndex];
    const rank = raid.rank;
    const gateInfo = GATE_DATA[rank];
    
    let xpGain = 0, goldGain = 0, manaGain = 0, success = false;

    // Loot Logic
    if (rank === 'BLUE') {
        success = true;
        const roll = Math.random() * 100;
        if (roll > 99) { xpGain = 1000; goldGain = 100; }
        else if (roll > 90) { xpGain = 250; goldGain = 40; }
        else if (roll > 60) { xpGain = 100; goldGain = 30; }
        else if (roll > 40) { xpGain = 50; goldGain = 20; }
        else if (roll > 20) { xpGain = 20; goldGain = 10; }
        else { xpGain = 10; goldGain = 5; }
    } else if (rank === 'RED') {
        if (Math.random() <= gateInfo.chance) {
            success = true;
            xpGain = 200;
            manaGain = Math.floor(Math.random() * (150 - 20 + 1)) + 20;
        }
    } else {
        if (Math.random() <= gateInfo.chance) {
            success = true;
            xpGain = gateInfo.xp;
            goldGain = gateInfo.gold;
            manaGain = Math.floor(Math.random() * (gateInfo.maxMana || 5)) + 1;
        }
    }

    if (success) {
        addRewards(xpGain, goldGain, manaGain, `Gate Cleared: ${rank}-Rank`);
    } else {
        addToLog(`Gate Failed: ${rank}-Rank (No Loot).`);
        showNotification("Raid Failed...");
    }

    playerData.activeGates.splice(raidIndex, 1);
    await saveToDB();
    updateUI();
    renderActiveRaids();
};

function startTimerLoop() {
    if (gateTimerInterval) clearInterval(gateTimerInterval);
    gateTimerInterval = setInterval(() => {
        if (!playerData.activeGates || playerData.activeGates.length === 0) return;
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
            html = `
            <div class="raid-card" style="border-color: #f1c40f;">
                <div class="raid-info"><span class="raid-title">${raid.rank}-Rank Gate</span><span class="raid-timer" style="color:#f1c40f">DONE</span></div>
                <button class="claim-btn" onclick="claimGateReward(${raid.id})">CLAIM</button>
            </div>`;
        } else {
            const m = Math.floor((timeLeft / 1000 / 60) % 60);
            const s = Math.floor((timeLeft / 1000) % 60);
            html = `
            <div class="raid-card">
                <div class="raid-info"><span class="raid-title">${raid.rank}-Rank Gate</span><span class="raid-timer">${m}:${s.toString().padStart(2,'0')}</span></div>
                <span style="color:#888; font-size:0.8em;">EXPLORING...</span>
            </div>`;
        }
        container.innerHTML += html;
    });
}

// --- MANA & QUESTS ---
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

// --- HELPERS ---
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
    
    const details = `(+${xp}XP, +${gold}G${mana ? `, +${mana}Mana` : ''})`;
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

function updateUI() {
    const xp = isNaN(playerData.xp) ? 0 : playerData.xp;
    const gold = isNaN(playerData.gold) ? 0 : playerData.gold;

    document.getElementById('display-rank').innerText = playerData.rank;
    document.getElementById('display-xp').innerText = xp;
    document.getElementById('display-gold').innerText = gold;
    document.getElementById('display-mana').innerText = (playerData.manaCrystals || 0) + " 💎";
    
    const currentRank = RANKS.find(r => r.name === playerData.rank);
    if (currentRank) document.getElementById('display-next').innerText = currentRank.max;

    document.getElementById('shop-gold').innerText = gold;
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

// --- EVENT LISTENERS ---
window.openQuestModal = (t) => { document.getElementById('new-quest-type').value = t; document.getElementById('modal-quest').classList.remove('hidden'); };
window.openConvertModal = () => { document.getElementById('convert-available').innerText = playerData.manaCrystals || 0; document.getElementById('modal-convert').classList.remove('hidden'); };
window.closeModal = (id) => document.getElementById(id).classList.add('hidden');
window.logout = () => signOut(auth);
window.switchTab = (tabName) => {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active-tab'));
    document.getElementById('tab-' + tabName).classList.add('active-tab');
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    document.getElementById('nav-' + tabName).classList.add('active');
    document.getElementById('nav-menu').classList.remove('active');
};
document.getElementById('hamburger-btn').addEventListener('click', () => document.getElementById('nav-menu').classList.toggle('active'));