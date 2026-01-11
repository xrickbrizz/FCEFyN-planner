import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import { getAuth, signOut, onAuthStateChanged, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
  query,
  where,
  serverTimestamp,
  updateDoc,
  addDoc,
  onSnapshot,
  orderBy,
  limit
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
import { createQuickSidebar } from "../ui/sidebar.js";
import { showToast, showConfirm } from "../ui/notifications.js";
import { getPlansIndex, getPlanWithSubjects, findPlanByName } from "./plans-data.js";

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
const themeColor = (varName, fallback) => {
  const value = getComputedStyle(document.documentElement).getPropertyValue(varName);
  return (value || "").trim() || fallback;
};
const defaultSubjectColor = () => themeColor("--color-accent", "#E6D98C");
const notifyWarn = (message) => showToast({ message, type:"warning" });
let html2canvasLib = null;
let jsPDFLib = null;

// ---- ESTUDIO
let selectedDate = null;
let estudiosCache = {};
let editingIndex = -1;

// ---- MATERIAS
let subjects = [];
let editingSubjectIndex = -1;
let careerPlans = [];
let careerSubjects = [];
let plannerCareer = { slug:"", name:"" };

// ---- AGENDA
let agendaData = {};
const dayKeys = ['lunes','martes','miercoles','jueves','viernes','sabado']; // sin domingo
const dayLabels = ['Lun','Mar','Mié','Jue','Vie','Sáb'];
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

// ---- PROFESORES (NUEVO)
let professorsCatalog = [];
let professorFilters = { career:"", subject:"" };
let professorReviewsCache = {};
let selectedProfessorId = null;
let userProfile = null;

// ---- MENSAJES / AMISTADES (NUEVO)
let friendRequests = { incoming:[], outgoing:[] };
let friendsList = [];
let activeChatId = null;
let activeChatPartner = null;
let messagesUnsubscribe = null;
let messagesCache = {};
let statusUnsubscribe = null;
let userStatusMap = new Map();
let showLastSeenPref = true;
let requestsLoading = true;
let friendsLoading = true;
let messengerInitialCollapsed = false;

const navItems = [
  { id:"inicio", label:"Inicio", icon:"🏠" },
  { id:"estudio", label:"Estudio", icon:"📒" },
  { id:"academico", label:"Académico", icon:"🎓" },
  { id:"agenda", label:"Agenda", icon:"📅" },
  { id:"materias", label:"Materias", icon:"📚" },
  { id:"planificador", label:"Planificador", icon:"🧭" },
  { id:"profesores", label:"Profesores", icon:"⭐" }, // NUEVO
  { id:"mensajes", label:"Mensajes", icon:"💬" }, // NUEVO: contactos + chat
  { id:"perfil", label:"Perfil", icon:"👤" },
];
let activeSection = "inicio";
let lastNonMessagesSection = "inicio";
const helpButton = document.getElementById("helpButton");
const helpModalBg = document.getElementById("helpModalBg");
const helpModalTitle = document.getElementById("helpModalTitle");
const helpModalBody = document.getElementById("helpModalBody");
const btnHelpClose = document.getElementById("btnHelpClose");

const helpContent = {
  inicio: {
    title: "Bienvenida a FCEFyN Planner",
    bullets: [
      "Desde la barra izquierda podés abrir Estudio, Académico, Agenda, Planificador, Profesores y Mensajería.",
      "Los datos que cargues se guardan en tu cuenta de Firebase y se sincronizan al instante.",
      "Usá este inicio para orientarte antes de abrir un calendario o una agenda."
    ]
  },
  estudio: {
    title: "Cómo usar Estudio",
    bullets: [
      "Seleccioná un día del calendario y cargá horas, tema y materia estudiada.",
      "Revisá la lista del modal para editar o borrar registros sin perder tu historial.",
      "Las materias vienen de la sección “Materias”; mantené colores coherentes para ubicarlas rápido.",
      "Usá el botón Hoy para volver al mes actual en un clic."
    ]
  },
  academico: {
    title: "Cómo usar Académico",
    bullets: [
      "Abrí un día para ver o añadir parciales, TPs, tareas, informes o recordatorios.",
      "Definí materia, título, fecha/hora y estado para que los widgets calculen próximos vencimientos.",
      "El panel derecho muestra el detalle y métricas de los próximos 7 días.",
      "Todo queda guardado en tu planner y se puede editar o eliminar sin perder consistencia."
    ]
  },
  agenda: {
    title: "Cómo usar Agenda",
    bullets: [
      "Añadí clases desde el botón principal o importá un preset creado en Planificador.",
      "Los bloques se muestran entre 08:00 y 23:00 y validan que fin sea mayor que inicio.",
      "Podés editar o borrar una clase haciendo click en el bloque dentro de la grilla.",
      "Descargá la vista semanal en PNG o PDF para compartir tu horario."
    ]
  },
  materias: {
    title: "Cómo usar Materias",
    bullets: [
      "Elegí una carrera y seleccioná las materias desde la lista oficial.",
      "Al editar una materia, se actualiza en todos los registros asociados automáticamente.",
      "Si eliminás una materia, elegí si querés limpiar también sus clases y registros."
    ]
  },
  planificador: {
    title: "Cómo usar Planificador",
    bullets: [
      "Buscá comisiones del administrador y agregalas a un preset evitando superposiciones.",
      "Guardá, duplicá o eliminá presets para comparar escenarios sin tocar tu Agenda real.",
      "Pasá el preset a Agenda eligiendo entre agregar encima o reemplazar la agenda actual.",
      "La vista previa semanal te deja ver choques antes de aplicar cambios."
    ]
  },
  profesores: {
    title: "Cómo usar Profesores",
    bullets: [
      "Filtrá por carrera y materia para encontrar al docente correcto.",
      "Al seleccionar un profesor, mirá sus promedios por criterio y los comentarios recientes.",
      "Valorá con 0 a 5 estrellas cada criterio y opcionalmente dejá un comentario anónimo.",
      "Tus valoraciones actualizan los promedios y quedan ligadas a tu usuario."
    ]
  },
  mensajes: {
    title: "Cómo usar Mensajería",
    bullets: [
      "Enviá solicitudes de amistad con el correo institucional de la otra persona.",
      "Aceptá o rechazá solicitudes recibidas y revisá las enviadas desde el mismo panel.",
      "Solo los amigos aceptados aparecen en la lista; elegí uno para abrir el chat.",
      "El input se habilita al elegir un contacto y podés enviar mensajes en tiempo real."
    ]
  },
  perfil: {
    title: "Cómo usar Perfil",
    bullets: [
      "Actualizá tu nombre, carrera y datos básicos desde el formulario.",
      "Guardá los cambios para que queden disponibles en tu cuenta.",
      "Si necesitás cambiar la contraseña, usá el botón de seguridad para recibir el correo.",
      "Los cambios no afectan tus materias ni tus calendarios."
    ]
  }
};

function renderHelpContent(sectionId){
  const data = helpContent[sectionId] || helpContent.inicio || helpContent.estudio;
  if (helpModalTitle) helpModalTitle.textContent = data.title || "Ayuda";
  if (helpModalBody){
    helpModalBody.innerHTML = "";
    if (Array.isArray(data.bullets)){
      const ul = document.createElement("ul");
      ul.className = "help-list";
      data.bullets.forEach(b =>{
        const li = document.createElement("li");
        li.textContent = b;
        ul.appendChild(li);
      });
      const heading = document.createElement("div");
      heading.className = "help-section-title";
      heading.textContent = "Tips rápidos";
      helpModalBody.appendChild(heading);
      helpModalBody.appendChild(ul);
    } else {
      helpModalBody.textContent = "Sin ayuda disponible para esta sección.";
    }
  }
}

function openHelpModal(sectionId){
  renderHelpContent(sectionId);
  if (helpModalBg) helpModalBg.style.display = "flex";
}
function closeHelpModal(){
  if (helpModalBg) helpModalBg.style.display = "none";
}

if (helpButton) helpButton.addEventListener("click", ()=> openHelpModal(activeSection));
if (btnHelpClose) btnHelpClose.addEventListener("click", closeHelpModal);
if (helpModalBg) helpModalBg.addEventListener("click", (e)=>{ if (e.target === helpModalBg) closeHelpModal(); });

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
  if (name !== "mensajes") lastNonMessagesSection = name;
  activeSection = name;
  const tabInicio           = document.getElementById("tab-inicio");
  const tabEstudio          = document.getElementById("tab-estudio");
  const tabAcademico        = document.getElementById("tab-academico");
  const tabAgenda           = document.getElementById("tab-agenda");
  const tabMaterias         = document.getElementById("tab-materias");
  const tabPlanificador     = document.getElementById("tab-planificador");
  const tabProfesores       = document.getElementById("tab-profesores"); // NUEVO
  const tabMensajes         = document.getElementById("tab-mensajes"); // NUEVO
  const tabPerfil           = document.getElementById("tab-perfil");
  const toggleTab = (el, visible)=>{ if (el) el.style.display = visible ? "block" : "none"; };

  toggleTab(tabInicio, name === "inicio");
  toggleTab(tabEstudio, name === "estudio");
  toggleTab(tabAcademico, name === "academico");
  toggleTab(tabAgenda, name === "agenda");
  toggleTab(tabMaterias, name === "materias");
  toggleTab(tabPlanificador, name === "planificador");
  toggleTab(tabProfesores, name === "profesores"); // NUEVO
  toggleTab(tabMensajes, name === "mensajes"); // NUEVO
  toggleTab(tabPerfil, name === "perfil");

  if (name === "agenda") renderAgenda();
  if (name === "planificador") renderPlannerAll();
  if (name === "estudio") renderStudyCalendar();
  if (name === "academico") renderAcadCalendar();
  if (name === "profesores") renderProfessorsSection(); // NUEVO
  if (name === "mensajes"){
    renderFriendRequestsUI();
    renderFriendsList();
    renderMessaging();
  } // NUEVO
  if (name === "perfil") renderProfileSection();

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
  await loadUserProfile(); // NUEVO
  await loadCareerPlans();
  await loadProfessorsCatalog(); // NUEVO
  await loadFriendRequests(); // NUEVO
  await loadFriends(); // NUEVO
  await initPresence(); // NUEVO
  await ensureLastSeenPref(); // NUEVO

  initStudyNav();
  initAcademicoNav();

  renderSubjectsList();
  renderSubjectsOptions();
  await initSubjectsCareerUI();
  renderProfileSection();
  renderAgenda();

  initPlanificadorUI();
  initPresetToAgendaModalUI();
  initAcademicoModalUI();
  initProfessorsUI(); // NUEVO
  initMessagingUI(); // NUEVO

  const now = new Date();
  studyViewYear = now.getFullYear();
  studyViewMonth = now.getMonth();
  acadViewYear = now.getFullYear();
  acadViewMonth = now.getMonth();

  // auto-select today in Académico
  acadSelectedDateKey = dateKeyFromYMD(now.getFullYear(), now.getMonth()+1, now.getDate());

  renderStudyCalendar();
  renderAcadCalendar();
  showTab("inicio");
});

window.logout = async function(){
  try{
    await updatePresence(false);
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
  let removedSunday = false;

  if (snap.exists()){
    const data = snap.data();
    if (data.estudios && typeof data.estudios === "object") estudiosCache = data.estudios;
    if (Array.isArray(data.subjects)) subjects = data.subjects;
    if (data.subjectCareer && typeof data.subjectCareer === "object") plannerCareer = data.subjectCareer;
    if (data.agenda && typeof data.agenda === "object") agendaData = data.agenda;
    if (agendaData?.domingo){
      delete agendaData.domingo;
      removedSunday = true;
    }

    if (Array.isArray(data.schedulePresets)) presets = data.schedulePresets;
    if (data.activePresetId) activePresetId = data.activePresetId;

    if (data.academico && typeof data.academico === "object") academicoCache = data.academico;
  } else {
    await setDoc(ref, {
      estudios:{},
      subjects:[],
      subjectCareer:{},
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
  if (removedSunday){
    await setDoc(ref, { agenda: agendaData }, { merge:true });
  }

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

// NUEVO: Carga perfil usuario
async function loadUserProfile(){
  if (!currentUser) return;
  try{
    const snap = await getDoc(doc(db,"users",currentUser.uid));
    userProfile = snap.exists() ? snap.data() : null;
  }catch(_){
    userProfile = null;
  }
}

async function loadCareerPlans(){
  try{
    careerPlans = await getPlansIndex();
  }catch(_){
    careerPlans = [];
  }
}

// ------------------------ PERFIL ------------------------
const profileEmailEl = document.getElementById("profileEmail");
const profileFirstNameInput = document.getElementById("profileFirstName");
const profileLastNameInput = document.getElementById("profileLastName");
const profileCareerSelect = document.getElementById("profileCareer");
const profileYearInInput = document.getElementById("profileYearIn");
const profileDocumentInput = document.getElementById("profileDocument");
const profileStatusEl = document.getElementById("profileStatus");
const passwordStatusEl = document.getElementById("passwordStatus");
const btnProfileSave = document.getElementById("btnProfileSave");
const btnPasswordReset = document.getElementById("btnPasswordReset");

function renderCareerOptions(selectEl, selectedSlug){
  if (!selectEl) return;
  selectEl.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Seleccioná una carrera";
  selectEl.appendChild(placeholder);

  const sorted = Array.from(careerPlans || []).sort((a,b)=> normalizeStr(a.nombre) < normalizeStr(b.nombre) ? -1 : 1);
  sorted.forEach(plan => {
    const opt = document.createElement("option");
    opt.value = plan.slug;
    opt.textContent = plan.nombre;
    selectEl.appendChild(opt);
  });

  if (selectedSlug){
    selectEl.value = selectedSlug;
  } else {
    placeholder.selected = true;
  }
}

function renderProfileSection(){
  if (!currentUser) return;
  if (profileEmailEl) profileEmailEl.textContent = currentUser.email || userProfile?.email || "—";

  const plan = userProfile?.careerSlug
    ? (careerPlans || []).find(p => p.slug === userProfile.careerSlug)
    : (userProfile?.career ? findPlanByName(userProfile.career) : null);
  const selectedSlug = plan?.slug || userProfile?.careerSlug || "";

  renderCareerOptions(profileCareerSelect, selectedSlug);

  if (profileFirstNameInput) profileFirstNameInput.value = userProfile?.firstName || "";
  if (profileLastNameInput) profileLastNameInput.value = userProfile?.lastName || "";
  if (profileYearInInput) profileYearInInput.value = userProfile?.yearIn || "";
  if (profileDocumentInput){
    profileDocumentInput.value = userProfile?.documento || userProfile?.dni || userProfile?.legajo || "";
  }
  setProfileStatus(profileStatusEl, "");
  setProfileStatus(passwordStatusEl, "");
}

function setProfileStatus(target, message){
  if (target) target.textContent = message || "";
}

if (btnProfileSave){
  btnProfileSave.addEventListener("click", async ()=>{
    if (!currentUser) return;
    const firstName = profileFirstNameInput?.value.trim() || "";
    const lastName = profileLastNameInput?.value.trim() || "";
    const name = `${firstName} ${lastName}`.trim();
    const careerSlug = profileCareerSelect?.value || "";
    const plan = careerSlug ? (careerPlans || []).find(p => p.slug === careerSlug) : null;
    const careerName = plan?.nombre || userProfile?.career || "";
    const yearRaw = profileYearInInput?.value.trim() || "";
    const yearIn = yearRaw ? parseInt(yearRaw, 10) : "";
    const documento = profileDocumentInput?.value.trim() || "";

    if (yearRaw && (!Number.isFinite(yearIn) || yearIn < 1900 || yearIn > 2100)){
      notifyWarn("El año de ingreso debe ser un número válido.");
      setProfileStatus(profileStatusEl, "Revisá el año de ingreso.");
      return;
    }

    try{
      await setDoc(doc(db, "users", currentUser.uid), {
        firstName,
        lastName,
        name,
        career: careerSlug ? careerName : "",
        careerSlug,
        yearIn: yearIn || "",
        documento,
        dni: documento,
        legajo: documento
      }, { merge:true });
      userProfile = {
        ...(userProfile || {}),
        firstName,
        lastName,
        name,
        career: careerSlug ? careerName : "",
        careerSlug,
        yearIn: yearIn || "",
        documento,
        dni: documento,
        legajo: documento
      };
      notifySuccess("Perfil actualizado.");
      setProfileStatus(profileStatusEl, "Cambios guardados correctamente.");
    }catch(e){
      notifyError("No se pudo guardar el perfil.");
      setProfileStatus(profileStatusEl, "No se pudo guardar. Intentá nuevamente.");
    }
  });
}

if (btnPasswordReset){
  btnPasswordReset.addEventListener("click", async ()=>{
    if (!currentUser || !currentUser.email) return;
    const ok = await showConfirm({
      title:"Cambiar contraseña",
      message:`Te enviaremos un correo a ${currentUser.email} para cambiar la contraseña.`,
      confirmText:"Enviar correo",
      cancelText:"Cancelar"
    });
    if (!ok) return;
    try{
      await sendPasswordResetEmail(auth, currentUser.email);
      notifySuccess("Correo enviado para cambiar la contraseña.");
      setProfileStatus(passwordStatusEl, "Correo enviado. Revisá tu bandeja.");
    }catch(e){
      notifyError("No se pudo enviar el correo.");
      setProfileStatus(passwordStatusEl, "No se pudo enviar el correo. Intentá más tarde.");
    }
  });
}

function ensureAgendaStructure(){
  if (!agendaData || typeof agendaData !== "object") agendaData = {};
  Object.keys(agendaData).forEach(k => {
    if (!dayKeys.includes(k)) delete agendaData[k];
  });
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
  grid.style.gridTemplateColumns = `70px repeat(${dayKeys.length},1fr)`;

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
      block.style.background = `linear-gradient(135deg, ${color}, ${themeColor("--color-accent-2", "#CBBF74")})`;
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

async function ensureHtml2canvas(){
  if (html2canvasLib) return html2canvasLib;
  try{
    const mod = await import("https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/+esm");
    html2canvasLib = mod.default || mod;
    return html2canvasLib;
  }catch(_e){}
  await loadRemoteScript("https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js");
  html2canvasLib = window.html2canvas;
  if (!html2canvasLib) throw new Error("html2canvas no disponible");
  return html2canvasLib;
}

async function ensureJsPDF(){
  if (jsPDFLib) return jsPDFLib;
  try{
    const mod = await import("https://cdn.jsdelivr.net/npm/jspdf@2.5.1/+esm");
    jsPDFLib = mod.jsPDF || mod.default?.jsPDF || mod.default;
    return jsPDFLib;
  }catch(_e){}
  await loadRemoteScript("https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js");
  jsPDFLib = window.jspdf?.jsPDF || window.jspdf?.default?.jsPDF;
  if (!jsPDFLib) throw new Error("jsPDF no disponible");
  return jsPDFLib;
}

async function downloadAgenda(format){
  const captureEl = document.getElementById("tab-agenda");
  if (!captureEl || captureEl.style.display === "none"){
    notifyWarn("Abrí la pestaña Agenda para descargar tu horario.");
    return;
  }
  try{
    renderAgenda();
    captureEl.scrollTop = 0;
    await new Promise(res => requestAnimationFrame(()=> requestAnimationFrame(res)));
    const html2canvas = await ensureHtml2canvas();
    const canvas = await html2canvas(captureEl, {
      backgroundColor: themeColor("--color-primary-strong", "#0F1A18"),
      scale:2,
      useCORS:true
    });

    if (format === "png"){
      const link = document.createElement("a");
      link.href = canvas.toDataURL("image/png");
      link.download = "horario.png";
      link.click();
      notifySuccess("Horario descargado en PNG.");
      return;
    }

    const jsPDF = await ensureJsPDF();
    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF({ orientation:"landscape", unit:"pt", format:"a4" });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 30;
    let renderWidth = pageWidth - margin * 2;
    let renderHeight = canvas.height * (renderWidth / canvas.width);
    if (renderHeight > pageHeight - margin * 2){
      renderHeight = pageHeight - margin * 2;
      renderWidth = canvas.width * (renderHeight / canvas.height);
    }
    const posX = (pageWidth - renderWidth) / 2;
    const posY = (pageHeight - renderHeight) / 2;
    pdf.addImage(imgData, "PNG", posX, posY, renderWidth, renderHeight);
    pdf.save("horario.pdf");
    notifySuccess("Horario descargado en PDF.");
  }catch(e){
    notifyError("No se pudo generar la descarga: " + (e.message || e));
  }
}

function loadRemoteScript(url){
  return new Promise((resolve, reject)=>{
    const script = document.createElement("script");
    script.src = url;
    script.async = true;
    script.onload = ()=> resolve();
    script.onerror = ()=> reject(new Error("No se pudo cargar " + url));
    document.head.appendChild(script);
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
function dateFromLocal(dtLocal){
  const p = dtLocalToParts(dtLocal);
  if (!p) return null;
  return new Date(p.y, p.m-1, p.d, p.hh, p.mm, 0, 0);
}
function escapeHtml(s){
  return (s || "").toString()
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

// NUEVO: Helpers profesores
function renderStars(value){
  const val = Math.round(value || 0);
  let html = "";
  for (let i=1; i<=5; i++){
    const cls = i <= val ? "star full" : "star";
    html += `<span class="${cls}">★</span>`;
  }
  return html;
}
function formatDecimal(val){
  return (typeof val === "number" ? val : 0).toFixed(1);
}
function currentUserDisplayName(){
  if (userProfile && (userProfile.name || userProfile.fullName)) return userProfile.name || userProfile.fullName;
  if (userProfile && userProfile.email) return userProfile.email;
  if (currentUser && currentUser.email) return currentUser.email;
  return "Estudiante";
}

function subjectColor(name){
  const s = subjects.find(x => x.name === name);
  return (s && s.color) ? s.color : defaultSubjectColor();
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
const subjectCareerSelect = document.getElementById("subjectCareer");
const subjectNameSelect = document.getElementById("subjectNameSelect");
const subjectColorInput = document.getElementById("subjectColor");
const subjectFormTitle = document.getElementById("subjectFormTitle");
const subjectPlanHint = document.getElementById("subjectPlanHint");
const btnSubjectSave = document.getElementById("btnSubjectSave");
const btnSubjectReset = document.getElementById("btnSubjectReset");

function resolvedCareerFromProfile(){
  if (plannerCareer && plannerCareer.slug) return plannerCareer;
  if (userProfile && userProfile.careerSlug){
    return { slug: userProfile.careerSlug, name: userProfile.career || userProfile.careerSlug };
  }
  if (userProfile && userProfile.career){
    const plan = findPlanByName(userProfile.career);
    if (plan) return { slug: plan.slug, name: plan.nombre };
  }
  return { slug:"", name:"" };
}

function updateSubjectPlanHint(){
  if (!subjectPlanHint) return;
  if (!plannerCareer || !plannerCareer.slug){
    subjectPlanHint.textContent = "Seleccioná una carrera para ver sus materias.";
    return;
  }
  const count = careerSubjects.length;
  subjectPlanHint.textContent = `Materias de ${plannerCareer.name || "la carrera"} (${count}).`;
}

function renderSubjectCareerOptions(){
  if (!subjectCareerSelect) return;
  subjectCareerSelect.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Seleccioná una carrera";
  placeholder.disabled = true;
  subjectCareerSelect.appendChild(placeholder);

  const sorted = Array.from(careerPlans || []).sort((a,b)=> normalizeStr(a.nombre) < normalizeStr(b.nombre) ? -1 : 1);
  sorted.forEach(plan => {
    const opt = document.createElement("option");
    opt.value = plan.slug;
    opt.textContent = plan.nombre;
    subjectCareerSelect.appendChild(opt);
  });

  const resolved = resolvedCareerFromProfile();
  const target = resolved.slug || "";
  if (target){
    subjectCareerSelect.value = target;
    if (!plannerCareer.slug) plannerCareer = { slug: target, name: resolved.name };
  } else {
    placeholder.selected = true;
  }
}

async function setActiveCareer(slug, persist){
  if (!slug){
    plannerCareer = { slug:"", name:"" };
    careerSubjects = [];
    renderSubjectNameOptions();
    updateSubjectPlanHint();
    return;
  }
  const plan = (careerPlans || []).find(p => p.slug === slug);
  plannerCareer = { slug, name: plan?.nombre || slug };
  try{
    const data = await getPlanWithSubjects(slug);
    careerSubjects = Array.isArray(data.subjects) ? data.subjects : [];
  }catch(_){
    careerSubjects = [];
    notifyWarn("No se pudieron cargar las materias de la carrera.");
  }
  renderSubjectNameOptions();
  updateSubjectPlanHint();
  if (persist && currentUser){
    await setDoc(doc(db, "planner", currentUser.uid), { subjectCareer: plannerCareer }, { merge:true });
  }
}

function renderSubjectNameOptions(selectedName=""){
  if (!subjectNameSelect) return;
  subjectNameSelect.innerHTML = "";

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = plannerCareer?.slug ? "Seleccioná una materia" : "Seleccioná una carrera primero";
  placeholder.disabled = true;
  subjectNameSelect.appendChild(placeholder);

  const planSubjects = Array.isArray(careerSubjects) ? careerSubjects.map(s => ({
    name: s.nombre || s.name || s.id || "Materia",
    semester: s.semestre || s.semester || 0
  })) : [];

  if (plannerCareer?.slug && planSubjects.length){
    const group = document.createElement("optgroup");
    group.label = `Materias de ${plannerCareer.name || "la carrera"}`;
    planSubjects.sort((a,b)=>{
      if (a.semester !== b.semester) return (a.semester || 0) - (b.semester || 0);
      return normalizeStr(a.name) < normalizeStr(b.name) ? -1 : 1;
    }).forEach(item => {
      const opt = document.createElement("option");
      opt.value = item.name;
      opt.textContent = item.semester ? `S${item.semester} · ${item.name}` : item.name;
      group.appendChild(opt);
    });
    subjectNameSelect.appendChild(group);
  }

  const existing = subjects
    .map(s => s.name)
    .filter(name => name)
    .filter(name => !planSubjects.some(ps => normalizeStr(ps.name) === normalizeStr(name)));

  if (existing.length){
    const group = document.createElement("optgroup");
    group.label = "Materias existentes";
    existing.sort((a,b)=> normalizeStr(a) < normalizeStr(b) ? -1 : 1).forEach(name => {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      group.appendChild(opt);
    });
    subjectNameSelect.appendChild(group);
  }

  if (selectedName){
    subjectNameSelect.value = selectedName;
  } else {
    placeholder.selected = true;
  }
}

async function initSubjectsCareerUI(){
  renderSubjectCareerOptions();
  const slug = subjectCareerSelect?.value || "";
  if (slug){
    await setActiveCareer(slug, false);
  } else {
    renderSubjectNameOptions();
    updateSubjectPlanHint();
  }
}

if (subjectCareerSelect){
  subjectCareerSelect.addEventListener("change", async (e)=>{
    const slug = e.target.value;
    await setActiveCareer(slug, true);
  });
}

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
    dot.style.background = s.color || defaultSubjectColor();

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
  renderSubjectNameOptions(s.name);
  subjectColorInput.value = s.color || defaultSubjectColor();
  subjectFormTitle.textContent = "Editar materia";
}

btnSubjectReset.onclick = () => {
  editingSubjectIndex = -1;
  renderSubjectNameOptions();
  subjectColorInput.value = defaultSubjectColor();
  subjectFormTitle.textContent = "Nueva materia";
};

btnSubjectSave.onclick = async () => {
  if (!currentUser) return;
  const name = (subjectNameSelect?.value || "").trim();
  const color = subjectColorInput.value || defaultSubjectColor();
  if (!name){
    notifyWarn("Seleccioná una materia.");
    return;
  }

  if (editingSubjectIndex === -1){
    if (subjects.some(s => s.name.toLowerCase() === name.toLowerCase())){
      notifyWarn("Ya existe una materia con ese nombre.");
      return;
    }
    subjects.push({ name, color });
  } else {
    if (subjects.some((s, i) => i !== editingSubjectIndex && s.name.toLowerCase() === name.toLowerCase())){
      notifyWarn("Ya existe una materia con ese nombre.");
      return;
    }
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
  if (plannerCareer && plannerCareer.slug) data.subjectCareer = plannerCareer;
  data.estudios = estudiosCache;
  data.agenda = agendaData;
  data.academico = academicoCache;
  await setDoc(ref, data);

  editingSubjectIndex = -1;
  renderSubjectNameOptions();
  subjectColorInput.value = defaultSubjectColor();
  subjectFormTitle.textContent = "Nueva materia";

  renderSubjectsList();
  renderSubjectNameOptions();
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
  if (plannerCareer && plannerCareer.slug) data.subjectCareer = plannerCareer;
  data.estudios = estudiosCache;
  data.agenda = agendaData;
  data.academico = academicoCache;
  await setDoc(ref, data);

  editingSubjectIndex = -1;
  renderSubjectNameOptions();
  subjectColorInput.value = defaultSubjectColor();
  subjectFormTitle.textContent = "Nueva materia";

  renderSubjectsList();
  renderSubjectNameOptions();
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
const btnAcadAddGlobal = document.getElementById("btnAcadAddGlobal");
const acadWidgetsBox = document.getElementById("acadWidgets");
const acadNext7Box = document.getElementById("acadNext7");

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
  if (btnAcadAddGlobal){
    btnAcadAddGlobal.addEventListener("click", ()=>{
      const now = new Date();
      const fallbackKey = dateKeyFromYMD(now.getFullYear(), now.getMonth()+1, now.getDate());
      openAcadModalForDate(acadSelectedDateKey || fallbackKey, -1);
    });
  }
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
  const selectedKey = acadSelectedDateKey || todayKey;
  acadSelectedDateKey = selectedKey;

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
    card.dataset.dateKey = dateKey;
    if (dateKey === todayKey) card.classList.add("is-today");
    if (dateKey === acadSelectedDateKey) card.classList.add("is-selected");

    const head = document.createElement("div");
    head.className = "day-number";
    head.innerHTML = `<span>${d}</span><span class="today-dot"></span>`;
    card.appendChild(head);

    const items = Array.isArray(academicoCache?.[dateKey]) ? academicoCache[dateKey] : [];
    items.sort((a,b)=> (a.cuando || a.when || "").localeCompare(b.cuando || b.when || ""));

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
      highlightAcadSelection(dateKey);
      openAcadDetail(dateKey);
    });

    acadGrid.appendChild(card);
  }

  highlightAcadSelection(acadSelectedDateKey);
  openAcadDetail(acadSelectedDateKey || todayKey);
}

function highlightAcadSelection(dateKey){
  if (!acadGrid) return;
  acadGrid.querySelectorAll(".day").forEach(card =>{
    if (!card.dataset.dateKey) return;
    card.classList.toggle("is-selected", card.dataset.dateKey === dateKey);
  });
}

function openAcadDetail(dateKey){
  const parts = ymdFromDateKey(dateKey);
  if (!parts){
    acadDetailBox.style.display = "none";
    return;
  }

  acadSelectedDateKey = dateKey;
  highlightAcadSelection(dateKey);

  acadDetailTitle.textContent = "Detalle del " + parts.d + "/" + parts.m;
  acadDetailSub.textContent = "Año " + parts.y;
  const items = Array.isArray(academicoCache?.[dateKey]) ? academicoCache[dateKey].slice() : [];
  items.sort((a,b)=> (a.cuando || a.when || "").localeCompare(b.cuando || b.when || ""));

  acadDetailCount.textContent = String(items.length);
  acadDetailList.innerHTML = "";
  acadDetailBox.style.display = "block";

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

  if (!items.length){
    const empty = document.createElement("div");
    empty.className = "acad-detail-empty";
    empty.textContent = "No hay items para esta fecha. Usá “Añadir” para crear uno.";
    acadDetailList.appendChild(empty);
  }

  updateAcadWidgets();
}

function updateAcadWidgets(){
  if (!acadWidgetsBox || !acadNext7Box) return;
  const items = [];
  Object.keys(academicoCache || {}).forEach(dateKey =>{
    const arr = Array.isArray(academicoCache[dateKey]) ? academicoCache[dateKey] : [];
    arr.forEach(item =>{
      const d = dateFromLocal(item.cuando || item.when || "");
      if (d && !isNaN(d)) items.push({ ...item, _date:d, _dateKey:dateKey });
    });
  });

  const now = new Date();
  const limit30 = new Date(now); limit30.setDate(limit30.getDate() + 30);
  const back30 = new Date(now); back30.setDate(back30.getDate() - 30);
  const limit7 = new Date(now); limit7.setDate(limit7.getDate() + 7);

  const fmtLabel = (it)=>{
    const parts = dtLocalToParts(it?.cuando || it?.when || "");
    return parts ? fmtShortDateTimeFromParts(parts) : "—";
  };

  const pending = items
    .filter(it => (it.estado || "pending") !== "done" && it._date >= now)
    .sort((a,b)=> a._date - b._date);
  const next = pending[0];

  const pending30 = items.filter(it =>
    (it.estado || "pending") !== "done" && it._date >= now && it._date <= limit30
  ).length;
  const done30 = items.filter(it =>
    (it.estado || "pending") === "done" && it._date >= back30 && it._date <= limit30
  ).length;

  acadWidgetsBox.innerHTML =
    "• Próximo vencimiento: <strong>" + (next ? (fmtLabel(next) + " · " + escapeHtml(next.titulo || next.tipo || "")) : "—") + "</strong><br/>" +
    "• Pendientes (30 días): <strong>" + pending30 + "</strong><br/>" +
    "• Hechos (30 días): <strong>" + done30 + "</strong>";

  const next7 = items
    .filter(it => it._date >= now && it._date <= limit7)
    .sort((a,b)=> a._date - b._date)
    .slice(0, 10);

  acadNext7Box.innerHTML = "";
  if (!next7.length){
    acadNext7Box.textContent = "—";
  } else {
    next7.forEach(it =>{
      const row = document.createElement("div");
      row.className = "acad-next-row";
      row.textContent = fmtLabel(it) + " · " + (it.tipo || "Item") + " · " + (it.titulo || it.materia || "");
      acadNext7Box.appendChild(row);
    });
  }
}

function openAcadModalForDate(dateKey, index){
  const parts = ymdFromDateKey(dateKey);
  if (!parts) return;

  acadEditing = { dateKey, index };
  acadSelectedDateKey = dateKey;
  highlightAcadSelection(dateKey);
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

  try{
    const ref = doc(db, "planner", currentUser.uid);
    const snap = await getDoc(ref);
    let data = snap.exists() ? snap.data() : {};
    if (!data.academico) data.academico = {};
    if (!Array.isArray(data.academico[dateKey])) data.academico[dateKey] = [];

    if (index >= 0) data.academico[dateKey][index] = item;
    else data.academico[dateKey].push(item);

    await setDoc(ref, data);
    academicoCache = data.academico || {};
    acadSelectedDateKey = dateKey;
    renderAcadCalendar();
    openAcadDetail(dateKey);
    document.getElementById("acadModalBg").style.display = "none";
    notifySuccess("Académico guardado.");
  }catch(e){
    notifyError("No se pudo guardar en Académico: " + (e.message || e));
  }
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

  try{
    const ref = doc(db, "planner", currentUser.uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    const data = snap.data() || {};
    if (!Array.isArray(data.academico?.[dateKey])) return;

    data.academico[dateKey].splice(index,1);
    if (!data.academico[dateKey].length) delete data.academico[dateKey];

    await setDoc(ref, data);
    academicoCache = data.academico || {};
    acadSelectedDateKey = dateKey;
    renderAcadCalendar();
    openAcadDetail(dateKey);
    document.getElementById("acadModalBg").style.display = "none";
    notifySuccess("Item eliminado.");
  }catch(e){
    notifyError("No se pudo eliminar: " + (e.message || e));
  }
});

// ------------------------ AGENDA ------------------------
const agendaGrid = document.getElementById("agendaGrid");
const agendaModalBg = document.getElementById("agendaModalBg");
const agendaModalTitle = document.getElementById("agendaModalTitle");
const btnAddClass = document.getElementById("btnAddClass");
const btnDownloadAgendaPng = document.getElementById("btnDownloadAgendaPng");
const btnDownloadAgendaPdf = document.getElementById("btnDownloadAgendaPdf");
const btnAgendaCancel = document.getElementById("btnAgendaCancel");
const btnAgendaDelete = document.getElementById("btnAgendaDelete");
const btnAgendaSave = document.getElementById("btnAgendaSave");

btnAddClass.addEventListener("click", ()=> openAgendaModal(null, null));
if (btnDownloadAgendaPng) btnDownloadAgendaPng.addEventListener("click", ()=> downloadAgenda("png"));
if (btnDownloadAgendaPdf) btnDownloadAgendaPdf.addEventListener("click", ()=> downloadAgenda("pdf"));

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
    const validDays = (sec.days || []).filter(d => dayNameToKey(d.day));
    validDays.forEach(d=>{
      const pill = document.createElement("span");
      pill.className = "pill";
      const sedeDia = d.campus || sec.campus || "";
      pill.textContent = (d.day || "—") + " " + (d.start || "??") + "–" + (d.end || "??") + (sedeDia ? (" · " + sedeDia) : "");
      days.appendChild(pill);
    });
    if (!validDays.length){
      const pill = document.createElement("span");
      pill.className = "pill pill-muted";
      pill.textContent = "Sin días cargados (Lun a Sáb)";
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
    const validDays = (sec.days || []).filter(d => dayNameToKey(d.day));
    validDays.forEach(d=>{
      const pill = document.createElement("span");
      pill.className = "pill";
      const sedeDia = d.campus || sec.campus || "";
      pill.textContent = (d.day || "—") + " " + (d.start || "??") + "–" + (d.end || "??") + (sedeDia ? (" · " + sedeDia) : "");
      days.appendChild(pill);
    });
    if (!validDays.length){
      const pill = document.createElement("span");
      pill.className = "pill pill-muted";
      pill.textContent = "Sin días cargados (Lun a Sáb)";
      days.appendChild(pill);
    }

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

// ------------------------ PROFESORES (NUEVO) ------------------------
async function loadProfessorsCatalog(){
  professorsCatalog = [];
  professorReviewsCache = {};
  try{
    const snap = await getDocs(query(collection(db,"professors"), where("active","==", true)));
    snap.forEach(d =>{
      const data = d.data() || {};
      professorsCatalog.push({
        id: d.id,
        name: data.name || "",
        careers: Array.isArray(data.careers) ? data.careers : [],
        subjects: Array.isArray(data.subjects) ? data.subjects : [],
        avgGeneral: typeof data.avgGeneral === "number" ? data.avgGeneral : 0,
        avgTeaching: typeof data.avgTeaching === "number" ? data.avgTeaching : 0,
        avgExams: typeof data.avgExams === "number" ? data.avgExams : 0,
        avgTreatment: typeof data.avgTreatment === "number" ? data.avgTreatment : 0,
        ratingCount: data.ratingCount || 0,
        commentsCount: data.commentsCount || 0
      });
    });
  }catch(e){
    notifyError("No se pudieron cargar profesores: " + (e.message || e));
    professorsCatalog = [];
  }
  renderProfessorsSection();
}

function initProfessorsUI(){
  const selCareer = document.getElementById("profFilterCareer");
  const selSubject = document.getElementById("profFilterSubject");
  if (selCareer){
    selCareer.addEventListener("change", ()=>{
      professorFilters.career = selCareer.value;
      renderProfessorsSection();
    });
  }
  if (selSubject){
    selSubject.addEventListener("change", ()=>{
      professorFilters.subject = selSubject.value;
      renderProfessorsSection();
    });
  }

  [
    { input:"rateTeaching", label:"labelRateTeaching" },
    { input:"rateExams", label:"labelRateExams" },
    { input:"rateTreatment", label:"labelRateTreatment" }
  ].forEach(({input,label})=>{
    const el = document.getElementById(input);
    const lab = document.getElementById(label);
    if (el && lab){
      lab.textContent = (el.value || 0) + " ★";
      el.addEventListener("input", ()=>{ lab.textContent = (el.value || 0) + " ★"; });
    }
  });

  const btn = document.getElementById("btnSubmitRating");
  if (btn) btn.addEventListener("click", submitProfessorRating);
}

function renderProfessorsSection(){
  renderProfessorsFilters();
  renderProfessorsList();
  renderProfessorDetail();
}

function renderProfessorsFilters(){
  const selCareer = document.getElementById("profFilterCareer");
  const selSubject = document.getElementById("profFilterSubject");

  const careers = new Set();
  const subjectsSet = new Set();
  professorsCatalog.forEach(p=>{
    (p.careers || []).forEach(c=> careers.add(c));
    (p.subjects || []).forEach(s=> subjectsSet.add(s));
  });

  if (selCareer){
    const existing = Array.from(careers).map(normalizeStr);
    if (professorFilters.career && !existing.includes(normalizeStr(professorFilters.career))){
      professorFilters.career = "";
    }
    selCareer.innerHTML = "";
    const optAll = document.createElement("option");
    optAll.value = "";
    optAll.textContent = "Todas las carreras";
    selCareer.appendChild(optAll);
    Array.from(careers).sort((a,b)=> normalizeStr(a) < normalizeStr(b) ? -1 : 1).forEach(c=>{
      const opt = document.createElement("option");
      opt.value = c;
      opt.textContent = c;
      if (professorFilters.career && normalizeStr(professorFilters.career) === normalizeStr(c)) opt.selected = true;
      selCareer.appendChild(opt);
    });
  }

  if (selSubject){
    const existing = Array.from(subjectsSet).map(normalizeStr);
    if (professorFilters.subject && !existing.includes(normalizeStr(professorFilters.subject))){
      professorFilters.subject = "";
    }
    selSubject.innerHTML = "";
    const optAllS = document.createElement("option");
    optAllS.value = "";
    optAllS.textContent = "Todas las materias";
    selSubject.appendChild(optAllS);
    Array.from(subjectsSet).sort((a,b)=> normalizeStr(a) < normalizeStr(b) ? -1 : 1).forEach(s=>{
      const opt = document.createElement("option");
      opt.value = s;
      opt.textContent = s;
      if (professorFilters.subject && normalizeStr(professorFilters.subject) === normalizeStr(s)) opt.selected = true;
      selSubject.appendChild(opt);
    });
  }
}

function renderProfessorsList(){
  const list = document.getElementById("professorsList");
  if (!list) return;
  list.innerHTML = "";

  let filtered = professorsCatalog.slice();
  if (professorFilters.career){
    filtered = filtered.filter(p => Array.isArray(p.careers) && p.careers.some(c => normalizeStr(c) === normalizeStr(professorFilters.career)));
  }
  if (professorFilters.subject){
    filtered = filtered.filter(p => Array.isArray(p.subjects) && p.subjects.some(s => normalizeStr(s) === normalizeStr(professorFilters.subject)));
  }

  filtered.sort((a,b)=>{
    if (b.avgGeneral !== a.avgGeneral) return b.avgGeneral - a.avgGeneral;
    return normalizeStr(a.name) < normalizeStr(b.name) ? -1 : 1;
  });

  if (!filtered.length){
    const div = document.createElement("div");
    div.className = "small-muted";
    div.textContent = "No hay profesores activos para los filtros elegidos.";
    list.appendChild(div);
    selectedProfessorId = null;
    resetRatingForm();
    return;
  }

  if (!selectedProfessorId || !filtered.some(p => p.id === selectedProfessorId)){
    selectedProfessorId = filtered[0].id;
    loadProfessorReviews(selectedProfessorId).then(()=>{
      renderProfessorDetail();
      fillRatingFormFromMyReview(selectedProfessorId);
    });
  }

  filtered.forEach(p=>{
    const card = document.createElement("div");
    card.className = "prof-card" + (p.id === selectedProfessorId ? " active" : "");

    const row = document.createElement("div");
    row.className = "prof-card-row";

    const title = document.createElement("div");
    title.className = "prof-card-title";
    title.textContent = p.name || "Profesor";

    const score = document.createElement("div");
    score.className = "stars";
    score.innerHTML = renderStars(p.avgGeneral) + `<span class="prof-badge">${formatDecimal(p.avgGeneral)} ★</span>`;

    row.appendChild(title);
    row.appendChild(score);

    const meta = document.createElement("div");
    meta.className = "prof-card-meta";
    meta.textContent = `${p.ratingCount || 0} valoraciones · ${p.commentsCount || 0} comentarios`;

    const badges = document.createElement("div");
    badges.className = "prof-badges";
    const subjectsLabel = document.createElement("span");
    subjectsLabel.className = "prof-badge";
    subjectsLabel.textContent = (p.subjects || []).join(" · ") || "Sin materias";
    const careersLabel = document.createElement("span");
    careersLabel.className = "prof-badge";
    careersLabel.textContent = (p.careers || []).join(" · ") || "Sin carreras";
    badges.appendChild(subjectsLabel);
    badges.appendChild(careersLabel);

    card.appendChild(row);
    card.appendChild(meta);
    card.appendChild(badges);

    card.addEventListener("click", ()=>{
      selectedProfessorId = p.id;
      renderProfessorsList();
      renderProfessorDetail();
      loadProfessorReviews(p.id).then(()=>{
        renderProfessorDetail();
        fillRatingFormFromMyReview(p.id);
      });
    });

    list.appendChild(card);
  });
}

function resetRatingForm(){
  const ids = [
    { input:"rateTeaching", label:"labelRateTeaching" },
    { input:"rateExams", label:"labelRateExams" },
    { input:"rateTreatment", label:"labelRateTreatment" }
  ];
  ids.forEach(({input,label})=>{
    const el = document.getElementById(input);
    const lab = document.getElementById(label);
    if (el){ el.value = 0; }
    if (lab){ lab.textContent = "0 ★"; }
  });
  const comment = document.getElementById("rateComment");
  const anon = document.getElementById("rateAnonymous");
  if (comment) comment.value = "";
  if (anon) anon.checked = false;
}

function renderProfessorDetail(){
  const box = document.getElementById("profDetailBox");
  if (!box) return;

  if (!selectedProfessorId){
    box.innerHTML = `<div class="small-muted">Seleccioná un profesor para ver detalle y comentarios.</div>`;
    resetRatingForm();
    return;
  }

  const prof = professorsCatalog.find(p => p.id === selectedProfessorId);
  if (!prof){
    box.innerHTML = `<div class="small-muted">Profesor no encontrado.</div>`;
    return;
  }

  const reviewsData = professorReviewsCache[selectedProfessorId];
  const comments = (reviewsData?.items || []).filter(r => (r.comment || "").trim().length);
  const loading = reviewsData?.loading;

  const detail = document.createElement("div");
  detail.className = "prof-detail-card";

  const head = document.createElement("div");
  head.className = "prof-detail-head";

  const left = document.createElement("div");
  const nameEl = document.createElement("div");
  nameEl.className = "prof-detail-name";
  nameEl.textContent = prof.name || "Profesor";
  const meta = document.createElement("div");
  meta.className = "prof-detail-meta";
  meta.textContent = `Carreras: ${(prof.careers || []).join(", ") || "—"} · Materias: ${(prof.subjects || []).join(", ") || "—"}`;
  left.appendChild(nameEl);
  left.appendChild(meta);

  const right = document.createElement("div");
  right.className = "prof-score";
  right.innerHTML = `
    <div class="prof-score-big">${formatDecimal(prof.avgGeneral)} ★</div>
    <div class="stars">${renderStars(prof.avgGeneral)}</div>
    <div class="small-muted">${prof.ratingCount || 0} valoraciones en total</div>
  `;

  head.appendChild(left);
  head.appendChild(right);

  const grid = document.createElement("div");
  grid.className = "prof-criteria-grid";
  const criteria = [
    { label:"Calidad de enseñanza", value: prof.avgTeaching },
    { label:"Dificultad de parciales", value: prof.avgExams },
    { label:"Trato con estudiantes", value: prof.avgTreatment }
  ];
  criteria.forEach(c =>{
    const card = document.createElement("div");
    card.className = "prof-criteria";
    const ttl = document.createElement("div");
    ttl.textContent = c.label;
    const stars = document.createElement("div");
    stars.className = "stars";
    stars.innerHTML = renderStars(c.value) + `<span class="prof-badge">${formatDecimal(c.value)} ★</span>`;
    card.appendChild(ttl);
    card.appendChild(stars);
    grid.appendChild(card);
  });

  const commentsWrap = document.createElement("div");
  commentsWrap.className = "prof-comments";

  const commentsTitle = document.createElement("h4");
  commentsTitle.textContent = `Comentarios (${comments.length})`;
  commentsWrap.appendChild(commentsTitle);

  if (loading){
    const div = document.createElement("div");
    div.className = "small-muted";
    div.textContent = "Cargando reseñas...";
    commentsWrap.appendChild(div);
  } else if (!comments.length){
    const div = document.createElement("div");
    div.className = "small-muted";
    div.textContent = "Todavía no hay comentarios para este profesor.";
    commentsWrap.appendChild(div);
  } else {
    comments.forEach(c =>{
      const card = document.createElement("div");
      card.className = "prof-comment";
      const headC = document.createElement("div");
      headC.className = "prof-comment-head";
      const who = document.createElement("div");
      who.textContent = c.anonymous ? "Anónimo" : (c.authorName || "Estudiante");
      const score = document.createElement("div");
      const avgLocal = (c.teachingQuality + c.examDifficulty + c.studentTreatment) / 3;
      score.innerHTML = `<div class="stars">${renderStars(avgLocal)}</div><div class="small-muted">${formatDecimal(avgLocal)} ★</div>`;
      headC.appendChild(who);
      headC.appendChild(score);
      const body = document.createElement("div");
      body.style.marginTop = ".35rem";
      body.textContent = c.comment || "";
      card.appendChild(headC);
      card.appendChild(body);
      commentsWrap.appendChild(card);
    });
  }

  detail.appendChild(head);
  detail.appendChild(grid);
  detail.appendChild(commentsWrap);
  box.innerHTML = "";
  box.appendChild(detail);
}

async function loadProfessorReviews(profId){
  if (!profId) return;
  professorReviewsCache[profId] = { loading:true, items:[] };
  try{
    const snap = await getDocs(query(collection(db,"professorReviews"), where("professorId","==", profId)));
    const items = [];
    snap.forEach(d =>{
      const data = d.data() || {};
      const createdAt = data.createdAt && typeof data.createdAt.toMillis === "function" ? data.createdAt.toMillis() : null;
      items.push({
        id: d.id,
        professorId: profId,
        userId: data.userId || "",
        teachingQuality: Number(data.teachingQuality || 0),
        examDifficulty: Number(data.examDifficulty || 0),
        studentTreatment: Number(data.studentTreatment || 0),
        comment: data.comment || "",
        anonymous: !!data.anonymous,
        authorName: data.authorName || "",
        createdAt
      });
    });
    items.sort((a,b)=> (b.createdAt || 0) - (a.createdAt || 0));
    professorReviewsCache[profId] = { loading:false, items };
  }catch(e){
    professorReviewsCache[profId] = { loading:false, items:[] };
    notifyError("No se pudieron cargar reseñas: " + (e.message || e));
  }
}

function fillRatingFormFromMyReview(profId){
  const cache = professorReviewsCache[profId];
  if (!cache || !Array.isArray(cache.items)) return;
  const mine = cache.items.find(r => r.userId === (currentUser?.uid || ""));
  const apply = (id, labelId, value)=>{
    const el = document.getElementById(id);
    const lab = document.getElementById(labelId);
    if (el){ el.value = value; }
    if (lab){ lab.textContent = value + " ★"; }
  };
  apply("rateTeaching","labelRateTeaching", mine ? Number(mine.teachingQuality || 0) : 0);
  apply("rateExams","labelRateExams", mine ? Number(mine.examDifficulty || 0) : 0);
  apply("rateTreatment","labelRateTreatment", mine ? Number(mine.studentTreatment || 0) : 0);
  const comment = document.getElementById("rateComment");
  const anon = document.getElementById("rateAnonymous");
  if (comment) comment.value = mine ? (mine.comment || "") : "";
  if (anon) anon.checked = !!(mine && mine.anonymous);
}

async function submitProfessorRating(){
  if (!currentUser){
    notifyWarn("Necesitás iniciar sesión para valorar.");
    return;
  }
  if (!selectedProfessorId){
    notifyWarn("Seleccioná un profesor primero.");
    return;
  }

  const teaching = Number(document.getElementById("rateTeaching")?.value || 0);
  const exams = Number(document.getElementById("rateExams")?.value || 0);
  const treatment = Number(document.getElementById("rateTreatment")?.value || 0);

  const withinRange = v => Number.isFinite(v) && v >= 0 && v <= 5;
  if (![teaching, exams, treatment].every(withinRange)){
    notifyWarn("Cada criterio debe estar entre 0 y 5 estrellas.");
    return;
  }

  const comment = (document.getElementById("rateComment")?.value || "").trim();
  const anonymous = !!document.getElementById("rateAnonymous")?.checked;

  const cache = professorReviewsCache[selectedProfessorId];
  const existing = cache?.items?.find(r => r.userId === currentUser.uid);
  const reviewId = `${selectedProfessorId}_${currentUser.uid}`;
  const btn = document.getElementById("btnSubmitRating");
  if (btn) btn.disabled = true;

  const payload = {
    professorId: selectedProfessorId,
    userId: currentUser.uid,
    teachingQuality: teaching,
    examDifficulty: exams,
    studentTreatment: treatment,
    comment,
    anonymous,
    authorName: anonymous ? "" : currentUserDisplayName(),
    createdAt: existing?.createdAt ? new Date(existing.createdAt) : serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  try{
    const reviewRef = doc(db,"professorReviews",reviewId);
    await setDoc(reviewRef, payload, { merge:true });
    await loadProfessorReviews(selectedProfessorId);
    fillRatingFormFromMyReview(selectedProfessorId);
    await recalcProfessorStats(selectedProfessorId);
    await loadProfessorsCatalog();
    renderProfessorsSection();
    notifySuccess("Valoración guardada.");
  }catch(e){
    console.error("submitProfessorRating error", e);
    notifyError("No se pudo guardar la valoración: " + (e.message || e));
  }finally{
    if (btn) btn.disabled = false;
  }
}

async function recalcProfessorStats(profId){
  const snap = await getDocs(query(collection(db,"professorReviews"), where("professorId","==", profId)));
  let count = 0;
  let commentsCount = 0;
  let sumT = 0, sumE = 0, sumTr = 0;
  snap.forEach(d =>{
    const data = d.data() || {};
    const t = Number(data.teachingQuality || 0);
    const e = Number(data.examDifficulty || 0);
    const tr = Number(data.studentTreatment || 0);
    sumT += t;
    sumE += e;
    sumTr += tr;
    count++;
    if ((data.comment || "").trim().length) commentsCount++;
  });
  const avgTeaching = count ? (sumT / count) : 0;
  const avgExams = count ? (sumE / count) : 0;
  const avgTreatment = count ? (sumTr / count) : 0;
  const avgGeneral = count ? ((sumT + sumE + sumTr) / (count * 3)) : 0;
  await updateDoc(doc(db,"professors",profId), {
    avgTeaching,
    avgExams,
    avgTreatment,
    avgGeneral,
    ratingCount: count,
    commentsCount,
    updatedAt: serverTimestamp()
  });
}

/* ---------- MENSAJES / AMISTADES (NUEVO) ---------- */
function initMessengerDock(){
  // La vista de mensajería se maneja con pestañas; solo aseguramos que no falle la inicialización.
}

function openMessengerDock(){
  showTab("mensajes");
}

function toggleMessengerDock(){
  if (activeSection === "mensajes"){
    showTab(lastNonMessagesSection || "inicio");
  } else {
    showTab("mensajes");
  }
}

function composeChatId(uids){
  return (uids || []).slice().sort().join("__");
}

function setChatInputState(enabled, placeholder){
  const input = document.getElementById("messageInput");
  const btn = document.getElementById("btnSendMessage");
  if (input){
    input.disabled = !enabled;
    if (placeholder) input.placeholder = placeholder;
  }
  if (btn) btn.disabled = !enabled;
}

function userStatusLabel(uid){
  const st = userStatusMap.get(uid);
  if (!st) return "Desconectado";
  if (st.online) return "En línea";
  if (st.showLastSeen === false) return "Última conexión no visible";
  if (st.lastSeen?.toDate){
    return "Última vez: " + st.lastSeen.toDate().toLocaleString("es-AR");
  }
  if (st.lastSeen){
    try{
      return "Última vez: " + new Date(st.lastSeen).toLocaleString("es-AR");
    }catch(_){}
  }
  return "Desconectado";
}

async function ensureLastSeenPref(){
  showLastSeenPref = userProfile?.showLastSeen !== false;
  if (!currentUser) return;
  try{
    await setDoc(doc(db,"users",currentUser.uid), { showLastSeen: showLastSeenPref }, { merge:true });
  }catch(_){}
}

async function updatePresence(isOnline){
  if (!currentUser) return;
  const ref = doc(db,"userStatus", currentUser.uid);
  try{
    await setDoc(ref, {
      uid: currentUser.uid,
      online: isOnline,
      lastSeen: serverTimestamp(),
      showLastSeen: showLastSeenPref
    }, { merge:true });
  }catch(_){}
}

function subscribeStatusFeed(){
  if (statusUnsubscribe) statusUnsubscribe();
  statusUnsubscribe = onSnapshot(collection(db,"userStatus"), snap =>{
    const map = new Map();
    snap.forEach(d => map.set(d.id, d.data()));
    userStatusMap = map;
    renderFriendsList();
    renderMessaging();
  }, (err)=> console.error("status snapshot error", err));
}

async function initPresence(){
  await updatePresence(true);
  window.addEventListener("beforeunload", ()=> { updatePresence(false); });
  document.addEventListener("visibilitychange", ()=>{ updatePresence(!document.hidden); });
  subscribeStatusFeed();
}

async function loadFriendRequests(){
  if (!currentUser) return;
  requestsLoading = true;
  renderFriendRequestsUI();
  const incomingQ = query(collection(db,"friendRequests"), where("toUid","==", currentUser.uid));
  const outgoingQ = query(collection(db,"friendRequests"), where("fromUid","==", currentUser.uid));
  const [snapIn, snapOut] = await Promise.all([getDocs(incomingQ), getDocs(outgoingQ)]);
  const incoming = [];
  const outgoing = [];
  snapIn.forEach(d =>{
    const data = d.data() || {};
    if (data.status === "rejected") return;
    incoming.push({ id:d.id, ...data });
  });
  snapOut.forEach(d =>{
    const data = d.data() || {};
    if (data.status === "rejected") return;
    outgoing.push({ id:d.id, ...data });
  });
  friendRequests = { incoming, outgoing };
  requestsLoading = false;
  renderFriendRequestsUI();
  renderMessaging();
}

async function loadFriends(){
  if (!currentUser) return;
  friendsLoading = true;
  renderFriendsList();
  const snap = await getDocs(query(collection(db,"friends"), where("uids","array-contains", currentUser.uid)));
  const arr = [];
  for (const d of snap.docs){
    const data = d.data();
    const otherUid = Array.isArray(data.uids) ? data.uids.find(u => u !== currentUser.uid) : "";
    let otherProfile = null;
    if (otherUid){
      const psnap = await getDoc(doc(db,"users", otherUid));
      otherProfile = psnap.exists() ? psnap.data() : null;
    }
    arr.push({
      id: d.id,
      chatId: data.chatId || composeChatId(data.uids || []),
      uids: data.uids || [],
      otherUid,
      otherProfile
    });
  }
  friendsList = arr;
  friendsLoading = false;
  renderFriendsList();
  renderMessaging();
}

function renderFriendRequestsUI(){
  const incomingBox = document.getElementById("incomingRequests");
  const outgoingBox = document.getElementById("outgoingRequests");
  if (!incomingBox || !outgoingBox) return;

  incomingBox.innerHTML = "";
  outgoingBox.innerHTML = "";

  if (requestsLoading){
    incomingBox.innerHTML = "<div class='muted'>Cargando...</div>";
    outgoingBox.innerHTML = "<div class='muted'>Cargando...</div>";
    return;
  }

  if (!friendRequests.incoming.length){
    incomingBox.innerHTML = "<div class='muted'>Sin solicitudes pendientes.</div>";
  } else {
    friendRequests.incoming.forEach(req =>{
      const div = document.createElement("div");
      div.className = "request-card";
      div.innerHTML = `
        <div>
          <div class="req-email">${req.fromEmail || "Correo desconocido"}</div>
          <div class="req-meta">Estado: ${req.status || "pendiente"}</div>
        </div>
        <div class="req-actions">
          <button class="btn-blue btn-small" data-action="accept" data-id="${req.id}">Aceptar</button>
          <button class="btn-danger btn-small" data-action="reject" data-id="${req.id}">Rechazar</button>
        </div>
      `;
      incomingBox.appendChild(div);
    });
  }

  if (!friendRequests.outgoing.length){
    outgoingBox.innerHTML = "<div class='muted'>No enviaste solicitudes.</div>";
  } else {
    friendRequests.outgoing.forEach(req =>{
      const div = document.createElement("div");
      div.className = "request-card ghost";
      div.innerHTML = `
        <div>
          <div class="req-email">${req.toEmail || "Correo"}</div>
          <div class="req-meta">Estado: ${req.status || "pendiente"}</div>
        </div>
      `;
      outgoingBox.appendChild(div);
    });
  }
}

function renderFriendsList(){
  const box = document.getElementById("friendsListBox");
  if (!box) return;
  box.innerHTML = "";

  if (friendsLoading){
    box.innerHTML = "<div class='muted'>Cargando amigos...</div>";
    return;
  }

  if (!friendsList.length){
    box.innerHTML = "<div class='muted'>Agregá amigos para chatear.</div>";
    return;
  }
  friendsList.forEach(f =>{
    const profile = f.otherProfile || {};
    const name = profile.name || profile.fullName || profile.email || "Estudiante";
    const status = userStatusLabel(f.otherUid);
    const online = userStatusMap.get(f.otherUid)?.online;
    const div = document.createElement("div");
    div.className = "friend-row";
    div.innerHTML = `
      <div>
        <div class="friend-name">${name}</div>
        <div class="friend-meta">${status}</div>
      </div>
      <button class="btn-outline btn-small" data-chat="${f.chatId}">Chat</button>
    `;
    if (online) div.classList.add("friend-online");
    div.querySelector("button").addEventListener("click", ()=> openChatWithFriend(f));
    box.appendChild(div);
  });
}

function renderMessaging(){
  const header = document.getElementById("chatHeader");
  const list = document.getElementById("messagesList");
  const sub = document.getElementById("chatSubheader");
  const inputRow = document.getElementById("chatInputRow");
  if (!header || !list){
    return;
  }
  if (!activeChatPartner){
    header.textContent = "Seleccioná un amigo para chatear";
    if (sub) sub.textContent = "Agregá amigos para iniciar una conversación.";
    list.innerHTML = "<div class='muted'>No hay conversación activa.</div>";
    setChatInputState(false, "Seleccioná un amigo para chatear");
    if (inputRow) inputRow.style.display = "none";
    return;
  }
  const profile = activeChatPartner.otherProfile || {};
  header.textContent = (profile.name || profile.email || "Chat");
  if (sub) sub.textContent = userStatusLabel(activeChatPartner.otherUid);
  setChatInputState(true, "Escribí un mensaje...");
  if (inputRow) inputRow.style.display = "flex";

  const msgs = messagesCache[activeChatId] || [];
  list.innerHTML = "";
  if (!msgs.length){
    list.innerHTML = "<div class='muted'>Sin mensajes. ¡Enviá el primero!</div>";
    return;
  }
  msgs.forEach(m =>{
    const me = m.senderUid === currentUser?.uid;
    const wrap = document.createElement("div");
    wrap.className = "msg-row " + (me ? "me" : "other");
    const date = m.createdAt?.toDate ? m.createdAt.toDate().toLocaleString("es-AR") : "";
    const bubble = document.createElement("div");
    bubble.className = "msg-bubble";
    const textEl = document.createElement("div");
    textEl.className = "msg-text";
    textEl.textContent = m.text || "";
    const meta = document.createElement("div");
    meta.className = "msg-meta";
    meta.textContent = `${me ? "Yo" : "Ellx"} · ${date}`;
    bubble.appendChild(textEl);
    bubble.appendChild(meta);
    wrap.appendChild(bubble);
    list.appendChild(wrap);
  });
  list.scrollTop = list.scrollHeight;
}

function subscribeMessages(chatId){
  if (messagesUnsubscribe) messagesUnsubscribe();
  const q = query(collection(db,"chats", chatId, "messages"), orderBy("createdAt","asc"), limit(100));
  messagesUnsubscribe = onSnapshot(q, snap =>{
    const arr = [];
    snap.forEach(d => arr.push(d.data()));
    messagesCache[chatId] = arr;
    renderMessaging();
  }, (err)=> console.error("messages snapshot error", err));
}

async function ensureChat(uids){
  const chatId = composeChatId(uids);
  const ref = doc(db,"chats", chatId);
  const snap = await getDoc(ref);
  if (!snap.exists()){
    await setDoc(ref, { uids, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  }
  return chatId;
}

async function openChatWithFriend(friend){
  activeChatPartner = friend;
  activeChatId = friend.chatId || composeChatId(friend.uids);
  await ensureChat(friend.uids);
  subscribeMessages(activeChatId);
  openMessengerDock();
  renderMessaging();
}

async function sendMessage(){
  const input = document.getElementById("messageInput");
  if (!input || !activeChatId || !activeChatPartner) return;
  const text = (input.value || "").trim();
  if (!text){
    notifyWarn("Escribí un mensaje.");
    return;
  }
  input.value = "";
  try{
    await addDoc(collection(db,"chats", activeChatId, "messages"), {
      text,
      senderUid: currentUser.uid,
      uids: [currentUser.uid, activeChatPartner.otherUid],
      createdAt: serverTimestamp()
    });
    await updateDoc(doc(db,"chats", activeChatId), { updatedAt: serverTimestamp() });
  }catch(e){
    notifyError("No se pudo enviar: " + (e.message || e));
  }
}

async function sendFriendRequest(){
  const inp = document.getElementById("friendEmailInput");
  if (!inp || !currentUser) return;
  const email = (inp.value || "").trim().toLowerCase();
  if (!email){
    notifyWarn("Ingresá el correo del estudiante.");
    return;
  }
  if (email === (currentUser.email || "").toLowerCase()){
    notifyWarn("No podés enviarte una solicitud a vos mismo.");
    return;
  }
  try{
    const userSnap = await getDocs(query(collection(db,"users"), where("email","==", email)));
    if (userSnap.empty){
      notifyWarn("No se encontró un usuario con ese correo.");
      return;
    }
    const targetId = userSnap.docs[0].id;
    const existing = friendRequests.outgoing.some(r => (r.toUid === targetId) && (r.status === "pending"));
    if (existing){
      notifyWarn("Ya enviaste una solicitud pendiente a este usuario.");
      return;
    }
    const alreadyFriend = friendsList.some(f => f.otherUid === targetId);
    if (alreadyFriend){
      notifyWarn("Ya son amigos y pueden chatear.");
      return;
    }
    await addDoc(collection(db,"friendRequests"), {
      fromUid: currentUser.uid,
      toUid: targetId,
      fromEmail: currentUser.email || "",
      toEmail: email,
      status: "pending",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    inp.value = "";
    await loadFriendRequests();
    notifySuccess("Solicitud enviada.");
  }catch(e){
    notifyError("No se pudo enviar la solicitud: " + (e.message || e));
  }
}

async function acceptFriendRequest(id){
  const req = friendRequests.incoming.find(r => r.id === id);
  if (!req){
    notifyWarn("Solicitud no encontrada.");
    return;
  }
  try{
    const chatId = composeChatId([req.fromUid, req.toUid]);
    await updateDoc(doc(db,"friendRequests",id), { status:"accepted", updatedAt: serverTimestamp(), decisionBy: currentUser.uid });
    await setDoc(doc(db,"friends", chatId), { uids:[req.fromUid, req.toUid], chatId, createdAt: serverTimestamp() }, { merge:true });
    await ensureChat([req.fromUid, req.toUid]);
    await loadFriendRequests();
    await loadFriends();
    notifySuccess("Solicitud aceptada. Ya pueden chatear.");
  }catch(e){
    notifyError("No se pudo aceptar: " + (e.message || e));
  }
}

async function rejectFriendRequest(id){
  const req = friendRequests.incoming.find(r => r.id === id);
  if (!req) return;
  try{
    await updateDoc(doc(db,"friendRequests",id), { status:"rejected", updatedAt: serverTimestamp(), decisionBy: currentUser.uid });
    await loadFriendRequests();
    notifyWarn("Solicitud rechazada.");
  }catch(e){
    notifyError("No se pudo rechazar: " + (e.message || e));
  }
}

function wireFriendRequestActions(){
  const incomingBox = document.getElementById("incomingRequests");
  if (!incomingBox) return;
  incomingBox.addEventListener("click", (e)=>{
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const id = btn.getAttribute("data-id");
    const action = btn.getAttribute("data-action");
    if (action === "accept") acceptFriendRequest(id);
    else if (action === "reject") rejectFriendRequest(id);
  });
}

function initMessagingUI(){
  const btnSendReq = document.getElementById("btnSendFriendRequest");
  if (btnSendReq) btnSendReq.addEventListener("click", sendFriendRequest);

  const btnSendMsg = document.getElementById("btnSendMessage");
  if (btnSendMsg) btnSendMsg.addEventListener("click", sendMessage);

  const msgInput = document.getElementById("messageInput");
  if (msgInput){
    msgInput.addEventListener("keydown", (e)=>{
      if (e.key === "Enter" && !e.shiftKey){
        e.preventDefault();
        sendMessage();
      }
    });
  }

  const toggle = document.getElementById("toggleLastSeen");
  if (toggle){
    toggle.checked = showLastSeenPref;
    toggle.addEventListener("change", async ()=>{
      showLastSeenPref = !!toggle.checked;
      await ensureLastSeenPref();
      await updatePresence(true);
      renderMessaging();
    });
  }

  const dockToggle = document.getElementById("messengerToggle");
  if (dockToggle){
    dockToggle.addEventListener("click", toggleMessengerDock);
  }

  wireFriendRequestActions();
  setChatInputState(false, "Seleccioná un amigo para chatear");
  renderMessaging();
}