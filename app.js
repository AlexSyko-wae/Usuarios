
function setupPasswordToggle() {
    const toggleBtns = document.querySelectorAll('#togglePassword');

    toggleBtns.forEach((toggleBtn) => {
        const wrapper = toggleBtn.closest('.password-wrapper');
        const passwordInput = wrapper.querySelector('input[type="password"], input[type="text"]');
        const eyeIcon = toggleBtn.querySelector('i');

        if (toggleBtn && passwordInput && eyeIcon) {
            toggleBtn.addEventListener('click', () => {
                const isPassword = passwordInput.type === 'password';
                passwordInput.type = isPassword ? 'text' : 'password';

                eyeIcon.classList.toggle('fa-eye');
                eyeIcon.classList.toggle('fa-eye-slash');
            });
        }
    });
}

/* Fin de la sección para el ojo */
/* Fin de la sección para el ojo */


const STORAGE = {
  SESSION: "peje_session",
  EVENTS: "peje_events"
};

const API_BASE =
  (typeof window !== "undefined" && window.PEJE_API_BASE) || "http://127.0.0.1:5000";

const STRIPE_PUBLISHABLE_KEY = "pk_test_51TNJvcBbv5m9j8pfGndFlTY9pm6of72sVzC5IxnWYgItJG5IfgO6zCiwcwwHnAWDb5QO6vGR3r5PmoTOz8fFKvst00G2aHPMjd";
let stripeClient = null;
let stripeElements = null;
let stripeCardElement = null;
let stripeCardMounted = false;

function apiUrl(path) {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${String(API_BASE).replace(/\/$/, "")}${p}`;
}

async function apiFetchJson(path, options = {}) {
  const url = apiUrl(path);
  const opts = { ...options };
  opts.headers = { ...(opts.headers || {}) };
  if (opts.body && typeof opts.body === "string" && !opts.headers["Content-Type"]) {
    opts.headers["Content-Type"] = "application/json";
  }
  const res = await fetch(url, opts);
  let data = null;
  try {
    const text = await res.text();
    if (text) data = JSON.parse(text);
  } catch {
    data = null;
  }
  return { res, data };
}

async function refreshEventsFromBackend() {
  try {
    const { res, data } = await apiFetchJson("/api/eventos-disponibles", { method: "GET" });
    if (res && res.ok && data && data.success && Array.isArray(data.data)) {
      state.events = data.data.map((e) => {
        const fechaRaw = e.fecha ?? e.Fecha;
        const catRaw = e.categoria ?? e.Categoria;
        return {
          id: e.id ?? e.ID,
          nombre: (e.titulo ?? e.Titulo ?? e.nombre ?? e.Nombre ?? "").trim() || "—",
          fecha: normalizeFechaFromApiForState(fechaRaw),
          ubicacion: (e.ubicacion ?? e.Ubicacion ?? "").trim(),
          capacidad: Number(e.capacidad ?? e.Capacidad ?? 0) || 0,
          descripcion: (e.descripcion ?? e.Descripcion ?? "").trim(),
          categoria: String(catRaw != null ? catRaw : "").trim() || "General",
          disponibles: Number(e.disponibles ?? e.Disponibles ?? 0) || 0,
          vendidos: Number(e.vendidos ?? e.Vendidos ?? 0) || 0,
          precioMin: Number(e.precio_minimo ?? e.precioMinimo ?? e.PrecioMinimo ?? 0) || 0,
          boletosGenerados: Number(e.boletos_generados ?? e.BoletosGenerados ?? 0)
        };
      });
    }
  } catch (e) {
    console.warn("Error cargando eventos desde BD:", e);
  }
}



/*boletos general*/
// --- API GENERAR BOLETOS ---
async function apiPostGenerarBoletos(eventoId, precio) {
  const { res, data } = await apiFetchJson("/api/generar-boletos", {
    method: "POST",
    body: JSON.stringify({
      evento_id: eventoId,
      precio: precio
    })
  });
  return { ok: res.ok, data };
}

async function apiComprarBoletos(eventoId, usuarioId, cantidad = 1, metodo = "Stripe") {
  const { res, data } = await apiFetchJson("/api/comprar-boleto", {
    method: "POST",
    body: JSON.stringify({ evento_id: eventoId, usuario_id: usuarioId, cantidad, metodo })
  });
  return { ok: res.ok, data };
}

async function apiCreatePaymentIntent(eventoId, cantidad = 1) {
  const { res, data } = await apiFetchJson("/api/create-payment-intent", {
    method: "POST",
    body: JSON.stringify({ evento_id: eventoId, cantidad })
  });
  return { ok: res.ok, data };
}

async function apiObtenerOrdenes(usuarioId) {
  const { res, data } = await apiFetchJson("/api/mis-ordenes", {
    method: "POST",
    body: JSON.stringify({ usuario_id: usuarioId })
  });
  return { ok: res.ok, data };
}

async function apiObtenerPerfil(usuarioId) {
  const { res, data } = await apiFetchJson(`/api/mi-perfil/${encodeURIComponent(usuarioId)}`, {
    method: "GET"
  });
  return { ok: res.ok, data };
}

async function apiActualizarPerfilOnServer(userId, nombre, email, password) {
  const { res, data } = await apiFetchJson("/api/actualizar-perfil", {
    method: "POST",
    body: JSON.stringify({
      user_id: userId,
      nombre,
      email,
      password
    })
  });
  return { ok: res.ok && data && data.success, data };
}

function profilePhotoStorageKey(userId) {
  return `peje_profile_photo_${userId}`;
}

function loadProfilePhoto(userId) {
  if (!userId) return null;
  try {
    return localStorage.getItem(profilePhotoStorageKey(userId));
  } catch {
    return null;
  }
}

function saveProfilePhoto(userId, dataUrl) {
  if (!userId || !dataUrl) return;
  try {
    localStorage.setItem(profilePhotoStorageKey(userId), dataUrl);
  } catch {
    // ignore
  }
}

function renderProfilePhoto(userId) {
  const photo = loadProfilePhoto(userId);
  return photo || "https://via.placeholder.com/160/0ea5e9/ffffff?text=Foto";
}

function updateStoredSessionProfile(session, name, email) {
  const updated = { ...session };
  if (name && typeof name === "string") updated.name = name;
  if (email && typeof email === "string") updated.email = email;
  try {
    saveSession(updated);
    return updated;
  } catch (e) {
    console.error("No se pudo actualizar la sesión:", e);
    return session;
  }
}

async function refreshProfileInfo(session) {
  if (!session || !session.userId) return session;
  try {
    const { ok, data } = await apiObtenerPerfil(session.userId);
    if (!ok || !data || !data.success || !data.user) return session;
    const user = data.user;
    const updated = { ...session };
    if (user.nombre) updated.name = String(user.nombre).trim();
    if (user.email) updated.email = String(user.email).trim();
    saveSession(updated);
    return updated;
  } catch (e) {
    console.warn("No se pudo cargar el perfil del usuario:", e);
    return session;
  }
}

function showStripeCardErrors(message) {
  const el = document.getElementById("card-errors");
  if (!el) return;
  el.textContent = message;
  el.classList.remove("hidden");
}

function clearStripeCardErrors() {
  const el = document.getElementById("card-errors");
  if (!el) return;
  el.textContent = "";
  el.classList.add("hidden");
}

async function initStripeCard() {
  if (stripeCardMounted) return true;
  if (typeof Stripe === "undefined") {
    showToast("Stripe no está disponible. Carga la página de nuevo.", "error");
    return false;
  }
  if (!STRIPE_PUBLISHABLE_KEY || STRIPE_PUBLISHABLE_KEY.includes("REEMPLAZA")) {
    showToast("Configura tu clave pública de Stripe en app.js.", "error");
    return false;
  }

  stripeClient = stripeClient || Stripe(STRIPE_PUBLISHABLE_KEY);
  stripeElements = stripeElements || stripeClient.elements();
  stripeCardElement = stripeElements.create("card", {
    style: {
      base: {
        color: "#0f172a",
        fontFamily: "Inter, system-ui, sans-serif",
        fontSize: "16px",
        "::placeholder": { color: "#94a3b8" }
      },
      invalid: {
        color: "#b91c1c"
      }
    }
  });

  const mount = document.getElementById("card-element");
  if (!mount) {
    showToast("No se encontró el contenedor de tarjeta.", "error");
    return false;
  }
  stripeCardElement.mount(mount);
  stripeCardMounted = true;

  stripeCardElement.on("change", (event) => {
    if (event.error) {
      showStripeCardErrors(event.error.message);
    } else {
      clearStripeCardErrors();
    }
  });
  return true;
}

async function showPaymentSection(event) {
  const paymentSection = document.getElementById("stripePaymentSection");
  if (!paymentSection) return;
  paymentSection.classList.remove("hidden");
  const paymentTitle = document.getElementById("paymentAmountLabel");
  if (paymentTitle) {
    paymentTitle.textContent = event.precioMin > 0 ? `Total a pagar: $${event.precioMin.toFixed(2)}` : "Total a pagar: $0.00";
  }
  const confirmBtn = paymentSection.querySelector(".btn-confirm-payment");
  if (confirmBtn) {
    confirmBtn.dataset.id = event.id;
    confirmBtn.dataset.amount = Math.round((event.precioMin || 0) * 100);
  }
  await initStripeCard();
}

async function confirmStripePayment(eventId) {
  const session = getSession();
  if (!session || !session.userId) {
    showToast("Necesitas iniciar sesión para completar el pago.", "error");
    return;
  }
  const event = getEventById(eventId);
  if (!event) {
    showToast("Evento no encontrado.", "error");
    return;
  }
  if (event.precioMin <= 0) {
    showToast("No se encontró un precio válido para el evento.", "error");
    return;
  }
  clearStripeCardErrors();

  const { ok, data } = await apiCreatePaymentIntent(eventId, 1);
  if (!ok || !data || !data.success) {
    showToast("No se pudo iniciar el pago: " + (data?.error || "Error desconocido"), "error");
    return;
  }
  const clientSecret = data.client_secret;
  if (!clientSecret) {
    showToast("No se recibió el client_secret de Stripe.", "error");
    return;
  }

  showToast("Procesando pago con Stripe...", "info");
  const result = await stripeClient.confirmCardPayment(clientSecret, {
    payment_method: {
      card: stripeCardElement,
      billing_details: {
        name: session.nombre || session.email || "Cliente"
      }
    }
  });

  if (result.error) {
    showStripeCardErrors(result.error.message || "Error al procesar el pago.");
    showToast("Error de pago: " + (result.error.message || "No se pudo realizar el cargo."), "error");
    return;
  }
  if (result.paymentIntent && result.paymentIntent.status === "succeeded") {
    const { ok: bought, data: buyData } = await apiComprarBoletos(eventId, session.userId, 1, "Stripe");
    if (bought && buyData && buyData.success) {
      showToast("Pago realizado y boleto reservado correctamente.", "success");
      closeEventDetailModal();
      await refreshEventsFromBackend();
      if (session.role === ROLES.USER) {
        await refreshOrdersFromBackend();
      }
      renderView(session);
    } else {
      showToast("Pago confirmado, pero no se pudo reservar el boleto: " + (buyData?.error || "Error desconocido"), "error");
    }
    return;
  }

  showToast("El pago no se completó correctamente.", "error");
}

function getEventById(eventId) {
  return state.events.find((e) => Number(e.id) === Number(eventId)) || null;
}

function renderEventDetailModal(event) {
  if (!event) {
    return `
      <div class="modal-card">
        <div class="modal-header">
          <h3>Evento no encontrado</h3>
          <button type="button" class="modal-close" aria-label="Cerrar detalles">&times;</button>
        </div>
        <div class="modal-body">
          <p>Este evento ya no está disponible o no se encontró en el listado.</p>
        </div>
      </div>`;
  }

  return `
    <div class="modal-card">
      <div class="modal-header">
        <div>
          <h3>${escapeHtml(event.nombre)}</h3>
          <p class="muted" style="margin: 8px 0 0;">${escapeHtml(event.fecha)} · ${escapeHtml(event.ubicacion)}</p>
        </div>
        <button type="button" class="modal-close" aria-label="Cerrar detalles">&times;</button>
      </div>
      <div class="modal-body">
        <p class="muted" style="margin-bottom: 1rem;">Categoría: ${escapeHtml(event.categoria || "General")}</p>
        <p style="margin-bottom: 1rem;">${escapeHtml(event.descripcion || "No hay descripción disponible para este evento.")}</p>
        <div class="modal-row">
          <div>
            <strong>Capacidad total</strong>
            <p>${event.capacidad.toLocaleString("es-MX")}</p>
          </div>
          <div>
            <strong>Boletos vendidos</strong>
            <p>${event.vendidos.toLocaleString("es-MX")}</p>
          </div>
          <div>
            <strong>Disponibles</strong>
            <p>${event.disponibles.toLocaleString("es-MX")}</p>
          </div>
        </div>
        <div class="modal-row" style="margin-top: 16px;">
          <div>
            <strong>Precio</strong>
            <p>${event.precioMin > 0 ? `$${event.precioMin.toFixed(2)} MXN` : "Precio disponible"}</p>
          </div>
        </div>
        <div id="stripePaymentSection" class="hidden" style="margin-top:1.25rem;">
          <h4>Pago con tarjeta</h4>
          <div class="field">
            <label for="card-element">Número de tarjeta</label>
            <div id="card-element" class="stripe-card"></div>
            <p id="card-errors" class="form-error hidden" role="alert"></p>
          </div>
          <p id="paymentAmountLabel" class="muted" style="margin-top: 8px; margin-bottom: 12px;"></p>
          <div class="modal-actions">
            <button type="button" class="btn btn-secondary btn-sm modal-close">Cerrar</button>
            <button type="button" class="btn btn-primary btn-sm btn-confirm-payment" data-id="${event.id}" data-amount="${Math.round((event.precioMin || 0) * 100)}">
              Confirmar pago
            </button>
          </div>
        </div>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-secondary btn-sm modal-close">Cerrar</button>
        <button type="button" class="btn btn-primary btn-sm btn-start-payment" data-id="${event.id}" ${event.disponibles <= 0 || event.precioMin <= 0 ? "disabled" : ""}>
          ${event.disponibles > 0 ? "Pagar con Stripe" : "Agotado"}
        </button>
      </div>
    </div>`;
}

function openEventDetailModal(event) {
  const modal = document.getElementById("eventDetailModal");
  const backdrop = document.getElementById("eventModalBackdrop");
  if (!modal || !backdrop) return;

  modal.innerHTML = renderEventDetailModal(event);
  modal.classList.remove("hidden");
  backdrop.classList.remove("hidden");
  requestAnimationFrame(() => {
    modal.classList.add("visible");
    backdrop.classList.add("visible");
  });
  modal.setAttribute("aria-hidden", "false");
  backdrop.setAttribute("aria-hidden", "false");
}

function closeEventDetailModal() {
  const modal = document.getElementById("eventDetailModal");
  const backdrop = document.getElementById("eventModalBackdrop");
  if (!modal || !backdrop) return;

  modal.classList.remove("visible");
  backdrop.classList.remove("visible");
  modal.setAttribute("aria-hidden", "true");
  backdrop.setAttribute("aria-hidden", "true");
  if (stripeCardElement && stripeCardMounted) {
    stripeCardElement.unmount();
    stripeCardMounted = false;
    stripeCardElement = null;
  }
  modal.addEventListener(
    "transitionend",
    () => {
      if (modal.classList.contains("visible")) return;
      modal.classList.add("hidden");
      backdrop.classList.add("hidden");
      modal.innerHTML = "";
    },
    { once: true }
  );
}

/*boletos general*/






function mapApiUserToSession(apiUser) {
  if (!apiUser || typeof apiUser !== "object") return null;
  const email = String(apiUser.email ?? apiUser.correo ?? apiUser.Correo ?? "").trim();
  const tipoRaw = apiUser.tipo ?? apiUser.rol ?? apiUser.Tipo ?? apiUser.Rol ?? "";
  const role = String(tipoRaw).trim().toLowerCase();
  if (!email) return null;
  const idVal = apiUser.id ?? apiUser.idUsuario ?? apiUser.ID ?? apiUser.user_id;
  const userId = idVal != null && idVal !== "" ? Number(idVal) : NaN;
  return {
    email,
    name: String(apiUser.nombre ?? apiUser.Nombre ?? "").trim() || "",
    role,
    userId: Number.isFinite(userId) ? userId : null
  };
}

function normalizeUsuarioRow(row) {
  if (!row || typeof row !== "object") {
    return { id: 0, nombre: "—", correo: "", rol: "usuario" };
  }
  const idVal = row.id ?? row.idUsuario ?? row.ID;
  let id = Number(idVal);
  if (!Number.isFinite(id)) id = 0;
  return {
    id,
    nombre: String(row.nombre ?? row.Nombre ?? "").trim() || "—",
    correo: String(row.correo ?? row.email ?? row.Correo ?? "").trim(),
    rol: String(row.tipo ?? row.rol ?? row.Tipo ?? "usuario").trim().toLowerCase()
  };
}

async function refreshUsersFromBackend() {
  const session = getSession();
  if (!session || session.role !== ROLES.ADMIN) return;
  try {
    const { res, data } = await apiFetchJson("/api/usuarios", { method: "GET" });
    if (!res.ok || !data || !data.success || !Array.isArray(data.data)) return;
    state.users = data.data.map(normalizeUsuarioRow);
  } catch (e) {
    console.warn("refreshUsersFromBackend", e);
  }
}

async function refreshOrdersFromBackend() {
  const session = getSession();
  if (!session || session.role !== ROLES.USER) return;
  try {
    const { ok, data } = await apiObtenerOrdenes(session.userId);
    if (!ok || !data || !data.success || !Array.isArray(data.data)) {
      return;
    }
    state.userOrders = data.data.map((order) => ({
      id: order.id,
      evento: order.evento,
      total: order.total,
      estado: order.estado,
      fecha: order.fecha,
      cantidad: order.cantidad
    }));
  } catch (e) {
    console.warn("refreshOrdersFromBackend", e);
  }
}

const EVENT_TIME_UI_KEY = "peje_event_time_ui";
const EVENT_CATEGORY_PRESETS = [
  "General",
  "Concierto",
  "Deportes",
  "Teatro",
  "Conferencia",
  "Festival"
];

function normalizeFechaFromApiForState(raw) {
  if (raw == null || raw === "") return "";
  const s = String(raw).trim().replace("T", " ");
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s} 00:00:00`;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(s)) return `${s}:00`;
  return s;
}

function pad2(n) {
  return String(Math.max(0, Math.min(59, Number(n) || 0))).padStart(2, "0");
}

function pad2h(n) {
  return String(Math.max(0, Math.min(23, Number(n) || 0))).padStart(2, "0");
}

function parseDbDateTimeParts(raw) {
  if (raw == null || raw === "") return { ymd: "", hhmm: "12:00" };
  let s = String(raw).trim();
  if (typeof raw === "object" && raw instanceof Date && !Number.isNaN(raw.getTime())) {
    const y = raw.getFullYear();
    const mo = String(raw.getMonth() + 1).padStart(2, "0");
    const d = String(raw.getDate()).padStart(2, "0");
    const H = String(raw.getHours()).padStart(2, "0");
    const M = String(raw.getMinutes()).padStart(2, "0");
    return { ymd: `${y}-${mo}-${d}`, hhmm: `${H}:${M}` };
  }
  s = s.replace("T", " ").replace(/\.\d+/, "").replace(/Z$/i, "").trim();
  const dm = s.match(/(\d{4}-\d{2}-\d{2})/);
  const ymd = dm ? dm[1] : "";
  let hhmm = "12:00";
  const afterDate = dm ? s.slice(s.indexOf(dm[0]) + dm[0].length) : s;
  const tm = afterDate.match(/(\d{1,2}):(\d{2})(?::\d{2})?/);
  if (tm) hhmm = `${pad2h(tm[1])}:${pad2(tm[2])}`;
  return { ymd, hhmm };
}

function formatMysqlDatetime(ymd, hhmm) {
  const m = /^(\d{2}):(\d{2})$/.exec((hhmm || "00:00").trim());
  const h = m ? m[1] : "00";
  const min = m ? m[2] : "00";
  return `${ymd} ${h}:${min}:00`;
}

function timeStringTo12Parts(hhmm) {
  const [hs, ms] = (hhmm || "12:00").split(":");
  let H = parseInt(hs, 10);
  if (!Number.isFinite(H)) H = 0;
  H = ((H % 24) + 24) % 24;
  let M = parseInt(ms, 10);
  if (!Number.isFinite(M)) M = 0;
  M = ((M % 60) + 60) % 60;
  const ap = H < 12 ? "am" : "pm";
  let h12 = H % 12;
  if (h12 === 0) h12 = 12;
  return { h12, M, ap };
}

function hora12ToTimeString(h12, min, ap) {
  let H = Number(h12);
  if (!Number.isFinite(H) || H < 1 || H > 12) H = 12;
  let M = Number(min);
  if (!Number.isFinite(M) || M < 0 || M > 59) M = 0;
  if (ap === "am") {
    if (H === 12) H = 0;
  } else {
    if (H !== 12) H += 12;
  }
  return `${pad2h(H)}:${pad2(M)}`;
}

function getEventTimeDisplayMode() {
  try {
    return sessionStorage.getItem(EVENT_TIME_UI_KEY) === "12" ? "12" : "24";
  } catch {
    return "24";
  }
}

function syncEventTimePanelsVisibility(mode) {
  const row24 = $("#evTimeRow24");
  const row12 = $("#evTimeRow12");
  if (row24) row24.classList.toggle("hidden", mode !== "24");
  if (row12) row12.classList.toggle("hidden", mode !== "12");
}

function syncTimeModeToggleUI(mode) {
  document.querySelectorAll(".btn-time-mode").forEach((b) => {
    const on = b.getAttribute("data-mode") === mode;
    b.classList.toggle("is-active", on);
    b.setAttribute("aria-pressed", on ? "true" : "false");
  });
}

function initEventFormTimeUI() {
  const mode = getEventTimeDisplayMode();
  syncEventTimePanelsVisibility(mode);
  syncTimeModeToggleUI(mode);
}

function applyHour24ToBothUIs(hhmm) {
  const ok = /^(\d{2}):(\d{2})$/.test((hhmm || "").trim());
  const safe = ok ? hhmm.trim() : "12:00";
  const t24 = $("#evHora24");
  if (t24) t24.value = safe;
  const { h12, M, ap } = timeStringTo12Parts(safe);
  const hEl = $("#evHora12Hour");
  const mEl = $("#evHora12Min");
  const aEl = $("#evHora12Ampm");
  if (hEl) hEl.value = String(h12);
  if (mEl) mEl.value = String(M);
  if (aEl) aEl.value = ap;
}

function getHour24FromFormFields() {
  if (getEventTimeDisplayMode() === "24") {
    const el = $("#evHora24");
    if (el && el.value) return el.value;
    return "12:00";
  }
  const h12 = $("#evHora12Hour");
  const m = $("#evHora12Min");
  const ap = $("#evHora12Ampm");
  return hora12ToTimeString(
    Number(h12 && h12.value) || 12,
    Number(m && m.value) || 0,
    (ap && ap.value) || "am"
  );
}

function buildMysqlDatetimeFromForm() {
  const ymd = ($("#evFecha") && $("#evFecha").value) || "";
  if (!ymd) return "";
  return formatMysqlDatetime(ymd, getHour24FromFormFields());
}

function fillEventDatetimeFromDbString(raw) {
  const { ymd, hhmm } = parseDbDateTimeParts(raw);
  const y = $("#evFecha");
  const safeYmd = ymd || (raw != null && String(raw).trim() !== "" ? extractYmdFromRaw(raw) : "");
  if (y && safeYmd) {
    y.value = safeYmd;
    requestAnimationFrame(() => {
      const el = $("#evFecha");
      if (el) el.value = safeYmd;
    });
  } else if (y) {
    y.value = safeYmd || "";
  }
  applyHour24ToBothUIs(hhmm);
  initEventFormTimeUI();
}

function extractYmdFromRaw(raw) {
  const m = String(raw).match(/(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : "";
}

function getCategoriaFromForm() {
  const sel = $("#evCategoriaSelect");
  const custom = $("#evCategoriaCustom");
  if (!sel) return "General";
  if (sel.value === "__otros__") {
    const t = (custom && custom.value.trim()) || "";
    return t || "General";
  }
  return (sel.value && sel.value.trim()) || "General";
}

function setCategoriaOnForm(val) {
  const sel = $("#evCategoriaSelect");
  const custom = $("#evCategoriaCustom");
  const wrap = $("#evCategoriaCustomWrap");
  const v = (val || "").trim();
  if (!sel) return;
  if (!v) {
    sel.value = "General";
    if (wrap) wrap.classList.add("hidden");
    if (custom) custom.value = "";
    return;
  }
  const match = EVENT_CATEGORY_PRESETS.includes(v);
  if (match) {
    sel.value = v;
    if (wrap) wrap.classList.add("hidden");
    if (custom) custom.value = "";
  } else {
    sel.value = "__otros__";
    if (custom) custom.value = v;
    if (wrap) wrap.classList.remove("hidden");
  }
}

function renderHours12SelectOptions() {
  return Array.from({ length: 12 }, (_, i) => {
    const h = i + 1;
    return `<option value="${h}">${h}</option>`;
  }).join("");
}

async function apiCrearEventoOnServer(payload) {
  const session = getSession();
  const orgId = session && session.userId != null ? Number(session.userId) : null;
  const { res, data } = await apiFetchJson("/api/crear-evento", {
    method: "POST",
    body: JSON.stringify({
      titulo: payload.nombre,
      fecha: payload.fecha,
      ubicacion: payload.ubicacion,
      capacidad: payload.capacidad,
      descripcion: payload.descripcion,
      categoria: payload.categoria || "General",
      org_id: Number.isFinite(orgId) ? orgId : null
    })
  });
  return { ok: res.ok && data && data.success, data };
}

async function apiEditarEventoOnServer(eventoId, nombre, fecha, ubicacion, capacidad, descripcion, categoria) {
  const { res, data } = await apiFetchJson("/api/editar-evento", {
    method: "POST",
    body: JSON.stringify({
      evento_id: eventoId,
      titulo: nombre,
      fecha,
      ubicacion,
      capacidad,
      descripcion,
      categoria
    })
  });
  return { ok: res.ok && data && data.success, data };
}

async function apiEliminarEventoOnServer(eventoId) {
  const { res, data } = await apiFetchJson("/api/eliminar-evento", {
    method: "POST",
    body: JSON.stringify({ evento_id: eventoId })
  });
  return { ok: res.ok && data && data.success, data };
}

const ROLES = {
  ADMIN: "administrador",
  ORG: "organizador",
  USER: "cliente"
};

const VIEWS = [
  { key: "dashboard", label: "Inicio", icon: "fa-chart-line" },
  { key: "eventos", label: "Eventos", icon: "fa-calendar-days" },
  { key: "ordenes", label: "Mis compras", icon: "fa-receipt" },
  { key: "perfil", label: "Mi perfil", icon: "fa-user" },
  { key: "usuarios", label: "Usuarios", icon: "fa-users" },
  { key: "boletos", label: "Boletos", icon: "fa-ticket" },
  { key: "pagos", label: "Pagos", icon: "fa-credit-card" },
  { key: "reportes", label: "Reportes", icon: "fa-chart-column" },
  { key: "registro", label: "Registro", icon: "fa-user-plus" }
];

const state = {
  currentView: "dashboard",
  events: [],
  userOrders: [],
  dashboardSearch: "",
  dashboardCategory: "Todos",
  users: [
    { id: 1, nombre: "Ana López", correo: "ana@peje.com", rol: "administrador" },
    { id: 2, nombre: "Carlos Ruiz", correo: "carlos@peje.com", rol: "organizador" },
    { id: 3, nombre: "María Pérez", correo: "maria@peje.com", rol: "usuario" },
    { id: 4, nombre: "Luis Torres", correo: "luis@peje.com", rol: "organizador" }
  ],
  tickets: 12450,
  orders: 3678,
  payments: 3590
};

function getDashboardCategories() {
  const categories = new Set();
  (state.events || []).forEach((event) => {
    const category = String(event.categoria || event.Categoria || "General").trim();
    categories.add(category || "General");
  });
  return ["Todos", ...Array.from(categories).sort((a, b) => a.localeCompare(b, "es"))];
}

function getDashboardFilteredEvents() {
  const query = String(state.dashboardSearch || "").trim().toLowerCase();
  const category = String(state.dashboardCategory || "Todos");
  return (state.events || [])
    .filter((event) => {
      const title = String(event.nombre || event.titulo || "").toLowerCase();
      const location = String(event.ubicacion || event.Ubicacion || "").toLowerCase();
      const catValue = String(event.categoria || event.Categoria || "General").trim();
      const catLower = catValue.toLowerCase();
      const matchesQuery =
        !query ||
        title.includes(query) ||
        location.includes(query) ||
        catLower.includes(query);
      const matchesCategory =
        category === "Todos" || catValue === category;
      return matchesQuery && matchesCategory;
    })
    .sort((a, b) => {
      const dateA = new Date(a.fecha || a.Fecha).getTime();
      const dateB = new Date(b.fecha || b.Fecha).getTime();
      return Number.isFinite(dateA) && Number.isFinite(dateB) ? dateA - dateB : 0;
    });
}

const $ = (sel, root = document) => root.querySelector(sel);

function getSession() {
  try {
    const raw = localStorage.getItem(STORAGE.SESSION);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data.email !== "string" || typeof data.role !== "string") return null;
    return data;
  } catch {
    return null;
  }
}

function saveSession(payload) {
  try {
    localStorage.setItem(STORAGE.SESSION, JSON.stringify(payload));
  } catch (e) {
    console.error(e);
    throw e;
  }
}

function clearSession() {
  try {
    localStorage.removeItem(STORAGE.SESSION);
  } catch (e) {
    console.error(e);
  }
}

function roleLabel(role) {
  if (role === ROLES.ADMIN) return "Administrador";
  if (role === ROLES.ORG) return "Organizador";
  if (role === ROLES.USER) return "Cliente";
  return role;
}

function displayNameFromEmail(email) {
  if (!email || typeof email !== "string") return "Usuario";
  const local = email.split("@")[0];
  return local.replace(/[._-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function viewsForRole(role) {
  if (role === ROLES.ORG) {
    return VIEWS.filter((v) => v.key !== "usuarios" && v.key !== "registro");
  }
  if (role === ROLES.USER) {
    return VIEWS.filter((v) => ["dashboard", "eventos", "ordenes", "perfil"].includes(v.key));
  }
  // Si es administrador, devuelve todas las opciones
  return VIEWS.slice();
}

function canAccessView(role, viewKey) {
  return viewsForRole(role).some((v) => v.key === viewKey);
}

function hydrateEvents() {
  try {
    const raw = localStorage.getItem(STORAGE.EVENTS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {
    console.warn("No se pudieron leer eventos guardados.", e);
  }
  const initial = DEFAULT_EVENTS.map((e) => ({ ...e }));
  try {
    localStorage.setItem(STORAGE.EVENTS, JSON.stringify(initial));
  } catch (e) {
    console.warn("No se pudo persistir la lista inicial de eventos.", e);
  }
  return initial;
}

function persistEvents() {
  try {
    localStorage.setItem(STORAGE.EVENTS, JSON.stringify(state.events));
  } catch (e) {
    console.error(e);
    showToast("No se pudieron guardar los eventos. Revisa el almacenamiento del navegador.");
  }
}

let toastTimer = null;
function showToast(message, variant = "info") {
  const el = $("#toast");
  if (!el) {
    window.alert(message);
    return;
  }
  el.textContent = message;
  el.classList.remove("hidden", "toast-success", "toast-error");
  if (variant === "success") el.classList.add("toast-success");
  if (variant === "error") el.classList.add("toast-error");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.add("hidden");
  }, 3800);
}

function ensureValidView(session) {
  const allowed = viewsForRole(session.role).map((v) => v.key);
  if (!allowed.includes(state.currentView)) {
    state.currentView = "dashboard";
  }
}

function applyHashOrDefault(session) {
  const hash = (location.hash || "").replace(/^#/, "").trim();
  if (!hash) return;
  const exists = VIEWS.some((v) => v.key === hash);
  if (!exists) {
    try {
      history.replaceState(null, "", location.pathname + location.search);
    } catch { /* ignore */ }
    return;
  }
  if (canAccessView(session.role, hash)) {
    state.currentView = hash;
  } else {
    state.currentView = "dashboard";
    try {
      history.replaceState(null, "", location.pathname + location.search);
    } catch { /* ignore */ }
    showToast("No tienes permiso para acceder a esa sección.", "error");
  }
}

function renderMenu(session) {
  const menu = $("#menu");
  if (!menu) return;
  const items = viewsForRole(session.role);
  menu.innerHTML = items
    .map((v) => {
      const isActive = state.currentView === v.key;
      return `
      <button type="button" class="menu-item${isActive ? " active" : ""}" data-view="${v.key}" aria-current="${isActive ? "page" : "false"}">
        <span class="menu-item-inner">
          <i class="fa-solid ${v.icon}" aria-hidden="true"></i>
          <span class="menu-item-label">${v.label}</span>
        </span>
      </button>`;
    })
    .join("");

  menu.onclick = (e) => {
    const btn = e.target.closest("[data-view]");
    if (!btn) return;
    const session = getSession();
    if (!session) {
      window.location.href = "login.html";
      return;
    }

    const view = String(btn.dataset.view || "").trim();
    if (!view) return;
    if (!canAccessView(session.role, view)) {
      state.currentView = "dashboard";
      showToast("No tienes permiso para acceder a esa sección.", "error");
    } else {
      state.currentView = view;
    }

    const finishNav = () => {
      renderView(session);
      updateTopbar(session);
      closeMobileNav();
    };

    if (state.currentView === "usuarios" && session.role === ROLES.ADMIN) {
      refreshUsersFromBackend().then(finishNav).catch(() => finishNav());
    } else if (state.currentView === "eventos") {
      refreshEventsFromBackend().then(finishNav).catch(() => finishNav());
    } else if (state.currentView === "ordenes" && session.role === ROLES.USER) {
      refreshOrdersFromBackend().then(finishNav).catch(() => finishNav());
    } else {
      finishNav();
    }
  };
}

function updateTopbar(session) {
  const titleEl = $("#viewTitle");
  const current = VIEWS.find((v) => v.key === state.currentView);
  if (titleEl) titleEl.textContent = current ? current.label : "Dashboard";

  const nameEl = $("#userDisplayName");
  if (nameEl) {
    const name = session.name || displayNameFromEmail(session.email);
    nameEl.innerHTML = `<i class="fa-solid fa-user" aria-hidden="true"></i> ${escapeHtml(name)}`;
  }

  const emailEl = $("#userEmail");
  if (emailEl) {
    emailEl.textContent = session.email;
  }

  const avatarImg = $("#userAvatar img");
  if (avatarImg) {
    const photo = session.photo || loadProfilePhoto(session.userId);
    avatarImg.src = photo || "https://via.placeholder.com/64/0ea5e9/ffffff?text=PE";
    avatarImg.alt = `Foto de perfil de ${escapeHtml(session.name || displayNameFromEmail(session.email))}`;
  }

  const pill = $("#userRolePill");
  if (pill) {
    pill.textContent = roleLabel(session.role);
    pill.classList.remove("pill-admin", "pill-org");
    pill.classList.add(session.role === ROLES.ADMIN ? "pill-admin" : "pill-org");
  }
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function renderProfileView(session) {
  const s = session || getSession();
  if (!s) return "";
  const name = s.name || displayNameFromEmail(s.email);
  const email = s.email || "";
  const userId = s.userId || "";
  const avatar = renderProfilePhoto(userId);
  return `
    <div class="page-section profile-section">
      <div class="profile-panel">
        <div class="profile-card">
          <div class="profile-avatar-wrapper">
            <img id="profileAvatar" class="profile-avatar" src="${escapeHtml(avatar)}" alt="Foto de perfil de ${escapeHtml(name)}" />
            <label for="profilePhotoInput" class="profile-photo-button" tabindex="0">
              <i class="fa-solid fa-camera"></i>
              Cambiar foto
            </label>
            <input id="profilePhotoInput" name="profilePhoto" type="file" accept="image/*" class="hidden" />
          </div>
          <div class="profile-info">
            <h2>${escapeHtml(name)}</h2>
            <p class="muted">ID de usuario: ${escapeHtml(String(userId))}</p>
            <p class="muted">Correo: ${escapeHtml(email)}</p>
          </div>
        </div>
        <form id="profileForm" class="profile-form">
          <h3>Actualizar datos</h3>
          <div class="field">
            <label for="profileName">Nombre</label>
            <input id="profileName" name="nombre" type="text" value="${escapeHtml(name)}" placeholder="Tu nombre" />
          </div>
          <div class="field">
            <label for="profileEmail">Correo electrónico</label>
            <input id="profileEmail" name="email" type="email" value="${escapeHtml(email)}" placeholder="correo@ejemplo.com" />
          </div>
          <div class="field">
            <label for="profilePassword">Contraseña</label>
            <input id="profilePassword" name="password" type="password" placeholder="Dejar en blanco para mantener la actual" />
          </div>
          <p id="profileError" class="form-error hidden" role="alert"></p>
          <div class="modal-actions" style="justify-content:flex-start; margin-top:16px;">
            <button type="submit" class="btn btn-primary">Guardar cambios</button>
          </div>
        </form>
      </div>
    </div>`;
}

function renderDashboard(session) {
  const s = session || getSession();
  const userName = s ? displayNameFromEmail(s.email) : "Usuario";
  const filteredEvents = getDashboardFilteredEvents();
  const featuredEvents = filteredEvents.slice(0, 3);
  const popularEvents = state.events
    .slice()
    .sort((a, b) => (Number(b.vendidos) || 0) - (Number(a.vendidos) || 0))
    .slice(0, 3);
  const recentOrders = state.userOrders.slice(-3).reverse();

  const formatShortDate = (value) => {
    try {
      const date = new Date(value);
      if (!Number.isFinite(date.getTime())) return escapeHtml(String(value || "—"));
      return date.toLocaleDateString("es-MX", {
        day: "numeric",
        month: "short",
        year: "numeric"
      });
    } catch {
      return escapeHtml(String(value || "—"));
    }
  };

  return `
    <section class="dashboard-hero">
      <div class="hero-copy">
        <span class="eyebrow">¡Bienvenido a Peje Tickets!</span>
        <h1>Hola, ${escapeHtml(userName)}.</h1>
        <p class="hero-text">Explora los mejores eventos, compra boletos en segundos y mantente al día con tus próximas experiencias.</p>
        <div class="hero-actions">
          <button type="button" class="btn btn-primary btn-nav" data-view="eventos">Explorar eventos</button>
          <button type="button" class="btn btn-secondary btn-nav" data-view="ordenes">Ver mis compras</button>
        </div>
      </div>
      <div class="hero-cards">
        <article class="summary-card">
          <p class="label">Eventos disponibles</p>
          <p class="value">${state.events.length}</p>
        </article>
        <article class="summary-card">
          <p class="label">Tus compras</p>
          <p class="value">${state.userOrders.length}</p>
        </article>
        <article class="summary-card">
          <p class="label">Entradas vendidas</p>
          <p class="value">${state.tickets.toLocaleString("es-MX")}</p>
        </article>
        <article class="summary-card">
          <p class="label">Órdenes procesadas</p>
          <p class="value">${state.orders.toLocaleString("es-MX")}</p>
        </article>
      </div>
    </section>

    <section class="dashboard-search-panel">
      <div class="dashboard-search-left">
        <label class="search-label" for="dashboardSearch">Buscar eventos</label>
        <input id="dashboardSearch" type="search" class="search-input" value="${escapeHtml(state.dashboardSearch)}" placeholder="Buscar por nombre, ubicación o categoría" />
      </div>
      <div class="dashboard-search-right">
        <span class="search-count">${filteredEvents.length} evento(s) encontrados</span>
      </div>
    </section>

    <section class="category-chip-row">
      ${getDashboardCategories()
        .map(
          (category) => `
            <button type="button" class="category-chip${state.dashboardCategory === category ? " active" : ""}" data-category="${escapeHtml(category)}">
              ${escapeHtml(category)}
            </button>`
        )
        .join("")}
    </section>

    <section class="dashboard-grid">
      <article class="panel panel-featured">
        <div class="panel-header">
          <div>
            <h2 class="section-title">Eventos próximos</h2>
            <p class="muted">Filtrados por tu búsqueda y categoría seleccionada.</p>
          </div>
          <button type="button" class="btn btn-secondary btn-nav" data-view="eventos">Ver todos</button>
        </div>
        <div class="event-cards">
          ${featuredEvents.length
            ? featuredEvents
                .map((event) => {
                  const available = Number(event.disponibles || 0);
                  return `
                    <article class="event-card">
                      <div class="event-card-top">
                        <span class="event-badge">${escapeHtml(event.categoria || "General")}</span>
                        <span class="event-status ${available > 0 ? "status-available" : "status-soldout"}">${available > 0 ? `${available} boletos` : "Agotado"}</span>
                      </div>
                      <h3>${escapeHtml(event.nombre)}</h3>
                      <p class="event-meta">${formatShortDate(event.fecha)} · ${escapeHtml(event.ubicacion)}</p>
                      <p class="event-description">${escapeHtml(event.descripcion || "Una experiencia inolvidable está a un clic.")}</p>
                      <div class="event-card-footer">
                        <span class="event-price">${event.precioMin > 0 ? `$${event.precioMin.toFixed(2)}` : "Precio disponible"}</span>
                        <button type="button" class="btn btn-primary btn-sm btn-details" data-id="${event.id}">Ver evento</button>
                      </div>
                    </article>`;
                })
                .join("")
            : `<p class="muted">No se encontraron eventos con los filtros seleccionados. Prueba otra búsqueda o categoría.</p>`}
        </div>
      </article>

      <article class="panel panel-orders">
        <div class="panel-header">
          <div>
            <h2 class="section-title">Compras recientes</h2>
            <p class="muted">Sigue el estado de tus últimas órdenes.</p>
          </div>
        </div>
        ${recentOrders.length
          ? `<div class="orders-list">
              ${recentOrders
                .map(
                  (order) => `
                  <div class="order-card">
                    <div>
                      <p class="order-event">${escapeHtml(order.evento || "Evento")}</p>
                      <p class="muted">${formatShortDate(order.fecha)} · ${order.cantidad} boleto(s)</p>
                    </div>
                    <span class="order-status ${escapeHtml(order.estado || "Pendiente").toLowerCase()}">${escapeHtml(order.estado || "Pendiente")}</span>
                  </div>`
                )
                .join("")}
            </div>`
          : `<p class="muted">Aún no tienes compras. Encuentra tu próximo evento y asegura tu lugar.</p>`}
      </article>
    </section>

    <section class="panel panel-popular">
      <div class="panel-header">
        <div>
          <h2 class="section-title">Lo más popular</h2>
          <p class="muted">Eventos con más boletos vendidos.</p>
        </div>
      </div>
      <div class="cards cards-grid popular-cards">
        ${popularEvents.length
          ? popularEvents
              .map((event) => {
                const available = Number(event.disponibles || 0);
                return `
                  <article class="card popular-card">
                    <p class="label">${escapeHtml(event.categoria || "General")}</p>
                    <h3>${escapeHtml(event.nombre)}</h3>
                    <p class="muted">${formatShortDate(event.fecha)} · ${escapeHtml(event.ubicacion)}</p>
                    <p class="value">${event.precioMin > 0 ? `$${event.precioMin.toFixed(2)}` : "Precio disponible"}</p>
                    <div class="card-actions" style="margin-top: 10px; display:flex; gap:0.5rem; flex-wrap:wrap; align-items:center;">
                      <button type="button" class="btn btn-secondary btn-sm btn-details" data-id="${event.id}">Ver detalles</button>
                      <span class="tag ${available > 0 ? "tag-success" : "tag-danger"}">${available > 0 ? "Boletos disponibles" : "Agotado"}</span>
                    </div>
                  </article>`;
              })
              .join("")
          : `<p class="muted">No hay datos suficientes para mostrar eventos populares.</p>`}
      </div>
    </section>
  `;
}

function renderEventsTableRows() {
  return state.events
    .map(
      (e) => `
    <tr data-event-id="${e.id}">
      <td>${escapeHtml(e.nombre)}</td>
      <td>${escapeHtml(e.fecha)}</td>
      <td>${escapeHtml(e.ubicacion)}</td>
      <td>${e.capacidad.toLocaleString("es-MX")}</td>
      <td>${escapeHtml(e.descripcion || "")}</td>
      <td>${escapeHtml(e.categoria || "")}</td>
      <td class="table-actions">
        <button type="button" class="btn btn-secondary btn-sm btn-edit" data-id="${e.id}"><i class="fa-solid fa-pen"></i> Editar</button>
        <button type="button" class="btn btn-danger btn-sm btn-delete" data-id="${e.id}"><i class="fa-solid fa-trash"></i> Eliminar</button>
      </td>
    </tr>`
    )
    .join("");
}   



function renderEvents(session) {
  if (session && session.role === ROLES.USER) {
    return `
      <section class="panel">
        <div class="toolbar">
          <div>
            <h2 class="section-title">Explora eventos</h2>
            <p class="muted">Compra boletos disponibles para tus eventos favoritos.</p>
          </div>
          <div>
            <span class="tag tag-info">Clientes</span>
          </div>
        </div>
      </section>
      <div class="cards cards-grid" style="gap:1rem; grid-template-columns:repeat(auto-fit,minmax(250px,1fr));">
        ${state.events
          .map((e) => {
            const available = Number(e.disponibles ?? 0);
            const sold = Number(e.vendidos ?? 0);
            return `
              <article class="card">
                <h3>${escapeHtml(e.nombre)}</h3>
                <p class="muted" style="margin:0.25rem 0 0.75rem;">${escapeHtml(e.fecha)} · ${escapeHtml(e.ubicacion)}</p>
                <p style="margin-bottom:0.75rem;">${escapeHtml(e.descripcion || "Sin descripción disponible.")}</p>
                <p style="margin:0.25rem 0;"><strong>Categoría:</strong> ${escapeHtml(e.categoria || "General")}</p>
                <p style="margin:0.25rem 0;"><strong>Precio:</strong> ${e.precioMin > 0 ? `$${e.precioMin.toFixed(2)} MXN` : "Precio disponible"}</p>
                <p style="margin:0.25rem 0;">
                  <span class="tag ${available > 0 ? "tag-success" : "tag-danger"}">${available > 0 ? `${available} boletos disponibles` : "Agotado"}</span>
                  <span class="tag" style="margin-left:0.5rem;">${sold} vendidos</span>
                </p>
                <div class="card-actions" style="margin-top:1rem; display:flex; gap:0.5rem; flex-wrap:wrap; align-items:center;">
                  <button type="button" class="btn btn-secondary btn-sm btn-details" data-id="${e.id}">Ver detalles</button>
                  <button type="button" class="btn btn-primary btn-sm btn-start-payment" data-id="${e.id}" ${available <= 0 || e.precioMin <= 0 ? "disabled" : ""}>
                    ${available > 0 ? "Pagar con Stripe" : "No disponible"}
                  </button>
                </div>
              </article>`;
          })
          .join("")}
      </div>
    `;
  }

  return `
    <h2 class="section-title">Gestión de Eventos</h2>
    <div class="toolbar">
      <p class="muted">Administra y actualiza la cartelera de eventos.</p>
      <button type="button" id="btnNewEvent" class="btn btn-primary" style="width:auto;"><i class="fa-solid fa-plus"></i> Crear evento</button>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Fecha</th>
            <th>Ubicación</th>
            <th>Capacidad</th>
            <th>Descripción</th>
            <th>Categoría</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>${renderEventsTableRows()}</tbody>
      </table>
    </div>
    <section id="eventFormPanel" class="panel hidden">
      <h3 id="eventFormTitle">Crear evento</h3>
      <p id="eventFormError" class="form-error hidden" role="alert"></p>
      <form id="eventForm" style="margin-top:10px;" novalidate>
        <input type="hidden" id="eventId" />
        <div class="form-row">
          <div class="field">
            <label for="evNombre">Nombre</label>
            <input id="evNombre" autocomplete="off" />
          </div>
          <div class="field event-datetime-stack">
            <div class="datetime-ux-hint-row">
              <span class="muted datetime-hint-text">Formato de hora (solo pantalla; en servidor sigue siendo fecha y hora completas):</span>
              <div class="datetime-mode-toggle" role="group" aria-label="Formato de hora en pantalla">
                <button type="button" class="btn-time-mode is-active" data-mode="24" aria-pressed="true">24 h</button>
                <button type="button" class="btn-time-mode" data-mode="12" aria-pressed="false">12 h (a.&nbsp;m. / p.&nbsp;m.)</button>
              </div>
            </div>
            <label for="evFecha">Fecha</label>
            <input id="evFecha" type="date" />
            <div id="evTimeRow24" class="time-row">
              <label for="evHora24">Hora (24 h)</label>
              <input id="evHora24" type="time" step="60" value="12:00" />
            </div>
            <div id="evTimeRow12" class="time-row hidden">
              <span class="time-12-label">Hora (12 h)</span>
              <div class="time-12-inputs">
                <select id="evHora12Hour" aria-label="Hora"></select>
                <span class="time-sep">:</span>
                <input type="number" id="evHora12Min" min="0" max="59" value="0" aria-label="Minutos" />
                <select id="evHora12Ampm" aria-label="Mediodía">
                  <option value="am">a. m.</option>
                  <option value="pm">p. m.</option>
                </select>
              </div>
            </div>
          </div>
        </div>
        <div class="form-row">
          <div class="field">
            <label for="evUbicacion">Ubicación</label>
            <input id="evUbicacion" autocomplete="off" />
          </div>
          <div class="field">
            <label for="evCapacidad">Capacidad</label>
            <input id="evCapacidad" type="number" min="1" step="1" />
          </div>
        </div>
        <div class="form-row" style="margin-top: 10px;">
          <div class="field">
            <label for="evCategoriaSelect">Categoría</label>
            <p class="muted categoria-field-hint">Elige una opción del catálogo o «Otros» y escribe una categoría personalizada.</p>
            <select id="evCategoriaSelect">
              ${EVENT_CATEGORY_PRESETS.map(
                (p) => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`
              ).join("")}
              <option value="__otros__">Otros</option>
            </select>
          </div>
          <div id="evCategoriaCustomWrap" class="field hidden">
            <label for="evCategoriaCustom">Categoría personalizada</label>
            <input id="evCategoriaCustom" type="text" autocomplete="off" placeholder="Ej. Expo, Gala benéfica, Cine…" />
          </div>
        </div>
        <div class="form-row">
          <div class="field field--full-row">
            <label for="evDescripcion">Descripción</label>
            <textarea id="evDescripcion" rows="3" class="textarea-block"></textarea>
          </div>
        </div>
        <div class="form-actions" style="margin-top: 15px;">
          <button type="button" id="btnCancelEvent" class="btn btn-secondary">Cancelar</button>
          <button type="submit" class="btn btn-primary" style="width:auto;">Guardar</button>
        </div>
      </form>
    </section>
  `;
}

function renderUsers() {
  const roleClass = (rol) => (rol === "administrador" ? "admin" : rol === "organizador" ? "org" : "user");
  const rows = state.users
    .map(
      (u) => `
    <tr>
      <td>${escapeHtml(u.nombre)}</td>
      <td>${escapeHtml(u.correo)}</td>
      <td><span class="tag ${roleClass(u.rol)}">${escapeHtml(u.rol)}</span></td>
    </tr>`
    )
    .join("");

  return `
    <h2 class="section-title">Gestión de Usuarios</h2>
    <p class="muted" style="margin-bottom:10px;">Roles disponibles: administrador, organizador y usuario.</p>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Correo</th>
            <th>Rol</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}


function renderBoletosTableRows(filtro = 'todos') {
  // 1. Filtrar los eventos según la opción seleccionada
  const eventosFiltrados = state.events.filter(e => {
      const generados = e.boletosGenerados || 0;
      const faltantes = e.capacidad - generados;

      if (filtro === 'pendientes') return faltantes > 0;
      if (filtro === 'completos') return faltantes <= 0;
      return true; // 'todos'
  });

  if (eventosFiltrados.length === 0) {
      return '<tr><td colspan="4" style="text-align:center;">No hay eventos para esta categoría.</td></tr>';
  }

  // 2. Dibujar las filas con sus respectivos botones
  return eventosFiltrados.map(e => {
    const generados = e.boletosGenerados || 0;
    const faltantes = e.capacidad - generados;
    let accionesHtml = "";

    if (faltantes === e.capacidad) {
      // ESTADO NORMAL: No se ha generado nada (Conserva tu función actual)
      accionesHtml = `
        <div class="input-group" style="display:flex; gap:5px; align-items:center;">
          <input type="number" step="0.01" placeholder="Precio $" 
                 class="input-precio-boleto" id="precio-${e.id}" 
                 style="width:80px; padding:5px; border-radius:4px; border:1px solid #ccc;">
          <button class="btn btn-primary btn-sm btn-ejecutar-generacion" 
                  data-id="${e.id}" data-nombre="${e.nombre}" data-capacidad="${e.capacidad}">
            Generar Boletos
          </button>
        </div>`;
    } 
    else if (faltantes === 0) {
      // ESTADO COMPLETADO: Capacidad alcanzada (Botón cambiado y bloqueado)
      accionesHtml = `
        <button class="btn btn-secondary btn-sm" disabled 
                style="cursor:not-allowed; opacity:0.7; background-color:#6c757d; color:white; border:none; padding:5px 10px; border-radius:4px;">
           Límite de boletos superado (Ya creados)
        </button>`;
    } 
   else if (faltantes > 0) {
      // ESTADO INCONSISTENCIA: Faltan algunos boletos (Se borraron de la BD)
      accionesHtml = `
        <div style="color: #d9534f; margin-bottom: 5px; font-size: 0.85em;">
          <strong>Faltan ${faltantes} boletos</strong>
        </div>
        <div class="input-group" style="display:flex; gap:5px; align-items:center;">
          <input type="number" step="0.01" placeholder="Precio $" 
                 class="input-precio-boleto" id="precio-${e.id}" 
                 style="width:80px; padding:5px; border-radius:4px; border:1px solid #ccc;">
                 
          <button class="btn btn-warning btn-sm btn-ejecutar-generacion" 
                  data-id="${e.id}" data-nombre="${e.nombre}" data-capacidad="${faltantes}">
            Regenerar Faltantes
          </button>
        </div>`;
    }

    // Dibujamos la fila de la tabla
    return `
      <tr>
        <td>${escapeHtml(e.nombre)}</td>
        <td>${e.capacidad}</td>
        <td>${generados}</td>
        <td>${accionesHtml}</td>
      </tr>
    `;
  }).join("");
}

/**
 * Inicia la verificación automática cada 5 segundos
 */
function startBoletosPolling() {
  setInterval(async () => {
    if (state.currentView === "boletos") {
      await refreshEventsFromBackend(); // Consulta la base de datos
      const filtro = document.getElementById("filtroEstadoBoletos")?.value || 'todos';
      const tbody = document.getElementById("tablaBoletosBody");
      if (tbody) tbody.innerHTML = renderBoletosTableRows(filtro);
    }
  }, 5000);
}


function renderReports() {
  const sales = [
    { mes: "Ene", valor: 40 }, { mes: "Feb", valor: 55 }, { mes: "Mar", valor: 62 },
    { mes: "Abr", valor: 51 }, { mes: "May", valor: 72 }, { mes: "Jun", valor: 68 }
  ];
  const max = Math.max(...sales.map((s) => s.valor));

  return `
    <h2 class="section-title">Reportes Operativos</h2>
    <div class="grid-2">
      
      <section class="panel">
        <h3>Boletos vendidos por mes</h3>
        <div class="chart">
          ${sales.map(s => `
            <div class="bar-col">
              <div class="bar" style="height:${(s.valor / max) * 170 + 20}px;"></div>
              <div>${s.mes}</div>
            </div>`).join("")}
        </div>
      </section>

      <section class="panel">
        <h3>Resumen financiero</h3>
        <p class="muted">Ingreso total: $1,245,000 MXN</p>
        <p class="muted">Pagos exitosos: ${state.payments.toLocaleString("es-MX")}</p>
        <p class="muted">Reembolsos: 124</p>
        <p class="muted">Tasa de conversión: 4.8%</p>

        <!-- 🔥 AQUÍ VA TODO EL CONTROL DE IMPRESIÓN -->
        <div class="print-controls" style="margin-top:20px; border-top: 1px solid #eee; padding-top:15px;">
          <label style="display:block; margin-bottom:8px; font-weight:bold;">Acciones de Reporte:</label>
          
          <div style="display:grid; gap:10px;">
            
            <button class="btn btn-secondary" onclick="mostrarVistaPrevia('ventas')">
              <i class="fa-solid fa-chart-line"></i> Reporte de Ventas
            </button>

            <button class="btn btn-secondary" onclick="mostrarVistaPrevia('asistencia')">
              <i class="fa-solid fa-user-check"></i> Reporte de Asistencia
            </button>

            <button class="btn btn-secondary" onclick="mostrarVistaPrevia('pagos')">
              <i class="fa-solid fa-credit-card"></i> Reporte de Pagos
            </button>

            <button class="btn btn-primary" onclick="mostrarVistaPrevia('all')">
              <i class="fa-solid fa-file-pdf"></i> Imprimir Todo (Consolidado)
            </button>

          </div>
        </div>

      </section>
    </div>

    <!-- 🔥 MODAL DE VISTA PREVIA -->
    <div id="previewModal" class="modal hidden">
      <div class="modal-content" style="width:90%; max-width:1000px; height:90vh; display:flex; flex-direction:column;">
        
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
          <h3>Vista Previa de Impresión</h3>
          
          <div style="gap:10px; display:flex;">
            <button class="btn btn-primary" onclick="window.frames['printFrame'].print()">
              <i class="fa-solid fa-print"></i> Imprimir
            </button>
            <button class="btn btn-close" onclick="cerrarVistaPrevia()">Cerrar</button>
          </div>
        </div>

        <iframe id="printFrame" name="printFrame" style="flex-grow:1; border:1px solid #ccc; border-radius:4px;"></iframe>
      </div>
    </div>
  `;
}

/* no mover es para ejecutar el boton del pdf*/ 
async function ejecutarImpresion(tipo) {
  showToast("Generando reporte PDF...", "info");
  
  try {
    const response = await fetch('/api/reportes/imprimir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo: tipo })
    });

    if (response.ok) {
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Reporte_${tipo}_${new Date().toLocaleDateString()}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      closePrintModal();
    } else {
      showToast("Error al generar el PDF", "error");
    }
  } catch (error) {
    console.error("Error:", error);
    showToast("Error de conexión", "error");
  }
}


async function mostrarVistaPrevia(tipo) {
  const modal = document.getElementById('previewModal');
  const frame = document.getElementById('printFrame');

  modal.classList.remove('hidden');

  try {
    const response = await fetch('/api/reportes/imprimir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo: tipo })
    });

    if (response.ok) {
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      frame.src = url;
    } else {
      showToast("Error al generar vista previa", "error");
    }

  } catch (error) {
    console.error(error);
    showToast("Error de conexión", "error");
  }
}
function cerrarVistaPrevia() {
  document.getElementById('previewModal').classList.add('hidden');
  document.getElementById('printFrame').src = "";
}    
/*asta cadura lo de pdf*/





function renderSimple(title, desc) {
  return `
    <h2 class="section-title">${escapeHtml(title)}</h2>
    <section class="panel">
      <p class="muted">${escapeHtml(desc)}</p>
    </section>
  `;
}

function renderOrders(session) {
  if (session && session.role === ROLES.USER) {
    if (!state.userOrders || !state.userOrders.length) {
      return `
        <h2 class="section-title">Mis compras</h2>
        <section class="panel">
          <p class="muted">No tienes órdenes aún. Compra boletos en la sección de eventos.</p>
        </section>
      `;
    }

    return `
      <h2 class="section-title">Mis compras</h2>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Orden</th>
              <th>Evento</th>
              <th>Cantidad</th>
              <th>Total</th>
              <th>Estado</th>
              <th>Fecha</th>
            </tr>
          </thead>
          <tbody>
            ${state.userOrders
              .map(
                (order) => `
                  <tr>
                    <td>#${escapeHtml(String(order.id))}</td>
                    <td>${escapeHtml(order.evento || "-")}</td>
                    <td>${escapeHtml(String(order.cantidad || 0))}</td>
                    <td>$${Number(order.total || 0).toFixed(2)}</td>
                    <td>${escapeHtml(order.estado || "-")}</td>
                    <td>${escapeHtml(String(order.fecha || "-"))}</td>
                  </tr>`
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  return renderSimple("Órdenes", "Vista simulada para seguimiento de órdenes y estado de compra.");
}

function validateEventPayload(nombre, fechaMysql, ubicacion, capacidadNum, _descripcion, _categoria) {
  const errors = [];
  if (!nombre) errors.push("El nombre es obligatorio.");
  if (!ubicacion) errors.push("La ubicación es obligatoria.");
  if (!fechaMysql || !String(fechaMysql).trim()) errors.push("La fecha y la hora son obligatorias.");
  const forParse = String(fechaMysql || "").replace(" ", "T");
  const t = Date.parse(forParse);
  if (fechaMysql && Number.isNaN(t)) errors.push("La fecha u hora no son válidas.");
  if (!Number.isFinite(capacidadNum) || capacidadNum <= 0) errors.push("La capacidad debe ser un número mayor que 0.");
  return errors;
}

function showEventFormError(msg) {
  const el = $("#eventFormError");
  if (!el) return;
  if (!msg) {
    el.textContent = "";
    el.classList.add("hidden");
    return;
  }
  el.textContent = msg;
  el.classList.remove("hidden");
}

function resetEventForm() {
  const form = $("#eventForm");
  if (form) form.reset();
  const hid = $("#eventId");
  if (hid) hid.value = "";
  const title = $("#eventFormTitle");
  if (title) title.textContent = "Crear evento";
  setCategoriaOnForm("General");
  const y = $("#evFecha");
  if (y) y.value = "";
  applyHour24ToBothUIs("12:00");
  initEventFormTimeUI();
  showEventFormError("");
}

function nextEventId() {
  const ids = state.events.map((e) => e.id);
  return ids.length ? Math.max(...ids) + 1 : 1;
}

function initEventosFormControls() {
  const hsel = $("#evHora12Hour");
  if (hsel) hsel.innerHTML = renderHours12SelectOptions();
  initEventFormTimeUI();
}

function renderView(session) {
  const content = $("#content");
  if (!content) return;

  const s = session || getSession();
  if (!s) return;

  if (!canAccessView(s.role, state.currentView)) {
    state.currentView = "dashboard";
  }

  try {
    switch (state.currentView) {
      case "dashboard":
        content.innerHTML = renderDashboard();
        break;
      case "eventos":
        content.innerHTML = renderEvents(s);
        initEventosFormControls();
        break;
      case "usuarios":
        content.innerHTML = renderUsers();
        break;
      case "reportes":
        content.innerHTML = renderReports();
        break;
        // En renderView, case "boletos":
case "boletos":
  content.innerHTML = `
    <h2 class="section-title">Control de Capacidad</h2>
    <div style="margin-bottom:15px; background:#f9f9f9; padding:10px; border-radius:5px; border:1px solid #eee;">
      <label>Ver:</label>
      <select id="filtroBoletos" style="padding:5px; border-radius:4px;">
        <option value="todos">Todos los eventos</option>
        <option value="pendientes">Pendientes / Con errores</option>
        <option value="completos">Completos</option>
      </select>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr><th>Evento</th><th>Capacidad</th><th>Creados</th><th>Acciones</th></tr>
        </thead>
        <tbody id="tablaBoletosBody">${renderBoletosTableRows('todos')}</tbody>
      </table>
    </div>`;
    
    // Activar el filtro inmediatamente
    setTimeout(() => {
      const f = document.getElementById("filtroBoletos");
      if(f) f.onchange = (ev) => {
        document.getElementById("tablaBoletosBody").innerHTML = renderBoletosTableRows(ev.target.value);
      };
    }, 0);
  break;
      
     
      
      case "ordenes":
        content.innerHTML = renderOrders(s);
        break;
      case "perfil":
        content.innerHTML = renderProfileView(s);
        break;
      case "pagos":
        content.innerHTML = renderSimple("Pagos", "Vista simulada para conciliación de pagos exitosos, pendientes y rechazados.");
        break;
      default:
        state.currentView = "dashboard";
        content.innerHTML = renderDashboard();
    }
  } catch (e) {
    console.error(e);
    state.currentView = "dashboard";
    content.innerHTML = renderDashboard();
    showToast("Hubo un problema al mostrar la vista. Se mostró el Dashboard.", "error");
  }

  renderMenu(s);
}


function closeMobileNav() {
  const sidebar = $("#sidebar");
  const backdrop = $("#sidebarBackdrop");
  const toggle = $("#mobileToggle");
  if (sidebar) sidebar.classList.remove("open");
  if (backdrop) backdrop.classList.remove("is-visible");
  if (toggle) toggle.setAttribute("aria-expanded", "false");
}

/** Un solo listener en #menu (delegación). innerHTML de los botones no afecta este listener. */
function setupMenuDelegation() {
  const menu = $("#menu");
  if (!menu || menu.dataset.bound === "1") return;
  menu.dataset.bound = "1";
  menu.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-view]");
    if (!btn) return;

    const session = getSession();
    if (!session) {
      window.location.href = "login.html";
      return;
    }

    const view = String(btn.dataset.view || "").trim();
    if (!view) return;
    if (!canAccessView(session.role, view)) {
      state.currentView = "dashboard";
      showToast("No tienes permiso para acceder a esa sección.", "error");
    } else {
      state.currentView = view;
    }
    btn.blur();
    // Busca esta parte dentro de setupMenuDelegation y déjala así:
    const finishNav = () => {
      renderView(session);
      updateTopbar(session);
      closeMobileNav();
    };

    if (state.currentView === "usuarios" && session.role === ROLES.ADMIN) {
      refreshUsersFromBackend().then(finishNav).catch(() => finishNav());
    } else if (state.currentView === "eventos") {
      refreshEventsFromBackend().then(finishNav).catch(() => finishNav());
    } else if (state.currentView === "ordenes" && session.role === ROLES.USER) {
      refreshOrdersFromBackend().then(finishNav).catch(() => finishNav());
    } else if (state.currentView === "perfil") {
      refreshProfileInfo(session)
        .then((refreshed) => {
          const active = refreshed || session;
          renderView(active);
          updateTopbar(active);
          closeMobileNav();
        })
        .catch(() => finishNav());
    } else {
      finishNav();
    }
  });
}
/*empieza el contenido de los boletos */




function setupContentDelegation() {
  const app = $("#app");
  if (!app || app.dataset.eventsDelegation === "1") return;
  app.dataset.eventsDelegation = "1";

  // 1. EVENTO CHANGE (Para la categoría "Otros")
  app.addEventListener("change", (e) => {
    if (e.target.id === "evCategoriaSelect") {
      const wrap = $("#evCategoriaCustomWrap");
      const custom = $("#evCategoriaCustom");
      if (e.target.value === "__otros__") {
        if (wrap) wrap.classList.remove("hidden");
        if (custom) custom.focus();
      } else {
        if (wrap) wrap.classList.add("hidden");
        if (custom) custom.value = "";
      }
      return;
    }

    if (e.target.id === "dashboardSearch") {
      state.dashboardSearch = String(e.target.value || "");
      renderView(getSession());
      updateTopbar(getSession());
      return;
    }

    if (e.target.id === "profilePhotoInput") {
      const input = e.target;
      const session = getSession();
      if (!input.files || !input.files[0] || !session || !session.userId) return;
      const file = input.files[0];
      if (!file.type.startsWith("image/")) {
        showToast("Selecciona una imagen válida para tu foto de perfil.", "error");
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result;
        saveProfilePhoto(session.userId, dataUrl);
        const avatar = $("#profileAvatar");
        if (avatar) avatar.src = dataUrl;
        const topAvatar = $("#userAvatar img");
        if (topAvatar) topAvatar.src = dataUrl;
        showToast("Foto de perfil actualizada localmente.", "success");
      };
      reader.readAsDataURL(file);
      return;
    }
  });

  app.addEventListener("input", (e) => {
    if (e.target.id === "dashboardSearch") {
      state.dashboardSearch = String(e.target.value || "");
      renderView(getSession());
      updateTopbar(getSession());
    }
  });

  // 2. EVENTO CLICK (Para todos los botones)
  app.addEventListener("click", (e) => {
    const session = getSession();
    if (!session) {
      window.location.href = "login.html";
      return;
    }

    const t = e.target;

    // --- LÓGICA DE GENERACIÓN DE BOLETOS ---
    const btnEjecutar = t.closest(".btn-ejecutar-generacion");
    if (btnEjecutar) {
      const id = btnEjecutar.dataset.id;
      const nombre = btnEjecutar.dataset.nombre;
      const capacidad = btnEjecutar.dataset.capacidad;
      
      const inputPrecio = document.getElementById(`precio-${id}`);
      const precioValor = parseFloat(inputPrecio ? inputPrecio.value : 0);

      if (!precioValor || precioValor <= 0) {
        showToast("Por favor, ingresa un precio válido.", "error");
        if (inputPrecio) inputPrecio.focus();
        return;
      }

      if (confirm(`¿Generar ${capacidad} boletos para "${nombre}" a $${precioValor}?`)) {
        (async () => {
          showToast("Generando boletos...", "info");
          try {
            const { ok, data } = await apiPostGenerarBoletos(id, precioValor);
            if (ok && data.success) {
              showToast(`¡Éxito! Boletos generados.`, "success");
              if (inputPrecio) inputPrecio.value = ""; 
            } else {
              showToast("Error: " + (data.error || "No se pudo completar."), "error");
            }
          } catch (err) {
            showToast("Error de conexión.", "error");
          }
        })();
      }
      return;
    }

    const modalBackdrop = t.closest("#eventModalBackdrop");
    if (modalBackdrop) {
      closeEventDetailModal();
      return;
    }

    const modalClose = t.closest(".modal-close");
    if (modalClose) {
      closeEventDetailModal();
      return;
    }

    const detailsBtn = t.closest(".btn-details");
    if (detailsBtn) {
      const eventId = Number(detailsBtn.dataset.id);
      const event = getEventById(eventId);
      openEventDetailModal(event);
      return;
    }

    const startPaymentBtn = t.closest(".btn-start-payment");
    if (startPaymentBtn) {
      const eventId = Number(startPaymentBtn.dataset.id);
      const event = getEventById(eventId);
      openEventDetailModal(event);
      setTimeout(() => {
        showPaymentSection(event);
      }, 100);
      return;
    }

    const confirmPaymentBtn = t.closest(".btn-confirm-payment");
    if (confirmPaymentBtn) {
      const eventId = Number(confirmPaymentBtn.dataset.id);
      confirmStripePayment(eventId);
      return;
    }

    const buyBtn = t.closest(".btn-buy");
    if (buyBtn) {
      const eventId = Number(buyBtn.dataset.id);
      const session = getSession();
      if (!session || !session.userId) {
        showToast("Necesitas iniciar sesión para comprar.", "error");
        return;
      }
      if (!window.confirm("¿Deseas comprar un boleto para este evento?")) return;
      (async () => {
        showToast("Procesando compra...", "info");
        try {
          const { ok, data } = await apiComprarBoletos(eventId, session.userId, 1);
          if (ok && data && data.success) {
            closeEventDetailModal();
            showToast("Compra completada. Revisa tus órdenes.", "success");
            await refreshEventsFromBackend();
            if (session.role === ROLES.USER) {
              await refreshOrdersFromBackend();
            }
            renderView(session);
          } else {
            showToast("Error: " + (data.error || "No se pudo procesar la compra."), "error");
          }
        } catch (err) {
          showToast("Error de conexión.", "error");
        }
      })();
      return;
    }

    // --- BOTONES DE FILTRO DE TIEMPO (Hoy, Mañana, etc) ---
    const navBtn = t.closest(".btn-nav");
    if (navBtn) {
      const view = String(navBtn.dataset.view || "").trim();
      if (view && canAccessView(session.role, view)) {
        state.currentView = view;
        renderView(session);
        updateTopbar(session);
        closeMobileNav();
      }
      return;
    }

    const categoryBtn = t.closest(".category-chip");
    if (categoryBtn) {
      state.dashboardCategory = String(categoryBtn.dataset.category || "Todos");
      renderView(session);
      updateTopbar(session);
      return;
    }

    const modeBtn = t.closest(".btn-time-mode");
    if (modeBtn) {
      const mode = modeBtn.dataset.mode;
      renderDashboard(session, mode);
      return;
    }

    
  });



/*contenido de los boletos finaliza*/
  app.addEventListener("click", (e) => {
    const session = getSession();
    if (!session) {
      window.location.href = "login.html";
      return;
    }

    const t = e.target;

    const modeBtn = t.closest(".btn-time-mode");
    if (modeBtn) {
      const mode = modeBtn.getAttribute("data-mode");
      if (mode !== "12" && mode !== "24") return;
      const h24 = getHour24FromFormFields();
      try {
        sessionStorage.setItem(EVENT_TIME_UI_KEY, mode);
      } catch {
        /* ignore */
      }
      syncEventTimePanelsVisibility(mode);
      syncTimeModeToggleUI(mode);
      applyHour24ToBothUIs(h24);
      return;
    }

    if (t.closest("#btnNewEvent")) {
      const panel = $("#eventFormPanel");
      resetEventForm();
      const ft = $("#eventFormTitle");
      if (ft) ft.textContent = "Nuevo evento";
      if (panel) panel.classList.remove("hidden");
      return;
    }

    if (t.closest("#btnCancelEvent")) {
      const panel = $("#eventFormPanel");
      resetEventForm();
      if (panel) panel.classList.add("hidden");
      return;
    }

    const editBtn = t.closest(".btn-edit");
    if (editBtn) {
      const id = Number(editBtn.dataset.id);
      const item = state.events.find((ev) => ev.id == id);
      if (!item) return;
      const panel = $("#eventFormPanel");
      const hid = $("#eventId");
      if (hid) hid.value = String(item.id);
      const n = $("#evNombre");
      const u = $("#evUbicacion");
      const c = $("#evCapacidad");
      const d = $("#evDescripcion");
      const ft = $("#eventFormTitle");
      if (n) n.value = item.nombre;
      fillEventDatetimeFromDbString(item.fecha || "");
      if (u) u.value = item.ubicacion;
      if (c) c.value = String(item.capacidad);
      if (d) d.value = item.descripcion || "";
      setCategoriaOnForm(item.categoria || "General");
      if (ft) ft.textContent = "Editar evento";
      showEventFormError("");
      if (panel) panel.classList.remove("hidden");
      return;
    }

    const delBtn = t.closest(".btn-delete");
    if (delBtn) {
      const id = Number(delBtn.dataset.id);
      if (!Number.isFinite(id)) return;
      if (!window.confirm("¿Seguro que deseas eliminar este evento de la base de datos?")) return;
      (async () => {
        try {
          const { ok, data } = await apiEliminarEventoOnServer(id);
          if (!ok) {
            showToast((data && data.error) || "No se pudo eliminar del servidor.", "error");
            return;
          }
          showToast("Evento eliminado con éxito.", "success");
          await refreshEventsFromBackend();
          persistEvents();
          renderView(getSession());
          updateTopbar(getSession());
        } catch (err) {
          console.error(err);
          showToast("Error al conectar con el servidor.", "error");
        }
      })();
    }
  });

  app.addEventListener("submit", (e) => {
    const session = getSession();
    if (!session) {
      window.location.href = "login.html";
      return;
    }

    if (e.target.id === "profileForm") {
      e.preventDefault();
      const name = ($("#profileName") && $("#profileName").value.trim()) || "";
      const email = ($("#profileEmail") && $("#profileEmail").value.trim()) || "";
      const password = ($("#profilePassword") && $("#profilePassword").value) || "";
      const errorEl = $("#profileError");
      if (!name) {
        if (errorEl) {
          errorEl.textContent = "Ingrese un nombre válido.";
          errorEl.classList.remove("hidden");
        }
        return;
      }
      if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
        if (errorEl) {
          errorEl.textContent = "Ingrese un correo electrónico válido.";
          errorEl.classList.remove("hidden");
        }
        return;
      }
      if (errorEl) {
        errorEl.textContent = "";
        errorEl.classList.add("hidden");
      }
      (async () => {
        showToast("Guardando cambios de perfil...", "info");
        try {
          const { ok, data } = await apiActualizarPerfilOnServer(session.userId, name, email, password);
          if (!ok) {
            showToast((data && data.error) || "No se pudo actualizar el perfil.", "error");
            if (errorEl) {
              errorEl.textContent = (data && data.error) || "Error al actualizar perfil.";
              errorEl.classList.remove("hidden");
            }
            return;
          }
          const updated = updateStoredSessionProfile(session, name, email);
          updateTopbar(updated);
          showToast("Perfil actualizado correctamente.", "success");
        } catch (err) {
          console.error(err);
          showToast("Error al guardar los datos de perfil.", "error");
          if (errorEl) {
            errorEl.textContent = "Error al enviar los datos al servidor.";
            errorEl.classList.remove("hidden");
          }
        }
      })();
      return;
    }

    if (e.target.id !== "eventForm") return;
    e.preventDefault();

    const idRaw = ($("#eventId") && $("#eventId").value) || "";
    const id = idRaw ? Number(idRaw) : 0;
    const nombre = ($("#evNombre") && $("#evNombre").value.trim()) || "";
    const fecha = buildMysqlDatetimeFromForm();
    const ubicacion = ($("#evUbicacion") && $("#evUbicacion").value.trim()) || "";
    const capacidadNum = Number($("#evCapacidad") && $("#evCapacidad").value);
    const descripcion = ($("#evDescripcion") && $("#evDescripcion").value.trim()) || "";

    const catSel = $("#evCategoriaSelect");
    if (catSel && catSel.value === "__otros__") {
      const customTxt = ($("#evCategoriaCustom") && $("#evCategoriaCustom").value.trim()) || "";
      if (!customTxt) {
        showToast("Si eliges «Otros», escribe la categoría personalizada.", "error");
        return;
      }
    }
    const categoria = getCategoriaFromForm();

    const errs = validateEventPayload(nombre, fecha, ubicacion, capacidadNum, descripcion, categoria);
    if (errs.length) {
      showEventFormError(errs[0]);
      showToast(errs[0], "error");
      return;
    }
    showEventFormError("");

    const payload = {
      id: id || nextEventId(),
      nombre,
      fecha,
      ubicacion,
      capacidad: capacidadNum,
      descripcion,
      categoria
    };

    (async () => {
      try {
        if (id) {
          const { ok, data } = await apiEditarEventoOnServer(
            id,
            nombre,
            fecha,
            ubicacion,
            capacidadNum,
            descripcion,
            categoria
          );
          if (!ok) {
            showToast((data && data.error) || "Error al actualizar.", "error");
            return;
          }
          showToast("Evento actualizado en la base de datos.", "success");
          resetEventForm();
          const panel = $("#eventFormPanel");
          if (panel) panel.classList.add("hidden");
          await refreshEventsFromBackend();
          persistEvents();
          renderView(session);
          updateTopbar(session);
        } else {
          const { ok, data } = await apiCrearEventoOnServer(payload);
          if (!ok) {
            showToast((data && data.error) || "No se pudo crear el evento en el servidor.", "error");
            return;
          }
          await refreshEventsFromBackend();
          persistEvents();
          resetEventForm();
          const panel = $("#eventFormPanel");
          if (panel) panel.classList.add("hidden");
          renderView(session);
          updateTopbar(session);
          showToast("Evento guardado correctamente.", "success");
        }
      } catch (err) {
        console.error(err);
        showToast("Ocurrió un error al guardar.", "error");
      }
    })();
  });
}


async function initDashboard() {
  const app = $("#app");
  if (!app) return;
  


  const session = getSession();
  if (!session) {
    window.location.href = "login.html";
    return;
  }

  // Configuración de interfaz
  state.events = hydrateEvents();
  applyHashOrDefault(session);
  ensureValidView(session);

  const refreshedProfileSession = await refreshProfileInfo(session);
  const activeSession = refreshedProfileSession || session;

  setupMenuDelegation();
  setupContentDelegation();
  setupMobileMenu();
  setupBrandNavigation();
  setupLogout();

  // --- CORRECCIÓN AQUÍ ---
  // Descargamos los datos del servidor SIEMPRE al iniciar
  try {
    await refreshEventsFromBackend(); 
    if (activeSession.role === ROLES.USER) {
      await refreshOrdersFromBackend();
    }
    persistEvents();
    renderView(activeSession);
    updateTopbar(activeSession);

    // Activamos el verificador automático de boletos
    startBoletosPolling(); 
  } catch (err) {
    console.error("Error al cargar datos iniciales:", err);
  }

  if (activeSession.role === ROLES.ADMIN) {
    refreshUsersFromBackend().then(() => {
      renderView(activeSession);
      updateTopbar(activeSession);
    });
  }
}

function setupMobileMenu() {
  const toggle = $("#mobileToggle");
  const sidebar = $("#sidebar");
  const backdrop = $("#sidebarBackdrop");
  if (!toggle || toggle.dataset.bound === "1") return;
  toggle.dataset.bound = "1";
  toggle.addEventListener("click", () => {
    if (!sidebar) return;
    const willOpen = !sidebar.classList.contains("open");
    sidebar.classList.toggle("open", willOpen);
    if (backdrop) backdrop.classList.toggle("is-visible", willOpen);
    toggle.setAttribute("aria-expanded", willOpen ? "true" : "false");
  });

  if (backdrop && backdrop.dataset.bound !== "1") {
    backdrop.dataset.bound = "1";
    backdrop.addEventListener("click", closeMobileNav);
  }

  window.addEventListener("resize", () => {
    if (window.innerWidth > 800) closeMobileNav();
  });
}

function setupBrandNavigation() {
  const btn = $("#btnBrandHome");
  if (!btn || btn.dataset.bound === "1") return;
  btn.dataset.bound = "1";
  btn.addEventListener("click", async () => {
    const session = getSession();
    if (!session) {
      window.location.href = "login.html";
      return;
    }

    state.currentView = "dashboard";
    await refreshEventsFromBackend().catch(() => {});
    renderView(session);
    updateTopbar(session);
    closeMobileNav();
  });
}

function setupLogout() {
  const btn = $("#btnLogout");
  if (!btn || btn.dataset.bound === "1") return;
  btn.dataset.bound = "1";
  btn.addEventListener("click", async () => {
    try {
      const session = getSession();
      if (session && session.userId != null && Number.isFinite(Number(session.userId))) {
        try {
          await apiFetchJson("/api/logout", {
            method: "POST",
            body: JSON.stringify({ user_id: Number(session.userId) })
          });
        } catch (e) {
          console.warn(e);
        }
      }
      clearSession();
    } finally {
      window.location.href = "login.html";
    }
  });
}



function validateLoginEmailInput(raw) {
  const email = (raw || "").trim();
  if (!email) {
    return { ok: false, message: "Ingresa tu correo electrónico.", fields: ["email"] };
  }
  if (!email.includes("@")) {
    return {
      ok: false,
      message: 'El correo debe incluir el símbolo "@". Ejemplo: usuario@empresa.com',
      fields: ["email"]
    };
  }
  const parts = email.split("@");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return {
      ok: false,
      message: "El formato del correo no es válido. Revisa que tenga texto antes y después de @.",
      fields: ["email"]
    };
  }
  if (!parts[1].includes(".")) {
    return {
      ok: false,
      message: "El dominio del correo parece incompleto. Usa un formato como nombre@dominio.com",
      fields: ["email"]
    };
  }
  return { ok: true, email };
}

function clearLoginFieldErrors() {
  const form = $("#loginForm");
  if (form) form.classList.remove("login-form--invalid");
  ["email", "password"].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove("input-invalid");
    el.removeAttribute("aria-invalid");
  });
  const errEl = $("#loginError");
  if (errEl) {
    errEl.textContent = "";
    errEl.classList.add("hidden");
  }
}

function showLoginValidationError(message, fieldIds) {
  const errEl = $("#loginError");
  if (errEl) {
    errEl.textContent = message;
    errEl.classList.remove("hidden");
  }
  const form = $("#loginForm");
  if (form) form.classList.add("login-form--invalid");
  (fieldIds || []).forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.classList.add("input-invalid");
      el.setAttribute("aria-invalid", "true");
    }
  });
}

function initRegisterPage() {
  const form = $("#registerForm");
  if (!form || form.dataset.bound === "1") return;
  form.dataset.bound = "1";

  const session = getSession();
  if (session) {
    try {
      window.location.replace("dashboard.html");
    } catch {
      window.location.href = "dashboard.html";
    }
    return;
  }

  const showRegErr = (msg) => {
    const el = $("#registerError");
    if (el) {
      el.textContent = msg;
      el.classList.remove("hidden");
    } else {
      window.alert(msg);
    }
  };

  const clearRegErr = () => {
    const el = $("#registerError");
    if (el) {
      el.textContent = "";
      el.classList.add("hidden");
    }
  };

  form.addEventListener("input", clearRegErr);
  form.addEventListener("change", clearRegErr);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearRegErr();

    const nombre = (($("#nombre") && $("#nombre").value) || "").trim();
    const emailRaw = (($("#email") && $("#email").value) || "").trim();
    const passVal = (($("#password") && $("#password").value) || "").trim();
    const tipo = "cliente";

    if (!nombre) {
      showRegErr("Ingresa tu nombre completo.");
      return;
    }
    const emailCheck = validateLoginEmailInput(emailRaw);
    if (!emailCheck.ok) {
      showRegErr(emailCheck.message);
      return;
    }
    if (!passVal) {
      showRegErr("Ingresa una contraseña.");
      return;
    }






    
    try {
      const { res, data } = await apiFetchJson("/api/crear-usuario", {
        method: "POST",
        body: JSON.stringify({
          nombre,
          email: emailCheck.email,
          password: passVal,
          tipo
        })
      });

      if (res.ok && data && data.success) {
        showToast("Cuenta creada. Ahora puedes iniciar sesión.", "success");
        try {
          window.location.href = "login.html";
        } catch {
          window.location.replace("login.html");
        }
      } else {
        const msg =
          (data && typeof data === "object" && (data.error || data.message)) ||
          "No se pudo completar el registro.";
        showRegErr(String(msg));
      }
    } catch (err) {
      console.error(err);
      showRegErr("Error al conectar con el servidor. Intenta más tarde.");
    }
  });
}

function initLoginPage() {
  const form = $("#loginForm");
  if (!form || form.dataset.bound === "1") return;
  form.dataset.bound = "1";

  const session = getSession();
  if (session) {
    try {
      window.location.replace("dashboard.html");
    } catch {
      window.location.href = "dashboard.html";
    }
    return;
  }

  form.addEventListener("input", clearLoginFieldErrors);
  form.addEventListener("change", clearLoginFieldErrors);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearLoginFieldErrors();

    const emailRaw = ($("#email") && $("#email").value) || "";
    const passVal = ($("#password") && $("#password").value) || "";

    if (!emailRaw.trim() && !passVal) {
      showLoginValidationError("Ingresa correo y contraseña para continuar.", ["email", "password"]);
      return;
    }
    if (!emailRaw.trim()) {
      showLoginValidationError("Ingresa tu correo electrónico.", ["email"]);
      return;
    }
    if (!passVal.trim()) {
      showLoginValidationError("Ingresa tu contraseña.", ["password"]);
      return;
    }

    const emailCheck = validateLoginEmailInput(emailRaw);
    if (!emailCheck.ok) {
      showLoginValidationError(emailCheck.message, emailCheck.fields);
      return;
    }

    try {
      const { res, data } = await apiFetchJson("/api/login", {
        method: "POST",
        body: JSON.stringify({ email: emailCheck.email, password: passVal })
      });

      if (!data || typeof data !== "object") {
        showLoginValidationError("Respuesta inválida del servidor.", ["email", "password"]);
        return;
      }

      if (res.ok && data.success && data.user) {
        const mapped = mapApiUserToSession(data.user);
        if (!mapped) {
          showLoginValidationError("Respuesta del servidor incompleta.", ["email", "password"]);
          return;
        }
        if (mapped.role !== ROLES.ADMIN && mapped.role !== ROLES.ORG && mapped.role !== ROLES.USER) {
          showLoginValidationError("Rol de usuario no reconocido en el sistema.", ["email", "password"]);
          return;
        }
        const sessionPayload = { email: mapped.email, role: mapped.role };
        if (mapped.userId != null) sessionPayload.userId = mapped.userId;
        try {
          saveSession(sessionPayload);
        } catch {
          showLoginValidationError("No se pudo guardar la sesión. Revisa el almacenamiento del navegador.", [
            "email",
            "password"
          ]);
          return;
        }
        try {
          window.location.replace("dashboard.html");
        } catch {
          window.location.href = "dashboard.html";
        }
      } else {
        const msg =
          (data && typeof data === "object" && (data.message || data.error || data.msg)) ||
          "Credenciales incorrectas.";
        showLoginValidationError(String(msg), ["email", "password"]);
      }
    } catch (err) {
      console.error(err);
      showLoginValidationError("Error al conectar con el servidor. Intenta más tarde.", ["email", "password"]);
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  try {
    setupPasswordToggle();
    if (document.getElementById("loginForm")) {
      initLoginPage();
    } else if (document.getElementById("registerForm")) {
      initRegisterPage();
    }
    initDashboard();
  } catch (e) {
    console.error(e);
  }

});


