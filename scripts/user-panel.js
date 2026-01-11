document.addEventListener("DOMContentLoaded", () => {
  const mountEl = document.getElementById("vue-user-panel");
  if (!mountEl || !window.Vue) return;

  const svgFallback = encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
      <defs>
        <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="#e6d98c"/>
          <stop offset="100%" stop-color="#9dd3ff"/>
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="32" fill="url(#g)"/>
      <circle cx="32" cy="26" r="12" fill="rgba(255,255,255,0.9)"/>
      <path d="M14 54c3-10 14-16 18-16s15 6 18 16" fill="rgba(255,255,255,0.9)"/>
    </svg>`
  );
  const fallbackAvatar = `data:image/svg+xml;utf8,${svgFallback}`;

  const app = Vue.createApp({
    data() {
      return {
        isOpen: false,
        avatarUrl: window.userPanelAvatar || fallbackAvatar
      };
    },
    mounted() {
      this.handleOutsideClick = (event) => {
        if (!this.$el.contains(event.target)) {
          this.isOpen = false;
        }
      };
      document.addEventListener("click", this.handleOutsideClick);
    },
    beforeUnmount() {
      document.removeEventListener("click", this.handleOutsideClick);
    },
    methods: {
      open() {
        this.isOpen = true;
      },
      close() {
        this.isOpen = false;
      },
      toggle() {
        this.isOpen = !this.isOpen;
      },
      goToSection(section) {
        if (typeof window.showTab === "function") {
          window.showTab(section);
        } else {
          window.location.hash = section;
        }
        this.close();
      },
      doLogout() {
        if (typeof window.logout === "function") {
          window.logout();
        }
        this.close();
      }
    },
    template: `
      <div class="user-panel" :class="{ open: isOpen }">
        <button class="user-avatar" type="button" aria-haspopup="true" :aria-expanded="isOpen.toString()" @click.stop="toggle">
          <img :src="avatarUrl" alt="Foto de perfil" />
        </button>
        <div class="user-menu" role="menu" @click.stop>
          <button type="button" role="menuitem" @click="goToSection('mensajes')">
            <span class="menu-icon">💬</span>
            Mensajes
          </button>
          <button type="button" role="menuitem" @click="goToSection('perfil')">
            <span class="menu-icon">👤</span>
            Perfil
          </button>
          <button type="button" role="menuitem" @click="doLogout">
            <span class="menu-icon">⏻</span>
            Cerrar sesión
          </button>
        </div>
      </div>
    `
  });

  app.mount(mountEl);
});
