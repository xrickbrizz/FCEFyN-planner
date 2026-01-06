(function(){
  const STORAGE_KEY = "fcefyn-theme";
  const body = document.body;

  function updateToggleButtons(isDark){
    document.querySelectorAll("[data-theme-toggle]").forEach(btn =>{
      btn.setAttribute("aria-pressed", String(isDark));
      const icon = btn.querySelector(".ico");
      const label = btn.querySelector(".label");
      const iconChar = isDark ? "🌙" : "☀️";
      const text = isDark ? "Modo oscuro" : "Modo claro";
      if (icon) icon.textContent = iconChar;
      if (label) label.textContent = text;
      if (!icon && !label){
        btn.textContent = `${iconChar} ${text}`;
      }
    });
  }

  function applyTheme(mode){
    const useDark = mode === "dark";
    body.classList.toggle("dark-mode", useDark);
    localStorage.setItem(STORAGE_KEY, useDark ? "dark" : "light");
    updateToggleButtons(useDark);
  }

  function getPreferredTheme(){
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "dark" || saved === "light") return saved;
    const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    return prefersDark ? "dark" : "light";
  }

  function initThemeToggle(){
    applyTheme(getPreferredTheme());
    const buttons = document.querySelectorAll("[data-theme-toggle]");
    buttons.forEach(btn =>{
      btn.addEventListener("click", ()=>{
        const nextMode = body.classList.contains("dark-mode") ? "light" : "dark";
        applyTheme(nextMode);
      });
    });
    const media = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
    media?.addEventListener("change", e =>{
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) applyTheme(e.matches ? "dark" : "light");
    });
  }

  document.addEventListener("DOMContentLoaded", initThemeToggle);
})();