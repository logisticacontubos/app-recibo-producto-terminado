// ==========================================================
// CONFIGURACIÓN
// ==========================================================
const API_URL = "https://script.google.com/macros/s/AKfycbzoW4nrhA3IxumwTbpPrGoTEevCquwhzbFN_kZMB6LAeaPUE8SVfx5OJEc9bQmu460Q/exec";

// ==========================================================
// SESIÓN (usuario logueado, guardado en sessionStorage) — igual patrón que las otras apps
// ==========================================================
function guardarSesion(usuario) {
  sessionStorage.setItem("usuario", JSON.stringify(usuario));
}
function obtenerSesion() {
  const raw = sessionStorage.getItem("usuario");
  return raw ? JSON.parse(raw) : null;
}
function cerrarSesion() {
  sessionStorage.removeItem("usuario");
  window.location.href = "index.html";
}
function requiereSesion() {
  const u = obtenerSesion();
  if (!u) { window.location.href = "index.html"; return null; }
  return u;
}

// ==========================================================
// ROLES Y PERMISOS
// rol real en la hoja Usuarios: jefe_produccion | auxiliar_produccion |
// operario_logistica | asistente_logistica | supervisor_inventarios | jefe_logistica
// ==========================================================
function puedeCrearEntrega(rol) {
  return rol === "jefe_produccion" || rol === "auxiliar_produccion";
}
function puedeRecibir(rol) {
  return rol === "operario_logistica" || rol === "asistente_logistica";
}
function esAdmin(rol) {
  return rol === "supervisor_inventarios" || rol === "jefe_logistica";
}

// ==========================================================
// INDICADOR DE "CARGANDO / PROCESANDO" GLOBAL
// ==========================================================
const MENSAJES_CARGA = {
  login: "Verificando...",
  getMaestros: "Cargando datos...",
  getOrCreateOPN: "Verificando OPN...",
  crearEntrega: "Creando entrega...",
  getEntregas: "Cargando entregas...",
  getEntregasPendientes: "Cargando entregas...",
  getEntregasPorOPN: "Cargando entregas...",
  recibirEntrega: "Registrando recibo...",
  getInventario: "Cargando inventario...",
  ajusteInventario: "Registrando ajuste...",
  getIndicadores: "Cargando indicadores...",
};
let _cargasActivas = 0;
function mostrarCargando(mensaje) {
  _cargasActivas++;
  let el = document.getElementById("loadingOverlay");
  if (!el) {
    el = document.createElement("div");
    el.id = "loadingOverlay";
    el.className = "loading-overlay";
    el.innerHTML = '<div class="spinner"></div><div class="texto"></div>';
    document.body.appendChild(el);
  }
  el.querySelector(".texto").textContent = mensaje || "Procesando...";
  el.style.display = "flex";
}
function ocultarCargando() {
  _cargasActivas = Math.max(0, _cargasActivas - 1);
  if (_cargasActivas > 0) return;
  const el = document.getElementById("loadingOverlay");
  if (el) el.style.display = "none";
}

// ==========================================================
// LLAMADAS A LA API (Apps Script) — mismo patrón que las otras apps
// ==========================================================
async function fetchConReintento(hacerFetch, reintentos) {
  let ultimoError;
  for (let intento = 0; intento <= reintentos; intento++) {
    try {
      const resp = await hacerFetch();
      const texto = await resp.text();
      let json;
      try {
        json = JSON.parse(texto);
      } catch (e) {
        throw new Error("La respuesta de Google no fue válida (intenta de nuevo en unos segundos).");
      }
      if (!json.ok) throw new Error(json.error || "Error desconocido");
      return json.data;
    } catch (e) {
      ultimoError = e;
      if (intento < reintentos) await new Promise((r) => setTimeout(r, 900));
    }
  }
  throw ultimoError;
}

async function apiPost(accion, datos, opts) {
  const body = Object.assign({ accion: accion }, datos);
  const silencioso = opts && opts.silencioso;
  if (!silencioso) mostrarCargando(MENSAJES_CARGA[accion] || "Procesando...");
  try {
    // Los POST (crear/recibir/ajustar) NO se reintentan automáticamente: si la
    // primera petición sí se guardó pero la respuesta se perdió, reintentar
    // duplicaría el registro.
    return await fetchConReintento(() => fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(body),
    }), 0);
  } finally {
    if (!silencioso) ocultarCargando();
  }
}

async function apiGet(accion, params, opts) {
  const base = Object.assign({ accion: accion }, params || {});
  const qs = new URLSearchParams(base);
  const silencioso = opts && opts.silencioso;
  if (!silencioso) mostrarCargando(MENSAJES_CARGA[accion] || "Cargando...");
  try {
    // Los GET (solo leer) sí se reintentan hasta 2 veces — son seguros de repetir.
    return await fetchConReintento(() => fetch(API_URL + "?" + qs.toString()), 2);
  } finally {
    if (!silencioso) ocultarCargando();
  }
}

// ==========================================================
// PÁGINA PROTEGIDA — valida sesión y arma el header en todas las pantallas
// internas (excepto index.html, que es el login).
// ==========================================================
function requiereApp() {
  const usuario = requiereSesion();
  if (!usuario) return null;
  mostrarUsuarioEnHeader(usuario);
  mostrarLogoEnHeader();
  mostrarBotonActualizar();
  mostrarBotonSalir();
  return usuario;
}

function mostrarLogoEnHeader() {
  const header = document.querySelector("header.topbar");
  if (!header) return;
  let img = header.querySelector(".logo-header");
  if (!img) {
    img = document.createElement("img");
    img.className = "logo-header";
    const back = header.querySelector(".back");
    if (back && back.nextSibling) header.insertBefore(img, back.nextSibling);
    else header.insertBefore(img, header.firstChild);
  }
  img.src = "assets/logo-contubos.png";
  img.alt = "Contubos";
}

function mostrarBotonActualizar() {
  const header = document.querySelector("header.topbar");
  if (!header || header.querySelector(".btn-actualizar")) return;
  const btn = document.createElement("button");
  btn.className = "btn-actualizar";
  btn.title = "Actualizar";
  btn.innerHTML = "&#8635;";
  btn.onclick = () => window.location.reload();
  header.appendChild(btn);
}

function mostrarBotonSalir() {
  const header = document.querySelector("header.topbar");
  if (!header || header.querySelector(".btn-salir")) return;
  const btn = document.createElement("button");
  btn.className = "btn-actualizar btn-salir";
  btn.title = "Cerrar sesión";
  btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>';
  btn.onclick = () => cerrarSesion();
  header.appendChild(btn);
}

function mostrarUsuarioEnHeader(usuario) {
  const header = document.querySelector("header.topbar");
  if (!header || header.querySelector(".userchip")) return;
  const chip = document.createElement("div");
  chip.className = "userchip";
  chip.innerHTML = `<div class="nombre">${usuario.nombre}</div><div class="rol">${usuario.cargo || usuario.rol}</div>`;
  header.appendChild(chip);
}

// ==========================================================
// UTILIDADES
// ==========================================================
function fechaHoy() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dia}`;
}
function mostrarError(elId, msg) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.textContent = msg;
  el.style.display = "block";
}
function ocultarError(elId) {
  const el = document.getElementById(elId);
  if (el) el.style.display = "none";
}
function mostrarToast(mensaje, ms) {
  const el = document.getElementById("toastExito");
  if (!el) return;
  el.textContent = mensaje;
  el.style.display = "block";
  clearTimeout(el._timeout);
  el._timeout = setTimeout(() => { el.style.display = "none"; }, ms || 2200);
}
function claseEstado(estado) {
  return (estado || "").toString().trim().replace(/\s+/g, "-");
}
