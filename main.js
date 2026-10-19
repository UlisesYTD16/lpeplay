// main.js — Lógica de interfaz para LPE Play
import {
  registerWithEmail,
  loginWithEmail,
  loginWithGoogle,
  resetPassword,
  logout,
  observeSession,
  processGoogleRedirect,
} from "./firebase.js";

/* ============ UTILIDADES ============ */
const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

async function loadJSON(path) {
  try {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`No se pudo cargar ${path}`);
    return await res.json();
  } catch (e) {
    console.warn(e);
    return null;
  }
}

/* ============ ESTADO GLOBAL ============ */
const state = {
  user: null,
  divisiones: [],
  equipos: [],
  eventos: [],
  resumenes: [],
  lpeShow: [],
  prp: [],
  proyeccion: [],
  femenino: [],
  futsal: [],
  programas: [],
  searchIndex: [],
};

/* ============ HEADER / MENÚ ============ */
const header   = $("#lpeHeader");
const menu     = $("#lpeMenu");
const openMenu = $("#openMenu");

openMenu?.addEventListener("click", () => {
  const opened = menu.classList.toggle("open");
  openMenu.setAttribute("aria-expanded", opened);
  menu.setAttribute("aria-hidden", !opened);
  document.body.style.overflow = opened ? "hidden" : "";
});

$$(".sub-toggle").forEach((btn) => {
  btn.addEventListener("click", () => {
    const sub = btn.nextElementSibling;
    const isOpen = sub.classList.toggle("open");
    btn.setAttribute("aria-expanded", isOpen);
  });
});

document.addEventListener("click", (e) => {
  if (menu.classList.contains("open") && !menu.contains(e.target) && !openMenu.contains(e.target)) {
    menu.classList.remove("open");
    openMenu.setAttribute("aria-expanded", false);
  }
});

/* ============ BUSCADOR ============ */
const searchPanel   = $("#searchPanel");
const searchInput   = $("#searchInput");
const searchResults = $("#searchResults");

$("#openSearch")?.addEventListener("click", () => {
  searchPanel.classList.add("open");
  searchPanel.setAttribute("aria-hidden", false);
  setTimeout(() => searchInput.focus(), 150);
});
$("#closeSearch")?.addEventListener("click", () => {
  searchPanel.classList.remove("open");
  searchPanel.setAttribute("aria-hidden", true);
  searchInput.value = "";
  searchResults.innerHTML = "";
});

searchInput?.addEventListener("input", (e) => {
  const q = e.target.value.trim().toLowerCase();
  searchResults.innerHTML = "";
  if (q.length < 2) return;

  const matches = state.searchIndex.filter((item) => {
    const hay = `${item.title} ${item.subtitle ?? ""} ${(item.tags ?? []).join(" ")}`.toLowerCase();
    return hay.includes(q);
  }).slice(0, 20);

  if (!matches.length) {
    searchResults.innerHTML = `<p style="color:var(--text-dim);padding:20px;">Sin resultados para "${q}".</p>`;
    return;
  }

  matches.forEach((m) => {
    const badge = m.status
      ? `<span class="search-badge search-badge--${m.status === "cancelado" ? "cancelled" : m.status === "en vivo" ? "live" : ""}">${m.status}</span>`
      : "";
    searchResults.insertAdjacentHTML("beforeend", `
      <a class="search-result" href="${m.url || '#'}">
        <img src="${m.thumb || 'recursos/imagenes/placeholder.jpg'}" alt="" loading="lazy" />
        <div class="search-result__info">
          <h4>${m.title}${badge}</h4>
          <span>${m.subtitle ?? ''}</span>
          ${m.date ? `<span>${m.date}</span>` : ''}
        </div>
      </a>
    `);
  });
});

/* ============ MODAL AUTH ============ */
const authModal   = $("#authModal");
const authForms   = $("#authForms");
const authSession = $("#authSession");

$("#openAuth")?.addEventListener("click", () => {
  authModal.classList.add("open");
  authModal.setAttribute("aria-hidden", false);
  menu.classList.remove("open");
});
$("#closeAuth")?.addEventListener("click", () => {
  authModal.classList.remove("open");
  authModal.setAttribute("aria-hidden", true);
});

$$(".lpe-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    $$(".lpe-tab").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    const isLogin = tab.dataset.tab === "login";
    $("#loginForm").classList.toggle("hidden", !isLogin);
    $("#registerForm").classList.toggle("hidden", isLogin);
  });
});

$("#loginForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const err = $("#loginError");
  err.textContent = "";
  const data = new FormData(e.target);
  try {
    await loginWithEmail(data.get("email"), data.get("password"));
    authModal.classList.remove("open");
  } catch (ex) {
    err.textContent = friendlyError(ex.code);
  }
});

$("#registerForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const err = $("#registerError");
  err.textContent = "";
  const data = new FormData(e.target);
  try {
    await registerWithEmail(data.get("email"), data.get("password"));
    authModal.classList.remove("open");
  } catch (ex) {
    err.textContent = friendlyError(ex.code);
  }
});

$("#googleLogin")?.addEventListener("click", async () => {
  try {
    await loginWithGoogle();
    authModal.classList.remove("open");
  } catch (ex) {
    console.warn(ex);
    $("#loginError").textContent = friendlyError(ex.code);
  }
});

$("#forgotPassword")?.addEventListener("click", async () => {
  const email = prompt("Ingresá tu correo para recuperar contraseña:");
  if (!email) return;
  try {
    await resetPassword(email);
    alert("Te enviamos un correo con las instrucciones.");
  } catch (ex) {
    alert(friendlyError(ex.code));
  }
});

$("#logoutBtn")?.addEventListener("click", async () => {
  await logout();
  authModal.classList.remove("open");
});

function friendlyError(code) {
  const map = {
    "auth/invalid-email": "Correo inválido.",
    "auth/user-not-found": "No existe una cuenta con ese correo.",
    "auth/wrong-password": "Contraseña incorrecta.",
    "auth/invalid-credential": "Correo o contraseña incorrectos.",
    "auth/email-already-in-use": "Ese correo ya está registrado.",
    "auth/weak-password": "La contraseña debe tener al menos 6 caracteres.",
    "auth/popup-closed-by-user": "Cerraste la ventana de Google.",
  };
  return map[code] || "Ocurrió un error. Intentá de nuevo.";
}

/* ============ SESIÓN ============ */
function renderSessionState(user) {
  state.user = user;
  const slot = $("#authSlot");
  if (!slot) return;

  if (user) {
    slot.innerHTML = `<button id="openAuth" class="auth-link">Mi cuenta (${user.email?.split("@")[0] ?? "Usuario"})</button>`;
    $("#openAuth").addEventListener("click", () => {
      authModal.classList.add("open");
      authForms.classList.add("hidden");
      authSession.classList.remove("hidden");
      $("#sessionEmail").textContent = user.email ?? "";
    });
  } else {
    slot.innerHTML = `<button id="openAuth" class="auth-link">Iniciar sesión / Registrarte</button>`;
    $("#openAuth").addEventListener("click", () => {
      authModal.classList.add("open");
      authForms.classList.remove("hidden");
      authSession.classList.add("hidden");
    });
  }

  // Actualizar candados en pósters
  $$(".card--poster[data-locked]").forEach((c) => {
    const lock = c.querySelector(".card__lock");
    if (lock) lock.style.display = user ? "none" : "grid";
  });
}

/* ============ CARRUSELES ============ */
function initCarousel(trackId) {
  const track = $(`#${trackId}`);
  if (!track) return;
  const navs = $$(`.carousel__nav[data-target="${trackId.replace('Track','Carousel')}"]`);
  navs.forEach((nav) => {
    nav.addEventListener("click", () => {
      const dir = nav.classList.contains("next") ? 1 : -1;
      track.scrollBy({ left: dir * track.clientWidth * 0.85, behavior: "smooth" });
    });
  });
}

/* ============ RENDER: DIVISIONES / ESCUDOS ============ */
function renderShields() {
  const grid = $("#shieldsGrid");
  if (!grid) return;
  grid.innerHTML = "";

  state.divisiones.forEach((div, idx) => {
    const equipos = state.equipos.filter((e) => e.division === div.slug);
    if (!equipos.length) return;

    const reversed = idx % 2 === 1;
    const duration = 30 + (idx % 4) * 6;

    const items = equipos.map((eq) => `
      <div class="shield" title="${eq.nombre}">
        <img src="${eq.escudo}" alt="${eq.nombre}" loading="lazy" />
      </div>
    `).join("");

    grid.insertAdjacentHTML("beforeend", `
      <div class="division-carousel">
        <div class="division-carousel__title">${div.nombre}</div>
        <div class="marquee ${reversed ? 'reverse' : ''}">
          <div class="marquee__inner" style="animation-duration:${duration}s;">${items}${items}</div>
        </div>
      </div>
    `);
  });
}

/* ============ RENDER: EVENTOS PROGRAMADOS ============ */
function computeStatus(ev) {
  const now = new Date();
  const start = new Date(ev.fechaInicio);
  const end   = new Date(ev.fechaFin);
  if (ev.estado === "cancelado") return "cancelado";
  if (now < start) return "programado";
  if (now >= start && now <= end) return "en vivo";
  return "finalizado";
}

function statusClass(status) {
  return status === "en vivo" ? "en-vivo" : status;
}

function renderEvents() {
  const track = $("#eventsTrack");
  if (!track) return;
  track.innerHTML = "";

  state.eventos.forEach((ev) => {
    const status = computeStatus(ev);
    const locked = !state.user && ev.requiereSesion;
    const fecha = new Date(ev.fechaInicio);
    const dateStr = fecha.toLocaleString("es-AR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

    track.insertAdjacentHTML("beforeend", `
      <a class="card card--poster ${locked ? 'locked' : ''}" href="${ev.url}" data-locked="${locked ? 1 : 0}">
        <img class="card__thumb" src="${ev.poster}" alt="${ev.titulo}" loading="lazy" />
        <span class="card__status status--${statusClass(status)}">${status}</span>
        ${locked ? `<span class="card__lock" aria-label="Contenido restringido">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#fff" stroke-width="2"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
        </span>` : ""}
        <div class="card__body">
          <p class="card__title">${ev.titulo}</p>
          <span class="card__meta">${ev.competicion} · ${dateStr}</span>
        </div>
      </a>
    `);
  });

  initCarousel("eventsCarousel");
}

/* ============ RENDER: TARJETAS 16:9 ============ */
function renderWideCards(trackId, items, showSeeMore = false) {
  const track = $(`#${trackId}`);
  if (!track) return;
  track.innerHTML = "";

  items.forEach((it) => {
    track.insertAdjacentHTML("beforeend", `
      <a class="card card--wide" href="${it.url}">
        <img class="card__thumb" src="${it.thumb}" alt="${it.titulo}" loading="lazy" />
        <div class="card__body">
          <p class="card__title">${it.titulo}</p>
          <span class="card__meta">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>
            ${it.views ?? 0} · ${it.publishedAgo ?? ''}
          </span>
        </div>
      </a>
    `);
  });

  const carouselId = trackId.replace("Track", "Carousel");
  initCarousel(carouselId);
}

/* ============ RENDER: SECCIÓN RESÚMENES ============ */
function renderResumenesSection() {
  const container = $("#resumenesContainer");
  if (!container) return;

  const divisiones = ["primera", "segunda-nacional", "federal-u", "lfg"];
  const titulos = {
    "primera": "Primera División",
    "segunda-nacional": "Segunda Nacional",
    "federal-u": "Federal U",
    "lfg": "LFG",
  };

  container.innerHTML = "";
  divisiones.forEach((slug, i) => {
    const items = state.resumenes.filter((r) => r.division === slug).slice(0, 10);
    if (!items.length) return;

    container.insertAdjacentHTML("beforeend", `
      <div class="section-head" style="margin-top:${i === 0 ? 0 : 40}px;">
        <h2 class="section-title">Resúmenes · ${titulos[slug]}</h2>
        <a class="btn-link" href="resumenes/${slug}.html">Ver más</a>
      </div>
      <div class="carousel" id="res-${slug}-carousel">
        <button class="carousel__nav prev" data-target="res-${slug}-carousel">‹</button>
        <div class="carousel__track" id="res-${slug}-track"></div>
        <button class="carousel__nav next" data-target="res-${slug}-carousel">›</button>
      </div>
    `);
    renderWideCards(`res-${slug}-track`, items);
  });
}

/* ============ RENDER: PROGRAMAS (9:16) ============ */
function renderPrograms() {
  const track = $("#programasTrack");
  if (!track) return;
  track.innerHTML = "";
  state.programas.forEach((p) => {
    track.insertAdjacentHTML("beforeend", `
      <a class="card card--poster" href="${p.url}">
        <img class="card__thumb" src="${p.poster}" alt="${p.titulo}" loading="lazy" />
        <div class="card__body">
          <p class="card__title">${p.titulo}</p>
          <span class="card__meta">${p.descripcion ?? ''}</span>
        </div>
      </a>
    `);
  });
  initCarousel("programasCarousel");
}

/* ============ RENDER: PARTNERS ============ */
function renderPartners() {
  const grid = $("#partnersGrid");
  if (!grid) return;
  const partners = state.divisiones.filter((d) => d.logo);
  grid.innerHTML = partners.map((p) => `
    <img src="${p.logo}" alt="${p.nombre}" loading="lazy" />
  `).join("");
}

/* ============ INDEX DE BÚSQUEDA ============ */
function buildSearchIndex() {
  const idx = [];

  state.eventos.forEach((ev) => {
    idx.push({
      title: ev.titulo,
      subtitle: `${ev.competicion} · Evento`,
      tags: [ev.competicion, ev.equipoLocal, ev.equipoVisitante].filter(Boolean),
      url: ev.url,
      thumb: ev.poster,
      date: new Date(ev.fechaInicio).toLocaleString("es-AR"),
      status: computeStatus(ev),
    });
  });

  state.resumenes.forEach((r) => idx.push({
    title: r.titulo, subtitle: `Resumen · ${r.division}`,
    tags: [r.division], url: r.url, thumb: r.thumb,
  }));
  state.lpeShow.forEach((r) => idx.push({
    title: r.titulo, subtitle: "LPE Show", url: r.url, thumb: r.thumb,
  }));
  state.prp.forEach((r) => idx.push({
    title: r.titulo, subtitle: "Puerto Rico Patea", url: r.url, thumb: r.thumb,
  }));
  state.proyeccion.forEach((r) => idx.push({
    title: r.titulo, subtitle: "Proyección", url: r.url, thumb: r.thumb,
  }));
  state.equipos.forEach((eq) => idx.push({
    title: eq.nombre, subtitle: `Equipo · ${eq.division}`,
    tags: [eq.division], url: `equipos/${eq.slug}.html`, thumb: eq.escudo,
  }));
  state.programas.forEach((p) => idx.push({
    title: p.titulo, subtitle: "Programa", url: p.url, thumb: p.poster,
  }));

  state.searchIndex = idx;
}

/* ============ INICIALIZACIÓN ============ */
async function boot() {
  // Cargar todos los JSON en paralelo
  const [
    divisiones, equipos, eventos, resumenes,
    lpeShow, prp, proyeccion, femenino, futsal, programas,
  ] = await Promise.all([
    loadJSON("recursos/data/divisiones/divisiones.json"),
    loadJSON("recursos/data/equipos/equipos.json"),
    loadJSON("recursos/data/eventos/programacion.json"),
    loadJSON("recursos/data/contenidos/resumenes.json"),
    loadJSON("recursos/data/contenidos/lpe-show.json"),
    loadJSON("recursos/data/contenidos/puerto-rico-patea.json"),
    loadJSON("recursos/data/contenidos/proyeccion.json"),
    loadJSON("recursos/data/contenidos/femenino.json"),
    loadJSON("recursos/data/contenidos/futsal.json"),
    loadJSON("recursos/data/programas/programas.json"),
  ]);

  state.divisiones = divisiones ?? [];
  state.equipos    = equipos ?? [];
  state.eventos    = eventos ?? [];
  state.resumenes  = resumenes ?? [];
  state.lpeShow    = lpeShow ?? [];
  state.prp        = prp ?? [];
  state.proyeccion = proyeccion ?? [];
  state.femenino   = femenino ?? [];
  state.futsal     = futsal ?? [];
  state.programas  = programas ?? [];

  renderShields();
  renderEvents();
  renderResumenesSection();

  // LPE Show
  renderWideCards("showTrack", state.lpeShow);
  initCarousel("showCarousel");

  // Puerto Rico Patea
  renderWideCards("prpTrack", state.prp);
  initCarousel("prpCarousel");

  // Femenino (mini carrusel)
  renderWideCards("femeninoTrack", state.femenino.slice(0, 6));
  // Futsal (mini carrusel)
  renderWideCards("futsalTrack", state.futsal.slice(0, 6));

  // Proyección
  renderWideCards("proyeccionTrack", state.proyeccion);
  initCarousel("proyeccionCarousel");

  // Programas y partners
  renderPrograms();
  renderPartners();

  buildSearchIndex();

  // Firebase
  try {
    await processGoogleRedirect();
    observeSession(renderSessionState);
  } catch (e) {
    console.warn("Firebase no disponible:", e);
    renderSessionState(null);
  }
}

document.addEventListener("DOMContentLoaded", boot);