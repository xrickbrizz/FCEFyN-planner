    import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
    import { getAuth, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";
    import { getFirestore, doc, getDoc, setDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

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

    // ------------------------ TABS ------------------------
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

      document.getElementById("tabBtnEstudio").classList.toggle("tab-active", name === "estudio");
      document.getElementById("tabBtnAcademico").classList.toggle("tab-active", name === "academico");
      document.getElementById("tabBtnAgenda").classList.toggle("tab-active", name === "agenda");
      document.getElementById("tabBtnMaterias").classList.toggle("tab-active", name === "materias");
      document.getElementById("tabBtnPlanificador").classList.toggle("tab-active", name === "planificador");

      if (name === "agenda") renderAgenda();
      if (name === "planificador") renderPlannerAll();
      if (name === "estudio") renderStudyCalendar();
      if (name === "academico") renderAcadCalendar();
    };

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
        alert("Error al cerrar sesión: " + e.message);
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
        alert("Ingresá un nombre para la materia.");
        return;
      }

      if (editingSubjectIndex === -1){
        if (subjects.some(s => s.name.toLowerCase() === name.toLowerCase())){
          alert("Ya existe una materia con ese nombre.");
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

      const msg =
        "Vas a borrar la materia \"" + s.name + "\".\n\n" +
        "Esto también puede borrar sus clases en la Agenda y sus registros de estudio del calendario,\n" +
        "y también los ítems del Académico asociados a esa materia.\n\n" +
        "¿Querés continuar?";
      if (!window.confirm(msg)) return;

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
              const tag = document.createElement("div");
              tag.className = "event";
              tag.textContent = ev.materia || "(sin materia)";
              box.appendChild(tag);
            });
          }
        });
      });
    }

    // ------------------------ MODAL ESTUDIO ------------------------
    const modalBg = document.getElementById("modalBg");
    const btnGuardar = document.getElementById("btnGuardar");
    const btnCancelar = document.getElementById("btnCancelar");
    const eventsList = document.getElementById("eventsList");

    function openModalStudy(day, month, year){
      selectedDate = dateKeyFromYMD(year, month, day);
      editingIndex = -1;

      document.getElementById("inpHoras").value = "";
      document.getElementById("inpMins").value = "";
      document.getElementById("inpTema").value = "";

      renderSubjectsOptions();

      const events = (estudiosCache && estudiosCache[selectedDate]) || [];
      renderEventsList(events);

      modalBg.style.display = "flex";
    }

    btnCancelar.onclick = () => { modalBg.style.display = "none"; };
    modalBg.onclick = (e) => { if (e.target === modalBg) modalBg.style.display = "none"; };

    function renderEventsList(events){
      eventsList.innerHTML = "";
      if (!events.length){
        eventsList.style.display = "none";
        return;
      }
      eventsList.style.display = "block";

      events.forEach((ev, i) => {
        const row = document.createElement("div");
        row.className = "event-row";

        const main = document.createElement("div");
        main.className = "event-row-main";
        main.textContent = ev.materia || "(sin materia)";

        const meta = document.createElement("div");
        meta.className = "event-row-meta";
        const h = (ev.horas ?? "");
        const m = (ev.mins ?? "");
        meta.textContent = "Tiempo: " + h + "h " + m + "m • Tema: " + (ev.tema || "");

        const actions = document.createElement("div");
        actions.className = "event-row-actions";

        const btnE = document.createElement("button");
        btnE.className = "btn-gray btn-small";
        btnE.textContent = "Editar";
        btnE.onclick = () => startEditEvent(i);

        const btnD = document.createElement("button");
        btnD.className = "btn-danger btn-small";
        btnD.textContent = "Borrar";
        btnD.onclick = () => deleteEvent(i);

        actions.appendChild(btnE);
        actions.appendChild(btnD);

        row.appendChild(main);
        row.appendChild(meta);
        row.appendChild(actions);

        eventsList.appendChild(row);
      });
    }

    function startEditEvent(index){
      const events = (estudiosCache && estudiosCache[selectedDate]) || [];
      const ev = events[index];
      if (!ev) return;

      editingIndex = index;
      document.getElementById("inpHoras").value = ev.horas ?? "";
      document.getElementById("inpMins").value  = ev.mins  ?? "";
      document.getElementById("inpTema").value  = ev.tema  ?? "";

      renderSubjectsOptions();
      const sel = document.getElementById("inpMateria");
      if (sel){
        for (let i=0;i<sel.options.length;i++){
          if (sel.options[i].value === ev.materia){
            sel.selectedIndex = i;
            break;
          }
        }
      }
    }

    async function deleteEvent(index){
      if (!currentUser || !selectedDate) return;

      const ref = doc(db, "planner", currentUser.uid);
      const snap = await getDoc(ref);
      if (!snap.exists()) return;

      const data = snap.data();
      if (!data.estudios || !data.estudios[selectedDate]) return;

      data.estudios[selectedDate].splice(index, 1);
      if (data.estudios[selectedDate].length === 0){
        delete data.estudios[selectedDate];
      }

      await setDoc(ref, data);
      estudiosCache = data.estudios || {};
      const events = estudiosCache[selectedDate] || [];
      renderEventsList(events);
      paintStudyEvents();
    }

    btnGuardar.onclick = async () => {
      if (!currentUser || !selectedDate) return;

      const horas = document.getElementById("inpHoras").value;
      const mins  = document.getElementById("inpMins").value;
      const tema  = document.getElementById("inpTema").value;
      const materiaSel = document.getElementById("inpMateria");

      if (!subjects.length || !materiaSel || !materiaSel.value){
        alert("Primero creá al menos una materia en la pestaña 'Materias'.");
        return;
      }
      const materia = materiaSel.value;

      const ref = doc(db, "planner", currentUser.uid);
      const snap = await getDoc(ref);

      let data = snap.exists() ? snap.data() : {};
      if (!data.estudios) data.estudios = {};
      if (!data.estudios[selectedDate]) data.estudios[selectedDate] = [];

      if (editingIndex === -1){
        data.estudios[selectedDate].push({ horas, mins, tema, materia });
      } else {
        data.estudios[selectedDate][editingIndex] = { horas, mins, tema, materia };
      }

      await setDoc(ref, data);
      estudiosCache = data.estudios || {};
      modalBg.style.display = "none";
      paintStudyEvents();
    };

    // ------------------------ ACADEMICO (CALENDARIO + WIDGETS + DETALLE) ------------------------
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
        acadSelectedDateKey = dateKeyFromYMD(now.getFullYear(), now.getMonth()+1, now.getDate());
        renderAcadCalendar();
      });
      document.getElementById("btnAcadAddGlobal").addEventListener("click", ()=>{
        const now = new Date();
        const key = dateKeyFromYMD(now.getFullYear(), now.getMonth()+1, now.getDate());
        acadSelectedDateKey = key;
        openAcadModalForDate(key, -1);
      });

      if (btnAcadAddFromDetail){
        btnAcadAddFromDetail.addEventListener("click", ()=>{
          if (!acadSelectedDateKey){
            const now = new Date();
            acadSelectedDateKey = dateKeyFromYMD(now.getFullYear(), now.getMonth()+1, now.getDate());
          }
          openAcadModalForDate(acadSelectedDateKey, -1);
        });
      }
    }

    function renderAcadCalendar(){
      if (acadViewYear === null || acadViewMonth === null){
        const now = new Date();
        acadViewYear = now.getFullYear();
        acadViewMonth = now.getMonth();
      }

      const labelDate = new Date(acadViewYear, acadViewMonth, 1);
      acadMonthTitle.textContent = labelDate.toLocaleDateString("es-ES", { month:"long", year:"numeric" });

      const firstDay = new Date(acadViewYear, acadViewMonth, 1);
      const jsDow = firstDay.getDay();
      const offset = (jsDow + 6) % 7;

      const totalDays = new Date(acadViewYear, acadViewMonth + 1, 0).getDate();

      acadGrid.innerHTML = "";

      for (let i=0;i<offset;i++){
        const empty = document.createElement("div");
        empty.className = "acad-day day-muted";
        acadGrid.appendChild(empty);
      }

      const now = new Date();
      const ty = now.getFullYear(), tm = now.getMonth(), td = now.getDate();

      for (let d=1; d<=totalDays; d++){
        const box = document.createElement("div");
        box.className = "acad-day";

        if (acadViewYear === ty && acadViewMonth === tm && d === td){
          box.classList.add("is-today");
        }

        const dateKey = dateKeyFromYMD(acadViewYear, acadViewMonth+1, d);
        if (acadSelectedDateKey === dateKey) box.classList.add("selected");

        const head = document.createElement("div");
        head.className = "acad-day-header";

        const num = document.createElement("div");
        num.className = "acad-day-num";
        num.innerHTML = "<span>" + d + "</span><span class='acad-today-pill'>HOY</span>";

        const btnAdd = document.createElement("button");
        btnAdd.className = "btn-outline btn-small acad-add-mini";
        btnAdd.textContent = "+";
        btnAdd.title = "Añadir";
        btnAdd.addEventListener("click", (ev)=>{
          ev.stopPropagation();
          acadSelectedDateKey = dateKey;
          openAcadModalForDate(dateKey, -1);
        });

        head.appendChild(num);
        head.appendChild(btnAdd);

        const itemsWrap = document.createElement("div");
        itemsWrap.className = "acad-items";

        const items = Array.isArray(academicoCache[dateKey]) ? academicoCache[dateKey] : [];

        const sorted = items.slice().sort((a,b)=>{
          const ap = dtLocalToParts(a.whenLocal);
          const bp = dtLocalToParts(b.whenLocal);
          if (!ap && !bp) return 0;
          if (!ap) return 1;
          if (!bp) return -1;
          const at = (ap.hh*60 + ap.mm);
          const bt = (bp.hh*60 + bp.mm);
          return at - bt;
        });

        const maxShow = 3;
        const show = sorted.slice(0, maxShow);

        show.forEach((it)=>{
          const chip = document.createElement("div");
          chip.className = "acad-item";

          const dot = document.createElement("span");
          dot.className = "dot";
          dot.style.background = typeColor(it.type || "");
          dot.style.boxShadow = "0 0 0 3px rgba(0,0,0,.12)";

          const txt = document.createElement("span");
          txt.className = "txt";
          txt.textContent = (it.type ? (it.type + ": ") : "") + (it.title || "(sin título)");

          const tmEl = document.createElement("span");
          tmEl.className = "time";
          const pp = dtLocalToParts(it.whenLocal);
          tmEl.textContent = pp ? (pad2(pp.hh) + ":" + pad2(pp.mm)) : "";

          chip.appendChild(dot);
          chip.appendChild(txt);
          chip.appendChild(tmEl);

          chip.addEventListener("click", (ev)=>{
            ev.stopPropagation();
            // en vez de overlay dentro del recuadro, se abre detalle lateral
            acadSelectedDateKey = dateKey;
            renderAcadCalendar(); // para marcar seleccionado
          });

          itemsWrap.appendChild(chip);
        });

        if (sorted.length > maxShow){
          const more = document.createElement("div");
          more.className = "acad-more";
          more.textContent = "+" + (sorted.length - maxShow) + " más";
          itemsWrap.appendChild(more);
        }

        box.appendChild(head);
        box.appendChild(itemsWrap);

        box.addEventListener("click", ()=>{
          acadSelectedDateKey = dateKey;
          renderAcadCalendar();
        });

        acadGrid.appendChild(box);
      }

      renderAcadWidgets();
      renderAcadDetail();
    }

    function typeColor(type){
      const t = normalizeStr(type);
      if (t.includes("parcial")) return "#22c55e";
      if (t === "tp") return "#a78bfa";
      if (t.includes("tarea")) return "#f59e0b";
      if (t.includes("informe")) return "#60a5fa";
      if (t.includes("record")) return "#fb7185";
      return "#93c5fd";
    }

    function renderAcadWidgets(){
      const w = document.getElementById("acadWidgets");
      const n7 = document.getElementById("acadNext7");

      const all = [];
      Object.keys(academicoCache || {}).forEach(dateKey=>{
        const arr = academicoCache[dateKey] || [];
        arr.forEach((it, idx)=>{
          const p = dtLocalToParts(it.whenLocal);
          if (!p) return;
          const dt = new Date(p.y, p.m-1, p.d, p.hh, p.mm, 0, 0);
          all.push({ dateKey, idx, it, dt });
        });
      });

      all.sort((a,b)=> a.dt - b.dt);

      const now = new Date();
      const plus7 = new Date(now.getTime() + 7*24*60*60*1000);
      const plus30 = new Date(now.getTime() + 30*24*60*60*1000);

      const upcoming = all.filter(x => x.dt >= now && x.it && x.it.status !== "done");
      const next = upcoming.length ? upcoming[0] : null;

      const pending30 = all.filter(x => x.dt >= now && x.dt <= plus30 && x.it.status !== "done").length;
      const done30 = all.filter(x => x.dt >= new Date(now.getTime() - 30*24*60*60*1000) && x.dt <= now && x.it.status === "done").length;

      w.innerHTML =
        "• Próximo vencimiento: <strong>" + (next ? (fmtShortDateTimeFromParts(dtLocalToParts(next.it.whenLocal)) + " — " + escapeHtml(next.it.type || "Académico") + ": " + escapeHtml(next.it.title || "")) : "—") + "</strong><br/>" +
        "• Pendientes (30 días): <strong>" + pending30 + "</strong><br/>" +
        "• Hechos (30 días): <strong>" + done30 + "</strong>";

      const list7 = all
        .filter(x => x.dt >= now && x.dt <= plus7)
        .slice(0, 6);

      if (!list7.length){
        n7.textContent = "—";
      } else {
        n7.innerHTML = list7.map(x=>{
          const p = dtLocalToParts(x.it.whenLocal);
          const s = fmtShortDateTimeFromParts(p) + " — " + escapeHtml(x.it.type || "Académico") + ": " + escapeHtml(x.it.title || "");
          return "<div style='margin:.25rem 0;'>" + s + "</div>";
        }).join("");
      }
    }

    function renderAcadDetail(){
      if (!acadSelectedDateKey){
        acadDetailBox.style.display = "none";
        return;
      }

      const parts = ymdFromDateKey(acadSelectedDateKey);
      if (!parts){
        acadDetailBox.style.display = "none";
        return;
      }

      const dateObj = new Date(parts.y, parts.m-1, parts.d);
      const pretty = dateObj.toLocaleDateString("es-ES", { weekday:"long", year:"numeric", month:"long", day:"numeric" });

      const arr = Array.isArray(academicoCache[acadSelectedDateKey]) ? academicoCache[acadSelectedDateKey] : [];
      const sorted = arr.slice().map((it, idx)=> ({ it, idx })).sort((a,b)=>{
        const ap = dtLocalToParts(a.it.whenLocal);
        const bp = dtLocalToParts(b.it.whenLocal);
        if (!ap && !bp) return 0;
        if (!ap) return 1;
        if (!bp) return -1;
        return (ap.hh*60+ap.mm) - (bp.hh*60+bp.mm);
      });

      acadDetailTitle.textContent = "Detalle del día";
      acadDetailSub.textContent = pretty;
      acadDetailCount.textContent = arr.length + " ítems";
      acadDetailList.innerHTML = "";

      acadDetailBox.style.display = "block";

      if (!sorted.length){
        const div = document.createElement("div");
        div.className = "small-muted";
        div.textContent = "No hay ítems en este día. Tocá “Añadir”.";
        acadDetailList.appendChild(div);
        return;
      }

      sorted.forEach(({it, idx})=>{
        const card = document.createElement("div");
        card.className = "acad-detail-item";

        const top = document.createElement("div");
        top.className = "acad-detail-item-top";

        const main = document.createElement("div");
        main.className = "acad-detail-main";

        const dot = document.createElement("span");
        dot.className = "acad-detail-dot";
        dot.style.background = typeColor(it.type || "");

        const text = document.createElement("div");
        text.className = "acad-detail-text";

        const title = document.createElement("strong");
        const tt = (it.type ? (it.type + ": ") : "") + (it.title || "(sin título)");
        title.textContent = tt;

        const meta = document.createElement("div");
        meta.className = "acad-detail-meta";
        const pp = dtLocalToParts(it.whenLocal);
        const hora = pp ? (pad2(pp.hh) + ":" + pad2(pp.mm)) : "—";
        const materia = it.materia || "(sin materia)";
        const estado = it.status === "done" ? "Hecho" : "Pendiente";
        meta.innerHTML = "<span style='color:#9ca3af;'>Hora:</span> " + escapeHtml(hora) +
          " · <span style='color:#9ca3af;'>Materia:</span> " + escapeHtml(materia) +
          " · <span style='color:#9ca3af;'>Estado:</span> " + escapeHtml(estado);

        text.appendChild(title);
        text.appendChild(meta);

        main.appendChild(dot);
        main.appendChild(text);

        const actions = document.createElement("div");
        actions.className = "acad-detail-actions";

        const btnDone = document.createElement("button");
        btnDone.className = "btn-outline btn-small";
        btnDone.textContent = (it.status === "done") ? "Marcar pendiente" : "Marcar hecho";
        btnDone.addEventListener("click", async ()=>{
          await toggleAcadDone(acadSelectedDateKey, idx);
          renderAcadCalendar();
        });

        const btnEdit = document.createElement("button");
        btnEdit.className = "btn-blue btn-small";
        btnEdit.textContent = "Editar";
        btnEdit.addEventListener("click", ()=>{
          openAcadModalForDate(acadSelectedDateKey, idx);
        });

        const btnDel = document.createElement("button");
        btnDel.className = "btn-danger btn-small";
        btnDel.textContent = "Borrar";
        btnDel.addEventListener("click", async ()=>{
          if (!confirm("¿Eliminar este ítem académico?")) return;
          await deleteAcadItemByKeyIndex(acadSelectedDateKey, idx);
          renderAcadCalendar();
        });

        actions.appendChild(btnDone);
        actions.appendChild(btnEdit);
        actions.appendChild(btnDel);

        top.appendChild(main);
        top.appendChild(actions);

        card.appendChild(top);

        if (it.notes){
          const notes = document.createElement("div");
          notes.className = "acad-detail-notes";
          notes.textContent = it.notes;
          card.appendChild(notes);
        }

        acadDetailList.appendChild(card);
      });
    }

    async function toggleAcadDone(dateKey, idx){
      if (!currentUser) return;
      const arr = Array.isArray(academicoCache[dateKey]) ? academicoCache[dateKey] : [];
      const it = arr[idx];
      if (!it) return;
      it.status = (it.status === "done") ? "pending" : "done";

      academicoCache[dateKey] = arr;

      const ref = doc(db, "planner", currentUser.uid);
      const snap = await getDoc(ref);
      let data = snap.exists() ? snap.data() : {};
      data.academico = academicoCache;
      await setDoc(ref, data);
    }

    async function deleteAcadItemByKeyIndex(dateKey, idx){
      if (!currentUser) return;
      const arr = Array.isArray(academicoCache[dateKey]) ? academicoCache[dateKey] : [];
      arr.splice(idx,1);
      if (arr.length) academicoCache[dateKey] = arr;
      else delete academicoCache[dateKey];

      const ref = doc(db, "planner", currentUser.uid);
      const snap = await getDoc(ref);
      let data = snap.exists() ? snap.data() : {};
      data.academico = academicoCache;
      await setDoc(ref, data);
    }

    // ------------------------ MODAL ACADEMICO ------------------------
    const acadModalBg = document.getElementById("acadModalBg");
    const acadModalTitle = document.getElementById("acadModalTitle");
    const btnAcadCancel = document.getElementById("btnAcadCancel");
    const btnAcadDelete = document.getElementById("btnAcadDelete");
    const btnAcadSave = document.getElementById("btnAcadSave");

    function initAcademicoModalUI(){
      btnAcadCancel.addEventListener("click", closeAcadModal);
      acadModalBg.addEventListener("click", (e)=>{ if (e.target === acadModalBg) closeAcadModal(); });

      btnAcadSave.addEventListener("click", saveAcadItem);
      btnAcadDelete.addEventListener("click", deleteAcadItem);
    }

    function openAcadModalForDate(dateKey, index){
      acadEditing = { dateKey, index };
      acadSelectedDateKey = dateKey;

      renderSubjectsOptions();

      const arr = Array.isArray(academicoCache[dateKey]) ? academicoCache[dateKey] : [];
      const it = (index >= 0) ? arr[index] : null;

      document.getElementById("acadType").value = it ? (it.type || "Parcial") : "Parcial";
      document.getElementById("acadTitle").value = it ? (it.title || "") : "";
      document.getElementById("acadNotes").value = it ? (it.notes || "") : "";
      document.getElementById("acadStatus").value = it ? (it.status || "pending") : "pending";

      const subjSel = document.getElementById("acadSubject");
      if (subjects.length && subjSel){
        const defaultSubj = subjects[0].name;
        const val = it ? (it.materia || defaultSubj) : defaultSubj;
        for (let i=0;i<subjSel.options.length;i++){
          if (subjSel.options[i].value === val){
            subjSel.selectedIndex = i;
            break;
          }
        }
      }

      const whenInput = document.getElementById("acadWhen");
      if (it && it.whenLocal){
        whenInput.value = it.whenLocal;
      } else {
        const parts = ymdFromDateKey(dateKey);
        const hh = 14, mm = 0;
        if (parts) whenInput.value = partsToDtLocal({ y:parts.y, m:parts.m, d:parts.d, hh, mm });
        else whenInput.value = "";
      }

      if (index >= 0){
        acadModalTitle.textContent = "Editar académico";
        btnAcadDelete.style.display = "inline-block";
      } else {
        acadModalTitle.textContent = "Añadir académico";
        btnAcadDelete.style.display = "none";
      }

      acadModalBg.style.display = "flex";
    }

    function closeAcadModal(){
      acadModalBg.style.display = "none";
    }

    async function saveAcadItem(){
      if (!currentUser) return;

      const dateKey = acadEditing.dateKey;
      if (!dateKey){
        alert("Error interno: no hay día seleccionado.");
        return;
      }

      if (!subjects.length){
        alert("Primero creá materias en la pestaña 'Materias'.");
        return;
      }

      const type = document.getElementById("acadType").value || "Parcial";
      const materiaSel = document.getElementById("acadSubject");
      const materia = (materiaSel && materiaSel.value) ? materiaSel.value : subjects[0].name;

      const title = document.getElementById("acadTitle").value.trim();
      const whenLocal = document.getElementById("acadWhen").value;
      const notes = document.getElementById("acadNotes").value.trim();
      const status = document.getElementById("acadStatus").value || "pending";

      if (!title){
        alert("Poné un título.");
        return;
      }
      if (!whenLocal){
        alert("Elegí fecha y hora.");
        return;
      }

      ensureSubjectExistsWithColor(materia);

      const arr = Array.isArray(academicoCache[dateKey]) ? academicoCache[dateKey] : [];

      const item = { type, materia, title, whenLocal, notes, status };

      if (acadEditing.index >= 0){
        arr[acadEditing.index] = item;
      } else {
        arr.push(item);
      }

      academicoCache[dateKey] = arr;

      const ref = doc(db, "planner", currentUser.uid);
      const snap = await getDoc(ref);
      let data = snap.exists() ? snap.data() : {};
      data.academico = academicoCache;
      data.subjects = subjects;
      await setDoc(ref, data);

      closeAcadModal();
      renderSubjectsList();
      renderSubjectsOptions();
      renderAcadCalendar();
    }

    async function deleteAcadItem(){
      if (!currentUser) return;
      const dateKey = acadEditing.dateKey;
      const idx = acadEditing.index;
      if (!dateKey || idx < 0) return;

      if (!confirm("¿Eliminar este ítem académico?")) return;

      await deleteAcadItemByKeyIndex(dateKey, idx);

      closeAcadModal();
      renderAcadCalendar();
    }

    // ------------------------ AGENDA SEMANAL ------------------------
    const agendaGrid = document.getElementById("agendaGrid");
    const agendaModalBg = document.getElementById("agendaModalBg");
    const agendaModalTitle = document.getElementById("agendaModalTitle");
    const btnAddClass = document.getElementById("btnAddClass");
    const btnAgendaCancel = document.getElementById("btnAgendaCancel");
    const btnAgendaDelete = document.getElementById("btnAgendaDelete");
    const btnAgendaSave = document.getElementById("btnAgendaSave");

    function renderAgenda(){
      ensureAgendaStructure();
      renderAgendaGridInto(agendaGrid, agendaData, true);
    }

    function renderAgendaGridInto(targetGrid, dataObj, allowClick){
      targetGrid.innerHTML = "";

      const hourCol = document.createElement("div");
      hourCol.className = "agenda-hour-col";
      for (let m = minutesStart; m <= minutesEnd; m += 60){
        const hour = document.createElement("div");
        hour.className = "agenda-hour";
        const h = String(Math.floor(m/60)).padStart(2,"0");
        hour.textContent = h + ":00";
        hourCol.appendChild(hour);
      }
      targetGrid.appendChild(hourCol);

      const totalMinutes = minutesEnd - minutesStart;
      const totalHeight = totalMinutes * pxPerMinute;

      dayKeys.forEach((key, idx) => {
        const col = document.createElement("div");
        col.className = "agenda-day-col";

        const header = document.createElement("div");
        header.className = "agenda-day-header";
        header.textContent = dayLabels[idx];
        col.appendChild(header);

        const inner = document.createElement("div");
        inner.className = "agenda-day-inner";
        inner.style.height = totalHeight + "px";

        for (let m = minutesStart; m <= minutesEnd; m += 60){
          const line = document.createElement("div");
          line.className = "agenda-line";
          line.style.top = ((m - minutesStart) * pxPerMinute) + "px";
          inner.appendChild(line);
        }

        const arr = (dataObj && dataObj[key]) ? dataObj[key] : [];
        arr.forEach((item, i) => {
          const startM = timeToMinutes(item.inicio);
          const endM   = timeToMinutes(item.fin);
          if (isNaN(startM) || isNaN(endM) || endM <= startM) return;

          const top = (startM - minutesStart) * pxPerMinute;
          const height = (endM - startM) * pxPerMinute;

          const block = document.createElement("div");
          block.className = "class-block";
          block.style.top = top + "px";
          block.style.height = height + "px";

          const subj = subjects.find(s => s.name === item.materia);
          block.style.background = subj ? subj.color : "#2563eb";

          block.innerHTML =
            "<strong>" + escapeHtml(item.materia) + "</strong>" +
            "<small>" + escapeHtml((item.aula ? (item.aula + " • ") : "") + item.inicio + "–" + item.fin) + "</small>";

          if (allowClick){
            block.onclick = (e) => {
              e.stopPropagation();
              openAgendaModal(key, i);
            };
          }

          inner.appendChild(block);
        });

        if (allowClick){
          inner.onclick = () => openAgendaModal(key, null);
        }

        col.appendChild(inner);
        targetGrid.appendChild(col);
      });
    }

    btnAddClass.onclick = () => openAgendaModal(null, null);

    function openAgendaModal(dayKey=null, index=null){
      agendaEditDay = dayKey;
      agendaEditIndex = index;

      const daySel = document.getElementById("agendaDay");
      daySel.innerHTML = "";
      dayKeys.forEach((k,i) => {
        const opt = document.createElement("option");
        opt.value = k;
        opt.textContent = dayLabels[i];
        daySel.appendChild(opt);
      });
      if (dayKey) daySel.value = dayKey;

      renderSubjectsOptions();

      document.getElementById("agendaRoom").value = "";
      document.getElementById("agendaStart").value = "";
      document.getElementById("agendaEnd").value = "";

      if (index !== null && dayKey){
        agendaModalTitle.textContent = "Editar clase";
        const item = (agendaData[dayKey] || [])[index];
        if (item){
          document.getElementById("agendaRoom").value = item.aula || "";
          document.getElementById("agendaStart").value = item.inicio;
          document.getElementById("agendaEnd").value   = item.fin;
          const selSub = document.getElementById("agendaSubject");
          if (selSub){
            for (let i=0;i<selSub.options.length;i++){
              if (selSub.options[i].value === item.materia){
                selSub.selectedIndex = i;
                break;
              }
            }
          }
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
        alert("Primero creá materias en la pestaña 'Materias'.");
        return;
      }

      const materia = subjSel.value;
      const aula = document.getElementById("agendaRoom").value.trim();
      const inicio = document.getElementById("agendaStart").value;
      const fin    = document.getElementById("agendaEnd").value;

      if (!day || !inicio || !fin){
        alert("Completá día, hora de inicio y fin.");
        return;
      }

      const startM = timeToMinutes(inicio);
      const endM   = timeToMinutes(fin);
      if (isNaN(startM) || isNaN(endM) || endM <= startM){
        alert("La hora de fin debe ser mayor a la de inicio.");
        return;
      }
      if (startM < minutesStart || endM > minutesEnd){
        alert("Rango permitido: entre 08:00 y 23:00.");
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

      if (!window.confirm("¿Seguro que querés eliminar esta clase de la agenda?")) return;

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

    // ------------------------ PLANIFICADOR: cargar horarios del admin ------------------------
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
        alert("Error al cargar horarios del admin: " + (e.message || e));
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
        const sede = sec.campus ? sec.campus : "—";
        const aula = sec.room ? sec.room : "—";
        sub.textContent = "Sede: " + sede + " · Aula: " + aula + (sec.degree ? (" · " + sec.degree) : "");

        left.appendChild(title);
        left.appendChild(sub);

        const actions = document.createElement("div");
        actions.className = "section-actions";

        const isSelected = activeSelectedSectionIds.includes(sec.id);
        const btn = document.createElement("button");
        btn.className = isSelected ? "btn-danger btn-small" : "btn-blue btn-small";
        btn.textContent = isSelected ? "Quitar" : "Agregar";
        btn.addEventListener("click", ()=> toggleSectionInPreset(sec.id));
        actions.appendChild(btn);

        top.appendChild(left);
        top.appendChild(actions);

        const days = document.createElement("div");
        days.className = "section-days";
        const daysArr = Array.isArray(sec.days) ? sec.days : [];
        if (!daysArr.length){
          const p = document.createElement("span");
          p.className = "pill pill-muted";
          p.textContent = "Sin días cargados";
          days.appendChild(p);
        } else {
          daysArr.forEach(d=>{
            const pill = document.createElement("span");
            pill.className = "pill";
            const sedeDia = d.campus || sec.campus || "";
            const t = (d.day || "—") + " " + (d.start || "??") + "–" + (d.end || "??") + (sedeDia ? (" · " + sedeDia) : "");
            pill.textContent = t;
            days.appendChild(pill);
          });
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
          alert("Ya tenés una comisión seleccionada para esa materia. Quitala primero si querés cambiarla.");
          return;
        }
      }

      if (hasOverlapWithSelected(sec)){
        alert("No se puede agregar: se superpone con una materia ya seleccionada en el mismo día/horario.");
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
        alert("Poné un nombre al preset antes de guardarlo.");
        return;
      }
      if (!activeSelectedSectionIds.length){
        alert("Seleccioná al menos una comisión para guardar el preset.");
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

      alert("Preset guardado.");
    }

    async function duplicatePreset(){
      if (!activePresetId){
        alert("Primero cargá o guardá un preset para duplicarlo.");
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
        alert("No hay un preset activo para eliminar.");
        return;
      }
      const ok = confirm("¿Seguro que querés eliminar este preset? (No borra nada de tu Agenda)");
      if (!ok) return;

      presets = presets.filter(x => x.id !== activePresetId);
      activePresetId = null;
      activePresetName = "";
      activeSelectedSectionIds = [];

      await persistPresetsToFirestore();
      renderPlannerAll();
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
        alert("Todavía no tenés presets guardados. Armá uno en Planificador y guardalo.");
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
        alert("Preset inválido.");
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
          alert("No se aplicó porque hay choque de horarios en: " + telling.join(", ") + ".\nElegí 'Reemplazar' o ajustá tu agenda.");
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
      alert("Agenda actualizada.");
    }