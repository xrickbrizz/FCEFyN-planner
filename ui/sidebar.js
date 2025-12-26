export function createQuickSidebar(options){
  const {
    mount,
    items=[],
    title="Accesos rápidos",
    subtitle="Navegá las secciones principales",
    footer="Se sincroniza con las pestaas actuales.",
    onSelect
  } = options || {};

  if (!mount) throw new Error("mount es requerido para createQuickSidebar");

  const backdrop = document.createElement("div");
  backdrop.className = "quick-sidebar-backdrop";

  const aside = document.createElement("aside");
  aside.className = "quick-sidebar";

  const head = document.createElement("div");
  head.className = "qs-head";

  const ttl = document.createElement("div");
  ttl.className = "qs-title";
  ttl.textContent = title;
  const sub = document.createElement("div");
  sub.className = "qs-sub";
  sub.textContent = subtitle;
  head.appendChild(ttl);
  head.appendChild(sub);

  const list = document.createElement("div");
  list.className = "qs-items";

  const footerEl = document.createElement("div");
  footerEl.className = "qs-footer";
  footerEl.innerHTML = `<span class="qs-dot"></span><span>${footer}</span>`;

  aside.appendChild(head);
  aside.appendChild(list);
  aside.appendChild(footerEl);

  const buttons = [];

  items.forEach(it =>{
    const row = document.createElement("button");
    row.className = "qs-item";
    row.type = "button";
    row.dataset.id = it.id;

    const label = document.createElement("div");
    label.className = "qs-label";

    const ico = document.createElement("span");
    ico.className = "qs-ico";
    ico.textContent = it.icon || "•";

    const txt = document.createElement("span");
    txt.textContent = it.label || "Sección";

    label.appendChild(ico);
    label.appendChild(txt);

    const pill = document.createElement("span");
    pill.className = "qs-pill";
    pill.textContent = it.badge || "";

    row.appendChild(label);
    row.appendChild(pill);

    row.addEventListener("click", ()=>{
      if (typeof onSelect === "function") onSelect(it.id);
      setActive(it.id);
      close();
    });

    list.appendChild(row);
    buttons.push(row);
  });

  mount.innerHTML = "";
  mount.appendChild(backdrop);
  mount.appendChild(aside);

  function setActive(id){
    buttons.forEach(b => b.classList.toggle("active", b.dataset.id === id));
  }
  function open(){
    aside.classList.add("open");
    backdrop.classList.add("visible");
  }
  function close(){
    aside.classList.remove("open");
    backdrop.classList.remove("visible");
  }
  function toggle(){
    if (aside.classList.contains("open")) close();
    else open();
  }

  backdrop.addEventListener("click", close);

  return { setActive, open, close, toggle, el: aside };
}
