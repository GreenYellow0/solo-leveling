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

// --- VARIABLES ---
let playerData = null;
let gateTimerInterval = null;

// --- DATA ---
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

// --- AUTH ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('app-screen').classList.remove('hidden');
        loadPlayerData(user);
    } else {
        document.getElementById('login-screen').classList.remove('hidden');
        document.getElementById('app-screen').classList.add('hidden');
    }
});

// --- LOAD & REPAIR DATA ---
async function loadPlayerData(user) {
    const docRef = doc(db, "players", user.uid);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
        playerData = docSnap.data();

        // 1. REPARATIE: Zorg dat alle IDs Strings zijn
        if (playerData.quests) {
            playerData.quests.forEach(q => {
                if (typeof q.id === 'number') q.id = "fix_" + q.id;
            });
        }
        if (playerData.activeGates) {
            playerData.activeGates.forEach(g => {
                if (typeof g.id === 'number') g.id = "fix_" + g.id;
            });
        }

        // 2. Data checks
        if (!playerData.email) playerData.email = user.email;
        if (isNaN(playerData.xp)) playerData.xp = 0;
        if (isNaN(playerData.gold)) playerData.gold = 0;
        if (!playerData.logbook) playerData.logbook = [];
        if (!playerData.quests) playerData.quests = [];
        if (!playerData.activeGates) playerData.activeGates = [];
        if (!playerData.lastSpecialDate) playerData.lastSpecialDate = new Date().toDateString();

        // 3. Opslaan
        await saveToDB();

    } else {
        // Nieuw account
        playerData = {
            email: user.email,
            rank: "E-Rank",
            xp: 0,
            gold: 0,
            manaCrystals: 0,
            lastLoginDate: new Date().toDateString(),
            lastSpecialDate: new Date().toDateString(),
            quests: [],
            activeGates: [],
            logbook: []
        };
        await setDoc(docRef, playerData);
    }

    checkResetLogic();
    updateUI();
    startTimerLoop();
}

async function checkResetLogic() {
    const today = new Date();
    const todayStr = today.toDateString();
    let updated = false;

    // Daily Reset
    if (playerData.lastLoginDate !== todayStr) {
        let count = 0;
        playerData.quests.forEach(q => {
            if (q.type === 'DAILY') { q.completed = false; count++; }
        });
        if (count > 0) addToLog(`Reset: ${count} Daily Quests.`);
        playerData.lastLoginDate = todayStr;
        updated = true;
    }

    // Special Reset (3 dagen)
    const lastSpec = new Date(playerData.lastSpecialDate);
    const diffTime = Math.abs(today - lastSpec);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
    if (diffDays >= 3) {
        let count = 0;
        playerData.quests.forEach(q => {
            if (q.type === 'SPECIAL') { q.completed = false; count++; }
        });
        if (count > 0) addToLog(`Reset: ${count} Special Quests.`);
        playerData.lastSpecialDate = todayStr;
        updated = true;
    }

    if (updated) await saveToDB();
}

// --- QUESTS ---
window.toggleQuest = async (id) => {
    try {
        console.log("Attempting toggleQuest ID:", id);
        const q = playerData.quests.find(x => String(x.id) === String(id));
        if (!q) {
            console.error("Quest not found for ID:", id);
            return;
        }
        if (q.completed) return;

        q.completed = true;
        addRewards(q.xp, q.gold, q.mana, `Quest: ${q.title}`);
        
        await saveToDB();
        updateUI();
    } catch (e) {
        console.error("Error in toggleQuest:", e);
        alert("System Error: Could not complete quest.");
    }
};

window.deleteQuest = async (id) => {
    if(!confirm("Delete this quest?")) return;
    playerData.quests = playerData.quests.filter(x => String(x.id) !== String(id));
    await saveToDB();
    updateUI();
};

window.saveNewQuest = async () => {
    const title = document.getElementById('new-quest-title').value;
    const desc = document.getElementById('new-quest-desc').value;
    const xp = parseInt(document.getElementById('new-quest-xp').value) || 0;
    const gold = parseInt(document.getElementById('new-quest-gold').value) || 0;
    const mana = parseInt(document.getElementById('new-quest-mana').value) || 0;
    const type = document.getElementById('new-quest-type').value;

    if (!title) return alert("Title required");
    
    // --- HIER IS DE FIX: GEEN NEGATIEVE CIJFERS ---
    if (xp < 0 || gold < 0 || mana < 0) {
        return alert("Rewards cannot be negative!");
    }
    
    // Altijd ID als string opslaan
    const newQuest = { 
        id: "quest_" + Date.now(), 
        title, desc, type, xp, gold, mana, completed: false 
    };
    
    playerData.quests.push(newQuest);
    await saveToDB();
    closeModal('modal-quest');
    updateUI();
};

// --- GATES ---
window.startGate = async (rank) => {
    // Check Slots
    const activeRanked = playerData.activeGates.find(g => !['RED', 'BLUE'].includes(g.rank));
    const activeRed = playerData.activeGates.find(g => g.rank === 'RED');
    const activeBlue = playerData.activeGates.find(g => g.rank === 'BLUE');

    if (rank === 'RED' && activeRed) return alert("Red Gate active!");
    if (rank === 'BLUE' && activeBlue) return alert("Blue Gate active!");
    if (rank !== 'RED' && rank !== 'BLUE' && activeRanked) return alert("Ranked Gate active!");

    // Rank Check
    const userRankIdx = RANKS.findIndex(r => r.name === playerData.rank);
    if (rank !== 'RED' && rank !== 'BLUE') {
        const info = GATE_DATA[rank];
        if (userRankIdx < info.reqRankIdx) return alert("Rank too low!");
    }

    // Daily Blue Check
    if (rank === 'BLUE') {
        if (playerData.lastBlueGateDate === new Date().toDateString()) return alert("Limit: 1 Blue Gate/Day.");
    }

    // Tijd
    let minutes = 5;
    if (GATE_DATA[rank]) {
        const d = GATE_DATA[rank];
        const min = d.minTime || d.time;
        const max = d.maxTime || d.time;
        minutes = Math.floor(Math.random() * (max - min + 1)) + min;
    }

    const endTime = Date.now() + (minutes * 60 * 1000);
    // Voeg toe (ID als string)
    playerData.activeGates.push({ id: "raid_" + Date.now(), rank: rank, endTime: endTime });

    if (rank === 'BLUE') playerData.lastBlueGateDate = new Date().toDateString();

    addToLog(`Started ${rank}-Rank Gate (${minutes}m).`);
    await saveToDB();
    updateUI();
    renderActiveRaids();
};

window.claimGateReward = async (raidId) => {
    try {
        const idx = playerData.activeGates.findIndex(g => String(g.id) === String(raidId));
        if (idx === -1) {
            console.error("Raid not found:", raidId);
            return;
        }

        const raid = playerData.activeGates[idx];
        const rank = raid.rank;
        const info = GATE_DATA[rank];
        
        let xp=0, gold=0, mana=0, success=false;

        // Loot Logic
        if (rank === 'BLUE') {
            success = true;
            const r = Math.random() * 100;
            if (r>99) { xp=1000; gold=100; }
            else if (r>90) { xp=250; gold=40; }
            else if (r>60) { xp=100; gold=30; }
            else if (r>40) { xp=50; gold=20; }
            else if (r>20) { xp=20; gold=10; }
            else { xp=10; gold=5; }
        } else if (rank === 'RED') {
            if (Math.random() <= info.chance) {
                success = true; xp=200; 
                mana = Math.floor(Math.random()*(150-20+1))+20;
            }
        } else {
            if (Math.random() <= info.chance) {
                success = true; xp=info.xp; gold=info.gold;
                mana = Math.floor(Math.random()*(info.maxMana||5))+1;
            }
        }

        if (success) addRewards(xp, gold, mana, `Gate Cleared: ${rank}`);
        else {
            addToLog(`Gate Failed: ${rank}`);
            showNotification("Raid Failed...");
        }

        playerData.activeGates.splice(idx, 1);
        await saveToDB();
        updateUI();
        renderActiveRaids();

    } catch (e) {
        console.error("Claim Error:", e);
        alert("Claim failed.");
    }
};

// --- HELPERS ---
function addRewards(xp, gold, mana, reason) {
    playerData.xp += xp;
    playerData.gold += gold;
    if (mana) playerData.manaCrystals += mana;

    const cur = RANKS.find(r => r.name === playerData.rank);
    if (cur && playerData.xp >= cur.max) {
        const next = RANKS.find(r => r.min === cur.max);
        if (next) {
            playerData.rank = next.name;
            showNotification(`RANK UP! ${next.name}`);
            addToLog(`Promoted to ${next.name}`);
        }
    }

    let msg = `+${xp} XP | +${gold} Gold`;
    if (mana) msg += ` | +${mana} Mana`;
    showNotification(msg);
    addToLog(`${reason} (${msg})`);
}

function addToLog(msg) {
    const time = new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
    if (!playerData.logbook) playerData.logbook = [];
    playerData.logbook.push({time, msg});
    if (playerData.logbook.length > 50) playerData.logbook.shift();
}

async function saveToDB() {
    if (!auth.currentUser) return;
    await updateDoc(doc(db, "players", auth.currentUser.uid), playerData);
}

function updateUI() {
    if (!playerData) return;
    
    document.getElementById('display-rank').innerText = playerData.rank;
    document.getElementById('display-xp').innerText = playerData.xp || 0;
    document.getElementById('display-gold').innerText = playerData.gold || 0;
    document.getElementById('display-mana').innerText = (playerData.manaCrystals || 0) + " 💎";
    
    const currentRank = RANKS.find(r => r.name === playerData.rank);
    if (currentRank) document.getElementById('display-next').innerText = currentRank.max;

    document.getElementById('shop-gold').innerText = playerData.gold || 0;
    document.getElementById('shop-mana').innerText = (playerData.manaCrystals || 0);

    renderList('list-daily', 'DAILY');
    renderList('list-special', 'SPECIAL');
    renderList('list-onetime', 'ONE_TIME');

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
    
    if (items.length === 0) {
        list.innerHTML = `<p class="empty-msg">No quests.</p>`;
        return;
    }
    
    items.forEach(q => {
        const cls = q.completed ? 'completed' : '';
        let rewards = `XP: ${q.xp} | Gold: ${q.gold}`;
        if (q.mana > 0) rewards += ` | Mana: ${q.mana}`;
        const descHtml = q.desc ? `<p class="quest-desc">${q.desc}</p>` : '';

        // STRING ID FIX: '${q.id}'
        list.innerHTML += `
            <div class="quest-item ${cls}">
                <div class="quest-info">
                    <h4>${q.title}</h4>
                    ${descHtml}
                    <div class="quest-rewards">${rewards}</div>
                </div>
                <div class="quest-actions">
                    <button class="delete-btn" onclick="deleteQuest('${q.id}')">🗑️</button>
                    <button class="checkbox-btn" onclick="toggleQuest('${q.id}')"></button>
                </div>
            </div>`;
    });
}

function startTimerLoop() {
    if (gateTimerInterval) clearInterval(gateTimerInterval);
    gateTimerInterval = setInterval(() => {
        if (!playerData.activeGates) return;
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
        // ID doorgeven met quotes '${raid.id}'
        if (timeLeft <= 0) {
            html = `
            <div class="raid-card" style="border-color: #f1c40f;">
                <div class="raid-info"><span class="raid-title">${raid.rank}-Rank Gate</span><span class="raid-timer" style="color:#f1c40f">DONE</span></div>
                <button class="claim-btn" onclick="claimGateReward('${raid.id}')">CLAIM</button>
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

function showNotification(text) {
    const n = document.getElementById('notification-bar');
    if(n) {
        document.getElementById('notif-text').innerText = text;
        n.classList.remove('hidden');
        setTimeout(() => n.classList.add('hidden'), 5000);
    }
}

// EVENTS
document.getElementById('btn-login').addEventListener('click', () => {
    const email = document.getElementById('email').value;
    const pass = document.getElementById('password').value;
    signInWithEmailAndPassword(auth, email, pass).catch(e => alert(e.message));
});

document.getElementById('btn-signup').addEventListener('click', async () => {
    const email = document.getElementById('email').value;
    const pass = document.getElementById('password').value;
    try {
        await createUserWithEmailAndPassword(auth, email, pass);
    } catch (e) { alert(e.message); }
});

window.convertMana = async () => {
    const amount = parseInt(document.getElementById('convert-amount').value);
    if (!amount || amount <= 0) return;
    if (playerData.manaCrystals < amount) return alert("Not enough Mana!");
    
    // HIER OOK DE MIN-CHECK
    if (amount < 0) return alert("Positive numbers only!");

    const used = amount - (amount % 3);
    const gold = used / 3;
    if (gold === 0) return alert("Need 3 Mana");
    playerData.manaCrystals -= used;
    playerData.gold += gold;
    addToLog(`Shop: ${used} Mana -> ${gold} Gold`);
    showNotification(`+${gold} Gold`);
    await saveToDB();
    closeModal('modal-convert');
    updateUI();
};

window.openQuestModal = (t) => { 
    document.getElementById('new-quest-title').value = "";
    document.getElementById('new-quest-desc').value = "";
    document.getElementById('new-quest-type').value = t; 
    document.getElementById('modal-quest').classList.remove('hidden'); 
};
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