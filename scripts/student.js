import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import { getAuth, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
import { createQuickSidebar } from "../ui/sidebar.js";
import { showToast, showConfirm } from "../ui/notifications.js";

const firebaseConfig = {
  apiKey: "AIzaSyA0i7hkXi5C-x3UwAEsh6FzRFqrFE5jpd8",
  authDomain: "fcefyn-planner.firebaseapp.com",
  projectId: "fcefyn-planner",
  storageBucket: "fcefyn-planner.firebasestorage.app",
  messagingSenderId: "713668406730",
  appId: "1:713668406730:web:f41c459641bfdce0cd7333"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;
let sidebarCtrl = null;

const notify = (message, type="info") => showToast({ message, type });
const notifySuccess = (message) => showToast({ message, type:"success" });
const notifyError = (message) => showToast({ message, type:"error" });
const notifyWarn = (message) => showToast({ message, type:"warning" });

// ---- ESTUDIO
let selectedDate = null;
let estudiosCache = {};
let editingIndex = -1;

// ---- MATERIAS
let subjects = [];
let editingSubjectIndex = -1;

// ---- AGENDA
let agendaData = {};
const dayKeys = ['lunes','martes','miercoles','jueves','viernes','sabado','domingo'];
const dayLabels = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
let agendaEditDay = null;
let agendaEditIndex = -1;
const minutesStart = 8*60;
const minutesEnd   = 23*60;
const pxPerMinute  = 40/60;

// ---- PLANIFICADOR
let courseSections = [];
let presets = [];
let activePresetId = null;
let activePresetName = "";
let activeSelectedSectionIds = [];

// ---- ACADEMICO
let academicoCache = {};
let acadViewYear = null;
let acadViewMonth = null;
let acadEditing = { dateKey:null, index:-1 };
let acadSelectedDateKey = null;

// ---- STUDY VIEW
let studyViewYear = null;
let studyViewMonth = null;

const navItems = [
  { id:"estudio", label:"Estudio", icon:"📒" },
  { id:"academico", label:"Académico", icon:"🎓" },
  { id:"agenda", label:"Agenda", icon:"📅" },
  { id:"materias", label:"Materias", icon:"📚" },
  { id:"planificador", label:"Planificador", icon:"🧭" },
];

// ------------------------ TABS ------------------------
function initSidebar(){
  const mount = document.getElementById("quickSidebarMount");
  const toggleBtn = document.getElementById("sidebarToggle");
  const layout = document.getElementById("pageLayout");
  let isPinned = false;
  if (!mount) return;

  const isMobile = () => window.matchMedia && window.matchMedia("(max-width: 1024px)").matches;

  function collapseSidebar(){
    if (!sidebarCtrl || isMobile()) return;
    sidebarCtrl.setCollapsed(true);
    layout?.classList.add("sidebar-collapsed");
  }
  function expandSidebar(){
    if (!sidebarCtrl) return;
    sidebarCtrl.setCollapsed(false);
    layout?.classList.remove("sidebar-collapsed");
  }

  sidebarCtrl = createQuickSidebar({
    mount,
    items: navItems,
    subtitle:"Navegación principal",
    footer:"Elegí sección",
    collapsed:true,
    onSelect: (id)=>{
      window.showTab(id);
      if (!isPinned && !isMobile()) collapseSidebar();
    }
  });

  if (layout && sidebarCtrl){
    sidebarCtrl.setCollapsed(true);
    layout.classList.add("sidebar-collapsed");
  }

  mount.addEventListener("mouseenter", ()=>{ if (!isMobile()) expandSidebar(); });
  mount.addEventListener("mouseleave", ()=>{ if (!isMobile() && !isPinned) collapseSidebar(); });

  if (toggleBtn && sidebarCtrl){
    toggleBtn.addEventListener("click", ()=>{
      if (isMobile()){
        sidebarCtrl.toggle();
        return;
      }
      isPinned = !isPinned;
      toggleBtn.classList.toggle("active", isPinned);
      if (isPinned) expandSidebar();
      else collapseSidebar();
    });
  }
  collapseSidebar();
}

window.showTab = function(name){
  const tabEstudio       = document.getElementById("tab-estudio");
  const tabAcademico     = document.getElementById("tab-academico");
  const tabAgenda        = document.getElementById("tab-agenda");
  const tabMaterias      = document.getElementById("tab-materias");
  const tabPlanificador  = document.getElementById("tab-planificador");

  tabEstudio.style.display      = (name === "estudio")      ? "block" : "none";
  tabAcademico.style.display    = (name === "academico")    ? "block" : "none";
  tabAgenda.style.display       = (name === "agenda")       ? "block" : "none";
  tabMaterias.style.display     = (name === "materias")     ? "block" : "none";
  tabPlanificador.style.display = (name === "planificador") ? "block" : "none";

  if (name === "agenda") renderAgenda();
  if (name === "planificador") renderPlannerAll();
  if (name === "estudio") renderStudyCalendar();
  if (name === "academico") renderAcadCalendar();

  if (sidebarCtrl) sidebarCtrl.setActive(name);
  const label = document.getElementById("currentSectionLabel");
  const nav = navItems.find(n => n.id === name);
  if (label && nav){
    label.textContent = (nav.icon || "") + " " + (nav.label || "");
  }
};
initSidebar();

// ------------------------ SESIÓN ------------------------
onAuthStateChanged(auth, async user => {
  if (!user) { window.location.href = "app.html"; return; }
  currentUser = user;

  const emailLabel = document.getElementById("userEmailLabel");
  if (emailLabel) emailLabel.textContent = user.email || "-";

  await loadPlannerData();
  await loadCourseSections();

  initStudyNav();
  initAcademicoNav();

  renderSubjectsList();
  renderSubjectsOptions();
  renderAgenda();

  initPlanificadorUI();
  initPresetToAgendaModalUI();
  initAcademicoModalUI();

  const now = new Date();
  studyViewYear = now.getFullYear();
  studyViewMonth = now.getMonth();
  acadViewYear = now.getFullYear();
  acadViewMonth = now.getMonth();

  // auto-select today in Académico
  acadSelectedDateKey = dateKeyFromYMD(now.getFullYear(), now.getMonth()+1, now.getDate());

  renderStudyCalendar();
  renderAcadCalendar();
  showTab("estudio");
});

window.logout = async function(){
  try{
    await signOut(auth);
    window.location.href = "app.html";
  }catch(e){
    notifyError("Error al cerrar sesión: " + e.message);
  }
};

// ------------------------ CARGA INICIAL ------------------------
async function loadPlannerData(){
  estudiosCache = {};
  subjects = [];
  agendaData = {};
  presets = [];
  activePresetId = null;
  activePresetName = "";
  activeSelectedSectionIds = [];
  academicoCache = {};

  if (!currentUser) return;

  const ref = doc(db, "planner", currentUser.uid);
  const snap = await getDoc(ref);

  if (snap.exists()){
    const data = snap.data();
    if (data.estudios && typeof data.estudios === "object") estudiosCache = data.estudios;
    if (Array.isArray(data.subjects)) subjects = data.subjects;
    if (data.agenda && typeof data.agenda === "object") agendaData = data.agenda;

    if (Array.isArray(data.schedulePresets)) presets = data.schedulePresets;
    if (data.activePresetId) activePresetId = data.activePresetId;

    if (data.academico && typeof data.academico === "object") academicoCache = data.academico;
  } else {
    await setDoc(ref, {
      estudios:{},
      subjects:[],
      agenda:{},
      schedulePresets:[],
      activePresetId:"",
      academico:{}
    });
    estudiosCache = {};
    subjects = [];
    agendaData = {};
    presets = [];
    activePresetId = null;
    academicoCache = {};
  }

  ensureAgendaStructure();

  const p = presets.find(x => x.id === activePresetId);
  if (p){
    activePresetName = p.name || "";
    activeSelectedSectionIds = Array.isArray(p.sectionIds) ? p.sectionIds.slice() : [];
  } else {
    activePresetId = null;
    activePresetName = "";
    activeSelectedSectionIds = [];
  }
}

function ensureAgendaStructure(){
  if (!agendaData || typeof agendaData !== "object") agendaData = {};
  dayKeys.forEach(k => {
    if (!Array.isArray(agendaData[k])) agendaData[k] = [];
  });
}

// ------------------------ AGENDA RENDER ------------------------
function renderAgenda(){
  ensureAgendaStructure();
  renderAgendaGridInto(agendaGrid, agendaData, true);
}

function renderAgendaGridInto(grid, data, allowEdit){
  if (!grid) return;
  grid.innerHTML = "";

  const hourCol = document.createElement("div");
  hourCol.className = "agenda-hour-col";

  const spacer = document.createElement("div");
  spacer.className = "agenda-hour-spacer";
  hourCol.appendChild(spacer);

  for (let m = minutesStart; m < minutesEnd; m += 60){
    const hour = document.createElement("div");
    hour.className = "agenda-hour";
    const hh = Math.floor(m/60);
    hour.textContent = pad2(hh) + ":00";
    hourCol.appendChild(hour);
  }
  grid.appendChild(hourCol);

  dayKeys.forEach((k, idx)=>{
    const col = document.createElement("div");
    col.className = "agenda-day-col";

    const header = document.createElement("div");
    header.className = "agenda-day-header";
    header.textContent = dayLabels[idx];
    col.appendChild(header);

    const inner = document.createElement("div");
    inner.className = "agenda-day-inner";
    inner.style.height = ((minutesEnd - minutesStart) * pxPerMinute) + "px";

    for (let m = minutesStart; m <= minutesEnd; m += 60){
      const line = document.createElement("div");
      line.className = "agenda-line";
      line.style.top = ((m - minutesStart) * pxPerMinute) + "px";
      inner.appendChild(line);
    }

    const entries = Array.isArray(data?.[k]) ? data[k].slice() : [];
    entries.sort((a,b)=> timeToMinutes(a.inicio) - timeToMinutes(b.inicio));

    entries.forEach((item, index)=>{
      const startM = timeToMinutes(item.inicio);
      const endM = timeToMinutes(item.fin);
      if (isNaN(startM) || isNaN(endM) || endM <= startM) return;

      const block = document.createElement("div");
      block.className = "class-block";
      const color = subjectColor(item.materia);
      block.style.background = `linear-gradient(135deg, ${color}, #0ea5e9)`;
      block.style.top = ((startM - minutesStart) * pxPerMinute) + "px";
      block.style.height = Math.max((endM - startM) * pxPerMinute, 18) + "px";

      const title = document.createElement("strong");
      title.textContent = item.materia || "Materia";
      const meta = document.createElement("small");
      const aulaLabel = item.aula ? (" · " + item.aula) : "";
      meta.textContent = (item.inicio || "—") + " – " + (item.fin || "—") + aulaLabel;

      block.appendChild(title);
      block.appendChild(meta);

      if (allowEdit){
        block.tabIndex = 0;
        block.setAttribute("role", "button");
        block.setAttribute("aria-label", `${title.textContent} ${item.inicio} a ${item.fin}`);
        block.addEventListener("click", ()=> openAgendaModal(k, index));
        block.addEventListener("keydown", (e)=>{
          if (e.key === "Enter" || e.key === " "){
            e.preventDefault();
            openAgendaModal(k, index);
          }
        });
      }

      inner.appendChild(block);
    });

    if (allowEdit){
      inner.addEventListener("dblclick", ()=> openAgendaModal(k, null));
    }

    col.appendChild(inner);
    grid.appendChild(col);
  });
}

// ------------------------ HELPERS ------------------------
function pad2(n){ return String(n).padStart(2,"0"); }
function dateKeyFromYMD(y,m,d){ return y + "-" + pad2(m) + "-" + pad2(d); }
function ymdFromDateKey(k){
  const p = (k||"").split("-");
  if (p.length !== 3) return null;
  return { y:parseInt(p[0],10), m:parseInt(p[1],10), d:parseInt(p[2],10) };
}
function normalizeStr(s){ return (s || "").toString().toLowerCase(); }
function timeToMinutes(t){
  const parts = (t || "").split(":").map(Number);
  if (parts.length !== 2) return NaN;
  const h = parts[0], m = parts[1];
  return h*60 + m;
}
function dtLocalToParts(dtLocal){
  if (!dtLocal) return null;
  const [dpart, tpart] = dtLocal.split("T");
  if (!dpart || !tpart) return null;
  const [y,m,d] = dpart.split("-").map(Number);
  const [hh,mm] = tpart.split(":").map(Number);
  if ([y,m,d,hh,mm].some(x => isNaN(x))) return null;
  return { y, m, d, hh, mm };
}
function partsToDtLocal(p){
  if (!p) return "";
  return p.y + "-" + pad2(p.m) + "-" + pad2(p.d) + "T" + pad2(p.hh) + ":" + pad2(p.mm);
}
function fmtShortDateTimeFromParts(p){
  if (!p) return "—";
  return p.y + "-" + pad2(p.m) + "-" + pad2(p.d) + " " + pad2(p.hh) + ":" + pad2(p.mm);
}
function escapeHtml(s){
  return (s || "").toString()
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function subjectColor(name){
  const s = subjects.find(x => x.name === name);
  return (s && s.color) ? s.color : "#2563eb";
}

function ensureSubjectExistsWithColor(subjectName){
  const exists = subjects.find(s => normalizeStr(s.name) === normalizeStr(subjectName));
  if (exists) return;
  let hash = 0;
  for (let i=0;i<subjectName.length;i++){
    hash = ((hash << 5) - hash) + subjectName.charCodeAt(i);
    hash |= 0;
  }
  const hue = Math.abs(hash) % 360;
  const color = hslToHex(hue, 80, 55);
  subjects.push({ name: subjectName, color });
}
function hslToHex(h, s, l){
  s /= 100; l /= 100;
  const k = n => (n + h/30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = x => Math.round(255 * x).toString(16).padStart(2, '0');
  return "#" + toHex(f(0)) + toHex(f(8)) + toHex(f(4));
}

// ------------------------ MATERIAS ------------------------
const subjectsListEl = document.getElementById("subjectsList");
const subjectsEmptyMsg = document.getElementById("subjectsEmptyMsg");
const subjectNameInput = document.getElementById("subjectName");
const subjectColorInput = document.getElementById("subjectColor");
const subjectFormTitle = document.getElementById("subjectFormTitle");
const btnSubjectSave = document.getElementById("btnSubjectSave");
const btnSubjectReset = document.getElementById("btnSubjectReset");

function renderSubjectsList(){
  subjectsListEl.innerHTML = "";
  if (!subjects.length){
    subjectsEmptyMsg.style.display = "block";
    return;
  }
  subjectsEmptyMsg.style.display = "none";

  subjects.forEach((s, idx) => {
    const row = document.createElement("div");
    row.className = "subject-row";

    const dot = document.createElement("div");
    dot.className = "subject-color-dot";
    dot.style.background = s.color || "#2563eb";

    const name = document.createElement("div");
    name.className = "subject-name";
    name.textContent = s.name;

    const actions = document.createElement("div");
    actions.className = "subject-actions";

    const btnEdit = document.createElement("button");
    btnEdit.className = "btn-gray btn-small";
    btnEdit.textContent = "Editar";
    btnEdit.onclick = () => startEditSubject(idx);

    const btnDel = document.createElement("button");
    btnDel.className = "btn-danger btn-small";
    btnDel.textContent = "Borrar";
    btnDel.onclick = () => deleteSubject(idx);

    actions.appendChild(btnEdit);
    actions.appendChild(btnDel);

    row.appendChild(dot);
    row.appendChild(name);
    row.appendChild(actions);

    subjectsListEl.appendChild(row);
  });
}

function startEditSubject(index){
  editingSubjectIndex = index;
  const s = subjects[index];
  subjectNameInput.value = s.name;
  subjectColorInput.value = s.color || "#2563eb";
  subjectFormTitle.textContent = "Editar materia";
}

btnSubjectReset.onclick = () => {
  editingSubjectIndex = -1;
  subjectNameInput.value = "";
  subjectColorInput.value = "#2563eb";
  subjectFormTitle.textContent = "Nueva materia";
};

btnSubjectSave.onclick = async () => {
  if (!currentUser) return;
  const name = subjectNameInput.value.trim();
  const color = subjectColorInput.value || "#2563eb";
  if (!name){
    notifyWarn("Ingresá un nombre para la materia.");
    return;
  }

  if (editingSubjectIndex === -1){
    if (subjects.some(s => s.name.toLowerCase() === name.toLowerCase())){
      notifyWarn("Ya existe una materia con ese nombre.");
      return;
    }
    subjects.push({ name, color });
  } else {
    const oldName = subjects[editingSubjectIndex].name;
    subjects[editingSubjectIndex] = { name, color };

    Object.keys(estudiosCache || {}).forEach(dateKey => {
      const arr = estudiosCache[dateKey] || [];
      arr.forEach(ev => { if (ev.materia === oldName) ev.materia = name; });
      estudiosCache[dateKey] = arr;
    });

    Object.keys(agendaData || {}).forEach(dayKey => {
      const arr = agendaData[dayKey] || [];
      arr.forEach(item => { if (item.materia === oldName) item.materia = name; });
      agendaData[dayKey] = arr;
    });

    Object.keys(academicoCache || {}).forEach(dateKey => {
      const arr = academicoCache[dateKey] || [];
      arr.forEach(item => { if (item.materia === oldName) item.materia = name; });
      academicoCache[dateKey] = arr;
    });
  }

  const ref = doc(db, "planner", currentUser.uid);
  const snap = await getDoc(ref);
  let data = snap.exists() ? snap.data() : {};
  data.subjects = subjects;
  data.estudios = estudiosCache;
  data.agenda = agendaData;
  data.academico = academicoCache;
  await setDoc(ref, data);

  editingSubjectIndex = -1;
  subjectNameInput.value = "";
  subjectColorInput.value = "#2563eb";
  subjectFormTitle.textContent = "Nueva materia";

  renderSubjectsList();
  renderSubjectsOptions();
  paintStudyEvents();
  renderAgenda();
  renderAcadCalendar();
};

async function deleteSubject(index){
  if (!currentUser) return;
  const s = subjects[index];
  if (!s) return;

  const ok = await showConfirm({
    title:"Eliminar materia",
    message:"Vas a borrar la materia \"" + s.name + "\".\n\nEsto también puede borrar sus clases en la Agenda y sus registros de estudio del calendario, y también los ítems del Académico asociados a esa materia.\n\n¿Querés continuar?",
    confirmText:"Eliminar",
    cancelText:"Cancelar",
    danger:true
  });
  if (!ok) return;

  const name = s.name;
  subjects.splice(index,1);

  Object.keys(estudiosCache || {}).forEach(dateKey => {
    const arr = estudiosCache[dateKey] || [];
    const filtered = arr.filter(ev => ev.materia !== name);
    if (filtered.length) estudiosCache[dateKey] = filtered;
    else delete estudiosCache[dateKey];
  });

  Object.keys(agendaData || {}).forEach(dayKey => {
    const arr = agendaData[dayKey] || [];
    agendaData[dayKey] = arr.filter(item => item.materia !== name);
  });

  Object.keys(academicoCache || {}).forEach(dateKey => {
    const arr = academicoCache[dateKey] || [];
    const filtered = arr.filter(item => item.materia !== name);
    if (filtered.length) academicoCache[dateKey] = filtered;
    else delete academicoCache[dateKey];
  });

  const ref = doc(db, "planner", currentUser.uid);
  const snap = await getDoc(ref);
  let data = snap.exists() ? snap.data() : {};
  data.subjects = subjects;
  data.estudios = estudiosCache;
  data.agenda = agendaData;
  data.academico = academicoCache;
  await setDoc(ref, data);

  editingSubjectIndex = -1;
  subjectNameInput.value = "";
  subjectColorInput.value = "#2563eb";
  subjectFormTitle.textContent = "Nueva materia";

  renderSubjectsList();
  renderSubjectsOptions();
  paintStudyEvents();
  renderAgenda();
  renderAcadCalendar();
  notifySuccess("Materia eliminada.");
}

function renderSubjectsOptions(){
  const selEstudio = document.getElementById("inpMateria");
  const selAgenda  = document.getElementById("agendaSubject");
  const selAcad    = document.getElementById("acadSubject");

  const fill = (sel) => {
    if (!sel) return;
    sel.innerHTML = "";
    if (!subjects.length){
      const opt = document.createElement("option");
      opt.textContent = "Creá materias primero";
      opt.disabled = true;
      opt.selected = true;
      sel.appendChild(opt);
      return;
    }
    subjects.forEach(s => {
      const o = document.createElement("option");
      o.value = s.name;
      o.textContent = s.name;
      sel.appendChild(o);
    });
  };

  fill(selEstudio);
  fill(selAgenda);
  fill(selAcad);
}

// ------------------------ ESTUDIO CALENDARIO ------------------------
const monthTitle = document.getElementById("monthTitle");
const gridStudy = document.getElementById("calendarGrid");

function initStudyNav(){
  document.getElementById("btnStudyPrev").addEventListener("click", ()=>{
    studyViewMonth--;
    if (studyViewMonth < 0){ studyViewMonth = 11; studyViewYear--; }
    renderStudyCalendar();
  });
  document.getElementById("btnStudyNext").addEventListener("click", ()=>{
    studyViewMonth++;
    if (studyViewMonth > 11){ studyViewMonth = 0; studyViewYear++; }
    renderStudyCalendar();
  });
  document.getElementById("btnStudyToday").addEventListener("click", ()=>{
    const now = new Date();
    studyViewYear = now.getFullYear();
    studyViewMonth = now.getMonth();
    renderStudyCalendar();
  });
}

function renderStudyCalendar(){
  if (studyViewYear === null || studyViewMonth === null){
    const now = new Date();
    studyViewYear = now.getFullYear();
    studyViewMonth = now.getMonth();
  }

  const firstDay = new Date(studyViewYear, studyViewMonth, 1);
  const jsDow = firstDay.getDay();
  const offset = (jsDow + 6) % 7;

  const totalDays = new Date(studyViewYear, studyViewMonth + 1, 0).getDate();
  const labelDate = new Date(studyViewYear, studyViewMonth, 1);
  monthTitle.textContent = labelDate.toLocaleDateString("es-ES", { month:"long", year:"numeric" });

  gridStudy.innerHTML = "";

  for (let i=0;i<offset;i++){
    const empty = document.createElement("div");
    empty.className = "day day-muted";
    gridStudy.appendChild(empty);
  }

  const now = new Date();
  const ty = now.getFullYear(), tm = now.getMonth(), td = now.getDate();

  for (let d=1; d<=totalDays; d++){
    const box = document.createElement("div");
    box.className = "day";

    if (studyViewYear === ty && studyViewMonth === tm && d === td){
      box.classList.add("is-today");
    }

    const head = document.createElement("div");
    head.className = "day-number";
    const left = document.createElement("span");
    left.textContent = String(d);
    const dot = document.createElement("span");
    dot.className = "today-dot";
    head.appendChild(left);
    head.appendChild(dot);

    box.appendChild(head);

    box.onclick = () => openModalStudy(d, studyViewMonth+1, studyViewYear);
    gridStudy.appendChild(box);
  }

  paintStudyEvents();
}

function paintStudyEvents(){
  const boxes = gridStudy.querySelectorAll(".day");
  boxes.forEach(b => {
    Array.from(b.querySelectorAll(".event")).forEach(e => e.remove());
  });

  if (!estudiosCache) return;

  Object.keys(estudiosCache).forEach(dateKey => {
    const parts = ymdFromDateKey(dateKey);
    if (!parts) return;
    if (parts.y !== studyViewYear) return;
    if ((parts.m - 1) !== studyViewMonth) return;

    const events = estudiosCache[dateKey] || [];
    const d = parts.d;

    boxes.forEach(box => {
      const nEl = box.querySelector(".day-number span");
      const n = nEl ? parseInt(nEl.textContent, 10) : NaN;
      if (n === d){
        events.forEach(ev => {
          const e = document.createElement("div");
          e.className = "event";
          const horas = (ev.horas || 0) + "h " + (ev.mins || 0) + "m";
          e.textContent = (ev.materia || "Materia") + " — " + horas + (ev.tema ? (" · " + ev.tema) : "");
          box.appendChild(e);
        });
      }
    });
  });
}

function openModalStudy(day, month, year){
  selectedDate = dateKeyFromYMD(year, month, day);
  editingIndex = -1;

  const modalBg = document.getElementById("modalBg");
  const inpHoras = document.getElementById("inpHoras");
  const inpMins  = document.getElementById("inpMins");
  const inpTema  = document.getElementById("inpTema");
  const inpMateria = document.getElementById("inpMateria");

  const events = estudiosCache[selectedDate] || [];
  renderEventsList(events);

  inpHoras.value = "";
  inpMins.value = "";
  inpTema.value = "";
  if (inpMateria && inpMateria.options.length) inpMateria.selectedIndex = 0;

  modalBg.style.display = "flex";
}

function renderEventsList(events){
  const list = document.getElementById("eventsList");
  list.innerHTML = "";
  if (!events.length){
    list.style.display = "none";
    return;
  }
  list.style.display = "block";

  events.forEach((ev, idx)=>{
    const row = document.createElement("div");
    row.className = "event-row";
    const horas = (ev.horas || 0) + "h " + (ev.mins || 0) + "m";
    row.innerHTML = `
      <div class="event-row-main">${escapeHtml(ev.materia || "Materia")}</div>
      <div class="event-row-meta">${escapeHtml(horas)} · ${escapeHtml(ev.tema || "-")}</div>
      <div class="event-row-actions">
        <button class="btn-outline btn-small" data-idx="${idx}" data-act="edit">Editar</button>
        <button class="btn-danger btn-small" data-idx="${idx}" data-act="del">Borrar</button>
      </div>
    `;
    list.appendChild(row);
  });

  list.querySelectorAll("button").forEach(btn => {
    btn.addEventListener("click", async (e)=>{
      const idx = parseInt(e.target.dataset.idx, 10);
      const act = e.target.dataset.act;
      if (isNaN(idx)) return;
      if (act === "edit") startEditEvent(idx);
      if (act === "del") await deleteEvent(idx);
    });
  });
}

function startEditEvent(index){
  editingIndex = index;
  const events = estudiosCache[selectedDate] || [];
  const ev = events[index];
  if (!ev) return;
  document.getElementById("inpHoras").value = ev.horas || "";
  document.getElementById("inpMins").value  = ev.mins || "";
  document.getElementById("inpTema").value  = ev.tema || "";
  const sel = document.getElementById("inpMateria");
  if (sel){
    const opt = Array.from(sel.options).find(o => o.value === ev.materia);
    if (opt) sel.value = opt.value;
  }
}

async function deleteEvent(index){
  if (!currentUser || !selectedDate) return;
  const ref = doc(db, "planner", currentUser.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const data = snap.data() || {};
  if (!data.estudios || !data.estudios[selectedDate]) return;

  data.estudios[selectedDate].splice(index, 1);
  if (data.estudios[selectedDate].length === 0) delete data.estudios[selectedDate];

  await setDoc(ref, data);
  estudiosCache = data.estudios || {};
  const events = estudiosCache[selectedDate] || [];
  renderEventsList(events);
  paintStudyEvents();
}

document.getElementById("btnCancelar").onclick = () => {
  document.getElementById("modalBg").style.display = "none";
  selectedDate = null;
  editingIndex = -1;
};

document.getElementById("btnGuardar").onclick = async () => {
  if (!currentUser || !selectedDate) return;

  const horas = document.getElementById("inpHoras").value;
  const mins  = document.getElementById("inpMins").value;
  const tema  = document.getElementById("inpTema").value;
  const materiaSel = document.getElementById("inpMateria");

  if (!subjects.length || !materiaSel || !materiaSel.value){
    notifyWarn("Primero creá al menos una materia en la pestaña 'Materias'.");
    return;
  }
  const materia = materiaSel.value;

  const ref = doc(db, "planner", currentUser.uid);
  const snap = await getDoc(ref);

  let data = snap.exists() ? snap.data() : {};
  if (!data.estudios) data.estudios = {};
  if (!data.estudios[selectedDate]) data.estudios[selectedDate] = [];

  const item = { horas, mins, tema, materia };
  if (editingIndex === -1){
    data.estudios[selectedDate].push(item);
  } else {
    data.estudios[selectedDate][editingIndex] = item;
  }

  await setDoc(ref, data);
  estudiosCache = data.estudios || {};
  document.getElementById("modalBg").style.display = "none";
  paintStudyEvents();
};

// ------------------------ ACADEMICO (CALENDARIO + WIDGETS) ------------------------
const acadGrid = document.getElementById("acadGrid");
const acadMonthTitle = document.getElementById("acadMonthTitle");
const acadDetailBox = document.getElementById("acadDetailBox");
const acadDetailTitle = document.getElementById("acadDetailTitle");
const acadDetailSub = document.getElementById("acadDetailSub");
const acadDetailCount = document.getElementById("acadDetailCount");
const acadDetailList = document.getElementById("acadDetailList");
const btnAcadAddFromDetail = document.getElementById("btnAcadAddFromDetail");

function initAcademicoNav(){
  document.getElementById("btnAcadPrev").addEventListener("click", ()=>{
    acadViewMonth--;
    if (acadViewMonth < 0){ acadViewMonth = 11; acadViewYear--; }
    renderAcadCalendar();
  });
  document.getElementById("btnAcadNext").addEventListener("click", ()=>{
    acadViewMonth++;
    if (acadViewMonth > 11){ acadViewMonth = 0; acadViewYear++; }
    renderAcadCalendar();
  });
  document.getElementById("btnAcadToday").addEventListener("click", ()=>{
    const now = new Date();
    acadViewYear = now.getFullYear();
    acadViewMonth = now.getMonth();
    renderAcadCalendar();
  });
  btnAcadAddFromDetail.addEventListener("click", ()=>{
    if (acadSelectedDateKey) openAcadModalForDate(acadSelectedDateKey, -1);
  });
}

function renderAcadCalendar(){
  if (acadViewYear === null || acadViewMonth === null){
    const now = new Date();
    acadViewYear = now.getFullYear();
    acadViewMonth = now.getMonth();
  }

  const firstDay = new Date(acadViewYear, acadViewMonth, 1);
  const jsDow = firstDay.getDay();
  const offset = (jsDow + 6) % 7;
  const totalDays = new Date(acadViewYear, acadViewMonth + 1, 0).getDate();

  const now = new Date();
  const todayKey = dateKeyFromYMD(now.getFullYear(), now.getMonth()+1, now.getDate());

  acadMonthTitle.textContent = firstDay.toLocaleString("es-ES", { month:"long", year:"numeric" });

  acadGrid.innerHTML = "";

  // fill offset blanks
  for (let i=0;i<offset;i++){
    const empty = document.createElement("div");
    empty.className = "day day-muted";
    acadGrid.appendChild(empty);
  }

  for (let d=1; d<=totalDays; d++){
    const dateKey = dateKeyFromYMD(acadViewYear, acadViewMonth+1, d);
    const card = document.createElement("div");
    card.className = "day";
    if (dateKey === todayKey) card.classList.add("is-today");

    const head = document.createElement("div");
    head.className = "day-number";
    head.innerHTML = `<span>${d}</span><span class="today-dot"></span>`;
    card.appendChild(head);

    const items = Array.isArray(academicoCache?.[dateKey]) ? academicoCache[dateKey] : [];
    items.sort((a,b)=> (a.when||"").localeCompare(b.when||""));

    const list = document.createElement("div");
    list.className = "acad-day-list";

    items.forEach((item, idx)=>{
      const row = document.createElement("div");
      row.className = "acad-day-item";
      row.addEventListener("click", ()=> openAcadModalForDate(dateKey, idx));

      const left = document.createElement("div");
      left.className = "acad-item-left";
      left.innerHTML = `<div class="badge-soft">${escapeHtml(item.tipo || "Item")}</div>`;

      const mid = document.createElement("div");
      mid.className = "acad-item-mid";
      mid.innerHTML = `
        <div class="acad-item-title">${escapeHtml(item.titulo || "(sin título)")}</div>
        <div class="acad-item-meta">${escapeHtml(item.materia || "Materia")} · ${escapeHtml(item.estado || "—")}</div>
      `;

      const right = document.createElement("div");
      right.className = "acad-item-right";
      const parts = dtLocalToParts(item.cuando || item.when || "");
      right.textContent = parts ? fmtShortDateTimeFromParts(parts) : "—";

      row.appendChild(left);
      row.appendChild(mid);
      row.appendChild(right);

      list.appendChild(row);
    });

    if (!items.length){
      const empty = document.createElement("div");
      empty.className = "small-muted";
      empty.textContent = "—";
      list.appendChild(empty);
    }

    card.appendChild(list);

    card.addEventListener("click", ()=>{
      acadSelectedDateKey = dateKey;
      openAcadDetail(dateKey);
    });

    acadGrid.appendChild(card);
  }

  openAcadDetail(acadSelectedDateKey || todayKey);
}

function openAcadDetail(dateKey){
  const parts = ymdFromDateKey(dateKey);
  if (!parts){
    acadDetailBox.style.display = "none";
    return;
  }

  acadSelectedDateKey = dateKey;

  acadDetailTitle.textContent = "Detalle del " + parts.d + "/" + parts.m;
  acadDetailSub.textContent = "Año " + parts.y;
  const items = Array.isArray(academicoCache?.[dateKey]) ? academicoCache[dateKey].slice() : [];
  items.sort((a,b)=> (a.when||"").localeCompare(b.when||""));

  acadDetailCount.textContent = String(items.length);
  acadDetailList.innerHTML = "";
  acadDetailBox.style.display = items.length ? "block" : "none";

  items.forEach((item, idx)=>{
    const row = document.createElement("div");
    row.className = "acad-detail-row";

    const left = document.createElement("div");
    left.className = "acad-detail-text";
    left.innerHTML = `
      <strong>${escapeHtml(item.titulo || "(sin título)")}</strong>
      <div class="acad-detail-meta">${escapeHtml(item.materia || "Materia")} · ${escapeHtml(item.estado || "—")} · ${escapeHtml(item.tipo || "Item")}</div>
      <div class="acad-detail-notes">${escapeHtml(item.notas || item.notes || "")}</div>
    `;

    const right = document.createElement("div");
    right.className = "acad-detail-actions";
    const btnEdit = document.createElement("button");
    btnEdit.className = "btn-outline btn-small";
    btnEdit.textContent = "Editar";
    btnEdit.addEventListener("click", ()=> openAcadModalForDate(dateKey, idx));

    right.appendChild(btnEdit);

    row.appendChild(left);
    row.appendChild(right);

    acadDetailList.appendChild(row);
  });
}

function openAcadModalForDate(dateKey, index){
  const parts = ymdFromDateKey(dateKey);
  if (!parts) return;

  acadEditing = { dateKey, index };
  const modalBg = document.getElementById("acadModalBg");
  const titleEl = document.getElementById("acadModalTitle");
  const typeSel = document.getElementById("acadType");
  const subjSel = document.getElementById("acadSubject");
  const titleInp = document.getElementById("acadTitle");
  const whenInp = document.getElementById("acadWhen");
  const notesTxt = document.getElementById("acadNotes");
  const statusSel = document.getElementById("acadStatus");
  const btnDelete = document.getElementById("btnAcadDelete");

  renderSubjectsOptions();

  if (index >= 0){
    const items = academicoCache[dateKey] || [];
    const item = items[index];
    if (item){
      typeSel.value = item.tipo || "Parcial";
      const opt = Array.from(subjSel.options).find(o => o.value === item.materia);
      if (opt) subjSel.value = opt.value;
      titleInp.value = item.titulo || "";
      whenInp.value = item.cuando || item.when || "";
      notesTxt.value = item.notas || item.notes || "";
      statusSel.value = item.estado || "pending";
    }
    titleEl.textContent = "Editar académico";
    btnDelete.style.display = "inline-block";
  } else {
    titleEl.textContent = "Añadir académico";
    btnDelete.style.display = "none";
    titleInp.value = "";
    whenInp.value = partsToDtLocal({ y:parts.y, m:parts.m, d:parts.d, hh:12, mm:0 });
    notesTxt.value = "";
    statusSel.value = "pending";
    typeSel.value = "Parcial";
    if (subjSel && subjSel.options.length) subjSel.selectedIndex = 0;
  }

  modalBg.style.display = "flex";
}

document.getElementById("btnAcadCancel").addEventListener("click", ()=> document.getElementById("acadModalBg").style.display = "none");
document.getElementById("acadModalBg").addEventListener("click", (e)=>{ if (e.target.id === "acadModalBg") e.target.style.display = "none"; });

document.getElementById("btnAcadSave").addEventListener("click", async ()=>{
  if (!currentUser) return;
  const typeSel = document.getElementById("acadType");
  const subjSel = document.getElementById("acadSubject");
  const titleInp = document.getElementById("acadTitle");
  const whenInp = document.getElementById("acadWhen");
  const notesTxt = document.getElementById("acadNotes");
  const statusSel = document.getElementById("acadStatus");

  if (!subjSel || !subjSel.value){
    notifyWarn("Elegí materia.");
    return;
  }
  if (!titleInp.value.trim()){
    notifyWarn("Poné un título.");
    return;
  }
  if (!whenInp.value){
    notifyWarn("Indicá fecha y hora.");
    return;
  }

  const item = {
    tipo: typeSel.value,
    materia: subjSel.value,
    titulo: titleInp.value.trim(),
    cuando: whenInp.value,
    notas: notesTxt.value,
    estado: statusSel.value
  };

  const { dateKey, index } = acadEditing;
  if (!dateKey) return;

  const ref = doc(db, "planner", currentUser.uid);
  const snap = await getDoc(ref);
  let data = snap.exists() ? snap.data() : {};
  if (!data.academico) data.academico = {};
  if (!Array.isArray(data.academico[dateKey])) data.academico[dateKey] = [];

  if (index >= 0) data.academico[dateKey][index] = item;
  else data.academico[dateKey].push(item);

  await setDoc(ref, data);
  academicoCache = data.academico;
  renderAcadCalendar();
  document.getElementById("acadModalBg").style.display = "none";
});

document.getElementById("btnAcadDelete").addEventListener("click", async ()=>{
  if (!currentUser) return;
  const { dateKey, index } = acadEditing;
  if (!dateKey || index < 0) return;

  const ok = await showConfirm({
    title:"Eliminar académico",
    message:"¿Seguro que querés eliminar este item?",
    confirmText:"Eliminar",
    cancelText:"Cancelar",
    danger:true
  });
  if (!ok) return;

  const ref = doc(db, "planner", currentUser.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const data = snap.data() || {};
  if (!Array.isArray(data.academico?.[dateKey])) return;

  data.academico[dateKey].splice(index,1);
  if (!data.academico[dateKey].length) delete data.academico[dateKey];

  await setDoc(ref, data);
  academicoCache = data.academico || {};
  renderAcadCalendar();
  document.getElementById("acadModalBg").style.display = "none";
});

// ------------------------ AGENDA ------------------------
const agendaGrid = document.getElementById("agendaGrid");
const agendaModalBg = document.getElementById("agendaModalBg");
const agendaModalTitle = document.getElementById("agendaModalTitle");
const btnAddClass = document.getElementById("btnAddClass");
const btnAgendaCancel = document.getElementById("btnAgendaCancel");
const btnAgendaDelete = document.getElementById("btnAgendaDelete");
const btnAgendaSave = document.getElementById("btnAgendaSave");

btnAddClass.addEventListener("click", ()=> openAgendaModal(null, null));

function openAgendaModal(dayKey, index){
  if (!currentUser) return;
  agendaEditDay = dayKey;
  agendaEditIndex = index === null ? null : index;

  const daySel = document.getElementById("agendaDay");
  const subjSel = document.getElementById("agendaSubject");
  const roomInput = document.getElementById("agendaRoom");
  const startInput = document.getElementById("agendaStart");
  const endInput = document.getElementById("agendaEnd");

  renderSubjectsOptions();

  daySel.innerHTML = "";
  dayKeys.forEach(k=>{
    const opt = document.createElement("option");
    opt.value = k;
    opt.textContent = k.charAt(0).toUpperCase() + k.slice(1);
    daySel.appendChild(opt);
  });

  if (!dayKey) dayKey = "lunes";
  daySel.value = dayKey;

  roomInput.value = "";
  startInput.value = "";
  endInput.value = "";

  if (index !== null && index >= 0){
    const arr = agendaData[dayKey] || [];
    const item = arr[index];
    if (item){
      roomInput.value = item.aula || "";
      startInput.value = item.inicio || "";
      endInput.value = item.fin || "";

      const opt = Array.from(subjSel.options).find(o => o.value === item.materia);
      if (opt) subjSel.value = opt.value;

      daySel.value = dayKey;
    }
    btnAgendaDelete.style.display = "inline-block";
  } else {
    agendaModalTitle.textContent = "Añadir clase";
    btnAgendaDelete.style.display = "none";
  }

  agendaModalBg.style.display = "flex";
}

btnAgendaCancel.onclick = () => { agendaModalBg.style.display = "none"; };
agendaModalBg.onclick = (e) => { if (e.target === agendaModalBg) agendaModalBg.style.display = "none"; };

btnAgendaSave.onclick = async () => {
  if (!currentUser) return;

  const daySel = document.getElementById("agendaDay");
  const day = daySel.value;

  const subjSel = document.getElementById("agendaSubject");
  if (!subjects.length || !subjSel || !subjSel.value){
    notifyWarn("Primero creá materias en la pestaña 'Materias'.");
    return;
  }

  const materia = subjSel.value;
  const aula = document.getElementById("agendaRoom").value.trim();
  const inicio = document.getElementById("agendaStart").value;
  const fin    = document.getElementById("agendaEnd").value;

  if (!day || !inicio || !fin){
    notifyWarn("Completá día, hora de inicio y fin.");
    return;
  }

  const startM = timeToMinutes(inicio);
  const endM   = timeToMinutes(fin);
  if (isNaN(startM) || isNaN(endM) || endM <= startM){
    notifyWarn("La hora de fin debe ser mayor a la de inicio.");
    return;
  }
  if (startM < minutesStart || endM > minutesEnd){
    notifyWarn("Rango permitido: entre 08:00 y 23:00.");
    return;
  }

  ensureAgendaStructure();
  const arr = agendaData[day] || [];
  const item = { materia, aula, inicio, fin };

  if (agendaEditIndex === null || agendaEditIndex < 0){
    arr.push(item);
  } else {
    arr[agendaEditIndex] = item;
  }
  agendaData[day] = arr;

  const ref = doc(db, "planner", currentUser.uid);
  const snap = await getDoc(ref);
  let data = snap.exists() ? snap.data() : {};
  data.agenda = agendaData;
  await setDoc(ref, data);

  agendaModalBg.style.display = "none";
  renderAgenda();
};

btnAgendaDelete.onclick = async () => {
  if (!currentUser) return;
  if (agendaEditDay === null || agendaEditIndex === null || agendaEditIndex < 0) return;

  const ok = await showConfirm({
    title:"Eliminar clase",
    message:"¿Seguro que querés eliminar esta clase de la agenda?",
    confirmText:"Eliminar",
    cancelText:"Cancelar",
    danger:true
  });
  if (!ok) return;

  const arr = agendaData[agendaEditDay] || [];
  arr.splice(agendaEditIndex,1);
  agendaData[agendaEditDay] = arr;

  const ref = doc(db, "planner", currentUser.uid);
  const snap = await getDoc(ref);
  let data = snap.exists() ? snap.data() : {};
  data.agenda = agendaData;
  await setDoc(ref, data);

  agendaModalBg.style.display = "none";
  renderAgenda();
};

// ------------------------ PLANIFICADOR ------------------------
async function loadCourseSections(){
  courseSections = [];
  try{
    const snap = await getDocs(collection(db,"courseSections"));
    snap.forEach(d => {
      const data = d.data() || {};
      courseSections.push({
        id: d.id,
        subject: data.subject || "",
        commission: data.commission || "",
        degree: data.degree || "",
        room: data.room || "",
        campus: data.campus || "",
        headEmail: data.headEmail || "",
        titular: data.titular || "",
        docentes: Array.isArray(data.docentes) ? data.docentes : [],
        days: Array.isArray(data.days) ? data.days : [],
      });
    });
  }catch(e){
    notifyError("Error al cargar horarios del admin: " + (e.message || e));
    courseSections = [];
  }
}

function initPlanificadorUI(){
  const search = document.getElementById("sectionsSearch");
  const btnReload = document.getElementById("btnReloadSections");
  const btnSave = document.getElementById("btnPresetSave");
  const btnNew = document.getElementById("btnPresetNew");
  const btnDup = document.getElementById("btnPresetDuplicate");
  const btnDel = document.getElementById("btnPresetDelete");
  const btnToAgenda = document.getElementById("btnPresetToAgenda");
  const btnAgendaFromPreset = document.getElementById("btnAgendaFromPreset");

  if (search){
    search.addEventListener("input", ()=> renderSectionsList());
  }
  if (btnReload){
    btnReload.addEventListener("click", async ()=>{
      await loadCourseSections();
      renderPlannerAll();
    });
  }
  if (btnSave) btnSave.addEventListener("click", saveActivePreset);
  if (btnNew) btnNew.addEventListener("click", newPreset);
  if (btnDup) btnDup.addEventListener("click", duplicatePreset);
  if (btnDel) btnDel.addEventListener("click", deletePreset);

  if (btnToAgenda) btnToAgenda.addEventListener("click", ()=> openPresetToAgendaModal(activePresetId));
  if (btnAgendaFromPreset) btnAgendaFromPreset.addEventListener("click", ()=> openPresetToAgendaModal(activePresetId));

  renderPlannerAll();
}

function renderPlannerAll(){
  document.getElementById("sectionsCountBadge").textContent = String(courseSections.length || 0);
  renderPresetsList();
  renderSectionsList();
  renderSelectedSectionsList();
  renderPlannerPreview();
}

function renderSectionsList(){
  const list = document.getElementById("sectionsList");
  const q = normalizeStr(document.getElementById("sectionsSearch")?.value || "");
  list.innerHTML = "";

  let filtered = courseSections.slice();
  if (q){
    filtered = filtered.filter(sec => {
      const hay = [
        sec.subject, sec.commission, sec.degree, sec.room, sec.campus,
        sec.headEmail, sec.titular,
        (sec.days || []).map(d=> (d.day||"") + " " + (d.start||"") + " " + (d.end||"") + " " + (d.campus||"")).join(" ")
      ].join(" | ");
      return normalizeStr(hay).includes(q);
    });
  }

  if (!filtered.length){
    const div = document.createElement("div");
    div.className = "small-muted";
    div.textContent = "No hay horarios para mostrar (o tu búsqueda no encontró resultados).";
    list.appendChild(div);
    return;
  }

  filtered.sort((a,b)=>{
    const sa = normalizeStr(a.subject), sb = normalizeStr(b.subject);
    if (sa < sb) return -1;
    if (sa > sb) return 1;
    const ca = normalizeStr(a.commission), cb = normalizeStr(b.commission);
    return ca < cb ? -1 : ca > cb ? 1 : 0;
  });

  filtered.forEach(sec => {
    const card = document.createElement("div");
    card.className = "section-card";

    const top = document.createElement("div");
    top.className = "section-card-top";

    const left = document.createElement("div");
    const title = document.createElement("div");
    title.className = "section-title";
    const subjectTxt = sec.subject || "(Sin materia)";
    const commTxt = sec.commission ? (" — Comisión " + sec.commission) : "";
    title.textContent = subjectTxt + commTxt;

    const sub = document.createElement("div");
    sub.className = "section-sub";
    const roomLabel = sec.room ? ("Aula " + sec.room) : "Aula no definida";
    const campusLabel = sec.campus ? ("Sede: " + sec.campus) : "Sede no definida";
    sub.textContent = roomLabel + " · " + campusLabel;

    left.appendChild(title);
    left.appendChild(sub);

    const actions = document.createElement("div");
    actions.className = "section-actions";

    const btn = document.createElement("button");
    btn.className = activeSelectedSectionIds.includes(sec.id) ? "btn-danger btn-small" : "btn-blue btn-small";
    btn.textContent = activeSelectedSectionIds.includes(sec.id) ? "Quitar" : "Agregar";
    btn.addEventListener("click", ()=> toggleSectionInPreset(sec.id));

    actions.appendChild(btn);

    top.appendChild(left);
    top.appendChild(actions);

    const days = document.createElement("div");
    days.className = "section-days";
    (sec.days || []).forEach(d=>{
      const pill = document.createElement("span");
      pill.className = "pill";
      const sedeDia = d.campus || sec.campus || "";
      pill.textContent = (d.day || "—") + " " + (d.start || "??") + "–" + (d.end || "??") + (sedeDia ? (" · " + sedeDia) : "");
      days.appendChild(pill);
    });
    if (!(sec.days || []).length){
      const pill = document.createElement("span");
      pill.className = "pill pill-muted";
      pill.textContent = "Sin días cargados";
      days.appendChild(pill);
    }

    card.appendChild(top);
    card.appendChild(days);

    const extra = [];
    if (sec.titular) extra.push("Titular: " + sec.titular);
    if (sec.headEmail) extra.push("Jefe cátedra: " + sec.headEmail);
    if (sec.docentes && sec.docentes.length){
      const x = sec.docentes.map(d0=>{
        const n = d0.name || "";
        const r = d0.role || "";
        return r ? (n + " (" + r + ")") : n;
      }).filter(Boolean).join(", ");
      if (x) extra.push("Equipo: " + x);
    }
    if (extra.length){
      const sub2 = document.createElement("div");
      sub2.className = "section-sub";
      sub2.style.marginTop = ".35rem";
      sub2.textContent = extra.join(" · ");
      card.appendChild(sub2);
    }

    list.appendChild(card);
  });
}

function renderPresetsList(){
  const list = document.getElementById("presetsList");
  const label = document.getElementById("activePresetLabel");
  const nameInput = document.getElementById("presetNameInput");

  list.innerHTML = "";

  if (activePresetId){
    label.textContent = "Activo: " + (activePresetName || "—");
  } else {
    label.textContent = "Sin preset cargado";
  }

  if (!presets.length){
    const div = document.createElement("div");
    div.className = "small-muted";
    div.textContent = "Todavía no tenés presets. Creá uno y guardalo.";
    list.appendChild(div);
  } else {
    presets.forEach(p=>{
      const item = document.createElement("div");
      item.className = "preset-item" + (p.id === activePresetId ? " active" : "");

      const left = document.createElement("div");
      const nm = document.createElement("div");
      nm.className = "preset-name";
      nm.textContent = p.name || "Sin nombre";

      const meta = document.createElement("div");
      meta.className = "preset-meta";
      const c = Array.isArray(p.sectionIds) ? p.sectionIds.length : 0;
      meta.textContent = c + " comisiones";

      left.appendChild(nm);
      left.appendChild(meta);

      const right = document.createElement("div");
      right.style.display = "flex";
      right.style.gap = ".4rem";
      right.style.flexWrap = "wrap";
      right.style.justifyContent = "flex-end";

      const btnLoad = document.createElement("button");
      btnLoad.className = "btn-outline btn-small";
      btnLoad.textContent = "Cargar";
      btnLoad.addEventListener("click", ()=> loadPreset(p.id));

      right.appendChild(btnLoad);

      item.appendChild(left);
      item.appendChild(right);

      list.appendChild(item);
    });
  }

  if (nameInput) nameInput.value = activePresetName || "";
}

function renderSelectedSectionsList(){
  const list = document.getElementById("selectedSectionsList");
  const label = document.getElementById("selectedCountLabel");
  list.innerHTML = "";

  const selected = activeSelectedSectionIds
    .map(id => courseSections.find(s => s.id === id))
    .filter(Boolean);

  label.textContent = selected.length + " comisiones";

  if (!selected.length){
    const div = document.createElement("div");
    div.className = "small-muted";
    div.textContent = "No seleccionaste ninguna comisión todavía.";
    list.appendChild(div);
    return;
  }

  selected.sort((a,b)=>{
    const sa = normalizeStr(a.subject), sb = normalizeStr(b.subject);
    if (sa < sb) return -1;
    if (sa > sb) return 1;
    const ca = normalizeStr(a.commission), cb = normalizeStr(b.commission);
    return ca < cb ? -1 : ca > cb ? 1 : 0;
  });

  selected.forEach(sec=>{
    const card = document.createElement("div");
    card.className = "section-card";

    const top = document.createElement("div");
    top.className = "section-card-top";

    const left = document.createElement("div");
    const title = document.createElement("div");
    title.className = "section-title";
    title.textContent = (sec.subject || "(Sin materia)") + (sec.commission ? (" — Comisión " + sec.commission) : "");

    const sub = document.createElement("div");
    sub.className = "section-sub";
    sub.textContent = "Sede: " + (sec.campus || "—") + " · Aula: " + (sec.room || "—");

    left.appendChild(title);
    left.appendChild(sub);

    const actions = document.createElement("div");
    actions.className = "section-actions";

    const btn = document.createElement("button");
    btn.className = "btn-danger btn-small";
    btn.textContent = "Quitar";
    btn.addEventListener("click", ()=> toggleSectionInPreset(sec.id));
    actions.appendChild(btn);

    top.appendChild(left);
    top.appendChild(actions);

    const days = document.createElement("div");
    days.className = "section-days";
    (sec.days || []).forEach(d=>{
      const pill = document.createElement("span");
      pill.className = "pill";
      const sedeDia = d.campus || sec.campus || "";
      pill.textContent = (d.day || "—") + " " + (d.start || "??") + "–" + (d.end || "??") + (sedeDia ? (" · " + sedeDia) : "");
      days.appendChild(pill);
    });

    card.appendChild(top);
    card.appendChild(days);

    list.appendChild(card);
  });
}

function dayNameToKey(dayName){
  const n = normalizeStr(dayName);
  if (n.startsWith("lun")) return "lunes";
  if (n.startsWith("mar")) return "martes";
  if (n.startsWith("mié") || n.startsWith("mie")) return "miercoles";
  if (n.startsWith("jue")) return "jueves";
  if (n.startsWith("vie")) return "viernes";
  if (n.startsWith("sáb") || n.startsWith("sab")) return "sabado";
  if (n.startsWith("dom")) return "domingo";
  return null;
}

function buildWeeklyDataFromSectionIds(sectionIds){
  const data = {};
  dayKeys.forEach(k => data[k] = []);

  const selected = (sectionIds || [])
    .map(id => courseSections.find(s => s.id === id))
    .filter(Boolean);

  selected.forEach(sec=>{
    const subjName = sec.subject || "(Sin materia)";
    const room = sec.room || "";
    const campusDefault = sec.campus || "";
    const comm = sec.commission || "";

    (sec.days || []).forEach(d=>{
      const k = dayNameToKey(d.day);
      if (!k) return;

      const inicio = d.start || "";
      const fin = d.end || "";
      const sede = d.campus || campusDefault || "";
      const aulaLabel = [room, sede].filter(Boolean).join(" • ");

      data[k].push({
        materia: subjName,
        aula: aulaLabel ? (aulaLabel + (comm ? (" • " + comm) : "")) : (comm ? ("Com " + comm) : ""),
        inicio, fin
      });
    });
  });

  dayKeys.forEach(k=>{
    data[k].sort((a,b)=> timeToMinutes(a.inicio) - timeToMinutes(b.inicio));
  });

  return data;
}

function buildWeeklyDataFromSelected(){
  return buildWeeklyDataFromSectionIds(activeSelectedSectionIds);
}

function renderPlannerPreview(){
  const grid = document.getElementById("plannerPreviewGrid");
  const data = buildWeeklyDataFromSelected();
  renderAgendaGridInto(grid, data, false);
}

function hasOverlapWithSelected(candidateSection){
  const selected = activeSelectedSectionIds
    .map(id => courseSections.find(s => s.id === id))
    .filter(Boolean);

  const candDays = Array.isArray(candidateSection.days) ? candidateSection.days : [];

  for (let i=0;i<candDays.length;i++){
    const cd = candDays[i];
    const dayKey = dayNameToKey(cd.day);
    if (!dayKey) continue;

    const cStart = timeToMinutes(cd.start);
    const cEnd = timeToMinutes(cd.end);
    if (isNaN(cStart) || isNaN(cEnd) || cEnd <= cStart) continue;

    for (let j=0;j<selected.length;j++){
      const s = selected[j];
      if (!s || s.id === candidateSection.id) continue;

      const sDays = Array.isArray(s.days) ? s.days : [];
      for (let k=0;k<sDays.length;k++){
        const sd = sDays[k];
        if (dayNameToKey(sd.day) !== dayKey) continue;

        const sStart = timeToMinutes(sd.start);
        const sEnd = timeToMinutes(sd.end);
        if (isNaN(sStart) || isNaN(sEnd) || sEnd <= sStart) continue;

        const overlap = (cStart < sEnd) && (cEnd > sStart);
        if (overlap) return true;
      }
    }
  }
  return false;
}

function toggleSectionInPreset(sectionId){
  const sec = courseSections.find(s => s.id === sectionId);
  if (!sec) return;

  const idx = activeSelectedSectionIds.indexOf(sectionId);
  if (idx >= 0){
    activeSelectedSectionIds.splice(idx,1);
    renderSelectedSectionsList();
    renderSectionsList();
    renderPlannerPreview();
    return;
  }

  if (sec.subject){
    const alreadySameSubject = activeSelectedSectionIds
      .map(id => courseSections.find(s => s.id === id))
      .filter(Boolean)
      .some(s => normalizeStr(s.subject) === normalizeStr(sec.subject));
    if (alreadySameSubject){
      notifyWarn("Ya tenés una comisión seleccionada para esa materia. Quitala primero si querés cambiarla.");
      return;
    }
  }

  if (hasOverlapWithSelected(sec)){
    notifyWarn("No se puede agregar: se superpone con una materia ya seleccionada en el mismo día/horario.");
    return;
  }

  activeSelectedSectionIds.push(sectionId);
  renderSelectedSectionsList();
  renderSectionsList();
  renderPlannerPreview();
}

function makeId(){
  return "p_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2,7);
}

async function persistPresetsToFirestore(){
  if (!currentUser) return;

  const ref = doc(db, "planner", currentUser.uid);
  const snap = await getDoc(ref);
  let data = snap.exists() ? snap.data() : {};

  data.schedulePresets = presets;
  data.activePresetId = activePresetId || "";

  await setDoc(ref, data);
}

function newPreset(){
  activePresetId = null;
  activePresetName = "";
  activeSelectedSectionIds = [];

  const input = document.getElementById("presetNameInput");
  if (input) input.value = "";

  renderPlannerAll();
}

function loadPreset(id){
  const p = presets.find(x=> x.id === id);
  if (!p) return;

  activePresetId = p.id;
  activePresetName = p.name || "";
  activeSelectedSectionIds = Array.isArray(p.sectionIds) ? p.sectionIds.slice() : [];

  renderPlannerAll();
  persistPresetsToFirestore().catch(()=>{});
}

async function saveActivePreset(){
  if (!currentUser) return;

  const name = (document.getElementById("presetNameInput")?.value || "").trim();
  if (!name){
    notifyWarn("Poné un nombre al preset antes de guardarlo.");
    return;
  }
  if (!activeSelectedSectionIds.length){
    notifyWarn("Seleccioná al menos una comisión para guardar el preset.");
    return;
  }

  const validIds = activeSelectedSectionIds.filter(id => courseSections.some(s=> s.id === id));
  activeSelectedSectionIds = validIds;

  if (!activePresetId){
    const id = makeId();
    activePresetId = id;
    activePresetName = name;
    presets.push({
      id,
      name,
      sectionIds: activeSelectedSectionIds.slice(),
      createdAt: Date.now()
    });
  } else {
    const p = presets.find(x=> x.id === activePresetId);
    if (p){
      p.name = name;
      p.sectionIds = activeSelectedSectionIds.slice();
      p.updatedAt = Date.now();
    } else {
      presets.push({
        id: activePresetId,
        name,
        sectionIds: activeSelectedSectionIds.slice(),
        createdAt: Date.now()
      });
    }
    activePresetName = name;
  }

  await persistPresetsToFirestore();

  renderPresetsList();
  renderSelectedSectionsList();
  renderPlannerPreview();

  notifySuccess("Preset guardado.");
}

async function duplicatePreset(){
  if (!activePresetId){
    notifyWarn("Primero cargá o guardá un preset para duplicarlo.");
    return;
  }
  const p = presets.find(x=> x.id === activePresetId);
  if (!p) return;

  const id = makeId();
  const newName = (p.name || "Preset") + " (copia)";
  presets.push({
    id,
    name: newName,
    sectionIds: Array.isArray(p.sectionIds) ? p.sectionIds.slice() : [],
    createdAt: Date.now()
  });

  activePresetId = id;
  activePresetName = newName;
  activeSelectedSectionIds = Array.isArray(p.sectionIds) ? p.sectionIds.slice() : [];

  await persistPresetsToFirestore();
  renderPlannerAll();
}

async function deletePreset(){
  if (!activePresetId){
    notifyWarn("No hay un preset activo para eliminar.");
    return;
  }
  const ok = await showConfirm({
    title:"Eliminar preset",
    message:"¿Seguro que querés eliminar este preset? (No borra tu Agenda)",
    confirmText:"Eliminar",
    cancelText:"Cancelar",
    danger:true
  });
  if (!ok) return;

  presets = presets.filter(x => x.id !== activePresetId);
  activePresetId = null;
  activePresetName = "";
  activeSelectedSectionIds = [];

  await persistPresetsToFirestore();
  renderPlannerAll();
  notifySuccess("Preset eliminado.");
}

// ------------------------ MODAL PASAR PRESET A AGENDA ------------------------
const presetToAgendaModalBg = document.getElementById("presetToAgendaModalBg");
const presetApplySelect = document.getElementById("presetApplySelect");
const presetApplyInfo = document.getElementById("presetApplyInfo");
const btnPresetApplyCancel = document.getElementById("btnPresetApplyCancel");
const btnPresetApplyConfirm = document.getElementById("btnPresetApplyConfirm");

function initPresetToAgendaModalUI(){
  btnPresetApplyCancel.addEventListener("click", closePresetToAgendaModal);
  presetToAgendaModalBg.addEventListener("click", (e)=>{ if (e.target === presetToAgendaModalBg) closePresetToAgendaModal(); });
  presetApplySelect.addEventListener("change", updatePresetApplyInfo);
  document.querySelectorAll('input[name="applyMode"]').forEach(r=>{
    r.addEventListener("change", updatePresetApplyInfo);
  });
  btnPresetApplyConfirm.addEventListener("click", applySelectedPresetToAgenda);
}

function openPresetToAgendaModal(preselectPresetId=null){
  if (!presets.length){
    notifyWarn("Todavía no tenés presets guardados. Armá uno en Planificador y guardalo.");
    return;
  }

  presetApplySelect.innerHTML = "";
  presets.slice().sort((a,b)=> (a.name||"").localeCompare(b.name||"")).forEach(p=>{
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = (p.name || "Sin nombre") + " (" + ((p.sectionIds||[]).length) + " comisiones)";
    presetApplySelect.appendChild(opt);
  });

  const idToSelect = preselectPresetId && presets.some(p=>p.id===preselectPresetId)
    ? preselectPresetId
    : (activePresetId && presets.some(p=>p.id===activePresetId) ? activePresetId : presets[0].id);

  presetApplySelect.value = idToSelect;

  const addRadio = document.querySelector('input[name="applyMode"][value="add"]');
  if (addRadio) addRadio.checked = true;

  updatePresetApplyInfo();

  presetToAgendaModalBg.style.display = "flex";
}

function closePresetToAgendaModal(){
  presetToAgendaModalBg.style.display = "none";
}

function getApplyMode(){
  const el = document.querySelector('input[name="applyMode"]:checked');
  return el ? el.value : "add";
}

function updatePresetApplyInfo(){
  const presetId = presetApplySelect.value;
  const p = presets.find(x=> x.id === presetId);
  const mode = getApplyMode();
  if (!p){
    presetApplyInfo.textContent = "—";
    return;
  }

  const count = Array.isArray(p.sectionIds) ? p.sectionIds.length : 0;
  const note = mode === "replace"
    ? "Reemplazar va a borrar tu agenda actual y poner solo el preset."
    : "Agregar va a sumar el preset a tu agenda actual (si hay choque de horarios, no se aplica).";

  presetApplyInfo.textContent =
    "Preset: \"" + (p.name || "Sin nombre") + "\" · " + count + " comisiones. " + note;
}

function overlaps(aStart, aEnd, bStart, bEnd){
  return (aStart < bEnd) && (aEnd > bStart);
}

function canMergeDay(existingArr, addArr){
  for (let i=0;i<addArr.length;i++){
    const a = addArr[i];
    const as = timeToMinutes(a.inicio);
    const ae = timeToMinutes(a.fin);
    if (isNaN(as) || isNaN(ae) || ae <= as) return false;

    for (let j=0;j<existingArr.length;j++){
      const b = existingArr[j];
      const bs = timeToMinutes(b.inicio);
      const be = timeToMinutes(b.fin);
      if (isNaN(bs) || isNaN(be) || be <= bs) continue;
      if (overlaps(as, ae, bs, be)) return false;
    }
  }
  return true;
}

async function applySelectedPresetToAgenda(){
  if (!currentUser) return;

  const presetId = presetApplySelect.value;
  const p = presets.find(x=> x.id === presetId);
  if (!p){
    notifyError("Preset inválido.");
    return;
  }

  const telling = [];
  const newWeek = buildWeeklyDataFromSectionIds(p.sectionIds || []);
  const mode = getApplyMode();

  ensureAgendaStructure();

  if (mode === "replace"){
    agendaData = newWeek;
  } else {
    // add: merge day by day; if any overlap -> cancel
    for (let i=0;i<dayKeys.length;i++){
      const k = dayKeys[i];
      const existingArr = Array.isArray(agendaData[k]) ? agendaData[k] : [];
      const addArr = Array.isArray(newWeek[k]) ? newWeek[k] : [];
      if (!addArr.length) continue;

      if (!canMergeDay(existingArr, addArr)){
        telling.push(dayLabels[i]);
      }
    }

    if (telling.length){
      notifyWarn("No se aplicó porque hay choque de horarios en: " + telling.join(", ") + ". Elegí \"Reemplazar\" o ajustá tu agenda.");
      return;
    }

    dayKeys.forEach(k=>{
      const existingArr = Array.isArray(agendaData[k]) ? agendaData[k] : [];
      const addArr = Array.isArray(newWeek[k]) ? newWeek[k] : [];
      agendaData[k] = existingArr.concat(addArr).sort((a,b)=> timeToMinutes(a.inicio) - timeToMinutes(b.inicio));
    });
  }

  const ref = doc(db, "planner", currentUser.uid);
  const snap = await getDoc(ref);
  let data = snap.exists() ? snap.data() : {};
  data.agenda = agendaData;
  await setDoc(ref, data);
  closePresetToAgendaModal();
  renderAgenda();
  notifySuccess("Agenda actualizada.");
}
