/* ====== CID Panel – Firebase (Auth + Firestore) ======
   Admin: logowanie przez Auth (email/hasło).
   Agent: logowanie przez UID + hasło (sprawdzane w Firestore, przechowywany hash SHA-256).
   Firestore: kolekcja "agents", dokument ID = UID.
======================================================= */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, query
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

/* === WPROWADŹ SWÓJ KONFIG === */
const firebaseConfig = {
  apiKey: "AIzaSyB_bbKb121VQeKeeiEKTfXz8QSkQraTvlg",
  authDomain: "cid-panel-2c164.firebaseapp.com",
  projectId: "cid-panel-2c164",
  storageBucket: "cid-panel-2c164.firebasestorage.app",
  messagingSenderId: "120022986109",
  appId: "1:120022986109:web:fc3844d3b51eebda867014",
  measurementId: "G-YLGF5G1D8N"
};
initializeApp(firebaseConfig);
const auth = getAuth();
const db = getFirestore();

/* ===== DOM ===== */
const $  = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const toast = (m, t=2200)=>{ const x=$("#toast"); x.textContent=m; x.classList.add("show"); setTimeout(()=>x.classList.remove("show"),t); };

const views = { auth: $("#view-auth"), app: $("#view-app") };
const pages = { home: $("#page-home"), agents: $("#page-agents"), trainings: $("#page-trainings"), gov: $("#page-gov"), bands: $("#page-bands"), depts: $("#page-depts") };

/* ===== UI ===== */
const tabs = $$(".tab");
tabs.forEach(b=>b.onclick=()=>{ tabs.forEach(t=>t.classList.remove("active")); b.classList.add("active"); $$(".tab-panel").forEach(p=>p.classList.remove("active")); (b.dataset.tab==="agent" ? $("#panel-agent") : $("#panel-admin")).classList.add("active"); });

$("#toggleAgentPass").onclick = ()=>{ const i=$("#agentPass"); i.type=i.type==="password"?"text":"password"; };
$("#toggleAdminPass").onclick = ()=>{ const i=$("#adminPass"); i.type=i.type==="password"?"text":"password"; };

/* ===== NAV ===== */
$$(".s-link").forEach(btn=>{
  btn.onclick=()=>{
    $$(".s-link").forEach(b=>b.classList.remove("active"));
    btn.classList.add("active");
    Object.values(pages).forEach(p=>p.classList.remove("active"));
    pages[btn.dataset.page].classList.add("active");
  };
});

/* ===== STAN SESJI ===== */
let isAdmin = false;
let currentAgentDoc = null; // dokument zalogowanego agenta (dla widoku agent)

function show(view){ Object.values(views).forEach(v=>v.classList.add("hidden")); views[view].classList.remove("hidden"); }

/* ===== HELPERS ===== */
const rankOrder = ["01","02","03","5","4","3","2","1"];
const rWeight = r => { const i = rankOrder.indexOf(String(r)); return i<0?999:i; };

async function sha256(str){
  const enc = new TextEncoder().encode(str);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,"0")).join("");
}

/* ===== LOGOWANIE ===== */
$("#btnAdminLogin").onclick = async ()=>{
  $("#adminErr").textContent="";
  const email=$("#adminEmail").value.trim(), pass=$("#adminPass").value.trim();
  if(!email||!pass) return $("#adminErr").textContent="Uzupełnij e-mail i hasło.";
  try{
    await signInWithEmailAndPassword(auth, email, pass);
    isAdmin = true;
    $("#uRole").textContent = "ADMIN";
    $("#uName").textContent = email;
    await renderAll(); show("app"); toast("Zalogowano jako admin");
    $("#adminOnly").classList.remove("hidden");
  }catch(e){ $("#adminErr").textContent = pretty(e); }
};

$("#btnAgentLogin").onclick = async ()=>{
  $("#agentErr").textContent="";
  const uid = $("#agentUID").value.trim();
  const pass = $("#agentPass").value;
  if(!uid||!pass) return $("#agentErr").textContent="Podaj UID i hasło.";
  try{
    const ref = doc(db,"agents", uid);
    const snap = await getDoc(ref);
    if(!snap.exists()) throw new Error("Nie znaleziono agenta.");
    const a = snap.data();
    const h = await sha256(pass);
    if(h !== a.passwordHash) throw new Error("Błędne dane logowania.");
    isAdmin = false; currentAgentDoc = {id: uid, data:a};
    $("#uRole").textContent = "AGENT";
    $("#uName").textContent = `${a.imie} ${a.nazwisko}`;
    $("#adminOnly").classList.add("hidden");
    await renderAllForAgent(a, uid);
    show("app"); toast("Witaj, agencie!");
  }catch(e){ $("#agentErr").textContent = pretty(e); }
};

$("#btnLogout").onclick = async ()=>{
  try{ await signOut(auth); }catch{}
  isAdmin=false; currentAgentDoc=null; location.reload();
};

/* ===== RENDER ===== */
async function renderAll(){
  await renderWelcomeAsAdmin();
  await renderAgents();
}
async function renderAllForAgent(a, uid){
  $("#welcomeTitle").textContent = `Witaj ${a.imie} ${a.nazwisko} w bazie CID!`;
  $("#welcomeSub1").textContent  = `Twój Wydział: ${a.wydzial || "—"}`;
  $("#welcomeStatus").innerHTML  = a.zarzad ? 'Członek Zarządu' : 'Agent';
  $("#welcomeSub2").textContent  = `Twój Stopień to: ${a.stopien}`;
  await renderAgents(); // agent widzi listę (tylko podgląd)
}
async function renderWelcomeAsAdmin(){
  $("#welcomeTitle").textContent = "Witaj w panelu administracyjnym CID!";
  $("#welcomeSub1").textContent  = "Masz pełne uprawnienia do zarządzania agentami.";
  $("#welcomeStatus").textContent= "Administrator";
  $("#welcomeSub2").textContent  = "Pamiętaj o bezpieczeństwie danych.";
}

$("#search").addEventListener("input", renderAgents);

async function renderAgents(){
  const list = $("#agentsList"); list.innerHTML="";
  try{
    const snaps = await getDocs(query(collection(db,"agents")));
    const term = ($("#search").value||"").toLowerCase();
    let agents = [];
    snaps.forEach(d=>{
      const a = d.data(); a._id = d.id;
      if([a.imie,a.nazwisko,a.uid].some(v=>String(v||"").toLowerCase().includes(term))) agents.push(a);
    });
    agents.sort((a,b)=> rWeight(a.ranga) - rWeight(b.ranga));
    agents.forEach(a=>{
      const row = document.createElement("div");
      row.className="agent-row";
      row.innerHTML = `
        <div>
          <div class="agent-name" data-id="${a.uid}">${a.imie} ${a.nazwisko}${a.zarzad?'<span class="badge">Zarząd</span>':''}</div>
          <div class="agent-uid">UID: ${a.uid}</div>
        </div>
        <div>${a.ranga}</div>
        <div>${a.stopien}</div>
      `;
      list.appendChild(row);
    });
    // klik w profil tylko dla admina
    if(isAdmin) $$(".agent-name").forEach(el => el.onclick = ()=> openDrawer(el.dataset.id));
  }catch(e){
    list.innerHTML = `<div class="hint">Błąd ładowania: ${pretty(e)}</div>`;
  }
}

/* ===== ADMIN: DODAWANIE AGENA ===== */
$("#btnAddAgent").onclick = async ()=>{
  const imie=$("#aImie").value.trim();
  const nazwisko=$("#aNazwisko").value.trim();
  const ranga=$("#aRanga").value.trim();
  const stopien=$("#aStopien").value.trim();
  const uid=$("#aUID").value.trim();
  const haslo=$("#aHaslo").value;
  const zarzad=$("#aZarzad").checked;

  if(!imie||!nazwisko||!ranga||!stopien||!uid||!haslo) return toast("Uzupełnij wszystkie pola.");
  const passwordHash = await sha256(haslo);

  try{
    await setDoc(doc(db,"agents", uid), {
      uid, imie, nazwisko, ranga, stopien, zarzad, szkolenia: [], passwordHash
    });
    $("#aImie").value=$("#aNazwisko").value=$("#aRanga").value=$("#aStopien").value=$("#aUID").value=$("#aHaslo").value="";
    $("#aZarzad").checked=false;
    await renderAgents(); toast("✅ Dodano agenta");
  }catch(e){ toast("❌ " + pretty(e)); }
};

/* ===== Drawer (profil) ===== */
const drawer = { el: $("#drawer"), backdrop: $("#backdrop"),
  name: $("#pName"), uid: $("#pUID"), imie: $("#pImie"), nazwisko: $("#pNazwisko"),
  ranga: $("#pRanga"), stopien: $("#pStopien"), zarzad: $("#pZarzad"),
  trainings: $("#pTrainings"), tName: $("#tName"), tStatus: $("#tStatus"),
  btnAddTraining: $("#btnAddTraining"), btnSaveRank: $("#btnSaveRank"),
  btnDelete: $("#btnDeleteAgent"), btnClose: $("#btnCloseDrawer")
};

let selectedUID = null;

async function openDrawer(uid){
  try{
    const snap = await getDoc(doc(db,"agents", uid));
    if(!snap.exists()) return;
    const a = snap.data(); selectedUID = uid;

    drawer.name.textContent = `${a.imie} ${a.nazwisko}${a.zarzad?' • Zarząd':''}`;
    drawer.uid.textContent = `UID: ${a.uid}`;
    drawer.imie.textContent = a.imie;
    drawer.nazwisko.textContent = a.nazwisko;
    drawer.ranga.value = String(a.ranga);
    drawer.stopien.textContent = a.stopien;
    drawer.zarzad.checked = !!a.zarzad;

    drawer.trainings.innerHTML="";
    (a.szkolenia||[]).forEach((s,idx)=>{
      const li=document.createElement("li");
      li.innerHTML = `<span>${s.nazwa} — <b class="${s.zdane?'ok':'no'}">${s.zdane?'Zdane':'Nie zdane'}</b></span>
                      <button class="btn outline danger" data-del="${idx}">Usuń</button>`;
      drawer.trainings.appendChild(li);
    });
    drawer.trainings.querySelectorAll("[data-del]").forEach(b=> b.onclick = ()=> deleteTraining(parseInt(b.dataset.del)));

    drawer.el.classList.add("open"); drawer.backdrop.classList.add("show");
  }catch(e){ toast("Błąd profilu: " + pretty(e)); }
}
function closeDrawer(){ drawer.el.classList.remove("open"); drawer.backdrop.classList.remove("show"); selectedUID=null; }
drawer.btnClose.onclick = closeDrawer; drawer.backdrop.onclick = closeDrawer;

drawer.btnSaveRank.onclick = async ()=>{
  if(!selectedUID) return;
  try{
    await updateDoc(doc(db,"agents", selectedUID), {
      ranga: drawer.ranga.value, zarzad: drawer.zarzad.checked
    });
    toast("💾 Zapisano zmiany");
    await renderAgents(); openDrawer(selectedUID);
  }catch(e){ toast("❌ " + pretty(e)); }
};
drawer.btnAddTraining.onclick = async ()=>{
  if(!selectedUID) return;
  const nazwa = drawer.tName.value.trim();
  const zdane = drawer.tStatus.value==="true";
  if(!nazwa) return toast("Podaj nazwę szkolenia.");
  try{
    const ref = doc(db,"agents", selectedUID);
    const snap = await getDoc(ref);
    const a = snap.data(); const arr = Array.isArray(a.szkolenia) ? a.szkolenia : [];
    arr.push({nazwa, zdane});
    await updateDoc(ref, { szkolenia: arr });
    drawer.tName.value=""; drawer.tStatus.value="true";
    openDrawer(selectedUID);
  }catch(e){ toast("❌ " + pretty(e)); }
};
async function deleteTraining(idx){
  if(!selectedUID) return;
  try{
    const ref = doc(db,"agents", selectedUID);
    const snap = await getDoc(ref); const a = snap.data(); const arr=[...(a.szkolenia||[])];
    arr.splice(idx,1); await updateDoc(ref,{szkolenia:arr}); openDrawer(selectedUID);
  }catch(e){ toast("❌ " + pretty(e)); }
}
drawer.btnDelete.onclick = async ()=>{
  if(!selectedUID) return;
  if(!confirm("Usunąć agenta z Firestore?")) return;
  try{
    await deleteDoc(doc(db,"agents", selectedUID));
    toast("🗑️ Usunięto (Firestore). Pamiętaj o usunięciu konta w Auth – tylko przez konsolę/Function.");
    closeDrawer(); renderAgents();
  }catch(e){ toast("❌ " + pretty(e)); }
};

/* ===== utils ===== */
function pretty(e){
  const m=String(e?.message||e?.code||e||""); 
  if(m.includes("permission")) return "Brak uprawnień (reguły Firestore).";
  if(m.includes("auth/invalid-credential")||m.includes("wrong-password")) return "Błędne dane logowania.";
  if(m.includes("auth/invalid-email")) return "Błędny e-mail.";
  return m;
}

/* start */
show("auth");
