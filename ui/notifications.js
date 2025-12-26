const TYPE_META = {
  info:   { icon:"ℹ",  title:"Aviso" },
  success:{ icon:"✓",  title:"Listo" },
  error:  { icon:"✕",  title:"Error" },
  warning:{ icon:"!",  title:"Atención" },
};

let toastStack = null;

function ensureToastStack(){
  if (toastStack) return toastStack;
  const div = document.createElement("div");
  div.className = "toast-stack";
  document.body.appendChild(div);
  toastStack = div;
  return toastStack;
}

function removeToast(el){
  if (!el) return;
  el.style.opacity = "0";
  el.style.transform = "translateY(-6px)";
  setTimeout(()=> el.remove(), 160);
}

export function showToast(options){
  const { message, title, type="info", duration=4500, actions=[], dismissible=true } = options || {};
  if (!message) return null;

  const stack = ensureToastStack();
  const meta = TYPE_META[type] || TYPE_META.info;

  const card = document.createElement("div");
  card.className = "toast-card " + type;

  const ico = document.createElement("div");
  ico.className = "toast-ico";
  ico.textContent = meta.icon;

  const body = document.createElement("div");
  body.className = "toast-body";

  const ttl = document.createElement("div");
  ttl.className = "toast-title";
  ttl.textContent = title || meta.title;

  const msg = document.createElement("div");
  msg.className = "toast-msg";
  msg.textContent = message;

  body.appendChild(ttl);
  body.appendChild(msg);

  if (Array.isArray(actions) && actions.length){
    const actWrap = document.createElement("div");
    actWrap.className = "toast-actions";
    actions.forEach((a, idx)=>{
      const btn = document.createElement("button");
      btn.className = "toast-btn " + (a.primary ? "primary" : "ghost");
      btn.textContent = a.label || ("Acción " + (idx+1));
      btn.addEventListener("click", ()=>{ if (typeof a.onClick === "function") a.onClick(); removeToast(card); });
      actWrap.appendChild(btn);
    });
    body.appendChild(actWrap);
  }

  card.appendChild(ico);
  card.appendChild(body);

  if (dismissible){
    const close = document.createElement("button");
    close.className = "toast-close";
    close.setAttribute("aria-label","Cerrar");
    close.textContent = "✕";
    close.addEventListener("click", ()=> removeToast(card));
    card.appendChild(close);
  }

  stack.appendChild(card);

  if (duration !== null){
    setTimeout(()=> removeToast(card), duration);
  }

  return { close: () => removeToast(card) };
}

export function showConfirm(options){
  const {
    title="Confirmar",
    message="",
    confirmText="Aceptar",
    cancelText="Cancelar",
    tone="primary",
    danger=false
  } = options || {};

  return new Promise(resolve =>{
    const backdrop = document.createElement("div");
    backdrop.className = "toast-dialog-backdrop";

    const dialog = document.createElement("div");
    dialog.className = "toast-dialog";

    const ttl = document.createElement("div");
    ttl.className = "dialog-title";
    ttl.textContent = title;
    const msg = document.createElement("div");
    msg.className = "dialog-msg";
    msg.textContent = message;

    const actions = document.createElement("div");
    actions.className = "dialog-actions";

    const btnCancel = document.createElement("button");
    btnCancel.className = "dialog-btn ghost";
    btnCancel.textContent = cancelText;
    btnCancel.addEventListener("click", ()=> cleanup(false));

    const btnOk = document.createElement("button");
    btnOk.className = "dialog-btn " + (danger ? "danger" : "primary");
    btnOk.textContent = confirmText;
    btnOk.addEventListener("click", ()=> cleanup(true));

    actions.appendChild(btnCancel);
    actions.appendChild(btnOk);

    dialog.appendChild(ttl);
    dialog.appendChild(msg);
    dialog.appendChild(actions);

    backdrop.appendChild(dialog);
    document.body.appendChild(backdrop);

    const onKey = (ev)=>{
      if (ev.key === "Escape") cleanup(false);
      if (ev.key === "Enter") cleanup(true);
    };
    document.addEventListener("keydown", onKey);

    function cleanup(val){
      document.removeEventListener("keydown", onKey);
      backdrop.remove();
      resolve(val);
    }

    backdrop.addEventListener("click", (e)=>{ if (e.target === backdrop) cleanup(false); });
  });
}

export function showPrompt(options){
  const {
    title="Confirmar",
    message="",
    placeholder="",
    defaultValue="",
    confirmText="Aceptar",
    cancelText="Cancelar",
    inputType="text",
    validate
  } = options || {};

  return new Promise(resolve =>{
    const backdrop = document.createElement("div");
    backdrop.className = "toast-dialog-backdrop";

    const dialog = document.createElement("div");
    dialog.className = "toast-dialog";

    const ttl = document.createElement("div");
    ttl.className = "dialog-title";
    ttl.textContent = title;
    const msg = document.createElement("div");
    msg.className = "dialog-msg";
    msg.textContent = message;

    const inputWrap = document.createElement("div");
    inputWrap.className = "dialog-input";
    const label = document.createElement("label");
    label.textContent = "Ingresá un valor";
    const input = document.createElement("input");
    input.type = inputType;
    input.placeholder = placeholder;
    input.value = defaultValue;
    inputWrap.appendChild(label);
    inputWrap.appendChild(input);

    const err = document.createElement("div");
    err.className = "dialog-error";
    err.style.display = "none";

    const actions = document.createElement("div");
    actions.className = "dialog-actions";

    const btnCancel = document.createElement("button");
    btnCancel.className = "dialog-btn ghost";
    btnCancel.textContent = cancelText;
    btnCancel.addEventListener("click", ()=> cleanup(null));

    const btnOk = document.createElement("button");
    btnOk.className = "dialog-btn primary";
    btnOk.textContent = confirmText;
    btnOk.addEventListener("click", submit);

    actions.appendChild(btnCancel);
    actions.appendChild(btnOk);

    dialog.appendChild(ttl);
    dialog.appendChild(msg);
    dialog.appendChild(inputWrap);
    dialog.appendChild(err);
    dialog.appendChild(actions);

    backdrop.appendChild(dialog);
    document.body.appendChild(backdrop);

    input.focus();

    const onKey = (ev)=>{
      if (ev.key === "Escape") cleanup(null);
      if (ev.key === "Enter") submit();
    };
    document.addEventListener("keydown", onKey);

    function submit(){
      const val = input.value;
      if (typeof validate === "function"){
        const msg = validate(val);
        if (msg){
          err.textContent = msg;
          err.style.display = "block";
          return;
        }
      }
      cleanup(val);
    }

    function cleanup(val){
      document.removeEventListener("keydown", onKey);
      backdrop.remove();
      resolve(val);
    }

    backdrop.addEventListener("click", (e)=>{ if (e.target === backdrop) cleanup(null); });
  });
}
