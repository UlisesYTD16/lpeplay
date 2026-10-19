/* =====================================================
   LPE Play — code.js
   ===================================================== */

import {
  auth,
  db,
  loginWithEmail,
  registerWithEmail,
  loginWithGoogle,
  processGoogleRedirect,
  resetPassword,
  logout,
  observeSession
} from './firebase.js';

import {
  doc, getDoc, setDoc, updateDoc,
  collection, getDocs, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js';

/* ---------- Estado ---------- */
const state = {
  user: null, profile: null,
  equipos: [], eventos: [], programas: [],
  resumenes: {}, partners: []
};

/* ---------- Utilidades ---------- */
async function fetchJSON(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`No se pudo cargar ${path}`);
  return res.json();
}

function el(tag, cls, html) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html !== undefined) n.innerHTML = html;
  return n;
}

function slugify(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function buildContentUrl(item) {
  if (!item) return '#';
  if (item.url) return item.url;
  const type = item.type || 'video';
  if (type === 'evento') {
    const division = slugify(item.division || 'general');
    const a = slugify(item.equipoA || item.local || 'equipo-a');
    const b = slugify(item.equipoB || item.visitante || 'equipo-b');
    return `eventos/${division}/${a}-${b}.html`;
  }
  if (type === 'programa') {
    return `programas/${slugify(item.slug || item.titulo || 'programa')}.html`;
  }
  return `videos/${slugify(item.slug || item.titulo || 'video')}.html`;
}

function humanizeAuthError(err) {
  const code = err?.code || '';
  const map = {
    'auth/invalid-email': 'El correo no es válido.',
    'auth/user-disabled': 'Esta cuenta fue deshabilitada.',
    'auth/user-not-found': 'No existe una cuenta con ese correo.',
    'auth/wrong-password': 'Contraseña incorrecta.',
    'auth/invalid-credential': 'Correo o contraseña incorrectos.',
    'auth/email-already-in-use': 'Ese correo ya está registrado.',
    'auth/weak-password': 'La contraseña debe tener al menos 6 caracteres.',
    'auth/missing-password': 'Ingresá una contraseña.',
    'auth/too-many-requests': 'Demasiados intentos. Probá más tarde.',
    'auth/popup-closed-by-user': 'Cerraste la ventana de Google.',
    'auth/unauthorized-domain': 'Dominio no autorizado en Firebase.',
    'auth/operation-not-allowed': 'Método de inicio de sesión no habilitado.'
  };
  return map[code] || 'Ocurrió un error. Intentá de nuevo.';
}

/* ---------- Firestore ---------- */
async function getDefaultProfile(uid = state.user?.uid) {
  if (!uid) return null;
  const ref = doc(db, 'users', uid, 'profiles', 'default');
  const snap = await getDoc(ref);
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

async function listProfiles(uid = state.user?.uid) {
  if (!uid) return [];
  const col = collection(db, 'users', uid, 'profiles');
  const snap = await getDocs(col);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function createProfile({ name, avatarType = 'standard', avatarUrl, favoriteTeams = [] } = {}) {
  if (!state.user) throw new Error('No hay sesión activa.');
  if (!name || name.length < 1 || name.length > 30) throw new Error('Nombre inválido.');
  const profileId = `p_${Date.now()}`;
  const ref = doc(db, 'users', state.user.uid, 'profiles', profileId);
  const data = {
    name: name.slice(0, 30),
    avatarType,
    favoriteTeams,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };
  if (avatarType === 'custom' && avatarUrl) data.avatarUrl = avatarUrl;
  await setDoc(ref, data);
  return { id: profileId, ...data };
}

async function updateProfile(profileId, patch = {}) {
  if (!state.user) throw new Error('No hay sesión activa.');
  const allowed = ['name', 'avatarType', 'avatarUrl', 'favoriteTeams'];
  const clean = {};
  Object.keys(patch).forEach((k) => { if (allowed.includes(k)) clean[k] = patch[k]; });
  clean.updatedAt = serverTimestamp();
  await updateDoc(doc(db, 'users', state.user.uid, 'profiles', profileId), clean);
}

/* ---------- Sesión ---------- */
processGoogleRedirect().catch((e) => console.warn('Google redirect:', e?.code || e));

observeSession(async (user) => {
  state.user = user || null;
  state.profile = user ? await getDefaultProfile(user.uid).catch(() => null) : null;
  updateAuthLink();
  applyLockState();
  window.dispatchEvent(new CustomEvent('lpe:session', { detail: { user: state.user } }));
});

function updateAuthLink() {
  const authLink = document.getElementById('auth-link');
  if (!authLink) return;
  authLink.textContent = state.user
    ? 'Mi cuenta / Cerrar sesión'
    : 'Iniciar Sesión / Registrarte';
  authLink.href = state.user ? '#' : 'login.html';
  authLink.onclick = (e) => {
    if (state.user) { e.preventDefault(); logout().catch(() => {}); }
  };
}

/* ---------- Formularios auth ---------- */
function bindAuthForms() {
  const loginForm    = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const resetForm    = document.getElementById('reset-form');
  const googleBtn    = document.getElementById('google-btn');

  const showMsg = (form, msg, isError = true) => {
    if (!form) return;
    let box = form.querySelector('.auth-msg');
    if (!box) { box = el('div', 'auth-msg'); form.appendChild(box); }
    box.textContent = msg;
    box.style.color = isError ? '#fb7185' : '#86efac';
    box.style.marginTop = '12px';
    box.style.fontSize = '14px';
  };

  loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await loginWithEmail(loginForm.email.value.trim(), loginForm.password.value);
      showMsg(loginForm, '¡Bienvenido!', false);
      setTimeout(() => (window.location.href = 'index.html'), 400);
    } catch (err) { showMsg(loginForm, humanizeAuthError(err)); }
  });

  registerForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await registerWithEmail(
        registerForm.email.value.trim(),
        registerForm.password.value,
        registerForm.name.value.trim()
      );
      showMsg(registerForm, 'Cuenta creada. Redirigiendo…', false);
      setTimeout(() => (window.location.href = 'index.html'), 400);
    } catch (err) { showMsg(registerForm, humanizeAuthError(err)); }
  });

  resetForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await resetPassword(resetForm.email.value.trim());
      showMsg(resetForm, 'Te enviamos un correo.', false);
    } catch (err) { showMsg(resetForm, humanizeAuthError(err)); }
  });

  googleBtn?.addEventListener('click', async () => {
    try { await loginWithGoogle(); }
    catch (err) {
      const parent = googleBtn.closest('form') || document.body;
      const box = el('div', 'auth-msg');
      box.textContent = humanizeAuthError(err);
      box.style.color = '#fb7185';
      box.style.marginTop = '12px';
      parent.appendChild(box);
    }
  });
}

/* ---------- Drawers ---------- */
function setupDrawer(openId, drawerId, closeId, backdropId) {
  const openBtn  = document.getElementById(openId);
  const drawer   = document.getElementById(drawerId);
  const closeBtn = document.getElementById(closeId);
  const backdrop = document.getElementById(backdropId);
  if (!drawer) return;
  const close = () => {
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
  };
  openBtn?.addEventListener('click', () => {
    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
  });
  closeBtn?.addEventListener('click', close);
  backdrop?.addEventListener('click', close);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
}

function bindDrawers() {
  setupDrawer('menu-open', 'menu-drawer', 'menu-close', 'menu-backdrop');
  setupDrawer('search-open', 'search-drawer', 'search-close', 'search-backdrop');
}

/* ---------- Buscador ---------- */
function bindSearch() {
  const form  = document.getElementById('search-form');
  const input = document.getElementById('search-input');
  if (!form || !input) return;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = input.value.trim();
    if (!q) return;
    const slug = q.toLowerCase().replace(/\s+/g, '-');
    window.location.href = `search.html?q=${encodeURIComponent(slug)}`;
  });
}

async function searchAll(query) {
  const q = slugify(query);
  if (!q) return [];
  const results = [];

  if (!state.eventos.length) {
    try { const d = await fetchJSON('recursos/data/eventos.json');
      state.eventos = Array.isArray(d) ? d : d.eventos || []; } catch (e) {}
  }
  state.eventos.forEach((it) => {
    const hay = slugify(`${it.titulo || ''} ${it.equipoA || ''} ${it.equipoB || ''} ${it.division || ''}`);
    if (hay.includes(q)) results.push({ ...it, type: it.type || 'evento', _kind: 'evento' });
  });

  if (!state.programas.length) {
    try { const d = await fetchJSON('recursos/data/programas.json');
      state.programas = Array.isArray(d) ? d : d.programas || []; } catch (e) {}
  }
  state.programas.forEach((it) => {
    const hay = slugify(`${it.titulo || ''} ${it.slug || ''}`);
    if (hay.includes(q)) results.push({ ...it, type: 'programa', _kind: 'programa' });
  });

  if (!Object.keys(state.resumenes).length) {
    try { state.resumenes = await fetchJSON('recursos/data/resumenes.json'); } catch (e) {}
  }
  Object.values(state.resumenes).forEach((section) => {
    (section.items || []).forEach((it) => {
      const hay = slugify(`${it.titulo || ''} ${it.slug || ''}`);
      if (hay.includes(q)) results.push({ ...it, type: it.type || 'video', _kind: 'video' });
    });
  });

  return results;
}

/* ---------- Marquee ---------- */
async function renderTeamsMarquee() {
  try {
    const data = await fetchJSON('recursos/data/equipos.json');
    state.equipos = Array.isArray(data) ? data : data.equipos || [];
    if (!state.equipos.length) return;

    const row1 = document.getElementById('teams-marquee-row1');
    const row2 = document.getElementById('teams-marquee-row2');
    if (!row1 || !row2) return;

    const half = Math.ceil(state.equipos.length / 2);
    const r1 = state.equipos.slice(0, half);
    const r2 = state.equipos.slice(half);

    const fill = (container, list) => {
      container.innerHTML = '';
      [...list, ...list].forEach((t) => {
        const badge = el('div', 'team-badge');
        badge.title = t.name || '';
        const img = document.createElement('img');
        img.src = t.escudo || t.logo || '';
        img.alt = t.name || 'Equipo';
        img.loading = 'lazy';
        badge.appendChild(img);
        container.appendChild(badge);
      });
    };
    fill(row1, r1);
    fill(row2, r2);
  } catch (e) { console.warn('Equipos:', e); }
}

/* ---------- Pósters ---------- */
function createPosterCard(item, { locked }) {
  const card = el('div', 'poster-card');
  card.setAttribute('role', 'button');
  card.tabIndex = 0;
  card.dataset.type = item.type || 'evento';

  const img = document.createElement('img');
  img.src = item.poster || item.imagen || '';
  img.alt = item.titulo || 'Contenido';
  img.loading = 'lazy';
  card.appendChild(img);

  if (locked) {
    const lock = el('div', 'lock');
    lock.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>`;
    card.appendChild(lock);
  }

  const go = () => {
    if (locked) window.location.href = 'login.html';
    else window.location.href = buildContentUrl(item);
  };
  card.addEventListener('click', go);
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); }
  });
  return card;
}

function renderPosterCarousel(containerId, items) {
  const track = document.getElementById(containerId);
  if (!track) return;
  track.innerHTML = '';
  items.forEach((it) => track.appendChild(createPosterCard(it, { locked: !state.user })));
}

/* ---------- Resúmenes ---------- */
function createResumenCard(item) {
  const card = el('div', 'resumen-card');
  const thumb = el('div', 'resumen-thumb');
  const img = document.createElement('img');
  img.src = item.thumbnail || item.imagen || '';
  img.alt = item.titulo || '';
  img.loading = 'lazy';
  thumb.appendChild(img);

  const title = el('div', 'resumen-title', item.titulo || '');
  const meta = el('div', 'resumen-meta');
  meta.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
    <span>${item.vistas || '0'} vistas</span><span>·</span><span>${item.hace || ''}</span>`;

  card.appendChild(thumb);
  card.appendChild(title);
  card.appendChild(meta);
  card.addEventListener('click', () => {
    window.location.href = buildContentUrl({ ...item, type: item.type || 'video' });
  });
  return card;
}

function renderResumenSection(sectionEl, sectionData) {
  sectionEl.innerHTML = '';
  const head = el('div', 'section-head');
  head.appendChild(el('h2', 'section-title', sectionData.titulo || ''));
  sectionEl.appendChild(head);

  const track = el('div', 'resumen-track');
  (sectionData.items || []).forEach((it) => track.appendChild(createResumenCard(it)));
  sectionEl.appendChild(track);

  if (sectionData.verMasHref) {
    const btn = el('a', 'vermas-btn', 'Ver más →');
    btn.href = sectionData.verMasHref;
    sectionEl.appendChild(btn);
  }
}

/* ---------- Partners ---------- */
async function renderPartners() {
  try {
    const data = await fetchJSON('recursos/data/partners.json');
    const grid = document.getElementById('partners-grid');
    if (!grid) return;
    grid.innerHTML = '';
    const list = Array.isArray(data) ? data : data.partners || [];
    list.forEach((p) => {
      const item = el('div', 'partner-item');
      const img = document.createElement('img');
      img.src = p.logo || '';
      img.alt = p.name || 'Partner';
      img.loading = 'lazy';
      item.appendChild(img);
      grid.appendChild(item);
    });
  } catch (e) { console.warn('Partners:', e); }
}

/* ---------- Candados ---------- */
function applyLockState() {
  document.querySelectorAll('.poster-card').forEach((card) => {
    const hasLock = card.querySelector('.lock');
    if (!state.user && !hasLock) {
      const lock = el('div', 'lock');
      lock.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>`;
      card.appendChild(lock);
    } else if (state.user && hasLock) {
      hasLock.remove();
    }
  });
}

/* ---------- Flechas ---------- */
function bindCarouselArrows() {
  document.querySelectorAll('.carousel-btn').forEach((btn) => {
    if (btn.dataset.bound === '1') return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', () => {
      const track = document.getElementById(btn.dataset.target);
      if (!track) return;
      const dir = btn.classList.contains('next') ? 1 : -1;
      track.scrollBy({ left: dir * (track.clientWidth * 0.8), behavior: 'smooth' });
    });
  });
}

/* ---------- Reproductor simulado ---------- */
async function loadEventoProgramacion(division, slugEquipos) {
  try {
    const data = await fetchJSON('recursos/eventos/programacion.json');
    const list = Array.isArray(data) ? data : data.eventos || [];
    const key = `${slugify(division)}/${slugify(slugEquipos)}`;
    return list.find((e) => {
      const a = slugify(e.equipoA || '');
      const b = slugify(e.equipoB || '');
      return `${slugify(e.division || '')}/${a}-${b}` === key;
    }) || null;
  } catch (e) { return null; }
}

function setupSimulatedPlayer({ videoEl, containerEl, evento }) {
  if (!videoEl || !evento) return;

  const ahora = Date.now();
  const inicio = evento.inicioMs || new Date(evento.inicio || 0).getTime();
  const fin = evento.finMs || new Date(evento.fin || 0).getTime();

  let estado = evento.estado;
  if (!estado) {
    if (ahora < inicio) estado = 'programado';
    else if (ahora > fin) estado = 'finalizado';
    else estado = 'en-vivo';
  }

  if (estado === 'en-vivo') {
    videoEl.removeAttribute('controls');
    videoEl.play().catch(() => {});
  } else {
    videoEl.setAttribute('controls', '');
  }

  const badge = el('div', 'live-badge');
  badge.textContent = estado === 'en-vivo' ? '● EN VIVO' :
                     estado === 'programado' ? 'PROGRAMADO' : 'FINALIZADO';
  badge.classList.toggle('live', estado === 'en-vivo');
  containerEl.appendChild(badge);

  if (estado === 'programado') {
    const cartel = el('div', 'live-overlay');
    cartel.innerHTML = `<div class="live-msg">El evento empieza pronto</div>`;
    containerEl.appendChild(cartel);
    return;
  }

  if (estado === 'en-vivo') {
    let targetTime = evento.videoInicioEnVivo || 0;
    let goLiveBtn = null;
    const showGoLive = () => {
      if (goLiveBtn) return;
      goLiveBtn = el('button', 'go-live-btn', 'Ir al vivo');
      goLiveBtn.addEventListener('click', () => {
        videoEl.currentTime = targetTime;
        videoEl.play().catch(() => {});
        goLiveBtn.remove();
        goLiveBtn = null;
      });
      containerEl.appendChild(goLiveBtn);
    };
    videoEl.addEventListener('seeking', () => {
      if (Math.abs(videoEl.currentTime - targetTime) > 2) {
        videoEl.currentTime = targetTime;
      }
    });
    setInterval(() => {
      if (!videoEl.paused) targetTime = Math.min(videoEl.duration || Infinity, targetTime + 1);
      if (videoEl.currentTime - targetTime > 15) showGoLive();
    }, 1000);
  }
}

function formatDuration(ms) {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/* ---------- Init index ---------- */
async function initIndex() {
  bindDrawers();
  bindSearch();
  bindCarouselArrows();

  await renderTeamsMarquee();
  await renderPartners();

  try {
    const d = await fetchJSON('recursos/data/eventos.json');
    state.eventos = Array.isArray(d) ? d : d.eventos || [];
    renderPosterCarousel('eventos-track', state.eventos);
  } catch (e) { console.warn('Eventos:', e); }

  try {
    const d = await fetchJSON('recursos/data/programas.json');
    state.programas = Array.isArray(d) ? d : d.programas || [];
    renderPosterCarousel('programas-track', state.programas);
  } catch (e) { console.warn('Programas:', e); }

  try {
    state.resumenes = await fetchJSON('recursos/data/resumenes.json');
    document.querySelectorAll('[data-resumenes-section]').forEach((sectionEl) => {
      const key = sectionEl.dataset.resumenesSection;
      if (state.resumenes[key]) renderResumenSection(sectionEl, state.resumenes[key]);
    });
  } catch (e) { console.warn('Resúmenes:', e); }

  applyLockState();

  window.addEventListener('lpe:session', () => {
    applyLockState();
    renderPosterCarousel('eventos-track', state.eventos);
    renderPosterCarousel('programas-track', state.programas);
  })
