// Importeer de functies
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --- CONFIG ---
        const firebaseConfig = {
        apiKey: "AIzaSyAoP9XAGIu5sBxLHx8vjWCWjWS41ZURX30",
        authDomain: "solo-leveling-app-57b38.firebaseapp.com",
        projectId: "solo-leveling-app-57b38",
        storageBucket: "solo-leveling-app-57b38.firebasestorage.app",
        messagingSenderId: "715704809890",
        appId: "1:715704809890:web:69e2ba6af16d0933e39afb"
        };

// Start Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- DOM ELEMENTEN ---
const loginScreen = document.getElementById('login-screen');
const appScreen = document.getElementById('app-screen');
const errorMsg = document.getElementById('error-msg');
const hamburgerBtn = document.getElementById('hamburger-btn');
const navMenu = document.getElementById('nav-menu');

// --- EVENT LISTENERS ---

// Hamburger Menu Toggle
hamburgerBtn.addEventListener('click', () => {
    hamburgerBtn.classList.toggle('active');
    navMenu.classList.toggle('active');
});

// Maak switchTab globaal beschikbaar voor HTML onclicks
window.switchTab = (tabName) => {
    // 1. Verberg alle tabs
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active-tab');
    });
    // 2. Toon de gekozen tab
    document.getElementById('tab-' + tabName).classList.add('active-tab');
    
    // 3. Update menu styling (welke is actief?)
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    
    // 4. Sluit menu op mobiel na klikken
    navMenu.classList.remove('active');
};

// --- FIREBASE LOGICA ---

onAuthStateChanged(auth, async (user) => {
    if (user) {
        loginScreen.classList.add('hidden');
        appScreen.classList.remove('hidden');
        loadPlayerData(user.uid);
    } else {
        loginScreen.classList.remove('hidden');
        appScreen.classList.add('hidden');
    }
});

async function loadPlayerData(userId) {
    const docRef = doc(db, "players", userId);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
        const data = docSnap.data();
        updateUI(data);
    } else {
        // Nieuw account defaults
        const defaultData = {
            rank: "E-Rank",
            xp: 0,
            gold: 0,
            manaCrystals: 0,
            logbook: [] // Nieuw: Logboek array
        };
        await setDoc(docRef, defaultData);
        updateUI(defaultData);
    }
}

function updateUI(data) {
    // Status Scherm
    document.getElementById('display-rank').innerText = data.rank;
    document.getElementById('display-xp').innerText = data.xp;
    document.getElementById('display-gold').innerText = data.gold;
    document.getElementById('display-mana').innerText = (data.manaCrystals || 0) + " 💎";
    
    // Shop Scherm (kleine weergave)
    document.getElementById('shop-gold').innerText = data.gold;
    document.getElementById('shop-mana').innerText = (data.manaCrystals || 0);

    // Logboek vullen
    const logList = document.getElementById('logbook-list');
    logList.innerHTML = ""; // Eerst leegmaken
    
    if (data.logbook && data.logbook.length > 0) {
        // Laatste eerst tonen (reverse)
        data.logbook.slice().reverse().forEach(entry => {
            const div = document.createElement('div');
            div.className = 'log-entry';
            div.innerHTML = `<span class="time">${entry.time}</span> <span class="text">${entry.msg}</span>`;
            logList.appendChild(div);
        });
    } else {
        logList.innerHTML = "<div class='log-entry'>Geen activiteiten.</div>";
    }
}

// Login & Signup knoppen
document.getElementById('btn-login').addEventListener('click', () => {
    const email = document.getElementById('email').value;
    const pass = document.getElementById('password').value;
    signInWithEmailAndPassword(auth, email, pass).catch((error) => errorMsg.innerText = error.message);
});

document.getElementById('btn-signup').addEventListener('click', () => {
    const email = document.getElementById('email').value;
    const pass = document.getElementById('password').value;
    createUserWithEmailAndPassword(auth, email, pass).catch((error) => errorMsg.innerText = error.message);
});

window.logout = () => signOut(auth);