// Importeer de functies (precies zoals eerst)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --------------------------------------------------------------
// JOUW CONFIGURATIE (Plak hier je keys weer in!)
// --------------------------------------------------------------
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

// --- VARIABELEN ---
const loginScreen = document.getElementById('login-screen');
const appScreen = document.getElementById('app-screen');
const errorMsg = document.getElementById('error-msg');

// --- FUNCTIES ---

// 1. Check of gebruiker is ingelogd
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

// 2. Data ophalen
async function loadPlayerData(userId) {
    const docRef = doc(db, "players", userId);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
        const data = docSnap.data();
        updateUI(data);
    } else {
        const defaultData = {
            rank: "E-Rank",
            xp: 0,
            gold: 0,
            manaCrystals: 0,
            dailyQuestsDone: []
        };
        await setDoc(docRef, defaultData);
        updateUI(defaultData);
    }
}

// 3. Scherm updaten
function updateUI(data) {
    document.getElementById('display-rank').innerText = data.rank;
    document.getElementById('display-xp').innerText = data.xp;
    document.getElementById('display-gold').innerText = data.gold;
    document.getElementById('display-next').innerText = "3000"; 
}

// 4. Knoppen Logica
document.getElementById('btn-login').addEventListener('click', () => {
    const email = document.getElementById('email').value;
    const pass = document.getElementById('password').value;
    signInWithEmailAndPassword(auth, email, pass).catch((error) => {
        errorMsg.innerText = error.message;
    });
});

document.getElementById('btn-signup').addEventListener('click', () => {
    const email = document.getElementById('email').value;
    const pass = document.getElementById('password').value;
    createUserWithEmailAndPassword(auth, email, pass).catch((error) => {
        errorMsg.innerText = error.message;
    });
});

window.logout = () => signOut(auth);