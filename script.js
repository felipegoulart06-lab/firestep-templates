const TEMPLATE_KEY = "fg_templates_v4";
const CATEGORY_KEY = "fg_categories_v1";
const BRIEFING_KEY = "fg_briefings_v3";
const COMPANY_KEY = "fg_companies_v1";
const INTEREST_KEY = "fs_interests_v1";
const PEDIDO_STATUSES = ["Novo", "Em contato", "Fechado", "Perdido"];
const ADMIN_SESSION_KEY = "fs_admin_session_v1";
const ADMIN_LOGIN_GUARD_KEY = "fs_admin_login_guard_v1";
const LOGIN_MAX_ATTEMPTS = 8;
const LOGIN_LOCK_MS = 5 * 60 * 1000;

const CFG = window.FIRESTEP_CONFIG || {};
const TEMPLATE_WEBHOOK = CFG.templateWebhook || "";
const BRIEFING_WEBHOOK = CFG.briefingWebhook || "";
const INTEREST_WEBHOOK = CFG.interestWebhook || "";
const SUPPORT_WHATSAPP = CFG.supportWhatsapp || "";
const SUPABASE_URL = CFG.supabaseUrl || "";
const SUPABASE_ANON_KEY = CFG.supabaseAnonKey || "";

const $ = (selector, parent = document) => parent.querySelector(selector);
const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];

function readStorage(key) {
  try {
    return JSON.parse(localStorage.getItem(key)) || [];
  } catch {
    return [];
  }
}

function writeStorage(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function readAdminSession() {
  try {
    return JSON.parse(localStorage.getItem(ADMIN_SESSION_KEY) || "null");
  } catch {
    return null;
  }
}

function writeAdminSession(session) {
  if (!session) {
    localStorage.removeItem(ADMIN_SESSION_KEY);
    return;
  }
  localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(session));
}

function getSupabaseAccessToken() {
  const session = readAdminSession();
  if (session?.access_token) return session.access_token;
  return SUPABASE_ANON_KEY;
}

function storeAuthSession(payload) {
  const expiresIn = Number(payload.expires_in || 3600) * 1000;
  writeAdminSession({
    access_token: payload.access_token,
    refresh_token: payload.refresh_token,
    expires_at: Date.now() + expiresIn,
    user: payload.user || null
  });
}

async function supabaseAuth(path, { method = "GET", body, token } = {}) {
  const headers = {
    apikey: SUPABASE_ANON_KEY,
    "Content-Type": "application/json"
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${SUPABASE_URL}/auth/v1${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { message: text };
  }

  if (!response.ok) {
    throw new Error(data.error_description || data.msg || data.message || "Falha na autenticação");
  }

  return data;
}

async function refreshAdminSession() {
  const session = readAdminSession();
  if (!session?.refresh_token) return null;

  const payload = await supabaseAuth("/token?grant_type=refresh_token", {
    method: "POST",
    body: { refresh_token: session.refresh_token }
  });
  storeAuthSession(payload);
  return readAdminSession();
}

async function isCurrentUserAdmin(token) {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/firestep_admins?select=user_id&user_id=eq.${encodeURIComponent(
      (await supabaseAuth("/user", { token })).id
    )}`,
    {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`
      }
    }
  );

  if (!response.ok) return false;
  const rows = await response.json();
  return Array.isArray(rows) && rows.length > 0;
}

async function restoreAdminSession() {
  let session = readAdminSession();
  if (!session?.access_token) return null;

  if (session.expires_at && Date.now() > session.expires_at - 15000) {
    try {
      session = await refreshAdminSession();
    } catch {
      writeAdminSession(null);
      return null;
    }
  }

  try {
    const allowed = await isCurrentUserAdmin(session.access_token);
    if (!allowed) {
      writeAdminSession(null);
      return null;
    }
    return session;
  } catch {
    try {
      session = await refreshAdminSession();
      if (session && (await isCurrentUserAdmin(session.access_token))) return session;
    } catch {
      /* sessão inválida */
    }
    writeAdminSession(null);
    return null;
  }
}

function readLoginGuard() {
  try {
    return JSON.parse(localStorage.getItem(ADMIN_LOGIN_GUARD_KEY) || "null") || { attempts: 0, lockUntil: 0 };
  } catch {
    return { attempts: 0, lockUntil: 0 };
  }
}

function writeLoginGuard(guard) {
  localStorage.setItem(ADMIN_LOGIN_GUARD_KEY, JSON.stringify(guard));
}

function assertLoginAllowed() {
  const guard = readLoginGuard();
  if (guard.lockUntil && Date.now() < guard.lockUntil) {
    const minutes = Math.max(1, Math.ceil((guard.lockUntil - Date.now()) / 60000));
    throw new Error(`Muitas tentativas. Aguarde ${minutes} min e tente de novo.`);
  }
}

function recordLoginFailure() {
  const guard = readLoginGuard();
  const attempts = Number(guard.attempts || 0) + 1;
  const next = {
    attempts,
    lockUntil: attempts >= LOGIN_MAX_ATTEMPTS ? Date.now() + LOGIN_LOCK_MS : 0
  };
  writeLoginGuard(next);
  if (next.lockUntil) {
    throw new Error("Muitas tentativas. O acesso ficou bloqueado por 5 minutos.");
  }
}

function clearLoginGuard() {
  localStorage.removeItem(ADMIN_LOGIN_GUARD_KEY);
}

function markAdminSessionUi(hasSession) {
  document.documentElement.classList.toggle("admin-has-session", Boolean(hasSession));
  document.body.classList.toggle("is-authed", Boolean(hasSession));
}

async function signInAdmin(email, password) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Configuração do servidor ausente.");
  }

  assertLoginAllowed();

  const payload = await supabaseAuth("/token?grant_type=password", {
    method: "POST",
    body: { email, password }
  });
  storeAuthSession(payload);
  const session = readAdminSession();
  if (!(await isCurrentUserAdmin(session.access_token))) {
    writeAdminSession(null);
    markAdminSessionUi(false);
    throw new Error("Este usuário não tem permissão de administrador.");
  }
  clearLoginGuard();
  return session;
}

async function signOutAdmin() {
  const session = readAdminSession();
  try {
    if (session?.access_token) {
      await supabaseAuth("/logout", { method: "POST", token: session.access_token });
    }
  } catch {
    /* continua o logout local mesmo se a API falhar */
  }
  writeAdminSession(null);
  markAdminSessionUi(false);
  location.reload();
}

let adminAppStarted = false;

function startAdminApp() {
  if (adminAppStarted) return;
  adminAppStarted = true;
  initAdminTabs();
  initDetailsModal();
  initConfirmModal();
  initRecordForms();
  initTemplatesAdmin();
  initCompanies();
  initBriefings();
  initPedidos();
  renderStatistics();
  $("#refreshStats")?.addEventListener("click", renderStatistics);
  readStorage(TEMPLATE_KEY).forEach(item => {
    persistTemplateRemote(item);
    persistCategoryRemote(item.category);
  });
}

async function initAdminAuth() {
  const login = $("#adminLogin");
  const form = $("#adminLoginForm");
  const errorBox = $("#adminLoginError");
  const submit = $("#adminLoginSubmit");
  $("#adminLogout")?.addEventListener("click", signOutAdmin);

  if (await restoreAdminSession()) {
    markAdminSessionUi(true);
    if (login) login.hidden = true;
    return true;
  }

  markAdminSessionUi(false);
  if (login) login.hidden = false;

  if (!form) return false;

  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (errorBox) {
      errorBox.hidden = true;
      errorBox.textContent = "";
    }
    if (submit) {
      submit.disabled = true;
      submit.textContent = "Entrando...";
    }

    try {
      await signInAdmin(
        ($("#adminLoginEmail")?.value || "").trim().toLowerCase(),
        $("#adminLoginPassword")?.value || ""
      );
      markAdminSessionUi(true);
      if (login) login.hidden = true;
      startAdminApp();
    } catch (error) {
      writeAdminSession(null);
      markAdminSessionUi(false);
      const alreadyLocked = /Muitas tentativas/.test(error.message || "");
      if (!alreadyLocked) {
        try {
          recordLoginFailure();
        } catch (lockError) {
          if (errorBox) {
            errorBox.hidden = false;
            errorBox.textContent = lockError.message;
          }
          return;
        }
      }
      if (errorBox) {
        errorBox.hidden = false;
        errorBox.textContent = error.message || "Não foi possível entrar.";
      }
    } finally {
      if (submit) {
        submit.disabled = false;
        submit.textContent = "Entrar";
      }
    }
  });

  return false;
}

function createId(prefix = "ID") {
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 7)}`.toUpperCase();
}

function normalizeText(value = "") {
  return String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function slugify(value = "") {
  return normalizeText(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "item";
}

function templateSeoDir(template = {}) {
  const category = slugify(template.category || "categoria");
  const specialty = slugify(template.subcategory || template.name || "especialidade");
  return `${category}/${specialty}`;
}

function templateSeoPath(template = {}) {
  return `${templateSeoDir(template)}/`;
}

function templateSeoHref(template = {}) {
  const id = encodeURIComponent(template.id || "");
  if (!id) return "/detalhe.html";
  if (typeof location !== "undefined" && location.protocol === "file:") {
    return `detalhe.html?id=${id}`;
  }
  return `/detalhe.html?id=${id}`;
}

function getPublishApi() {
  if (typeof location === "undefined") return "";
  if (location.hostname !== "localhost" && location.hostname !== "127.0.0.1") return "";
  return CFG.publishApi || "";
}

function getLocalPedidosApi() {
  return getPublishApi();
}

function normalizePedido(lead = {}) {
  return {
    id: lead.id || createId("INT"),
    createdAt: lead.createdAt || new Date().toISOString(),
    updatedAt: lead.updatedAt || lead.createdAt || new Date().toISOString(),
    fullName: lead.fullName || lead.full_name || "",
    whatsapp: lead.whatsapp || "",
    email: lead.email || "",
    templateId: lead.templateId || lead.template_id || "",
    templateName: lead.templateName || lead.template_name || "",
    serviceType: lead.serviceType || lead.service_type || "",
    category: lead.category || "",
    sku: lead.sku || "",
    templateUrl: lead.templateUrl || lead.template_url || "",
    basePrice: lead.basePrice || lead.base_price || "",
    deliveryTime: lead.deliveryTime || lead.delivery_time || "",
    pageUrl: lead.pageUrl || lead.page_url || "",
    status: lead.status || "Novo"
  };
}

function mergePedidos(...lists) {
  const map = new Map();

  lists.flat().forEach(item => {
    const pedido = normalizePedido(item);
    if (!pedido.id) return;
    const previous = map.get(pedido.id);
    if (!previous || String(pedido.updatedAt || pedido.createdAt) >= String(previous.updatedAt || previous.createdAt)) {
      map.set(pedido.id, { ...previous, ...pedido });
    }
  });

  return [...map.values()].sort((a, b) =>
    String(b.createdAt).localeCompare(String(a.createdAt))
  );
}

function savePedidosLocal(pedidos) {
  writeStorage(INTEREST_KEY, mergePedidos(pedidos));
}

async function supabasePedidos(path, { method = "GET", body, query = "" } = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/firestep_pedidos${query}`, {
    method,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${getSupabaseAccessToken()}`,
      "Content-Type": "application/json",
      Prefer: "return=representation"
    },
    body: body ? JSON.stringify(body) : undefined
  });

  if (!response.ok) {
    throw new Error(`Supabase ${response.status}`);
  }

  const text = await response.text();
  return text ? JSON.parse(text) : [];
}

function rowToTemplate(row = {}) {
  const payload = row.payload && typeof row.payload === "object" ? row.payload : {};
  return {
    ...payload,
    id: row.id || payload.id,
    name: payload.name || row.name || "",
    sku: payload.sku || row.sku || "",
    status: payload.status || row.status || "Ativo",
    serviceType: payload.serviceType || row.service_type || "",
    category: payload.category || row.category || "",
    subcategory: payload.subcategory || row.subcategory || "",
    updatedAt: payload.updatedAt || row.updated_at || "",
    createdAt: payload.createdAt || row.created_at || ""
  };
}

function templateToRow(template = {}) {
  return {
    id: template.id,
    name: template.name || "",
    sku: template.sku || null,
    status: template.status || "Ativo",
    service_type: template.serviceType || null,
    category: template.category || null,
    subcategory: template.subcategory || null,
    payload: template,
    updated_at: template.updatedAt || new Date().toISOString()
  };
}

async function supabaseTemplates(query = "", { method = "GET", body } = {}) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Supabase ausente");
  }

  const response = await fetch(`${SUPABASE_URL}/rest/v1/firestep_templates${query}`, {
    method,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${getSupabaseAccessToken()}`,
      "Content-Type": "application/json",
      Prefer: method === "POST" ? "resolution=merge-duplicates,return=representation" : "return=representation"
    },
    body: body ? JSON.stringify(body) : undefined
  });

  if (!response.ok) {
    throw new Error(`Supabase ${response.status}`);
  }

  const text = await response.text();
  return text ? JSON.parse(text) : [];
}

async function hydrateTemplatesFromCloud() {
  try {
    const rows = await supabaseTemplates("?select=*");
    const list = Array.isArray(rows) ? rows.map(rowToTemplate).filter(item => item.id) : [];
    const map = new Map();
    [...readStorage(TEMPLATE_KEY), ...list].forEach(item => {
      const previous = map.get(item.id);
      if (!previous || String(item.updatedAt || "") >= String(previous.updatedAt || "")) {
        map.set(item.id, { ...previous, ...item });
      }
    });
    writeStorage(TEMPLATE_KEY, [...map.values()]);
  } catch {
    /* catálogo local segue valendo */
  }
}

async function persistTemplateRemote(template) {
  if (!template?.id) return;
  try {
    await supabaseTemplates("", { method: "POST", body: templateToRow(template) });
  } catch {
    try {
      await supabaseTemplates(`?id=eq.${encodeURIComponent(template.id)}`, {
        method: "PATCH",
        body: templateToRow(template)
      });
    } catch {
      /* admin ainda tem o cadastro local */
    }
  }
}

async function deleteTemplateRemote(id) {
  if (!id) return;
  try {
    await supabaseTemplates(`?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" });
  } catch {
    /* ignore */
  }
}

async function fetchTemplateById(id) {
  const local = readStorage(TEMPLATE_KEY).find(item => item.id === id);
  if (local) return local;
  try {
    const rows = await supabaseTemplates(`?id=eq.${encodeURIComponent(id)}&select=*`);
    return Array.isArray(rows) && rows[0] ? rowToTemplate(rows[0]) : null;
  } catch {
    return null;
  }
}

async function persistCategoryRemote(name) {
  const category = normalizeCategory(name);
  if (!category) return;
  rememberCategoryLocal(category);
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/firestep_categories`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${getSupabaseAccessToken()}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal"
      },
      body: JSON.stringify({ name: category })
    });
  } catch {
    /* a categoria continua salva localmente */
  }
}

async function hydrateCategoriesFromCloud() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return;
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/firestep_categories?select=name&order=name.asc`, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${getSupabaseAccessToken()}`
      }
    });
    if (!response.ok) return;
    const rows = await response.json();
    const names = (Array.isArray(rows) ? rows : [])
      .map(row => normalizeCategory(row.name))
      .filter(Boolean);
    writeStorage(CATEGORY_KEY, [...new Set([...readStorage(CATEGORY_KEY).map(normalizeCategory), ...names])]);
  } catch {
    /* usa as categorias locais */
  }
}

function pedidoToRow(pedido) {
  const item = normalizePedido(pedido);
  return {
    id: item.id,
    created_at: item.createdAt,
    updated_at: item.updatedAt,
    full_name: item.fullName,
    whatsapp: item.whatsapp,
    email: item.email,
    template_id: item.templateId,
    template_name: item.templateName,
    service_type: item.serviceType,
    category: item.category,
    sku: item.sku,
    template_url: item.templateUrl,
    base_price: item.basePrice,
    delivery_time: item.deliveryTime,
    page_url: item.pageUrl,
    status: item.status,
    payload: item
  };
}

async function persistPedidoRemote(pedido) {
  const item = normalizePedido(pedido);
  const localApi = getLocalPedidosApi();

  const jobs = [
    supabasePedidos("", { method: "POST", body: pedidoToRow(item) }).catch(() =>
      supabasePedidos("", {
        method: "PATCH",
        query: `?id=eq.${encodeURIComponent(item.id)}`,
        body: pedidoToRow(item)
      })
    )
  ];

  if (localApi) {
    jobs.push(
      fetch(`${localApi}/api/pedidos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item)
      }).catch(() => null)
    );
  }

  await Promise.allSettled(jobs);
}

async function loadRemotePedidos() {
  const collected = [];

  try {
    const rows = await supabasePedidos("", {
      query: "?select=*&order=created_at.desc"
    });
    collected.push(...(Array.isArray(rows) ? rows : []));
  } catch {
    /* catálogo continua com o armazenamento local */
  }

  const localApi = getLocalPedidosApi();
  if (localApi) {
    try {
      const response = await fetch(`${localApi}/api/pedidos`);
      if (response.ok) {
        const payload = await response.json();
        collected.push(...(payload.pedidos || []));
      }
    } catch {
      /* sem servidor local */
    }
  }

  return mergePedidos(readStorage(INTEREST_KEY), collected);
}

function formatPedidoDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("pt-BR");
}

function whatsappHref(phone = "") {
  const digits = String(phone).replace(/\D/g, "");
  return digits ? `https://wa.me/${digits}` : "";
}

function updatePedidoCountBadge(count) {
  const badge = $("#pedidoCount");
  const tab = $("#pedidoTabCount");
  if (badge) badge.textContent = String(count);
  if (tab) tab.textContent = String(count);
}

function renderPedidos() {
  const list = $("#adminPedidoList");
  if (!list) return;

  const query = normalizeText($("#pedidoFilter")?.value || "");
  const pedidos = mergePedidos(readStorage(INTEREST_KEY)).filter(item => {
    if (!query) return true;
    return [
      item.fullName,
      item.whatsapp,
      item.email,
      item.templateName,
      item.sku,
      item.status,
      item.serviceType
    ].some(value => normalizeText(value).includes(query));
  });

  updatePedidoCountBadge(readStorage(INTEREST_KEY).length);

  if (!pedidos.length) {
    list.innerHTML = `
      <div class="empty-admin">
        <strong>Nenhum pedido encontrado</strong>
        Os envios de Tenho interesse no catálogo aparecem aqui.
      </div>
    `;
    return;
  }

  list.innerHTML = `
    <table class="admin-table">
      <thead>
        <tr>
          <th>Data</th>
          <th>Cliente</th>
          <th>WhatsApp</th>
          <th>E-mail</th>
          <th>Template</th>
          <th>Status</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${pedidos.map(pedido => `
          <tr>
            <td data-label="Data" class="cell-muted">${escapeHtml(formatPedidoDate(pedido.createdAt))}</td>
            <td data-label="Cliente" class="cell-main">${escapeHtml(pedido.fullName || "-")}</td>
            <td data-label="WhatsApp" class="cell-muted">${escapeHtml(pedido.whatsapp || "-")}</td>
            <td data-label="E-mail" class="cell-muted">${escapeHtml(pedido.email || "-")}</td>
            <td data-label="Template" class="cell-muted">${escapeHtml(pedido.templateName || "-")}</td>
            <td data-label="Status">
              <select class="pedido-status" data-pedido-status="${escapeHtml(pedido.id)}">
                ${PEDIDO_STATUSES.map(status => `
                  <option value="${escapeHtml(status)}" ${status === pedido.status ? "selected" : ""}>${escapeHtml(status)}</option>
                `).join("")}
              </select>
            </td>
            <td data-label="Ações">
              <div class="table-actions">
                <button class="mini-btn" type="button" data-details-pedido="${escapeHtml(pedido.id)}">Ver detalhes</button>
                ${
                  whatsappHref(pedido.whatsapp)
                    ? `<a class="mini-btn" href="${escapeHtml(whatsappHref(pedido.whatsapp))}" target="_blank" rel="noopener">WhatsApp</a>`
                    : ""
                }
              </div>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

async function refreshPedidos() {
  const pedidos = await loadRemotePedidos();
  savePedidosLocal(pedidos);
  renderPedidos();
  if ($("#estatistica")?.classList.contains("active")) {
    renderStatistics();
  }
}

async function updatePedidoStatus(id, status) {
  const pedidos = mergePedidos(readStorage(INTEREST_KEY));
  const index = pedidos.findIndex(item => item.id === id);
  if (index < 0) return;

  pedidos[index] = {
    ...pedidos[index],
    status,
    updatedAt: new Date().toISOString()
  };
  savePedidosLocal(pedidos);
  renderPedidos();
  await persistPedidoRemote(pedidos[index]);
}

function initPedidos() {
  if (!$("#adminPedidoList")) return;

  $("#pedidoFilter")?.addEventListener("input", renderPedidos);
  $("#refreshPedidos")?.addEventListener("click", () => {
    refreshPedidos().then(() => showToast("Pedidos atualizados."));
  });

  $("#adminPedidoList").addEventListener("change", event => {
    const select = event.target.closest("[data-pedido-status]");
    if (!select) return;
    updatePedidoStatus(select.dataset.pedidoStatus, select.value);
  });

  $("#adminPedidoList").addEventListener("click", event => {
    const detailsButton = event.target.closest("[data-details-pedido]");
    if (!detailsButton) return;

    const pedido = mergePedidos(readStorage(INTEREST_KEY)).find(
      item => item.id === detailsButton.dataset.detailsPedido
    );
    if (!pedido) return;

    openDetailsModal({
      eyebrow: "PEDIDO DO CATÁLOGO",
      title: pedido.fullName || "Pedido",
      sections: [
        {
          title: "Contato",
          rows: [
            ["Nome", pedido.fullName],
            ["WhatsApp", pedido.whatsapp],
            ["E-mail", pedido.email],
            ["Status", pedido.status],
            ["Recebido em", formatPedidoDate(pedido.createdAt)]
          ]
        },
        {
          title: "Template",
          rows: [
            ["Nome", pedido.templateName],
            ["Tipo", pedido.serviceType],
            ["Categoria", pedido.category],
            ["SKU", pedido.sku],
            ["Preço base", pedido.basePrice],
            ["Prazo", pedido.deliveryTime],
            ["Página", pedido.pageUrl],
            ["Demo", pedido.templateUrl]
          ]
        }
      ]
    });
  });

  refreshPedidos();
}

async function publishTemplatePage(template) {
  const api = getPublishApi();
  if (!api) return false;

  try {
    const response = await fetch(`${api}/api/publish-template`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(template)
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function publishAllTemplatePages(templates) {
  const api = getPublishApi();
  if (!api) return false;

  try {
    const response = await fetch(`${api}/api/publish-templates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ templates })
    });
    return response.ok;
  } catch {
    return false;
  }
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[character]));
}

function showToast(message) {
  $(".toast")?.remove();

  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;

  document.body.appendChild(toast);

  setTimeout(() => toast.remove(), 2300);
}

let confirmResolver = null;

function closeConfirmModal(result) {
  const modal = $("#confirmModal");
  if (modal) modal.hidden = true;
  const resolve = confirmResolver;
  confirmResolver = null;
  if (resolve) resolve(Boolean(result));
}

function initConfirmModal() {
  const modal = $("#confirmModal");
  if (!modal || modal.dataset.ready) return;
  modal.dataset.ready = "1";
  modal.addEventListener("click", event => {
    if (event.target.closest("[data-close-confirm]")) closeConfirmModal(false);
  });
  $("#confirmOk")?.addEventListener("click", () => closeConfirmModal(true));
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && modal && !modal.hidden) closeConfirmModal(false);
  });
}

function promptConfirm({
  title = "Confirmar ação",
  text = "",
  confirmLabel = "Continuar",
  danger = false
} = {}) {
  initConfirmModal();
  const modal = $("#confirmModal");
  if (!modal) return Promise.resolve(window.confirm(text));

  if (confirmResolver) confirmResolver(false);
  $("#confirmTitle").textContent = title;
  $("#confirmText").textContent = text;
  const ok = $("#confirmOk");
  if (ok) {
    ok.textContent = confirmLabel;
    ok.classList.toggle("btn-danger", danger);
    ok.classList.toggle("btn-primary", !danger);
  }
  modal.hidden = false;
  ok?.focus();

  return new Promise(resolve => {
    confirmResolver = resolve;
  });
}

async function confirmTwice(first, second) {
  if (!(await promptConfirm(first))) return false;
  return promptConfirm(second);
}

const FORM_HOSTS = {
  templates: "#templateFormHost",
  empresas: "#companyFormHost",
  briefings: "#briefingFormHost"
};

function openRecordForm(kind) {
  Object.values(FORM_HOSTS).forEach(selector => {
    const host = $(selector);
    if (host) host.hidden = true;
  });

  const host = $(FORM_HOSTS[kind]);
  if (!host) return;

  host.hidden = false;
  document.body.classList.add("modal-open");
}

function closeRecordForm(kind) {
  const host = $(FORM_HOSTS[kind]);
  if (host) host.hidden = true;

  const anyOpen = $$(".form-host").some(item => !item.hidden);
  if (!anyOpen) {
    document.body.classList.remove("modal-open");
  }
}

function initRecordForms() {
  document.addEventListener("click", event => {
    const closer = event.target.closest("[data-close-form]");
    if (!closer) return;

    const kind = closer.dataset.closeForm;
    if (kind === "templates") resetTemplateForm();
    if (kind === "empresas") resetCompanyForm();
    if (kind === "briefings") resetBriefingForm();
    closeRecordForm(kind);
  });

  $("#newTemplate")?.addEventListener("click", () => {
    resetTemplateForm();
    openRecordForm("templates");
  });

  $("#closeTemplateForm")?.addEventListener("click", () => {
    resetTemplateForm();
    closeRecordForm("templates");
  });

  $("#newCompany")?.addEventListener("click", () => {
    resetCompanyForm();
    openRecordForm("empresas");
  });

  $("#closeCompanyForm")?.addEventListener("click", () => {
    resetCompanyForm();
    closeRecordForm("empresas");
  });

  $("#closeBriefing")?.addEventListener("click", () => {
    resetBriefingForm();
    closeRecordForm("briefings");
  });

  document.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    if ($("#detailsModal") && !$("#detailsModal").hidden) return;

    if ($("#templateFormHost") && !$("#templateFormHost").hidden) {
      return;
    } else if ($("#companyFormHost") && !$("#companyFormHost").hidden) {
      resetCompanyForm();
      closeRecordForm("empresas");
    } else if ($("#briefingFormHost") && !$("#briefingFormHost").hidden) {
      resetBriefingForm();
      closeRecordForm("briefings");
    }
  });
}

function normalizeUrl(value = "") {
  const trimmed = String(value).trim();

  if (!trimmed) return "";
  if (/^(https?:\/\/|data:|\/)/i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("//")) return `https:${trimmed}`;

  return `https://${trimmed}`;
}

function statusChipClass(value = "") {
  const status = normalizeText(value);

  if (["rascunho", "em revisao", "em contato"].includes(status)) return " is-draft";
  if (["arquivado", "baixa", "perdido"].includes(status)) return " is-archived";
  if (["urgente", "alta"].includes(status)) return " is-urgente";

  return "";
}

/* =========================================================
   ENVIO PARA WEBHOOKS DO MAKE
========================================================= */

async function sendToWebhook(url, payload) {
  if (!url) return true;

  const body = JSON.stringify(payload);

  try {
  const response = await fetch(url, {
    method: "POST",
    headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
    },
      body
  });

  if (!response.ok) {
    throw new Error(`Webhook respondeu com status ${response.status}`);
  }

    return true;
  } catch (error) {
    try {
      const fallback = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain;charset=utf-8"
        },
        body
      });

      if (fallback.type !== "opaque" && !fallback.ok) {
        throw new Error(`Webhook respondeu com status ${fallback.status}`);
      }

      return true;
    } catch (fallbackError) {
      console.error("Erro ao enviar webhook:", error, fallbackError);
      return false;
    }
  }
}

function emptyToDash(value) {
  const text = value == null ? "" : String(value).trim();
  return text || "-";
}

function formatDetailValueHtml(value) {
  const text = emptyToDash(value);
  if (text === "-") return "-";
  if (/^https?:\/\//i.test(text)) {
    return `<a href="${escapeHtml(text)}" target="_blank" rel="noopener">${escapeHtml(text)}</a>`;
  }
  return escapeHtml(text);
}

function renderDetailSections(sections) {
  return sections
    .map(section => `
      <section class="details-section">
        <h3>${escapeHtml(section.title)}</h3>
        ${section.rows
          .map(([label, value]) => `
            <div class="details-row">
              <span>${escapeHtml(label)}</span>
              <p>${formatDetailValueHtml(value)}</p>
            </div>
          `)
          .join("")}
      </section>
    `)
    .join("");
}

function initDetailsModal() {
  const modal = $("#detailsModal");

  if (!modal) return;

  const close = () => {
    modal.hidden = true;
    document.body.classList.remove("modal-open");
  };

  modal.addEventListener("click", event => {
    if (event.target.closest("[data-close-details]")) {
      close();
    }
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !modal.hidden) {
      close();
    }
  });
}

function openDetailsModal({ eyebrow, title, sections, html, footerHtml, wide }) {
  const modal = $("#detailsModal");

  if (!modal) return;

  const panel = modal.querySelector(".details-panel");
  panel?.classList.toggle("is-wide", Boolean(wide));

  $("#detailsEyebrow").textContent = eyebrow;
  $("#detailsTitle").textContent = title;
  $("#detailsBody").innerHTML = html || renderDetailSections(sections || []);

  const footer = $("#detailsFooter");
  if (footer) {
    if (footerHtml) {
      footer.hidden = false;
      footer.innerHTML = footerHtml;
    } else {
      footer.hidden = true;
      footer.innerHTML = "";
    }
  }

  modal.hidden = false;
  document.body.classList.add("modal-open");
}

function buildMakePayload(evento, record, labels, nestedKey) {
  const enviadoEm = new Date().toISOString();
  const campos = {};

  Object.entries({ ...labels, ...Object.fromEntries(Object.keys(record).map(key => [key, labels[key] || key])) })
    .forEach(([key, label]) => {
      campos[label] = record[key] ?? "";
    });

  return {
    evento,
    origem: "firestep TEMPLATES - Admin Master",
    enviadoEm,
    ...record,
    ...campos,
    [nestedKey]: record,
    campos
  };
}

/* =========================================================
   CATEGORIAS
========================================================= */

function normalizeCategory(value = "") {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function getSavedCategories() {
  const remembered = readStorage(CATEGORY_KEY)
    .map(normalizeCategory)
    .filter(Boolean);
  const fromTemplates = readStorage(TEMPLATE_KEY)
    .map(item => normalizeCategory(item.category))
    .filter(Boolean);

  return [...new Set([...remembered, ...fromTemplates])]
    .sort((a, b) => a.localeCompare(b, "pt-BR"));
}

function rememberCategoryLocal(name) {
  const category = normalizeCategory(name);
  if (!category) return;
  writeStorage(CATEGORY_KEY, [...new Set([...readStorage(CATEGORY_KEY).map(normalizeCategory), category])]);
}

function getAllCategories() {
  return getSavedCategories();
}

function fillCategoryDatalist() {
  const datalist = $("#templateCategories");

  if (!datalist) return;

  datalist.innerHTML = getSavedCategories()
    .map(category => `<option value="${escapeHtml(category)}"></option>`)
    .join("");
}

/* =========================================================
   ABAS DO ADMIN
========================================================= */

function initAdminTabs() {
  const buttons = $$(".admin-tab-button");

  function activateTab(tabId, { scroll = true } = {}) {
    const targetButton = buttons.find(button => button.dataset.tab === tabId) || buttons[0];
    const targetTab = targetButton?.dataset.tab;

    if (!targetTab) return;

    buttons.forEach(item => {
      item.classList.toggle("active", item.dataset.tab === targetTab);
      });

      $$(".admin-section").forEach(section => {
      section.classList.toggle("active", section.id === targetTab);
    });

    if (location.hash.replace("#", "") !== targetTab) {
      history.replaceState(null, "", `#${targetTab}`);
    }

    if (scroll) {
      window.scrollTo({
        top: 0,
        behavior: "smooth"
      });
    }

    if (targetTab === "estatistica") {
      renderStatistics();
    }

    if (targetTab === "pedidos") {
      refreshPedidos();
    }

    if (targetTab === "briefings") {
      fillCompanySelect($("#companyId")?.value || "");
    }
  }

  buttons.forEach(button => {
    button.addEventListener("click", () => {
      activateTab(button.dataset.tab);
    });
  });

  const initialTab = location.hash.replace("#", "");
  activateTab(initialTab || "templates", { scroll: false });

  window.addEventListener("hashchange", () => {
    activateTab(location.hash.replace("#", "") || "templates", { scroll: false });
  });
}

/* =========================================================
   TEMPLATE - CAMPOS
========================================================= */

const TEMPLATE_FIELDS = [
  "templateServiceType",
  "templateCategory",
  "templateSubcategory",
  "templateName",
  "templateSku",
  "templateStatus",
  "templatePages",
  "templateVersion",
  "templateUrl",
  "templateImage",
  "templatePagePrint",
  "templateVideo",
  "templateDocumentation",
  "templateDescription",
  "templatePageList",
  "templateSections",
  "templateFeatures",
  "templateEditableFields",
  "templateTechnology",
  "templateHosting",
  "templateDependencies",
  "templateIntegrations",
  "templateDatabaseRequired",
  "templateDatabaseType",
  "templateSeoReady",
  "templateResponsive",
  "templateDarkMode",
  "templatePerformance",
  "templateCustomizationLevel",
  "templateBasePrice",
  "templateDeliveryTime",
  "templateComplexity",
  "templatePriority",
  "templateTags",
  "templateInternalNotes"
];

const TEMPLATE_LABELS = {
  id: "ID",
  serviceType: "Tipo de serviço",
  category: "Categoria do template",
  subcategory: "Subcategoria",
  name: "Nome do template",
  sku: "Código interno / SKU",
  status: "Status",
  pages: "Quantidade de páginas",
  version: "Versão",
  url: "Link Ver ao vivo",
  image: "Link da imagem / preview",
  pagePrint: "Print completo da landing",
  video: "Link do vídeo demonstrativo",
  documentation: "Link da documentação",
  description: "Como funciona",
  pageList: "Lista de páginas",
  sections: "Seções principais",
  features: "Recursos e funcionalidades",
  editableFields: "Campos editáveis pelo cliente",
  technology: "Tecnologia principal",
  hosting: "Hospedagem recomendada",
  dependencies: "Dependências / bibliotecas",
  integrations: "Integrações compatíveis",
  databaseRequired: "Banco de dados necessário?",
  databaseType: "Tipo de banco",
  seoReady: "SEO",
  responsive: "Responsivo",
  darkMode: "Dark mode",
  performance: "Nível de performance",
  customizationLevel: "Nível de personalização",
  basePrice: "Preço base sugerido",
  deliveryTime: "Prazo médio de implantação",
  complexity: "Complexidade",
  priority: "Prioridade comercial",
  tags: "Tags",
  internalNotes: "Observações internas",
  createdAt: "Criado em",
  updatedAt: "Atualizado em"
};

function getTemplateDetailSections(template) {
  return [
    {
      title: "Identificação",
      rows: [
        ["ID", template.id],
        ["Tipo de serviço", template.serviceType],
        ["Categoria", template.category],
        ["Subcategoria", template.subcategory],
        ["Nome", template.name],
        ["SKU", template.sku],
        ["Status", template.status],
        ["Páginas", template.pages],
        ["Versão", template.version]
      ]
    },
    {
      title: "Links e apresentação",
      rows: [
        ["Ver ao vivo", template.url],
        ["Imagem / preview", template.image],
        ["Print completo da landing", template.pagePrint],
        ["Imagens extras", Array.isArray(template.gallery) ? template.gallery.join("\n") : template.gallery],
        ["Vídeo", hasVideoLink(template.video) ? template.video : ""],
        ["Documentação", template.documentation]
      ]
    },
    {
      title: "Estrutura e conteúdo",
      rows: [
        ["Como funciona", template.description],
        ["Lista de páginas", template.pageList],
        ["Seções principais", template.sections],
        ["Recursos", template.features],
        ["Campos editáveis", template.editableFields]
      ]
    },
    {
      title: "Tecnologia e integração",
      rows: [
        ["Tecnologia", template.technology],
        ["Hospedagem", template.hosting],
        ["Dependências", template.dependencies],
        ["Integrações", template.integrations],
        ["Banco necessário", template.databaseRequired],
        ["Tipo de banco", template.databaseType]
      ]
    },
    {
      title: "SEO e performance",
      rows: [
        ["SEO", template.seoReady],
        ["Responsivo", template.responsive],
        ["Dark mode", template.darkMode],
        ["Performance", template.performance],
        ["Personalização", template.customizationLevel]
      ]
    },
    {
      title: "Comercial",
      rows: [
        ["Preço base", template.basePrice],
        ["Prazo", template.deliveryTime],
        ["Complexidade", template.complexity],
        ["Prioridade", template.priority],
        ["Tags", template.tags],
        ["Observações internas", template.internalNotes],
        ["Criado em", template.createdAt],
        ["Atualizado em", template.updatedAt]
      ]
    }
  ];
}

function getTemplatePublicDetailSections(template) {
  return [
    {
      title: "Identificação",
      rows: [
        ["Tipo de serviço", template.serviceType],
        ["Categoria", template.category],
        ["Subcategoria", template.subcategory],
        ["Nome", template.name],
        ["Código / SKU", template.sku],
        ["Status", template.status],
        ["Quantidade de páginas", template.pages],
        ["Versão", template.version]
      ]
    },
    {
      title: "Links e apresentação",
      rows: [
        ["Ver ao vivo", template.url],
        ["Imagem / preview", template.image],
        ["Print completo da landing", template.pagePrint],
        ["Vídeo demonstrativo", hasVideoLink(template.video) ? template.video : ""],
        ["Documentação", template.documentation]
      ]
    },
    {
      title: "Estrutura e conteúdo",
      rows: [
        ["Como funciona", template.description],
        ["Lista de páginas", template.pageList],
        ["Seções principais", template.sections],
        ["Recursos e funcionalidades", template.features],
        ["Campos editáveis pelo cliente", template.editableFields]
      ]
    },
    {
      title: "Tecnologia e integração",
      rows: [
        ["Tecnologia principal", template.technology],
        ["Hospedagem recomendada", template.hosting],
        ["Dependências / bibliotecas", template.dependencies],
        ["Integrações compatíveis", template.integrations],
        ["Banco de dados necessário?", template.databaseRequired],
        ["Tipo de banco", template.databaseType]
      ]
    },
    {
      title: "SEO, performance e personalização",
      rows: [
        ["SEO", template.seoReady],
        ["Responsivo", template.responsive],
        ["Dark mode", template.darkMode],
        ["Nível de performance", template.performance],
        ["Nível de personalização", template.customizationLevel]
      ]
    },
    {
      title: "Comercial",
      rows: [
        ["Prazo médio de implantação", template.deliveryTime],
        ["Complexidade", template.complexity],
        ["Prioridade comercial", template.priority],
        ["Tags", template.tags]
      ]
    }
  ];
}

const TEMPLATE_URL_FIELDS = [
  "url",
  "image",
  "pagePrint",
  "video",
  "documentation"
];

function templateFieldToProperty(fieldId) {
  return fieldId
    .replace("template", "")
    .replace(/^./, char => char.toLowerCase());
}

function hasVideoLink(value) {
  return /^https?:\/\/\S+/i.test(String(value || "").trim());
}

function templateGalleryUrls(template = {}) {
  const urls = [];
  const cover = String(template.image || "").trim();
  let extra = template.gallery;
  if (typeof extra === "string") {
    const trimmed = extra.trim();
    if (trimmed.startsWith("[")) {
      try {
        extra = JSON.parse(trimmed);
      } catch {
        extra = trimmed.split(/\n|,/);
      }
    } else {
      extra = trimmed.split(/\n|,/);
    }
  }
  if (!Array.isArray(extra)) extra = [];

  extra.forEach(item => {
    const url = String(item || "").trim();
    if (url && !urls.includes(url)) urls.push(url);
  });

  if (cover && !urls.includes(cover)) urls.unshift(cover);
  return urls;
}

function readGalleryInput() {
  try {
    const parsed = JSON.parse($("#templateGallery")?.value || "[]");
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return [];
  }
}

function writeGalleryInput(urls) {
  const unique = [...new Set(urls.filter(Boolean))];
  if ($("#templateGallery")) $("#templateGallery").value = JSON.stringify(unique);
  renderGalleryEditor(unique);
}

function renderGalleryEditor(urls) {
  const list = $("#templateGalleryList");
  if (!list) return;

  if (!urls.length) {
    list.innerHTML = `<p class="gallery-empty">Nenhuma imagem extra ainda. A capa continua sendo a foto principal.</p>`;
    return;
  }

  list.innerHTML = urls
    .map((url, index) => `
      <div class="gallery-item">
        <img src="${escapeHtml(url)}" alt="Imagem ${index + 1} do template">
        <button type="button" class="mini-btn danger" data-remove-gallery="${index}">Remover</button>
      </div>
    `)
    .join("");

  list.querySelectorAll("img").forEach(img => {
    img.addEventListener("error", () => img.classList.add("is-broken"));
  });
}

function fileExtension(file) {
  const type = String(file.type || "").toLowerCase();
  if (type.includes("png")) return "png";
  if (type.includes("webp")) return "webp";
  if (type.includes("gif")) return "gif";
  return "jpg";
}

async function uploadToSupabaseStorage(file) {
  const session = readAdminSession();
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !session?.access_token) return "";

  const path = `prints/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${fileExtension(file)}`;
  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/template-media/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: SUPABASE_ANON_KEY,
      "Content-Type": file.type || "image/jpeg",
      "x-upsert": "true"
    },
    body: file
  });

  if (!response.ok) return "";
  return `${SUPABASE_URL}/storage/v1/object/public/template-media/${path}`;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function uploadTemplateImageFile(file) {
  const fromStorage = await uploadToSupabaseStorage(file).catch(() => "");
  if (fromStorage) return fromStorage;

  const dataUrl = await readFileAsDataUrl(file);
  const api = getPublishApi();

  if (api) {
    try {
      const response = await fetch(`${api}/api/upload-image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, dataUrl })
      });

      if (response.ok) {
        const payload = await response.json();
        if (payload.url) return payload.url;
      }
    } catch {
      // fallback local
    }
  }

  if (String(dataUrl).length > 3_500_000) {
    throw new Error("Imagem grande demais. Entre no painel logado para enviar ao armazenamento, ou use um link.");
  }

  return dataUrl;
}

function renderMediaPreview(targetId, url) {
  const box = $("#" + targetId);
  if (!box) return;
  const src = String(url || "").trim();
  if (!src) {
    box.hidden = true;
    box.innerHTML = "";
    return;
  }
  box.hidden = false;
  box.innerHTML = `<img src="${escapeHtml(src)}" alt="Pré-visualização">`;
  box.querySelector("img")?.addEventListener("error", () => {
    box.innerHTML = `<p class="gallery-empty">Não foi possível carregar esta imagem.</p>`;
  });
}

function bindSingleImageField({ inputId, fileId, previewId, clearId }) {
  const input = $("#" + inputId);
  const fileInput = $("#" + fileId);
  if (!input) return;

  const syncPreview = () => renderMediaPreview(previewId, input.value.trim());
  input.addEventListener("input", syncPreview);
  syncPreview();

  fileInput?.addEventListener("change", async event => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      input.value = await uploadTemplateImageFile(file);
      input.dispatchEvent(new Event("input"));
    } catch (error) {
      alert(error.message || "Não foi possível enviar a imagem.");
    }
  });

  if (clearId) {
    $("#" + clearId)?.addEventListener("click", () => {
      input.value = "";
      syncPreview();
    });
  }
}

function initTemplateGalleryEditor() {
  const filesInput = $("#templateGalleryFiles");
  bindSingleImageField({
    inputId: "templateImage",
    fileId: "templateImageFile",
    previewId: "templateImagePreview"
  });
  bindSingleImageField({
    inputId: "templatePagePrint",
    fileId: "templatePagePrintFile",
    previewId: "templatePagePrintPreview",
    clearId: "clearPagePrint"
  });
  if (!filesInput) return;

  filesInput.addEventListener("change", async event => {
    const files = [...(event.target.files || [])];
    event.target.value = "";
    if (!files.length) return;

    const current = readGalleryInput();

    for (const file of files) {
      try {
        current.push(await uploadTemplateImageFile(file));
      } catch (error) {
        alert(error.message || "Não foi possível enviar a imagem. Use o servidor local ou uma URL.");
      }
    }

    writeGalleryInput(current);
  });

  $("#addGalleryUrl")?.addEventListener("click", () => {
    const url = window.prompt("Cole a URL da imagem:");
    if (!url) return;
    writeGalleryInput([...readGalleryInput(), normalizeUrl(url)]);
  });

  $("#templateGalleryList")?.addEventListener("click", event => {
    const button = event.target.closest("[data-remove-gallery]");
    if (!button) return;
    const urls = readGalleryInput();
    urls.splice(Number(button.dataset.removeGallery), 1);
    writeGalleryInput(urls);
  });
}

function collectTemplateData() {
  const data = {};

  TEMPLATE_FIELDS.forEach(fieldId => {
    const element = $("#" + fieldId);
    const property = templateFieldToProperty(fieldId);
    const value = element?.value.trim() || "";

    data[property] = TEMPLATE_URL_FIELDS.includes(property)
      ? normalizeUrl(value)
      : value;
  });

  if (!hasVideoLink(data.video)) data.video = "";
  data.category = normalizeCategory(data.category);
  data.gallery = readGalleryInput();

  return data;
}

function resetTemplateForm() {
  const form = $("#templateForm");

  if (!form) return;

  form.reset();

  $("#templateId").value = "";
  $("#templatePages").value = "5";
  $("#templateStatus").value = "Ativo";
  $("#templateSeoReady").value = "Preparado";
  $("#templateResponsive").value = "Sim";
  $("#templateDarkMode").value = "Não";
  $("#templatePerformance").value = "Alta";
  $("#templateCustomizationLevel").value = "Alta";
  $("#templateComplexity").value = "Baixa";
  $("#templatePriority").value = "Normal";
  $("#templateDatabaseRequired").value = "Não";
  $("#templateServiceType").value = "";
  writeGalleryInput([]);
  renderMediaPreview("templateImagePreview", "");
  renderMediaPreview("templatePagePrintPreview", "");
  fillCategoryDatalist();

  $("#templateFormTitle").textContent = "Cadastrar template";
}

function loadTemplateIntoForm(template) {
  $("#templateId").value = template.id;

  TEMPLATE_FIELDS.forEach(fieldId => {
    const property = templateFieldToProperty(fieldId);

    const element = $("#" + fieldId);

    if (element) {
      element.value = template[property] ?? "";
    }
  });

  writeGalleryInput(Array.isArray(template.gallery) ? template.gallery : []);
  renderMediaPreview("templateImagePreview", template.image || "");
  renderMediaPreview("templatePagePrintPreview", template.pagePrint || "");

  $("#templateFormTitle").textContent = "Editar template";
  openRecordForm("templates");

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

/* =========================================================
   ADMIN - TEMPLATES
========================================================= */

function initTemplatesAdmin() {
  const form = $("#templateForm");

  if (!form) return;

  initTemplateGalleryEditor();

  function renderTemplates() {
    fillCategoryDatalist();
    fillTemplateSelect($("#chosenTemplate")?.value || "");

    const allTemplates = readStorage(TEMPLATE_KEY);
    const categoryFilter = $("#templateCategoryFilter");
    const categories = [...new Set(allTemplates.map(item => item.category).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, "pt-BR"));
    const currentCategory = categoryFilter?.value || "";

    if (categoryFilter) {
      categoryFilter.innerHTML = `<option value="">Todas as categorias</option>${
        categories.map(category => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join("")
      }`;
      categoryFilter.value = categories.includes(currentCategory) ? currentCategory : "";
    }

    $("#templateCount").textContent = allTemplates.length;

    const query = normalizeText(
      $("#templateFilter").value.trim()
    );
    const selectedCategory = categoryFilter?.value || "";

    const templates = allTemplates.filter(template => {
      if (selectedCategory && template.category !== selectedCategory) return false;
      if (!query) return true;

      return [
        template.name,
        template.category,
        template.subcategory,
        template.sku,
        template.technology,
        template.status,
        template.tags,
        template.serviceType
      ].some(value =>
        normalizeText(value).includes(query)
      );
    });

    const list = $("#adminTemplateList");

    if (!templates.length) {
      list.innerHTML = `
        <div class="empty-admin">
          <strong>Nenhum template encontrado</strong>
          Cadastre um novo template ou altere o filtro da pesquisa.
        </div>
      `;

      return;
    }

    list.innerHTML = `
      <table class="admin-table">
        <thead>
          <tr>
            <th>Template</th>
            <th>Tipo</th>
            <th>Categoria</th>
            <th>SKU</th>
            <th>Status</th>
            <th>Páginas</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${templates.map(template => `
            <tr>
              <td data-label="Template" class="cell-main" title="${escapeHtml(template.name || "")}">${escapeHtml(template.name || "-")}</td>
              <td data-label="Tipo" class="cell-muted">${escapeHtml(template.serviceType || "-")}</td>
              <td data-label="Categoria" class="cell-muted" title="${escapeHtml([template.category, template.subcategory].filter(Boolean).join(" · "))}">
                ${escapeHtml(template.category || "-")}
              </td>
              <td data-label="SKU" class="cell-muted">${escapeHtml(template.sku || "-")}</td>
              <td data-label="Status">
                <span class="status-chip${statusChipClass(template.status || "Ativo")}">
              ${escapeHtml(template.status || "Ativo")}
            </span>
              </td>
              <td data-label="Páginas" class="cell-muted">${escapeHtml(template.pages || "-")}</td>
              <td data-label="Ações">
                <div class="table-actions">
                  <a class="mini-btn" href="${escapeHtml(templateSeoHref(template))}">Ver página</a>
                  <button class="mini-btn" type="button" data-edit-template="${template.id}">Editar</button>
                  <button class="mini-btn danger" type="button" data-delete-template="${template.id}">Excluir</button>
                  ${
                    template.url
                      ? `<a class="mini-btn" href="${escapeHtml(template.url)}" target="_blank" rel="noopener">Ver ao vivo</a>`
                      : ""
                  }
          </div>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  }

  form.addEventListener("submit", async event => {
    event.preventDefault();

    const submitButton = form.querySelector('button[type="submit"]');
    const originalButtonText = submitButton?.textContent;

    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = "Salvando...";
    }

    try {
      const editingId = $("#templateId").value;
      const template = collectTemplateData();

      if (!template.name || !template.category || !template.serviceType || !template.url || !template.image || !template.description) {
        alert("Preencha os campos obrigatórios do template, incluindo o tipo de serviço.");
        return;
      }

      let templates = readStorage(TEMPLATE_KEY);
      template.updatedAt = new Date().toISOString();

      if (editingId) {
        const oldTemplate = templates.find(item => item.id === editingId);
        template.id = editingId;
        template.createdAt = oldTemplate?.createdAt || template.updatedAt;
      } else {
        template.id = createId("TMP");
        template.createdAt = template.updatedAt;
      }

      const webhookPayload = buildMakePayload(
        editingId ? "template_atualizado" : "template_cadastrado",
        template,
        TEMPLATE_LABELS,
        "template"
      );

      if (editingId) {
        templates = templates.map(item => item.id === editingId ? template : item);
      } else {
        templates.unshift(template);
      }

      writeStorage(TEMPLATE_KEY, templates);
      await persistTemplateRemote(template);
      await persistCategoryRemote(template.category);
      fillCategoryDatalist();
      publishAllTemplatePages(templates).catch(() => false);

      resetTemplateForm();
      closeRecordForm("templates");
      renderTemplates();
      renderStatistics();

      const webhookOk = await sendToWebhook(TEMPLATE_WEBHOOK, webhookPayload);

      showToast(editingId ? "Template atualizado." : "Template cadastrado.");
    } catch (error) {
      console.error("Erro ao salvar template:", error);
      alert("Não foi possível salvar o template. Tente novamente.");
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = originalButtonText || "Salvar template";
      }
    }
  });

  $("#clearTemplateForm").addEventListener(
    "click",
    resetTemplateForm
  );

  $("#templateFilter").addEventListener(
    "input",
    renderTemplates
  );

  $("#templateCategory")?.addEventListener("focus", fillCategoryDatalist);
  $("#templateCategory")?.addEventListener("input", fillCategoryDatalist);

  $("#templateCategoryFilter")?.addEventListener("change", renderTemplates);

  $("#adminTemplateList").addEventListener(
    "click",
    async event => {

      const detailsButton = event.target.closest("[data-details-template]");

      if (detailsButton) {
        const template = readStorage(TEMPLATE_KEY).find(
          item => item.id === detailsButton.dataset.detailsTemplate
        );

        if (template) {
          openDetailsModal({
            eyebrow: "DETALHES DO TEMPLATE",
            title: template.name || "Template",
            sections: getTemplateDetailSections(template)
          });
        }

        return;
      }

      const editButton =
        event.target.closest(
          "[data-edit-template]"
        );

      if (editButton) {

        const template =
          readStorage(TEMPLATE_KEY)
            .find(
              item =>
                item.id ===
                editButton.dataset.editTemplate
            );

        if (template) {
          loadTemplateIntoForm(template);
        }

        return;
      }

      const deleteButton = event.target.closest("[data-delete-template]");
      if (!deleteButton) return;

      const template = readStorage(TEMPLATE_KEY).find(
        item => item.id === deleteButton.dataset.deleteTemplate
      );
      if (!template) return;

      const name = template.name || template.sku || "este template";
      const confirmed = await confirmTwice(
        {
          title: "Excluir template",
          text: `Excluir o template "${name}"? Ele some do catálogo e do painel.`,
          confirmLabel: "Sim, continuar"
        },
        {
          title: "Confirme outra vez",
          text: `Esta é a última confirmação. Excluir definitivamente "${name}"? Não dá para desfazer.`,
          confirmLabel: "Excluir agora",
          danger: true
        }
      );
      if (!confirmed) return;

      const remaining = readStorage(TEMPLATE_KEY).filter(item => item.id !== template.id);
      writeStorage(TEMPLATE_KEY, remaining);
      await deleteTemplateRemote(template.id);
      publishAllTemplatePages(remaining).catch(() => false);
      if ($("#templateId")?.value === template.id) resetTemplateForm();
      renderTemplates();
      renderStatistics();
      showToast("Template excluído.");
    }
  );

  renderTemplates();
}

function companyFieldToProperty(fieldId) {
  return fieldId
    .replace("empresa", "")
    .replace(/^./, char => char.toLowerCase());
}

const COMPANY_FIELDS = [
  "empresaLegalName",
  "empresaTradeName",
  "empresaDocument",
  "empresaStateRegistration",
  "empresaMunicipalRegistration",
  "empresaCompanyType",
  "empresaSize",
  "empresaFoundationYear",
  "empresaSegment",
  "empresaNiche",
  "empresaStatus",
  "empresaResponsibleName",
  "empresaResponsibleRole",
  "empresaWhatsapp",
  "empresaPhone",
  "empresaEmail",
  "empresaFinanceEmail",
  "empresaWebsite",
  "empresaInstagram",
  "empresaLinkedin",
  "empresaFacebook",
  "empresaYoutube",
  "empresaZip",
  "empresaCity",
  "empresaState",
  "empresaStreet",
  "empresaNumber",
  "empresaComplement",
  "empresaNeighborhood",
  "empresaCountry",
  "empresaAbout",
  "empresaProducts",
  "empresaAudience",
  "empresaRegion",
  "empresaDifferentials",
  "empresaCompetitors",
  "empresaEmployees",
  "empresaMonthlyRevenue",
  "empresaAverageTicket",
  "empresaSalesChannel",
  "empresaLogoUrl",
  "empresaHasBrandGuide",
  "empresaPrimaryColor",
  "empresaSecondaryColor",
  "empresaCommunicationTone",
  "empresaVisualStyle",
  "empresaAccountManager",
  "empresaContractType",
  "empresaPriority",
  "empresaMonthlyFee",
  "empresaPaymentMethod",
  "empresaStartDate",
  "empresaHasWebsite",
  "empresaHasDomain",
  "empresaHosting",
  "empresaCrm",
  "empresaCurrentTools",
  "empresaAutomations",
  "empresaTags",
  "empresaCommercialNotes",
  "empresaInternalNotes"
];

const COMPANY_LABELS = {
  id: "ID",
  legalName: "Razão social",
  tradeName: "Nome fantasia",
  document: "CNPJ",
  stateRegistration: "Inscrição estadual",
  municipalRegistration: "Inscrição municipal",
  companyType: "Tipo jurídico",
  size: "Porte",
  foundationYear: "Ano de fundação",
  segment: "Segmento",
  niche: "Nicho",
  status: "Status comercial",
  responsibleName: "Responsável principal",
  responsibleRole: "Cargo",
  whatsapp: "WhatsApp",
  phone: "Telefone",
  email: "E-mail principal",
  financeEmail: "E-mail financeiro",
  website: "Site",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  facebook: "Facebook",
  youtube: "YouTube",
  zip: "CEP",
  city: "Cidade",
  state: "Estado",
  street: "Logradouro",
  number: "Número",
  complement: "Complemento",
  neighborhood: "Bairro",
  country: "País",
  about: "Sobre a empresa",
  products: "Produtos ou serviços",
  audience: "Público-alvo",
  region: "Região atendida",
  differentials: "Diferenciais",
  competitors: "Concorrentes",
  employees: "Colaboradores",
  monthlyRevenue: "Faturamento mensal estimado",
  averageTicket: "Ticket médio",
  salesChannel: "Canal principal de vendas",
  logoUrl: "Logo (URL)",
  hasBrandGuide: "Manual de marca?",
  primaryColor: "Cor principal",
  secondaryColor: "Cor secundária",
  communicationTone: "Tom de comunicação",
  visualStyle: "Estilo visual",
  accountManager: "Gestor da conta",
  contractType: "Tipo de contrato",
  priority: "Prioridade",
  monthlyFee: "Valor mensal / projeto",
  paymentMethod: "Forma de pagamento",
  startDate: "Cliente desde",
  hasWebsite: "Possui site?",
  hasDomain: "Possui domínio?",
  hosting: "Hospedagem",
  crm: "CRM",
  currentTools: "Ferramentas atuais",
  automations: "Automações desejadas",
  tags: "Tags",
  commercialNotes: "Observações comerciais",
  internalNotes: "Observações internas",
  createdAt: "Criado em",
  updatedAt: "Atualizado em"
};

function collectCompanyData() {
  const data = {};

  COMPANY_FIELDS.forEach(fieldId => {
    const property = companyFieldToProperty(fieldId);
    const value = $("#" + fieldId)?.value.trim() || "";
    data[property] = ["website", "logoUrl"].includes(property) ? normalizeUrl(value) : value;
  });

  return data;
}

function resetCompanyForm() {
  const form = $("#companyForm");
  if (!form) return;
  form.reset();
  $("#empresaId").value = "";
  $("#empresaCountry").value = "Brasil";
  $("#empresaSize").value = "Pequeno";
  $("#empresaStatus").value = "Prospect";
  $("#empresaHasBrandGuide").value = "Não";
  $("#empresaContractType").value = "Projeto único";
  $("#empresaPriority").value = "Normal";
  $("#empresaHasWebsite").value = "Não";
  $("#empresaHasDomain").value = "Não";
  $("#companyFormTitle").textContent = "Cadastrar empresa";
}

function loadCompanyIntoForm(company) {
  $("#empresaId").value = company.id;
  COMPANY_FIELDS.forEach(fieldId => {
    const property = companyFieldToProperty(fieldId);
    const element = $("#" + fieldId);
    if (element) element.value = company[property] ?? "";
  });
  $("#companyFormTitle").textContent = "Editar empresa";
  openRecordForm("empresas");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function getCompanyDetailSections(company) {
  return [
    {
      title: "Identificação",
      rows: [
        ["ID", company.id],
        ["Razão social", company.legalName],
        ["Nome fantasia", company.tradeName],
        ["CNPJ", company.document],
        ["IE", company.stateRegistration],
        ["IM", company.municipalRegistration],
        ["Tipo", company.companyType],
        ["Porte", company.size],
        ["Fundação", company.foundationYear],
        ["Segmento", company.segment],
        ["Nicho", company.niche],
        ["Status", company.status]
      ]
    },
    {
      title: "Contatos",
      rows: [
        ["Responsável", company.responsibleName],
        ["Cargo", company.responsibleRole],
        ["WhatsApp", company.whatsapp],
        ["Telefone", company.phone],
        ["E-mail", company.email],
        ["E-mail financeiro", company.financeEmail],
        ["Site", company.website],
        ["Instagram", company.instagram],
        ["LinkedIn", company.linkedin],
        ["Facebook", company.facebook],
        ["YouTube", company.youtube]
      ]
    },
    {
      title: "Endereço",
      rows: [
        ["CEP", company.zip],
        ["Cidade", company.city],
        ["Estado", company.state],
        ["Logradouro", company.street],
        ["Número", company.number],
        ["Complemento", company.complement],
        ["Bairro", company.neighborhood],
        ["País", company.country]
      ]
    },
    {
      title: "Negócio",
      rows: [
        ["Sobre", company.about],
        ["Produtos / serviços", company.products],
        ["Público", company.audience],
        ["Região", company.region],
        ["Diferenciais", company.differentials],
        ["Concorrentes", company.competitors],
        ["Colaboradores", company.employees],
        ["Faturamento", company.monthlyRevenue],
        ["Ticket médio", company.averageTicket],
        ["Canal de vendas", company.salesChannel]
      ]
    },
    {
      title: "Marca e comercial",
      rows: [
        ["Logo", company.logoUrl],
        ["Manual de marca", company.hasBrandGuide],
        ["Cor principal", company.primaryColor],
        ["Cor secundária", company.secondaryColor],
        ["Tom", company.communicationTone],
        ["Estilo", company.visualStyle],
        ["Gestor", company.accountManager],
        ["Contrato", company.contractType],
        ["Prioridade", company.priority],
        ["Valor", company.monthlyFee],
        ["Pagamento", company.paymentMethod],
        ["Cliente desde", company.startDate]
      ]
    },
    {
      title: "Tecnologia e observações",
      rows: [
        ["Possui site", company.hasWebsite],
        ["Possui domínio", company.hasDomain],
        ["Hospedagem", company.hosting],
        ["CRM", company.crm],
        ["Ferramentas", company.currentTools],
        ["Automações", company.automations],
        ["Tags", company.tags],
        ["Notas comerciais", company.commercialNotes],
        ["Notas internas", company.internalNotes]
      ]
    }
  ];
}

function initCompanies() {
  const form = $("#companyForm");
  if (!form) return;

  function fillSegments() {
    const datalist = $("#companySegments");
    if (!datalist) return;
    const segments = [...new Set([
      ...getSavedCategories(),
      ...readStorage(COMPANY_KEY).map(item => item.segment).filter(Boolean)
    ])].sort((a, b) => a.localeCompare(b, "pt-BR"));
    datalist.innerHTML = segments.map(item => `<option value="${escapeHtml(item)}"></option>`).join("");
  }

  function renderCompanies() {
    fillSegments();
    fillCompanySelect($("#companyId")?.value || "");

    const allCompanies = readStorage(COMPANY_KEY);
    const categoryFilter = $("#companyCategoryFilter");
    const categories = [...new Set([
      ...allCompanies.map(item => item.segment).filter(Boolean)
    ])].sort((a, b) => a.localeCompare(b, "pt-BR"));
    const currentCategory = categoryFilter?.value || "";

    if (categoryFilter) {
      categoryFilter.innerHTML = `<option value="">Todas as categorias</option>${
        categories.map(category => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join("")
      }`;
      categoryFilter.value = categories.includes(currentCategory) ? currentCategory : "";
    }

    $("#companyCount").textContent = allCompanies.length;

    const query = normalizeText($("#companyFilter").value.trim());
    const selectedCategory = categoryFilter?.value || "";
    const companies = allCompanies.filter(company => {
      if (selectedCategory && company.segment !== selectedCategory) return false;
      if (!query) return true;
      return [
        company.legalName,
        company.tradeName,
        company.document,
        company.city,
        company.state,
        company.segment,
        company.niche,
        company.status,
        company.responsibleName
      ].some(value => normalizeText(value).includes(query));
    });

    const list = $("#adminCompanyList");

    if (!companies.length) {
      list.innerHTML = `
        <div class="empty-admin">
          <strong>Nenhuma empresa encontrada</strong>
          Cadastre uma empresa para liberar a criação de briefings.
        </div>
      `;
        return;
      }

    list.innerHTML = `
      <table class="admin-table">
        <thead>
          <tr>
            <th>Empresa</th>
            <th>Segmento</th>
            <th>Cidade</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${companies.map(company => `
            <tr>
              <td data-label="Empresa" class="cell-main">${escapeHtml(company.tradeName || company.legalName || "-")}</td>
              <td data-label="Segmento" class="cell-muted">${escapeHtml(company.segment || "-")}</td>
              <td data-label="Cidade" class="cell-muted">${escapeHtml([company.city, company.state].filter(Boolean).join(" - ") || "-")}</td>
              <td data-label="Status">
                <span class="status-chip${statusChipClass(company.status || "Ativa")}">
                  ${escapeHtml(company.status || "Ativa")}
                </span>
              </td>
              <td data-label="Ações">
                <div class="table-actions">
                  <button class="mini-btn" type="button" data-details-company="${company.id}">Ver detalhes</button>
                  <button class="mini-btn" type="button" data-edit-company="${company.id}">Editar</button>
                </div>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  }

  form.addEventListener("submit", event => {
    event.preventDefault();
    const editingId = $("#empresaId").value;
    const company = collectCompanyData();

    if (!company.legalName || !company.tradeName || !company.document || !company.segment || !company.responsibleName || !company.whatsapp || !company.email || !company.city || !company.state || !company.about) {
      alert("Preencha os campos obrigatórios da empresa antes de salvar.");
        return;
      }

    let companies = readStorage(COMPANY_KEY);
    company.updatedAt = new Date().toISOString();

    if (editingId) {
      const old = companies.find(item => item.id === editingId);
      company.id = editingId;
      company.createdAt = old?.createdAt || company.updatedAt;
      companies = companies.map(item => item.id === editingId ? company : item);
    } else {
      company.id = createId("EMP");
      company.createdAt = company.updatedAt;
      companies.unshift(company);
    }

    writeStorage(COMPANY_KEY, companies);
    resetCompanyForm();
    closeRecordForm("empresas");
    renderCompanies();
    renderStatistics();
    showToast(editingId ? "Empresa atualizada." : "Empresa cadastrada.");
  });

  $("#clearCompanyForm").addEventListener("click", resetCompanyForm);
  $("#companyFilter").addEventListener("input", renderCompanies);
  $("#companyCategoryFilter")?.addEventListener("change", renderCompanies);

  $("#adminCompanyList").addEventListener("click", event => {
    const detailsButton = event.target.closest("[data-details-company]");
    if (detailsButton) {
      const company = readStorage(COMPANY_KEY).find(item => item.id === detailsButton.dataset.detailsCompany);
      if (company) {
        openDetailsModal({
          eyebrow: "DETALHES DA EMPRESA",
          title: company.tradeName || company.legalName || "Empresa",
          sections: getCompanyDetailSections(company)
        });
      }
      return;
    }

    const editButton = event.target.closest("[data-edit-company]");
    if (editButton) {
      const company = readStorage(COMPANY_KEY).find(item => item.id === editButton.dataset.editCompany);
      if (company) loadCompanyIntoForm(company);
    }
  });

  renderCompanies();
}

/* =========================================================
   BRIEFING - CAMPOS
========================================================= */

const BRIEFING_FIELDS = [
  "companyId",
  "companyName",
  "responsibleName",
  "responsibleRole",
  "whatsapp",
  "email",
  "document",
  "city",
  "state",
  "currentWebsite",
  "instagram",
  "aboutCompany",
  "services",
  "targetAudience",
  "serviceRegion",
  "customerProblem",
  "differentials",
  "competitors",
  "averageTicket",
  "mainSalesChannel",
  "websiteGoal",
  "primaryConversion",
  "projectGoalMetric",
  "currentWebsiteProblems",
  "hasLogo",
  "hasBrandGuide",
  "hasFonts",
  "primaryColor",
  "secondaryColor",
  "avoidColor",
  "visualStyle",
  "desiredFeeling",
  "references",
  "dislikedReferences",
  "serviceType",
  "chosenTemplate",
  "pagesWanted",
  "homeSections",
  "features",
  "hasTexts",
  "hasPhotos",
  "hasVideos",
  "pendingAssets",
  "instAboutFocus",
  "instUnits",
  "instBlog",
  "instTeamPage",
  "instLanguages",
  "instCertifications",
  "instFooterContacts",
  "instContentOwner",
  "lpOffer",
  "lpPromise",
  "lpCta",
  "lpTrafficSource",
  "lpCampaign",
  "lpThankYou",
  "lpAudienceMoment",
  "lpObjections",
  "sysKind",
  "sysUsers",
  "sysModules",
  "sysData",
  "sysLogin",
  "sysPermissions",
  "sysRoles",
  "sysReports",
  "sysSla",
  "sysMigration",
  "bioMainLinks",
  "bioHighlight",
  "bioWhatsappText",
  "bioPixels",
  "bioLinkLimit",
  "seoCity",
  "seoState",
  "keywords",
  "faqQuestions",
  "communicationTone",
  "domain",
  "hasDomain",
  "hasHosting",
  "hostingProvider",
  "accessNotes",
  "socialNetworks",
  "integrations",
  "automationsWanted",
  "crm",
  "paymentPlatform",
  "deadline",
  "budget",
  "projectPriority",
  "startDate",
  "deliveryDate",
  "projectApprover",
  "clientNotes",
  "internalNotes"
];

const BRIEFING_REQUIRED_FIELDS = [
  "companyId",
  "responsibleName",
  "whatsapp",
  "email",
  "aboutCompany",
  "services",
  "websiteGoal",
  "pagesWanted",
  "serviceType",
  "chosenTemplate"
];

const BRIEFING_LABELS = {
  id: "ID",
  companyId: "ID da empresa",
  companyName: "Nome da empresa",
  responsibleName: "Nome do responsável",
  responsibleRole: "Cargo do responsável",
  whatsapp: "WhatsApp",
  email: "E-mail",
  document: "CNPJ / CPF",
  city: "Cidade",
  state: "Estado",
  currentWebsite: "Site atual",
  instagram: "Instagram",
  aboutCompany: "Descrição da empresa",
  services: "Principais produtos ou serviços",
  targetAudience: "Público-alvo principal",
  serviceRegion: "Região atendida",
  customerProblem: "Principal problema que a empresa resolve",
  differentials: "Diferenciais competitivos",
  competitors: "Principais concorrentes",
  averageTicket: "Ticket médio",
  mainSalesChannel: "Principal canal de vendas",
  websiteGoal: "Objetivo principal do website",
  primaryConversion: "Ação principal desejada",
  projectGoalMetric: "Meta do projeto",
  currentWebsiteProblems: "Problemas do site atual",
  hasLogo: "Possui logotipo?",
  hasBrandGuide: "Manual de marca?",
  hasFonts: "Possui fontes definidas?",
  primaryColor: "Cor principal",
  secondaryColor: "Cor secundária",
  avoidColor: "Cor que deve ser evitada",
  visualStyle: "Estilo visual desejado",
  desiredFeeling: "Sensação que o site deve transmitir",
  references: "Sites de referência",
  dislikedReferences: "Sites ou estilos que NÃO gosta",
  serviceType: "Tipo de serviço",
  chosenTemplate: "Template escolhido",
  pagesWanted: "Páginas desejadas",
  homeSections: "Seções indispensáveis na Home",
  features: "Funcionalidades desejadas",
  hasTexts: "Possui textos?",
  hasPhotos: "Possui fotos?",
  hasVideos: "Possui vídeos?",
  pendingAssets: "Materiais que o cliente precisa enviar",
  instAboutFocus: "Foco da página institucional",
  instUnits: "Quantidade de unidades / endereços",
  instBlog: "Terá blog / conteúdo",
  instTeamPage: "Página da equipe",
  instLanguages: "Idiomas do site",
  instCertifications: "Certificações, selos e prêmios",
  instFooterContacts: "Informações obrigatórias no rodapé",
  instContentOwner: "Quem envia/aprova o conteúdo institucional",
  lpOffer: "Oferta principal",
  lpPromise: "Promessa / resultado",
  lpCta: "Texto do botão de conversão",
  lpTrafficSource: "Origem do tráfego",
  lpCampaign: "Nome da campanha",
  lpThankYou: "Página de obrigado",
  lpAudienceMoment: "Momento do público na jornada",
  lpObjections: "Objeções que a página deve quebrar",
  sysKind: "Tipo de sistema",
  sysUsers: "Quantidade estimada de usuários",
  sysModules: "Módulos necessários",
  sysData: "Dados que o sistema precisa guardar",
  sysLogin: "Login / autenticação",
  sysPermissions: "Níveis de permissão",
  sysRoles: "Perfis / papéis de usuário",
  sysReports: "Relatórios desejados",
  sysSla: "SLA / prazo crítico",
  sysMigration: "Haverá migração de dados?",
  bioMainLinks: "Links que precisam aparecer",
  bioHighlight: "Destaque / oferta do momento",
  bioWhatsappText: "Texto do botão de WhatsApp",
  bioPixels: "Pixels / rastreamento",
  bioLinkLimit: "Limite de botões",
  seoCity: "Cidade principal para SEO",
  seoState: "Estado principal para SEO",
  keywords: "Palavras-chave desejadas",
  faqQuestions: "Principais perguntas dos clientes",
  communicationTone: "Tom de comunicação",
  domain: "Domínio desejado",
  hasDomain: "Já possui domínio?",
  hasHosting: "Possui hospedagem?",
  hostingProvider: "Provedor atual",
  accessNotes: "Observação sobre acessos",
  socialNetworks: "Redes sociais",
  integrations: "Integrações necessárias",
  automationsWanted: "Automações desejadas",
  crm: "CRM utilizado",
  paymentPlatform: "Plataforma de pagamentos",
  deadline: "Prazo desejado",
  budget: "Orçamento previsto",
  projectPriority: "Prioridade",
  startDate: "Data prevista para início",
  deliveryDate: "Data prevista para entrega",
  projectApprover: "Quem aprova o projeto?",
  clientNotes: "Observações do cliente",
  internalNotes: "Observações internas",
  createdAt: "Criado em",
  updatedAt: "Atualizado em"
};

function getBriefingDetailSections(briefing) {
  return [
    {
      title: "Cliente e empresa",
      rows: [
        ["ID", briefing.id],
        ["Empresa", briefing.companyName],
        ["ID da empresa", briefing.companyId],
        ["Responsável", briefing.responsibleName],
        ["Cargo", briefing.responsibleRole],
        ["WhatsApp", briefing.whatsapp],
        ["E-mail", briefing.email],
        ["CNPJ / CPF", briefing.document],
        ["Cidade", briefing.city],
        ["Estado", briefing.state],
        ["Site atual", briefing.currentWebsite],
        ["Instagram", briefing.instagram]
      ]
    },
    {
      title: "Sobre o negócio",
      rows: [
        ["Descrição da empresa", briefing.aboutCompany],
        ["Produtos / serviços", briefing.services],
        ["Público-alvo", briefing.targetAudience],
        ["Região atendida", briefing.serviceRegion],
        ["Problema que resolve", briefing.customerProblem],
        ["Diferenciais", briefing.differentials],
        ["Concorrentes", briefing.competitors],
        ["Ticket médio", briefing.averageTicket],
        ["Canal de vendas", briefing.mainSalesChannel]
      ]
    },
    {
      title: "Objetivos do projeto",
      rows: [
        ["Objetivo do website", briefing.websiteGoal],
        ["Conversão principal", briefing.primaryConversion],
        ["Meta", briefing.projectGoalMetric],
        ["Problemas do site atual", briefing.currentWebsiteProblems]
      ]
    },
    {
      title: "Identidade visual",
      rows: [
        ["Possui logotipo?", briefing.hasLogo],
        ["Manual de marca?", briefing.hasBrandGuide],
        ["Fontes definidas?", briefing.hasFonts],
        ["Cor principal", briefing.primaryColor],
        ["Cor secundária", briefing.secondaryColor],
        ["Cor a evitar", briefing.avoidColor],
        ["Estilo visual", briefing.visualStyle],
        ["Sensação desejada", briefing.desiredFeeling],
        ["Referências", briefing.references],
        ["Referências a evitar", briefing.dislikedReferences]
      ]
    },
    {
      title: "Estrutura do website",
      rows: [
        ["Template escolhido", briefing.chosenTemplate],
        ["Tipo de serviço", briefing.serviceType],
        ["Páginas desejadas", briefing.pagesWanted],
        ["Seções da Home", briefing.homeSections],
        ["Funcionalidades", briefing.features],
        ["Possui textos?", briefing.hasTexts],
        ["Possui fotos?", briefing.hasPhotos],
        ["Possui vídeos?", briefing.hasVideos],
        ["Materiais pendentes", briefing.pendingAssets]
      ]
    },
    {
      title: "Extras — Site institucional",
      rows: [
        ["Foco institucional", briefing.instAboutFocus],
        ["Unidades", briefing.instUnits],
        ["Blog", briefing.instBlog],
        ["Página da equipe", briefing.instTeamPage],
        ["Idiomas", briefing.instLanguages],
        ["Certificações", briefing.instCertifications],
        ["Rodapé", briefing.instFooterContacts],
        ["Aprovador de conteúdo", briefing.instContentOwner]
      ]
    },
    {
      title: "Extras — Landing page",
      rows: [
        ["Oferta", briefing.lpOffer],
        ["Promessa", briefing.lpPromise],
        ["CTA", briefing.lpCta],
        ["Tráfego", briefing.lpTrafficSource],
        ["Campanha", briefing.lpCampaign],
        ["Página de obrigado", briefing.lpThankYou],
        ["Momento do público", briefing.lpAudienceMoment],
        ["Objeções", briefing.lpObjections]
      ]
    },
    {
      title: "Extras — Sistema",
      rows: [
        ["Tipo de sistema", briefing.sysKind],
        ["Usuários", briefing.sysUsers],
        ["Módulos", briefing.sysModules],
        ["Dados", briefing.sysData],
        ["Login", briefing.sysLogin],
        ["Permissões", briefing.sysPermissions],
        ["Papéis", briefing.sysRoles],
        ["Relatórios", briefing.sysReports],
        ["SLA", briefing.sysSla],
        ["Migração", briefing.sysMigration]
      ]
    },
    {
      title: "Extras — Link na bio",
      rows: [
        ["Links", briefing.bioMainLinks],
        ["Destaque", briefing.bioHighlight],
        ["Texto WhatsApp", briefing.bioWhatsappText],
        ["Pixels", briefing.bioPixels],
        ["Limite de botões", briefing.bioLinkLimit]
      ]
    },
    {
      title: "SEO e conteúdo",
      rows: [
        ["Cidade SEO", briefing.seoCity],
        ["Estado SEO", briefing.seoState],
        ["Palavras-chave", briefing.keywords],
        ["Perguntas frequentes", briefing.faqQuestions],
        ["Tom de comunicação", briefing.communicationTone]
      ]
    },
    {
      title: "Domínio e hospedagem",
      rows: [
        ["Domínio", briefing.domain],
        ["Já possui domínio?", briefing.hasDomain],
        ["Possui hospedagem?", briefing.hasHosting],
        ["Provedor", briefing.hostingProvider],
        ["Observação de acessos", briefing.accessNotes]
      ]
    },
    {
      title: "Integrações e automações",
      rows: [
        ["Redes sociais", briefing.socialNetworks],
        ["Integrações", briefing.integrations],
        ["Automações desejadas", briefing.automationsWanted],
        ["CRM", briefing.crm],
        ["Pagamento", briefing.paymentPlatform]
      ]
    },
    {
      title: "Comercial e cronograma",
      rows: [
        ["Prazo", briefing.deadline],
        ["Orçamento", briefing.budget],
        ["Prioridade", briefing.projectPriority],
        ["Início previsto", briefing.startDate],
        ["Entrega prevista", briefing.deliveryDate],
        ["Responsável pela aprovação", briefing.projectApprover]
      ]
    },
    {
      title: "Observações finais",
      rows: [
        ["Observações do cliente", briefing.clientNotes],
        ["Observações internas", briefing.internalNotes],
        ["Criado em", briefing.createdAt],
        ["Atualizado em", briefing.updatedAt]
      ]
    }
  ];
}

function fillTemplateSelect(selectedName = "") {
  const select = $("#chosenTemplate");
  if (!select) return;

  const serviceType = $("#serviceType")?.value || "";
  const templates = readStorage(TEMPLATE_KEY)
    .filter(template =>
      template.status !== "Arquivado" &&
      (!serviceType || template.serviceType === serviceType)
    )
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "pt-BR"));

  select.innerHTML = `
    <option value="">${serviceType ? "Selecione o template" : "Selecione o tipo de serviço primeiro"}</option>
    ${templates.map(template => `
      <option value="${escapeHtml(template.name)}">${escapeHtml(template.name)}</option>
    `).join("")}
  `;

  if (selectedName) select.value = selectedName;
}

function toggleServiceExtras() {
  const serviceType = $("#serviceType")?.value || "";

  $$(".service-extras").forEach(block => {
    block.hidden = block.dataset.service !== serviceType;
  });

  fillTemplateSelect($("#chosenTemplate")?.value || "");
}

const SERVICE_EXTRA_REQUIRED = {
  "Site institucional": ["instAboutFocus", "instUnits", "instBlog", "instContentOwner"],
  "Landing page": ["lpOffer", "lpPromise", "lpCta", "lpTrafficSource"],
  "Sistema": ["sysKind", "sysUsers", "sysModules", "sysData", "sysLogin"],
  "Link na bio": ["bioMainLinks", "bioHighlight", "bioWhatsappText"]
};

function fillCompanySelect(selectedId = "") {
  const select = $("#companyId");

  if (!select) return;

  const companies = readStorage(COMPANY_KEY)
    .slice()
    .sort((a, b) =>
      String(a.tradeName || a.legalName || "").localeCompare(
        String(b.tradeName || b.legalName || ""),
        "pt-BR"
      )
    );

  select.innerHTML = `
    <option value="">Selecione uma empresa</option>
    ${companies
      .map(company => `
        <option value="${escapeHtml(company.id)}">
          ${escapeHtml(company.tradeName || company.legalName || company.id)}
        </option>
      `)
      .join("")}
  `;

  if (selectedId) {
    select.value = selectedId;
  }
}

function applyCompanyToBriefing(company) {
  if (!company) return;

  $("#companyName").value = company.tradeName || company.legalName || "";

  const mappings = [
    ["responsibleName", "responsibleName"],
    ["responsibleRole", "responsibleRole"],
    ["whatsapp", "whatsapp"],
    ["email", "email"],
    ["document", "document"],
    ["city", "city"],
    ["state", "state"],
    ["currentWebsite", "website"],
    ["instagram", "instagram"],
    ["aboutCompany", "about"],
    ["services", "products"],
    ["targetAudience", "audience"],
    ["serviceRegion", "region"],
    ["differentials", "differentials"],
    ["competitors", "competitors"],
    ["averageTicket", "averageTicket"],
    ["mainSalesChannel", "salesChannel"],
    ["primaryColor", "primaryColor"],
    ["secondaryColor", "secondaryColor"],
    ["visualStyle", "visualStyle"],
    ["communicationTone", "communicationTone"],
    ["crm", "crm"]
  ];

  mappings.forEach(([briefingField, companyField]) => {
    const element = $("#" + briefingField);
    if (element && !element.value.trim() && company[companyField]) {
      element.value = company[companyField];
    }
  });

  updateBriefingProgress();
}

function collectBriefingData() {
  const data = {};

  BRIEFING_FIELDS.forEach(field => {
    const value = $("#" + field)?.value.trim() || "";
    data[field] = field === "currentWebsite" ? normalizeUrl(value) : value;
  });

  const company = readStorage(COMPANY_KEY).find(item => item.id === data.companyId);

  if (company) {
    data.companyName = company.tradeName || company.legalName || data.companyName;
    data.companySegment = company.segment || "";
    data.companyCity = company.city || data.city;
    data.companyStatus = company.status || "";
  }

  return data;
}

function resetBriefingForm() {
  const form = $("#briefingForm");

  if (!form) return;

  form.reset();

  $("#briefingId").value = "";

  $("#briefingTitle").textContent =
    "Cadastrar briefing";

  $("#hasLogo").value = "Sim";
  $("#hasBrandGuide").value = "Não";
  $("#hasFonts").value = "Não";
  $("#hasTexts").value = "Não";
  $("#hasPhotos").value = "Não";
  $("#hasVideos").value = "Não";
  $("#hasDomain").value = "Não";
  $("#hasHosting").value = "Não";
  $("#projectPriority").value = "Normal";

  toggleServiceExtras();
  updateBriefingProgress();
}

function loadBriefingIntoForm(briefing) {
  fillCompanySelect(briefing.companyId);

  $("#briefingId").value =
    briefing.id;

  BRIEFING_FIELDS.forEach(field => {
    const element =
      $("#" + field);

    if (element) {
      element.value =
        briefing[field] ?? "";
    }
  });

  $("#briefingTitle").textContent =
    "Editar briefing";

  toggleServiceExtras();
  $("#chosenTemplate").value = briefing.chosenTemplate || "";
  updateBriefingProgress();
  openRecordForm("briefings");

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

function updateBriefingProgress() {
  const form = $("#briefingForm");

  if (!form) return;

  const completed =
    BRIEFING_FIELDS.filter(field => {
      const value =
        $("#" + field)?.value?.trim();

      return Boolean(value);
    }).length;

  const percentage =
    Math.round(
      (completed /
        BRIEFING_FIELDS.length) *
        100
    );

  $("#briefingProgressText").textContent =
    `${percentage}%`;

  $("#briefingProgressBar").style.width =
    `${percentage}%`;
}

/* =========================================================
   PDF DO BRIEFING
========================================================= */

function isPdfFilled(value) {
  return String(value ?? "").trim() !== "";
}

function formatPdfText(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  const isoDate = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoDate) return `${isoDate[3]}/${isoDate[2]}/${isoDate[1]}`;

  const isoDateTime = raw.match(/^(\d{4})-(\d{2})-(\d{2})T/);
  if (isoDateTime) {
    const date = new Date(raw);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleString("pt-BR");
    }
  }

  return raw;
}

function pdfColorHtml(value) {
  const formatted = formatPdfText(value);
  if (!formatted) {
    return `<span class="empty">Não informado</span>`;
  }

  const match = formatted.match(/#([0-9a-fA-F]{3,8})\b/);
  if (!match) return escapeHtml(formatted);

  const hex = match[0];
  return `<span class="color-val"><i style="background:${escapeHtml(hex)}"></i>${escapeHtml(formatted)}</span>`;
}

function pdfValueHtml(value, kind = "text") {
  if (kind === "color") return pdfColorHtml(value);
  if (!isPdfFilled(value)) return `<span class="empty">Não informado</span>`;
  return escapeHtml(formatPdfText(value));
}

function renderPdfFields(rows, { skipEmpty = true } = {}) {
  const visible = rows.filter(row => !skipEmpty || isPdfFilled(row.value));
  if (!visible.length) return "";

  return `<div class="fields">${visible
    .map(row => {
      const text = String(row.value ?? "");
      const long =
        row.kind === "long" ||
        text.length > 88 ||
        text.includes("\n");

      return `<div class="field${long ? " field-long" : ""}">
        <div class="k">${escapeHtml(row.label)}</div>
        <div class="v">${pdfValueHtml(row.value, row.kind)}</div>
      </div>`;
    })
    .join("")}</div>`;
}

function renderPdfSection(title, department, rows, options) {
  const fields = renderPdfFields(rows, options);
  if (!fields) return "";

  return `<section class="block">
    <div class="block-head">
      <h2>${escapeHtml(title)}</h2>
      ${department ? `<span class="dept">${escapeHtml(department)}</span>` : ""}
        </div>
    ${fields}
  </section>`;
}

function briefingServiceKind(serviceType = "") {
  const type = normalizeText(serviceType);
  if (type.includes("institucional")) return "institucional";
  if (type.includes("landing")) return "landing";
  if (type.includes("sistema")) return "sistema";
  if (type.includes("bio") || type.includes("link")) return "bio";
  return "";
}

function getCompanyRecord(companyId) {
  if (!companyId) return null;
  return (
    readStorage(COMPANY_KEY).find(item => item.id === companyId) || null
  );
}

function briefingPriorityClass(value = "") {
  const priority = normalizeText(value);
  if (["urgente", "alta"].includes(priority)) return "is-high";
  if (["baixa"].includes(priority)) return "is-low";
  return "is-normal";
}

function buildBriefingPdfHtml(briefing) {
  const generatedAt = new Date().toLocaleString("pt-BR");
  const company = getCompanyRecord(briefing.companyId);
  const serviceKind = briefingServiceKind(briefing.serviceType);
  const clientName = briefing.companyName || company?.tradeName || company?.legalName || "Cliente";
  const documentCode = briefing.id || "SEM-CODIGO";
  const versionStamp = formatPdfText(briefing.updatedAt) || generatedAt;

  const circulation = [
    ["Comercial / CS", "Cadastro, prazos, orçamento e aprovação."],
    ["Estratégia", "Negócio, público, objetivo e conversão."],
    ["Design / Branding", "Cores, estilo, referências e identidade."],
    ["Conteúdo", "Textos, páginas, tom, FAQ e materiais."],
    ["SEO", "Localidade, palavras-chave e estrutura."],
    ["Desenvolvimento", "Funcionalidades, template e integrações."],
    ["Tráfego / Mídia", "Oferta, campanha, pixels e CTA."],
    ["TI / Infra", "Domínio, hospedagem, acessos e sistemas."],
    ["Diretoria / Aprovação", "Escopo final, observações e assinatura."]
  ];

  const extraTitle = {
    institucional: "Especificações — Site institucional",
    landing: "Especificações — Landing page / captação",
    sistema: "Especificações — Sistema / produto",
    catalogo: "Especificações — Catálogo",
    bio: "Especificações — Link na bio"
  }[serviceKind];

  const extraDept = {
    institucional: "Conteúdo · Institucional",
    landing: "Tráfego · Conversão",
    sistema: "Produto · TI",
    bio: "Social · Growth"
  }[serviceKind];

  const extraRows = {
    institucional: [
      { label: "Foco da página institucional", value: briefing.instAboutFocus, kind: "long" },
      { label: "Unidades / endereços", value: briefing.instUnits },
      { label: "Blog / conteúdo", value: briefing.instBlog },
      { label: "Página da equipe", value: briefing.instTeamPage },
      { label: "Idiomas", value: briefing.instLanguages },
      { label: "Certificações, selos e prêmios", value: briefing.instCertifications, kind: "long" },
      { label: "Informações obrigatórias no rodapé", value: briefing.instFooterContacts, kind: "long" },
      { label: "Aprovador de conteúdo institucional", value: briefing.instContentOwner }
    ],
    landing: [
      { label: "Oferta principal", value: briefing.lpOffer, kind: "long" },
      { label: "Promessa / resultado", value: briefing.lpPromise, kind: "long" },
      { label: "Texto do botão de conversão", value: briefing.lpCta },
      { label: "Origem do tráfego", value: briefing.lpTrafficSource },
      { label: "Nome da campanha", value: briefing.lpCampaign },
      { label: "Página de obrigado", value: briefing.lpThankYou, kind: "long" },
      { label: "Momento do público na jornada", value: briefing.lpAudienceMoment, kind: "long" },
      { label: "Objeções que a página deve quebrar", value: briefing.lpObjections, kind: "long" }
    ],
    sistema: [
      { label: "Tipo de sistema", value: briefing.sysKind },
      { label: "Usuários estimados", value: briefing.sysUsers },
      { label: "Módulos necessários", value: briefing.sysModules, kind: "long" },
      { label: "Dados que o sistema precisa guardar", value: briefing.sysData, kind: "long" },
      { label: "Login / autenticação", value: briefing.sysLogin },
      { label: "Níveis de permissão", value: briefing.sysPermissions, kind: "long" },
      { label: "Perfis / papéis", value: briefing.sysRoles, kind: "long" },
      { label: "Relatórios desejados", value: briefing.sysReports, kind: "long" },
      { label: "SLA / prazo crítico", value: briefing.sysSla },
      { label: "Haverá migração de dados?", value: briefing.sysMigration }
    ],
    bio: [
      { label: "Links que precisam aparecer", value: briefing.bioMainLinks, kind: "long" },
      { label: "Destaque / oferta do momento", value: briefing.bioHighlight, kind: "long" },
      { label: "Texto do botão de WhatsApp", value: briefing.bioWhatsappText },
      { label: "Pixels / rastreamento", value: briefing.bioPixels, kind: "long" },
      { label: "Limite de botões", value: briefing.bioLinkLimit }
    ]
  }[serviceKind];

  const pending = isPdfFilled(briefing.pendingAssets);
  const internal = isPdfFilled(briefing.internalNotes);

  const companyBlock = company
    ? renderPdfSection("Cadastro da empresa (CRM)", "Comercial · CS", [
        { label: "Razão social", value: company.legalName },
        { label: "Nome fantasia", value: company.tradeName },
        { label: "CNPJ", value: company.document },
        { label: "Segmento", value: company.segment },
        { label: "Nicho", value: company.niche },
        { label: "Porte", value: company.size },
        { label: "Status comercial", value: company.status },
        { label: "Gestor da conta", value: company.accountManager },
        { label: "Tipo de contrato", value: company.contractType },
        { label: "Cliente desde", value: company.startDate }
      ])
    : "";

  const bodySections = [
    renderPdfSection("1. Cliente e interlocutor", "Comercial · CS", [
      { label: "Código do briefing", value: briefing.id },
      { label: "Empresa", value: clientName },
      { label: "ID da empresa", value: briefing.companyId },
      { label: "Responsável", value: briefing.responsibleName },
      { label: "Cargo", value: briefing.responsibleRole },
      { label: "WhatsApp", value: briefing.whatsapp },
      { label: "E-mail", value: briefing.email },
      { label: "CNPJ / CPF", value: briefing.document },
      { label: "Cidade", value: briefing.city },
      { label: "Estado", value: briefing.state },
      { label: "Site atual", value: briefing.currentWebsite },
      { label: "Instagram", value: briefing.instagram }
    ], { skipEmpty: false }),
    companyBlock,
    renderPdfSection("2. Sobre o negócio", "Estratégia · Comercial", [
      { label: "Descrição da empresa", value: briefing.aboutCompany, kind: "long" },
      { label: "Produtos / serviços", value: briefing.services, kind: "long" },
      { label: "Público-alvo", value: briefing.targetAudience, kind: "long" },
      { label: "Região atendida", value: briefing.serviceRegion },
      { label: "Problema que a empresa resolve", value: briefing.customerProblem, kind: "long" },
      { label: "Diferenciais competitivos", value: briefing.differentials, kind: "long" },
      { label: "Principais concorrentes", value: briefing.competitors, kind: "long" },
      { label: "Ticket médio", value: briefing.averageTicket },
      { label: "Principal canal de vendas", value: briefing.mainSalesChannel }
    ]),
    renderPdfSection("3. Objetivo e resultado esperado", "Estratégia · Diretoria", [
      { label: "Objetivo principal do website", value: briefing.websiteGoal, kind: "long" },
      { label: "Ação principal desejada (conversão)", value: briefing.primaryConversion, kind: "long" },
      { label: "Meta do projeto", value: briefing.projectGoalMetric, kind: "long" },
      { label: "Problemas do site atual", value: briefing.currentWebsiteProblems, kind: "long" }
    ]),
    renderPdfSection("4. Identidade visual e tom de marca", "Design · Branding", [
      { label: "Possui logotipo?", value: briefing.hasLogo },
      { label: "Manual de marca?", value: briefing.hasBrandGuide },
      { label: "Fontes definidas?", value: briefing.hasFonts },
      { label: "Cor principal", value: briefing.primaryColor, kind: "color" },
      { label: "Cor secundária", value: briefing.secondaryColor, kind: "color" },
      { label: "Cor a evitar", value: briefing.avoidColor, kind: "color" },
      { label: "Estilo visual desejado", value: briefing.visualStyle, kind: "long" },
      { label: "Sensação que o site deve transmitir", value: briefing.desiredFeeling, kind: "long" },
      { label: "Sites de referência", value: briefing.references, kind: "long" },
      { label: "Estilos que NÃO devem ser usados", value: briefing.dislikedReferences, kind: "long" }
    ]),
    renderPdfSection("5. Escopo, template e produção", "Desenvolvimento · Conteúdo", [
      { label: "Tipo de serviço", value: briefing.serviceType },
      { label: "Template escolhido", value: briefing.chosenTemplate },
      { label: "Páginas desejadas", value: briefing.pagesWanted, kind: "long" },
      { label: "Seções indispensáveis na Home", value: briefing.homeSections, kind: "long" },
      { label: "Funcionalidades desejadas", value: briefing.features, kind: "long" },
      { label: "Possui textos?", value: briefing.hasTexts },
      { label: "Possui fotos?", value: briefing.hasPhotos },
      { label: "Possui vídeos?", value: briefing.hasVideos },
      { label: "Materiais pendentes do cliente", value: briefing.pendingAssets, kind: "long" }
    ]),
    extraRows
      ? renderPdfSection(extraTitle, extraDept, extraRows)
      : "",
    renderPdfSection("6. SEO e conteúdo", "SEO · Conteúdo", [
      { label: "Cidade principal para SEO", value: briefing.seoCity },
      { label: "Estado principal para SEO", value: briefing.seoState },
      { label: "Palavras-chave desejadas", value: briefing.keywords, kind: "long" },
      { label: "Perguntas frequentes dos clientes", value: briefing.faqQuestions, kind: "long" },
      { label: "Tom de comunicação", value: briefing.communicationTone }
    ]),
    renderPdfSection("7. Domínio, hospedagem e acessos", "TI · Infra", [
      { label: "Domínio desejado", value: briefing.domain },
      { label: "Já possui domínio?", value: briefing.hasDomain },
      { label: "Possui hospedagem?", value: briefing.hasHosting },
      { label: "Provedor atual", value: briefing.hostingProvider },
      { label: "Observação sobre acessos", value: briefing.accessNotes, kind: "long" }
    ]),
    renderPdfSection("8. Integrações, CRM e automações", "Desenvolvimento · Ops", [
      { label: "Redes sociais", value: briefing.socialNetworks, kind: "long" },
      { label: "Integrações necessárias", value: briefing.integrations, kind: "long" },
      { label: "Automações desejadas", value: briefing.automationsWanted, kind: "long" },
      { label: "CRM utilizado", value: briefing.crm },
      { label: "Plataforma de pagamentos", value: briefing.paymentPlatform }
    ]),
    renderPdfSection("9. Comercial, prazos e aprovação", "Comercial · Diretoria", [
      { label: "Prazo desejado", value: briefing.deadline },
      { label: "Orçamento previsto", value: briefing.budget },
      { label: "Prioridade", value: briefing.projectPriority },
      { label: "Início previsto", value: briefing.startDate },
      { label: "Entrega prevista", value: briefing.deliveryDate },
      { label: "Quem aprova o projeto", value: briefing.projectApprover, kind: "long" },
      { label: "Observações do cliente", value: briefing.clientNotes, kind: "long" }
    ], { skipEmpty: false }),
    renderPdfSection("10. Observações internas (não enviar ao cliente)", "Uso interno", [
      { label: "Notas internas", value: briefing.internalNotes, kind: "long" },
      { label: "Criado em", value: briefing.createdAt },
      { label: "Atualizado em", value: briefing.updatedAt }
    ], { skipEmpty: false })
  ]
    .filter(Boolean)
    .join("");

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Briefing ${escapeHtml(documentCode)} — ${escapeHtml(clientName)}</title>
  <style>
    :root {
      --ink: #152033;
      --muted: #5b6b80;
      --line: #d5dde6;
      --soft: #f4f7fa;
      --navy: #163e73;
      --navy-2: #1d4f91;
      --gold: #b0892e;
      --danger: #9b1c1c;
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body {
      font-family: "Segoe UI", Calibri, Arial, sans-serif;
      color: var(--ink);
      background: #e8edf2;
      font-size: 12.5px;
      line-height: 1.45;
    }
    .print-bar {
      position: sticky;
      top: 0;
      z-index: 20;
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: center;
      padding: 12px 18px;
      background: #10233f;
      color: #fff;
    }
    .print-bar p { margin: 0; font-size: 12px; opacity: .88; max-width: 720px; }
    .print-bar button {
      border: 0;
      background: #fff;
      color: #10233f;
      font-weight: 700;
      padding: 9px 14px;
      cursor: pointer;
      white-space: nowrap;
    }
    .sheet {
      width: 210mm;
      min-height: 297mm;
      margin: 18px auto 36px;
      background: #fff;
      padding: 16mm 15mm 18mm;
      box-shadow: 0 12px 40px rgba(16,35,63,.16);
    }
    .cover {
      min-height: 265mm;
      display: flex;
      flex-direction: column;
      border: 1px solid var(--line);
      padding: 0;
    }
    .cover-top {
      background: var(--navy);
      color: #fff;
      padding: 22px 26px 20px;
      display: flex;
      justify-content: space-between;
      gap: 16px;
    }
    .brand-name { font-size: 13px; letter-spacing: .08em; text-transform: uppercase; opacity: .85; }
    .doc-kicker {
      margin-top: 18px;
      font-size: 11px;
      letter-spacing: .16em;
      text-transform: uppercase;
      color: #d6b56a;
      font-weight: 700;
    }
    .cover-top h1 {
      margin: 6px 0 0;
      font-size: 30px;
      line-height: 1.15;
      font-weight: 700;
      max-width: 430px;
    }
    .classif {
      border: 1px solid rgba(255,255,255,.35);
      padding: 8px 10px;
      font-size: 10px;
      letter-spacing: .12em;
      text-transform: uppercase;
      height: fit-content;
      text-align: right;
    }
    .cover-body { padding: 22px 26px 24px; flex: 1; }
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
      margin-bottom: 18px;
    }
    .kpi {
      border: 1px solid var(--line);
      background: var(--soft);
      padding: 10px 11px;
    }
    .kpi span {
      display: block;
      font-size: 9px;
      letter-spacing: .1em;
      text-transform: uppercase;
      color: var(--muted);
      font-weight: 700;
      margin-bottom: 4px;
    }
    .kpi strong { font-size: 13px; }
    .badge {
      display: inline-block;
      padding: 2px 8px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: .04em;
      text-transform: uppercase;
    }
    .is-high { background: #fde8e8; color: var(--danger); }
    .is-normal { background: #e8eef6; color: var(--navy); }
    .is-low { background: #eef2f6; color: #475569; }
    .meta-table, .circ-table, .sign-table {
      width: 100%;
      border-collapse: collapse;
    }
    .meta-table th, .meta-table td,
    .circ-table th, .circ-table td,
    .sign-table th, .sign-table td {
      border: 1px solid var(--line);
      padding: 8px 10px;
      text-align: left;
      vertical-align: top;
    }
    .meta-table th, .circ-table th, .sign-table th {
      background: var(--soft);
      font-size: 10px;
      letter-spacing: .08em;
      text-transform: uppercase;
      color: #4b5d73;
      width: 34%;
    }
    .section-label {
      margin: 18px 0 8px;
      font-size: 11px;
      letter-spacing: .14em;
      text-transform: uppercase;
      color: var(--navy);
      font-weight: 800;
    }
    .circ-table td:first-child { font-weight: 700; width: 34%; }
    .purpose {
      background: var(--soft);
      border-left: 4px solid var(--navy-2);
      padding: 12px 14px;
      margin: 16px 0 0;
      font-size: 12.5px;
    }
    .page-break { page-break-before: always; }
    .running {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      border-bottom: 2px solid var(--navy);
      padding-bottom: 8px;
      margin-bottom: 16px;
      font-size: 10px;
      letter-spacing: .08em;
      text-transform: uppercase;
      color: var(--muted);
    }
    .running strong { color: var(--navy); letter-spacing: 0; text-transform: none; font-size: 13px; }
    .exec {
      display: grid;
      grid-template-columns: 1.15fr .85fr;
      gap: 14px;
      margin-bottom: 18px;
    }
    .exec-card {
      border: 1px solid var(--line);
      padding: 14px 16px;
      background: #fff;
    }
    .exec-card h3 {
      margin: 0 0 8px;
      font-size: 11px;
      letter-spacing: .12em;
      text-transform: uppercase;
      color: var(--navy);
    }
    .exec-card p { margin: 0; white-space: pre-wrap; }
    .alert {
      border: 1px solid #e2c48a;
      background: #fff8ea;
      padding: 12px 14px;
      margin: 0 0 16px;
    }
    .alert strong { display: block; margin-bottom: 4px; color: #7a5410; }
    .internal-alert {
      border: 1px solid #f0b4b4;
      background: #fff5f5;
    }
    .internal-alert strong { color: var(--danger); }
    .block {
      border: 1px solid var(--line);
      margin: 0 0 14px;
    }
    .block-head { page-break-after: avoid; }
    .field { page-break-inside: avoid; }
    .block-head {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: center;
      background: var(--navy);
      color: #fff;
      padding: 8px 12px;
    }
    .block-head h2 {
      margin: 0;
      font-size: 12.5px;
      font-weight: 700;
      letter-spacing: .02em;
    }
    .dept {
      font-size: 9px;
      letter-spacing: .1em;
      text-transform: uppercase;
      border: 1px solid rgba(255,255,255,.35);
      padding: 3px 7px;
      white-space: nowrap;
    }
    .fields {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0;
    }
    .field {
      padding: 9px 12px 10px;
      border-bottom: 1px solid var(--line);
      border-right: 1px solid var(--line);
    }
    .field:nth-child(2n) { border-right: 0; }
    .field-long { grid-column: 1 / -1; border-right: 0; }
    .k {
      font-size: 9px;
      letter-spacing: .1em;
      text-transform: uppercase;
      color: var(--muted);
      font-weight: 700;
      margin-bottom: 3px;
    }
    .v { white-space: pre-wrap; font-size: 12.5px; }
    .empty { color: #94a3b8; font-style: italic; }
    .color-val { display: inline-flex; align-items: center; gap: 8px; }
    .color-val i {
      width: 14px;
      height: 14px;
      border: 1px solid #c5ced8;
      display: inline-block;
    }
    .signs { margin-top: 8px; page-break-inside: avoid; }
    .sign-table td { height: 72px; width: 33.33%; }
    .sign-table .who { font-size: 10px; color: var(--muted); }
    .footnote {
      margin-top: 18px;
      font-size: 10px;
      color: var(--muted);
      border-top: 1px solid var(--line);
      padding-top: 8px;
    }
    @page { size: A4; margin: 12mm 12mm 14mm; }
    @media print {
      body { background: #fff; }
      .print-bar { display: none !important; }
      .sheet {
        width: auto;
        min-height: 0;
        margin: 0;
        padding: 0;
        box-shadow: none;
      }
      .cover { min-height: 0; }
      a { color: inherit; text-decoration: none; }
    }
  </style>
</head>
<body>
  <div class="print-bar">
    <div>
      <strong>Briefing pronto para circular</strong>
      <p>Em Destino escolha <b>Salvar como PDF</b>, papel <b>A4</b>, orientação retrato. Desmarque “Cabeçalhos e rodapés” do navegador para o arquivo ficar limpo.</p>
    </div>
    <button type="button" onclick="window.print()">Imprimir / salvar PDF</button>
        </div>

  <div class="sheet">
    <article class="cover">
      <div class="cover-top">
        <div>
          <div class="brand-name">firestep TEMPLATES</div>
          <div class="doc-kicker">Documento operacional de projeto</div>
          <h1>${escapeHtml(clientName)}</h1>
        </div>
        <div class="classif">
          Confidencial<br>Uso interno<br>Circulação setorial
        </div>
      </div>
      <div class="cover-body">
        <div class="kpi-grid">
          <div class="kpi"><span>Tipo de serviço</span><strong>${escapeHtml(formatPdfText(briefing.serviceType) || "Não informado")}</strong></div>
          <div class="kpi"><span>Template</span><strong>${escapeHtml(formatPdfText(briefing.chosenTemplate) || "Não informado")}</strong></div>
          <div class="kpi"><span>Prioridade</span><strong><span class="badge ${briefingPriorityClass(briefing.projectPriority)}">${escapeHtml(formatPdfText(briefing.projectPriority) || "Normal")}</span></strong></div>
          <div class="kpi"><span>Entrega prevista</span><strong>${escapeHtml(formatPdfText(briefing.deliveryDate) || formatPdfText(briefing.deadline) || "A definir")}</strong></div>
        </div>

        <table class="meta-table">
          <tr><th>Código do briefing</th><td>${escapeHtml(documentCode)}</td></tr>
          <tr><th>Empresa / ID</th><td>${escapeHtml(clientName)} · ${escapeHtml(briefing.companyId || "—")}</td></tr>
          <tr><th>Interlocutor</th><td>${escapeHtml(formatPdfText(briefing.responsibleName) || "—")}${briefing.responsibleRole ? " — " + escapeHtml(briefing.responsibleRole) : ""}</td></tr>
          <tr><th>Aprovador do cliente</th><td>${escapeHtml(formatPdfText(briefing.projectApprover) || "Não informado")}</td></tr>
          <tr><th>Orçamento previsto</th><td>${escapeHtml(formatPdfText(briefing.budget) || "Não informado")}</td></tr>
          <tr><th>Emissão deste PDF</th><td>${escapeHtml(generatedAt)}</td></tr>
          <tr><th>Última atualização no sistema</th><td>${escapeHtml(versionStamp)}</td></tr>
        </table>

        <div class="section-label">Circulação obrigatória entre setores</div>
        <table class="circ-table">
          <thead><tr><th>Setor</th><th>O que este documento pede ao setor</th></tr></thead>
          <tbody>
            ${circulation
              .map(([sector, role]) => `<tr><td>${escapeHtml(sector)}</td><td>${escapeHtml(role)}</td></tr>`)
              .join("")}
          </tbody>
        </table>

        <div class="purpose">
          Este briefing é a fonte oficial de escopo. Design, conteúdo, mídia, desenvolvimento e comercial devem executar a partir deste arquivo. Divergências precisam ser atualizadas no sistema antes da produção.
        </div>
      </div>
    </article>

    <div class="page-break"></div>

    <div class="running">
      <span>firestep TEMPLATES · Briefing de projeto</span>
      <strong>${escapeHtml(documentCode)}</strong>
                  </div>

    <div class="section-label" style="margin-top:0">Resumo executivo</div>
    <div class="exec">
      <div class="exec-card">
        <h3>Objetivo</h3>
        <p>${pdfValueHtml(briefing.websiteGoal, "long")}</p>
      </div>
      <div class="exec-card">
        <h3>Conversão principal</h3>
        <p>${pdfValueHtml(briefing.primaryConversion, "long")}</p>
      </div>
      <div class="exec-card">
        <h3>Público</h3>
        <p>${pdfValueHtml(briefing.targetAudience, "long")}</p>
      </div>
      <div class="exec-card">
        <h3>Meta</h3>
        <p>${pdfValueHtml(briefing.projectGoalMetric, "long")}</p>
      </div>
                  </div>

    ${pending ? `<div class="alert"><strong>Pendência de materiais — Conteúdo / Design</strong>${escapeHtml(formatPdfText(briefing.pendingAssets))}</div>` : ""}
    ${internal ? `<div class="alert internal-alert"><strong>Uso interno — não encaminhar esta faixa ao cliente</strong>${escapeHtml(formatPdfText(briefing.internalNotes))}</div>` : ""}

    ${bodySections}

    <div class="signs">
      <div class="section-label">Controle de leitura e aprovação</div>
      <table class="sign-table">
        <thead>
          <tr>
            <th>Elaboração comercial</th>
            <th>Conferência de escopo</th>
            <th>Aprovação para produção</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><div class="who">Nome, data e rubrica</div></td>
            <td><div class="who">Nome, data e rubrica</div></td>
            <td><div class="who">Nome, data e rubrica</div></td>
          </tr>
        </tbody>
      </table>
                </div>

    <p class="footnote">
      Documento confidencial da firestep TEMPLATES. Circulação restrita aos setores envolvidos neste projeto.
      Qualquer alteração de escopo, prazo, orçamento ou template deve ser registrada no sistema e gerar uma nova versão deste PDF.
      Código ${escapeHtml(documentCode)} · Cliente ${escapeHtml(clientName)} · Gerado em ${escapeHtml(generatedAt)}.
    </p>
  </div>

      <script>
    window.addEventListener("load", function () {
      setTimeout(function () { window.print(); }, 280);
    });
      <\/script>
    </body>
</html>`;
}

function printBriefing(briefing) {
  const popup = window.open("", "_blank");

  if (!popup) {
    alert("Permita pop-ups no navegador para gerar o PDF.");
    return;
  }

  popup.document.open();
  popup.document.write(buildBriefingPdfHtml(briefing));
  popup.document.close();
}

/* =========================================================
   ADMIN - BRIEFINGS
========================================================= */

function initBriefings() {
  const form = $("#briefingForm");

  if (!form) return;

  BRIEFING_FIELDS.forEach(field => {
    const element = $("#" + field);

    if (element) {
      element.addEventListener(
        "input",
        updateBriefingProgress
      );

      element.addEventListener(
        "change",
        updateBriefingProgress
      );
    }
  });

  $("#companyId")?.addEventListener("change", () => {
    const company = readStorage(COMPANY_KEY).find(item => item.id === $("#companyId").value);

    if (!company) {
      $("#companyName").value = "";
      updateBriefingProgress();
      return;
    }

    applyCompanyToBriefing(company);
  });

  $("#serviceType")?.addEventListener("change", () => {
    $("#chosenTemplate").value = "";
    toggleServiceExtras();
    updateBriefingProgress();
  });

  function renderBriefings() {
    fillCompanySelect($("#companyId")?.value || "");

    const allBriefings =
      readStorage(BRIEFING_KEY);

    $("#briefingCount").textContent =
      allBriefings.length;

    const query =
      normalizeText(
        $("#briefingFilter")
          .value
          .trim()
      );

    const briefings =
      allBriefings.filter(
        briefing => {

          if (!query) {
            return true;
          }

          return [
            briefing.companyName,
            briefing.responsibleName,
            briefing.city,
            briefing.state,
            briefing.serviceType,
            briefing.chosenTemplate,
            briefing.email,
            briefing.whatsapp
          ].some(
            value =>
              normalizeText(value)
                .includes(query)
          );
        }
      );

    const list =
      $("#briefingList");

    if (!briefings.length) {

      list.innerHTML = `
        <div class="empty-admin">

          <strong>
            Nenhum briefing cadastrado
          </strong>

          Preencha o formulário para cadastrar o primeiro projeto.

        </div>
      `;

      return;
    }

    list.innerHTML = `
      <table class="admin-table">
        <thead>
          <tr>
            <th>Empresa</th>
            <th>Tipo</th>
            <th>Template</th>
            <th>Prioridade</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${briefings.map(briefing => `
            <tr>
              <td data-label="Empresa" class="cell-main" title="${escapeHtml(briefing.companyName || "")}">
                ${escapeHtml(briefing.companyName || "Empresa sem nome")}
              </td>
              <td data-label="Tipo" class="cell-muted">${escapeHtml(briefing.serviceType || "-")}</td>
              <td data-label="Template" class="cell-muted">${escapeHtml(briefing.chosenTemplate || "-")}</td>
              <td data-label="Prioridade">
                <span class="status-chip${statusChipClass(briefing.projectPriority || "Normal")}">
                  ${escapeHtml(briefing.projectPriority || "Normal")}
              </span>
              </td>
              <td data-label="Ações">
                <div class="table-actions">
                  <button class="mini-btn" type="button" data-details-briefing="${briefing.id}">Ver detalhes</button>
                  <button class="mini-btn" type="button" data-edit-briefing="${briefing.id}">Editar</button>
                  <button class="mini-btn" type="button" data-pdf-briefing="${briefing.id}">PDF</button>
            </div>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  }

  form.addEventListener(
    "submit",
    async event => {

      event.preventDefault();

      const submitButton =
        form.querySelector(
          'button[type="submit"]'
        );

      const originalButtonText =
        submitButton?.textContent;

      if (submitButton) {
        submitButton.disabled = true;

        submitButton.textContent =
          "Salvando...";
      }

      try {

        const editingId =
          $("#briefingId").value;

        const briefing =
          collectBriefingData();

        const missingRequired =
          BRIEFING_REQUIRED_FIELDS
            .filter(field => !briefing[field]);

        const extraRequired = (SERVICE_EXTRA_REQUIRED[briefing.serviceType] || [])
          .filter(field => !briefing[field]);

        if (missingRequired.length || extraRequired.length) {
          if (missingRequired.includes("companyId")) {
            alert("Selecione uma empresa cadastrada antes de salvar o briefing.");
          } else if (missingRequired.includes("serviceType") || missingRequired.includes("chosenTemplate")) {
            alert("Selecione o tipo de serviço e o template que o cliente deseja.");
          } else if (extraRequired.length) {
            alert("Preencha os campos extras obrigatórios deste tipo de serviço. O formulário só aumenta, nunca reduz os dados.");
          } else {
            alert("Preencha os campos obrigatórios do briefing antes de salvar.");
          }
          return;
        }

        let briefings =
          readStorage(
            BRIEFING_KEY
          );

        briefing.updatedAt =
          new Date().toISOString();

        if (editingId) {

          const oldBriefing =
            briefings.find(
              item =>
                item.id === editingId
            );

          briefing.id =
            editingId;

          briefing.createdAt =
            oldBriefing?.createdAt ||
            briefing.updatedAt;

        } else {

          briefing.id =
            createId("BRF");

          briefing.createdAt =
            briefing.updatedAt;
        }

        const webhookPayload = buildMakePayload(
          editingId ? "briefing_atualizado" : "briefing_cadastrado",
          briefing,
          BRIEFING_LABELS,
          "briefing"
        );

        if (editingId) {

          briefings =
            briefings.map(
              item =>
                item.id === editingId
                  ? briefing
                  : item
          );

        } else {

          briefings.unshift(
            briefing
          );
        }

        writeStorage(
          BRIEFING_KEY,
          briefings
        );

        resetBriefingForm();
        closeRecordForm("briefings");
        renderBriefings();
        renderStatistics();

        const webhookOk = await sendToWebhook(
          BRIEFING_WEBHOOK,
          webhookPayload
        );

        showToast(
          webhookOk
            ? (editingId
                ? "Briefing atualizado e enviado ao webhook."
                : "Briefing salvo e enviado ao webhook.")
            : "Briefing salvo localmente. O webhook não respondeu, mas o cadastro já foi registrado."
        );

      } catch (error) {

        console.error(
          "Erro ao salvar briefing:",
          error
        );

        alert(
          "Não foi possível salvar o briefing. Tente novamente."
        );

      } finally {

        if (submitButton) {
          submitButton.disabled =
            false;

          submitButton.textContent =
            originalButtonText ||
            "Salvar briefing";
        }

      }

    }
  );

  $("#briefingFilter").addEventListener(
    "input",
    renderBriefings
  );

  $("#clearBriefing").addEventListener(
    "click",
    resetBriefingForm
  );

  $("#newBriefing").addEventListener(
    "click",
    () => {
      resetBriefingForm();
      openRecordForm("briefings");
    }
  );

  $("#downloadCurrentBriefing")
    .addEventListener(
      "click",
      () => {

        const briefing =
          collectBriefingData();

        const missingRequired =
          BRIEFING_REQUIRED_FIELDS
            .filter(
              field =>
                !briefing[field]
            );

        if (
          missingRequired.length
        ) {

          alert(
            "Preencha os campos obrigatórios antes de gerar o PDF."
          );

          return;
        }

        printBriefing(
          briefing
        );

      }
    );

  $("#briefingList")
    .addEventListener(
      "click",
      event => {

        const briefings =
          readStorage(
            BRIEFING_KEY
          );

        const detailsButton =
          event.target.closest(
            "[data-details-briefing]"
          );

        if (detailsButton) {
          const briefing = briefings.find(
            item => item.id === detailsButton.dataset.detailsBriefing
          );

          if (briefing) {
            openDetailsModal({
              eyebrow: "DETALHES DO BRIEFING",
              title: briefing.companyName || "Briefing",
              sections: getBriefingDetailSections(briefing)
            });
          }

          return;
        }

        const editButton =
          event.target.closest(
            "[data-edit-briefing]"
          );

        if (editButton) {

          const briefing =
            briefings.find(
              item =>
                item.id ===
                editButton.dataset.editBriefing
            );

          if (briefing) {
            loadBriefingIntoForm(
              briefing
            );
          }

          return;
        }

        const pdfButton =
          event.target.closest(
            "[data-pdf-briefing]"
          );

        if (pdfButton) {

          const briefing =
            briefings.find(
              item =>
                item.id ===
                pdfButton.dataset.pdfBriefing
            );

          if (briefing) {
            printBriefing(
              briefing
            );
          }
        }
      }
    );

  updateBriefingProgress();
  toggleServiceExtras();

  renderBriefings();
}

/* =========================================================
   CATÁLOGO PÚBLICO
========================================================= */

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function closeInterestForm() {
  const modal = $("#interestModal");
  if (!modal) return;
  modal.hidden = true;
  if ($("#detailsModal")?.hidden !== false) {
    document.body.classList.remove("modal-open");
  }
}

function openInterestForm(templateId) {
  const modal = $("#interestModal");
  const form = $("#interestForm");
  if (!modal || !form) return;

  const template = readStorage(TEMPLATE_KEY).find(item => item.id === templateId);
  if (!template) {
    showToast("Template não encontrado.");
    return;
  }

  const details = $("#detailsModal");
  if (details) details.hidden = true;

  $("#interestTemplateId").value = template.id || "";
  $("#interestTemplateName").textContent = template.name || "Template";
  form.reset();
  $("#interestTemplateId").value = template.id || "";
  $("#interestSubmit").disabled = false;
  $("#interestSubmit").textContent = "Enviar";

  modal.hidden = false;
  document.body.classList.add("modal-open");
  $("#interestName")?.focus();
}

async function submitInterestLead(event) {
  event.preventDefault();

  const templateId = $("#interestTemplateId")?.value || "";
  const template = readStorage(TEMPLATE_KEY).find(item => item.id === templateId);
  const fullName = $("#interestName")?.value.trim() || "";
  const whatsapp = $("#interestWhatsapp")?.value.trim() || "";
  const email = $("#interestEmail")?.value.trim() || "";

  if (!fullName || !whatsapp || !email) {
    alert("Preencha nome completo, WhatsApp e e-mail.");
    return;
  }

  if (!isValidEmail(email)) {
    alert("Informe um e-mail válido.");
    return;
  }

  const submit = $("#interestSubmit");
  if (submit) {
    submit.disabled = true;
    submit.textContent = "Enviando...";
  }

  const lead = normalizePedido({
    id: createId("INT"),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    fullName,
    whatsapp,
    email,
    templateId: template?.id || templateId,
    templateName: template?.name || "",
    serviceType: template?.serviceType || "",
    category: template?.category || "",
    sku: template?.sku || "",
    templateUrl: template?.url || "",
    basePrice: template?.basePrice || "",
    deliveryTime: template?.deliveryTime || "",
    pageUrl: typeof location !== "undefined" ? location.href : "",
    status: "Novo"
  });

  savePedidosLocal([lead, ...readStorage(INTEREST_KEY)]);
  await persistPedidoRemote(lead);

  const payload = {
    evento: "tenho_interesse",
    origem: "firestep TEMPLATES - Catálogo",
    enviadoEm: lead.createdAt,
    nomeCompleto: fullName,
    whatsapp,
    email,
    ...lead,
    template: template || null
  };

  let webhookOk = true;
  if (INTEREST_WEBHOOK) {
    webhookOk = await sendToWebhook(INTEREST_WEBHOOK, payload);
  }

  closeInterestForm();
  showToast(
    webhookOk
      ? "Interesse enviado. Em breve a equipe entra em contato."
      : "Recebemos seus dados. Se o envio automático falhar, a equipe ainda terá o registro."
  );

  if (submit) {
    submit.disabled = false;
    submit.textContent = "Enviar";
  }
}

function initInterestLead() {
  const modal = $("#interestModal");
  const form = $("#interestForm");
  if (!modal || !form) return;

  form.addEventListener("submit", submitInterestLead);

  modal.addEventListener("click", event => {
    if (event.target.closest("[data-close-interest]")) {
      closeInterestForm();
    }
  });

  document.addEventListener("click", event => {
    const trigger = event.target.closest("[data-interest-template]");
    if (!trigger) return;
    event.preventDefault();
    openInterestForm(trigger.dataset.interestTemplate);
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !modal.hidden) {
      closeInterestForm();
    }
  });
}

function catalogKindSlug(template) {
  const type = normalizeText(template.serviceType || "");
  if (type.includes("sistema")) return "sistema";
  if (type.includes("catalogo")) return "catalogo";
  if (type.includes("bio") || type.includes("link")) return "bio";
  return "website";
}

function catalogKindMatches(template, kind) {
  const type = normalizeText(template.serviceType || "");
  if (kind === "website") {
    return type.includes("institucional") || type.includes("landing") || type.includes("website") || type === "site";
  }
  if (kind === "sistema") return type.includes("sistema");
  if (kind === "catalogo") return type.includes("catalogo");
  if (kind === "bio") return type.includes("bio") || type.includes("link");
  return false;
}

function initCrmNotice() {
  const notice = $("#crmNotice");
  if (!notice) return;

  document.body.classList.add("modal-open");

  function closeNotice() {
    notice.hidden = true;
    document.body.classList.remove("modal-open");
  }

  notice.addEventListener("click", event => {
    if (event.target.closest("[data-close-crm-notice]")) {
      closeNotice();
    }
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !notice.hidden) {
      closeNotice();
    }
  });
}

function initCatalog() {
  const input =
    $("#catalogSearch");

  if (!input) return;

  let selectedKind = "";
  let selectedCategory = "";

  function catalogCardHtml(template) {
    const tags = String(template.tags || "")
      .split(",")
      .map(tag => tag.trim())
      .filter(Boolean)
      .slice(0, 4);

    const specs = [
      template.pages ? `${template.pages} páginas` : "",
      template.technology,
      template.deliveryTime
    ].filter(Boolean);

    const detailsPath = templateSeoHref(template);
    const kind = catalogKindSlug(template);

    return `
      <article class="template-card is-${kind}">
        <a class="template-preview" href="${escapeHtml(detailsPath)}">
          <img
            src="${escapeHtml(template.image || "")}"
            alt="Preview do template ${escapeHtml(template.name || "")}"
          >
          <span>Sem preview</span>
          <b class="card-type">${escapeHtml(template.serviceType || "Template")}</b>
        </a>
        <div class="template-body">
          <small class="card-cat">${escapeHtml(template.category || "Catálogo")}</small>
          <h3>
            <a class="template-title-link" href="${escapeHtml(detailsPath)}">${escapeHtml(template.name || "Template")}</a>
          </h3>
          <p>${escapeHtml(template.description || "Template profissional pronto para personalização.")}</p>
          ${specs.length ? `
            <ul class="template-specs">
              ${specs.map(item => `<li>${escapeHtml(item)}</li>`).join("")}
            </ul>
          ` : ""}
          ${tags.length ? `
            <div class="template-tags">
              ${tags.map(tag => `<span class="template-tag">${escapeHtml(tag)}</span>`).join("")}
            </div>
          ` : ""}
          <div class="template-actions">
            <a class="btn btn-outline btn-full" href="${escapeHtml(detailsPath)}">Ver detalhes</a>
            <a class="btn btn-outline btn-full" href="${escapeHtml(template.url || "#")}" target="_blank" rel="noopener">Ver ao vivo</a>
            <button class="btn btn-primary btn-full" type="button" data-interest-template="${escapeHtml(template.id)}">Tenho interesse</button>
          </div>
        </div>
      </article>
    `;
  }

  function paintCatalogGrid(results, { title, emptySearch, emptyTitle, emptyText }) {
    $("#resultCount").textContent = results.length;
    $("#resultsTitle").textContent = title;
    $("#emptyState").hidden = results.length > 0;
    if ($("#emptyState strong") && emptyTitle) $("#emptyState strong").textContent = emptyTitle;
    if ($("#emptyState p") && emptyText) $("#emptyState p").textContent = emptyText;
    $("#noResults").hidden = !emptySearch || results.length > 0;
    $("#templateGrid").hidden = results.length === 0;
    $("#templateGrid").innerHTML = results.map(catalogCardHtml).join("");
    $$("#templateGrid img").forEach(img => {
      img.addEventListener("error", () => {
        img.closest(".template-preview")?.classList.add("is-fallback");
      });
    });
  }

  function renderCategoryChips(templates) {
    const categories = [...new Set(templates.map(item => item.category).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, "pt-BR"));

    const select = $("#catalogCategoryFilter");
    if (select) {
      select.innerHTML = `<option value="">Todas as categorias</option>${
        categories.map(category => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join("")
      }`;
      select.value = categories.includes(selectedCategory) ? selectedCategory : "";
      if (select.value !== selectedCategory) selectedCategory = select.value;
    }

    $("#categorySuggestions").innerHTML = categories
      .map(category => `
        <button
          type="button"
          data-category="${escapeHtml(category)}"
          class="${selectedCategory === category ? "is-active" : ""}"
        >
          ${escapeHtml(category)}
        </button>
      `)
      .join("");

    $("#categorySuggestions").hidden = categories.length === 0;
    const categoryFilterLabel = $(".catalog-category-filter");
    if (categoryFilterLabel) categoryFilterLabel.hidden = categories.length === 0;
  }

  function renderCatalog() {
    const query = input.value.trim();
    const normalizedQuery = normalizeText(query);
    selectedKind = document.querySelector('input[name="catalogKind"]:checked')?.value || "website";

    if (!document.querySelector('input[name="catalogKind"]:checked')) {
      const website = document.querySelector('input[name="catalogKind"][value="website"]');
      if (website) website.checked = true;
    }

    const allActive = readStorage(TEMPLATE_KEY).filter(
      template =>
        template.status !== "Arquivado" &&
        template.status !== "Rascunho"
    );

    if (!selectedKind) {
      $("#categorySuggestions").hidden = true;
      $("#categorySuggestions").innerHTML = "";
      const categoryFilterLabel = $(".catalog-category-filter");
      if (categoryFilterLabel) categoryFilterLabel.hidden = true;
      paintCatalogGrid([], {
        title: "Escolha o tipo de projeto",
        emptySearch: false,
        emptyTitle: "Selecione o tipo de projeto",
        emptyText: "É obrigatório escolher website, sistema ou link na bio para ver os templates."
      });
      return;
    }

    let templates = allActive.filter(template => catalogKindMatches(template, selectedKind));
    renderCategoryChips(templates);

    if (selectedCategory) {
      templates = templates.filter(template => template.category === selectedCategory);
    }

    if (!templates.length && !query && !selectedCategory) {
      paintCatalogGrid([], {
        title: "Templates disponíveis",
        emptySearch: false,
        emptyTitle: "Nenhum template neste tipo",
        emptyText: "Ainda não há templates cadastrados para esta opção."
      });
      return;
    }

    const results = query
      ? templates.filter(template =>
          [
            template.category,
            template.subcategory,
            template.name,
            template.description,
            template.technology,
            template.tags,
            template.features,
            template.serviceType,
            template.pageList,
            template.sections
          ].some(value => normalizeText(value).includes(normalizedQuery))
        )
      : templates;

    const kindLabel = selectedKind === "website"
      ? "Websites"
      : selectedKind === "sistema"
        ? "Sistemas"
        : selectedKind === "catalogo"
          ? "Catálogos"
          : "Links na bio";

    paintCatalogGrid(results, {
      title: selectedCategory ? `${kindLabel} · ${selectedCategory}` : kindLabel,
      emptySearch: Boolean(query || selectedCategory)
    });

    if (!results.length && (query || selectedCategory)) {
      $("#noResults p").textContent = "Tente outra categoria ou limpe o filtro da busca.";
    }
  }

  input.addEventListener(
    "input",
    renderCatalog
  );

  $("#clearSearch")
    .addEventListener(
      "click",
      () => {

        input.value = "";
        selectedCategory = "";
        if ($("#catalogCategoryFilter")) $("#catalogCategoryFilter").value = "";
        input.focus();
        renderCatalog();

      }
    );

  $("#categorySuggestions")
    .addEventListener(
      "click",
      event => {

        const button =
          event.target.closest(
            "[data-category]"
          );

        if (!button) {
          return;
        }

        selectedCategory = selectedCategory === button.dataset.category
          ? ""
          : button.dataset.category;
        if ($("#catalogCategoryFilter")) $("#catalogCategoryFilter").value = selectedCategory;

        renderCatalog();

      }
    );

  $("#catalogCategoryFilter")?.addEventListener("change", event => {
    selectedCategory = event.target.value || "";
    renderCatalog();
  });

  document.querySelectorAll('input[name="catalogKind"]').forEach(radio => {
    radio.addEventListener("change", () => {
      selectedCategory = "";
      input.value = "";
      if ($("#catalogCategoryFilter")) $("#catalogCategoryFilter").value = "";
      renderCatalog();
    });
  });

  renderCatalog();
}

const CHART_COLORS = ["#1763dc", "#3b82f6", "#0ea5e9", "#22c55e", "#eab308", "#f97316", "#ef4444", "#8b5cf6", "#14b8a6", "#64748b"];

function countBy(list, getKey) {
  const map = {};
  list.forEach(item => {
    const key = String(getKey(item) || "Não informado").trim() || "Não informado";
    map[key] = (map[key] || 0) + 1;
  });
  return Object.entries(map)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

function briefingFillRate(briefing) {
  const filled = BRIEFING_FIELDS.filter(field => String(briefing[field] || "").trim()).length;
  return Math.round((filled / BRIEFING_FIELDS.length) * 100);
}

function renderVerticalBars(items) {
  if (!items.length) return `<div class="empty-chart">Sem dados ainda.</div>`;
  const max = Math.max(...items.map(item => item.value), 1);
  return `
    <div class="vbars">
      ${items.slice(0, 8).map(item => `
        <div class="vbar">
          <i style="height:${Math.max(8, (item.value / max) * 100)}%"></i>
          <small>${escapeHtml(item.label)}<br>${item.value}</small>
        </div>
      `).join("")}
    </div>
  `;
}

function renderHorizontalBars(items) {
  if (!items.length) return `<div class="empty-chart">Sem dados ainda.</div>`;
  const max = Math.max(...items.map(item => item.value), 1);
  return `
    <div class="hbars">
      ${items.slice(0, 8).map(item => `
        <div class="hbar">
          <span title="${escapeHtml(item.label)}">${escapeHtml(item.label)}</span>
          <div class="hbar-track"><i style="width:${(item.value / max) * 100}%"></i></div>
          <strong>${item.value}</strong>
        </div>
      `).join("")}
    </div>
  `;
}

function renderDonut(items) {
  if (!items.length) return `<div class="empty-chart">Sem dados ainda.</div>`;
  const total = items.reduce((sum, item) => sum + item.value, 0) || 1;
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  const slices = items.map((item, index) => {
    const length = (item.value / total) * circumference;
    const circle = `
      <circle
        cx="80" cy="80" r="${radius}"
        fill="none"
        stroke="${CHART_COLORS[index % CHART_COLORS.length]}"
        stroke-width="18"
        stroke-dasharray="${length} ${circumference - length}"
        stroke-dashoffset="${-offset}"
        transform="rotate(-90 80 80)"
      ></circle>
    `;
    offset += length;
    return circle;
  }).join("");

  return `
    <div class="donut-wrap">
      <svg viewBox="0 0 160 160">${slices}</svg>
      <ul class="chart-legend">
        ${items.map((item, index) => `
          <li>
            <span><i class="legend-dot" style="background:${CHART_COLORS[index % CHART_COLORS.length]}"></i>${escapeHtml(item.label)}</span>
            <strong>${item.value} · ${Math.round((item.value / total) * 100)}%</strong>
          </li>
        `).join("")}
      </ul>
    </div>
  `;
}

function renderFunnel(steps) {
  const max = Math.max(...steps.map(step => step.value), 1);
  return `
    <div class="funnel">
      ${steps.map((step, index) => {
        const width = 58 + (step.value / max) * 42;
        return `
          <div class="funnel-step" style="width:${width}%;margin:0 auto;background:${CHART_COLORS[index]};border-radius:4px">
            ${escapeHtml(step.label)}
            <small>${step.value}</small>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function renderStatistics() {
  const root = $("#statsDashboard");
  if (!root) return;

  const templates = readStorage(TEMPLATE_KEY);
  const companies = readStorage(COMPANY_KEY);
  const briefings = readStorage(BRIEFING_KEY);
  const pedidos = mergePedidos(readStorage(INTEREST_KEY));
  const pedidosNovos = pedidos.filter(item => item.status === "Novo").length;

  const withTemplate = briefings.filter(item => item.chosenTemplate).length;
  const avgFill = briefings.length
    ? Math.round(briefings.reduce((sum, item) => sum + briefingFillRate(item), 0) / briefings.length)
    : 0;
  const companiesWithBriefing = new Set(briefings.map(item => item.companyId).filter(Boolean)).size;

  const recent = [...templates.map(item => ({ ...item, kind: "Template", title: item.name })),
    ...companies.map(item => ({ ...item, kind: "Empresa", title: item.tradeName || item.legalName })),
    ...briefings.map(item => ({ ...item, kind: "Briefing", title: item.companyName })),
    ...pedidos.map(item => ({ ...item, kind: "Pedido", title: item.fullName || item.templateName }))]
    .sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")))
    .slice(0, 8);

  root.innerHTML = `
    <div class="kpi-grid">
      <article class="kpi-card"><span>Templates</span><strong>${templates.length}</strong><small>${templates.filter(item => item.status === "Ativo").length} ativos no catálogo</small></article>
      <article class="kpi-card"><span>Empresas</span><strong>${companies.length}</strong><small>${companiesWithBriefing} com briefing vinculado</small></article>
      <article class="kpi-card"><span>Briefings</span><strong>${briefings.length}</strong><small>${withTemplate} com template escolhido</small></article>
      <article class="kpi-card"><span>Pedidos</span><strong>${pedidos.length}</strong><small>${pedidosNovos} novos do catálogo</small></article>
      <article class="kpi-card"><span>Preenchimento médio</span><strong>${avgFill}%</strong><small>campos do briefing completos</small></article>
    </div>

    <div class="stats-grid">
      <article class="chart-card">
        <h2>Cadastros por tipo</h2>
        <p>Volume comparado de templates, empresas e briefings.</p>
        ${renderVerticalBars([
          { label: "Templates", value: templates.length },
          { label: "Empresas", value: companies.length },
          { label: "Briefings", value: briefings.length },
          { label: "Pedidos", value: pedidos.length }
        ])}
      </article>
      <article class="chart-card">
        <h2>Funil operacional</h2>
        <p>Da carteira de empresas até a escolha de template.</p>
        ${renderFunnel([
          { label: "Pedidos do catálogo", value: pedidos.length },
          { label: "Empresas cadastradas", value: companies.length },
          { label: "Empresas com briefing", value: companiesWithBriefing },
          { label: "Briefings totais", value: briefings.length },
          { label: "Briefings com template", value: withTemplate }
        ])}
      </article>
    </div>

    <div class="stats-grid">
      <article class="chart-card">
        <h2>Templates por tipo de serviço</h2>
        <p>Institucional, landing page, sistema e link na bio.</p>
        ${renderDonut(countBy(templates, item => item.serviceType || "Não informado"))}
      </article>
      <article class="chart-card">
        <h2>Briefings por tipo de serviço</h2>
        <p>O que os clientes estão pedindo nos projetos.</p>
        ${renderDonut(countBy(briefings, item => item.serviceType || "Não informado"))}
      </article>
    </div>

    <div class="stats-grid-3">
      <article class="chart-card">
        <h2>Templates por status</h2>
        <p>Distribuição da biblioteca de produtos.</p>
        ${renderDonut(countBy(templates, item => item.status || "Ativo"))}
      </article>
      <article class="chart-card">
        <h2>Briefings por prioridade</h2>
        <p>Urgência comercial dos projetos.</p>
        ${renderDonut(countBy(briefings, item => item.projectPriority || "Normal"))}
      </article>
      <article class="chart-card">
        <h2>Empresas por status</h2>
        <p>Situação da carteira de clientes.</p>
        ${renderDonut(countBy(companies, item => item.status || "Prospect"))}
      </article>
    </div>

    <div class="stats-grid">
      <article class="chart-card">
        <h2>Templates por categoria</h2>
        <p>Categorias mais cadastradas na biblioteca.</p>
        ${renderHorizontalBars(countBy(templates, item => item.category))}
      </article>
      <article class="chart-card">
        <h2>Tecnologia dos templates</h2>
        <p>Stack mais usada nos produtos.</p>
        ${renderHorizontalBars(countBy(templates, item => item.technology || "Não informado"))}
      </article>
    </div>

    <div class="stats-grid">
      <article class="chart-card">
        <h2>Empresas por segmento</h2>
        <p>Setores da carteira cadastrada.</p>
        ${renderHorizontalBars(countBy(companies, item => item.segment))}
      </article>
      <article class="chart-card">
        <h2>Empresas por cidade</h2>
        <p>Concentração geográfica dos clientes.</p>
        ${renderHorizontalBars(countBy(companies, item => item.city))}
      </article>
    </div>

    <div class="stats-grid">
      <article class="chart-card">
        <h2>Briefings por empresa</h2>
        <p>Projetos abertos para cada cliente.</p>
        ${renderHorizontalBars(countBy(briefings, item => item.companyName))}
      </article>
      <article class="chart-card">
        <h2>Conversão desejada</h2>
        <p>Ação principal pedida nos briefings.</p>
        ${renderDonut(countBy(briefings, item => item.primaryConversion || "Não informado"))}
      </article>
    </div>

    <article class="chart-card">
      <h2>Atividade recente</h2>
      <p>Últimos cadastros e atualizações em templates, empresas e briefings.</p>
      ${
        recent.length
          ? `
            <table class="stats-table">
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>Registro</th>
                  <th>Atualizado em</th>
                </tr>
              </thead>
              <tbody>
                ${recent.map(item => `
                  <tr>
                    <td>${escapeHtml(item.kind)}</td>
                    <td>${escapeHtml(item.title || "-")}</td>
                    <td>${escapeHtml(item.updatedAt ? new Date(item.updatedAt).toLocaleString("pt-BR") : "-")}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          `
          : `<div class="empty-chart">Nenhum cadastro para exibir.</div>`
      }
    </article>
  `;
}

/* =========================================================
   BRIEFINGS DE DEMONSTRAÇÃO
========================================================= */

function seedCompleteTemplates() {
  try {
    localStorage.removeItem("fg_templates_v3");
  } catch {
    /* ignore */
  }
}

function seedCompleteCompanies() {
  const existing = readStorage(COMPANY_KEY);
  const seededIds = new Set(SEED_COMPANIES.map(item => item.id));
  const others = existing.filter(item => !seededIds.has(item.id));
  writeStorage(COMPANY_KEY, [...SEED_COMPANIES, ...others]);
}

function seedCompleteBriefings() {
  const existing = readStorage(BRIEFING_KEY);
  const seededIds = new Set(SEEDED_BRIEFINGS.map(item => item.id));
  const others = existing.filter(item => !seededIds.has(item.id));
  writeStorage(BRIEFING_KEY, [...SEEDED_BRIEFINGS, ...others]);
}

function initSupportChat() {
  if (!SUPPORT_WHATSAPP || $(".support-chat")) return;

  const message = encodeURIComponent(
    "Olá! Desejo falar com um atendente da firestep TEMPLATES."
  );
  const href = `https://wa.me/${SUPPORT_WHATSAPP}?text=${message}`;

  const box = document.createElement("a");
  box.className = "support-chat";
  box.href = href;
  box.target = "_blank";
  box.rel = "noopener";
  box.setAttribute("aria-label", "Falar com um atendente no WhatsApp");
  box.innerHTML = `
    <span class="support-chat-bubble">
      Deseja falar com um atendente?
      <strong>CLIQUE AQUI</strong>
    </span>
  `;

  document.body.appendChild(box);
}

function initPageScrollPreview() {
  $$(".page-scroll-preview-frame").forEach(frame => {
    const img = frame.querySelector("img");
    if (!img) return;

    const measure = () => {
      const travel = Math.max(0, img.scrollHeight - frame.clientHeight);
      img.style.setProperty("--scroll-travel", `-${travel}px`);
      const seconds = Math.min(42, Math.max(14, travel / 55));
      img.style.setProperty("--scroll-duration", `${seconds.toFixed(1)}s`);
    };

    const start = () => frame.classList.add("is-scrolling");
    const stop = () => frame.classList.remove("is-scrolling");

    if (img.complete) requestAnimationFrame(measure);
    img.addEventListener("load", () => requestAnimationFrame(measure));
    window.addEventListener("resize", measure);

    frame.addEventListener("pointerenter", start);
    frame.addEventListener("pointerleave", stop);
    frame.addEventListener("focus", start);
    frame.addEventListener("blur", stop);
    frame.addEventListener("pointerdown", event => {
      if (event.pointerType === "touch") start();
    });
    frame.addEventListener("pointerup", event => {
      if (event.pointerType === "touch") stop();
    });
    frame.addEventListener("pointercancel", stop);
  });
}

function getLightboxRoot() {
  let modal = $("#imageLightbox");
  if (modal) return modal;

  modal = document.createElement("div");
  modal.id = "imageLightbox";
  modal.className = "image-lightbox";
  modal.setAttribute("aria-hidden", "true");
  modal.innerHTML = `
    <div class="image-lightbox-backdrop" data-close-lightbox></div>
    <button class="image-lightbox-close form-close-x" type="button" data-close-lightbox aria-label="Fechar">×</button>
    <button class="image-lightbox-nav is-prev" type="button" data-lightbox-prev aria-label="Imagem anterior">‹</button>
    <img class="image-lightbox-photo" alt="Imagem ampliada">
    <button class="image-lightbox-nav is-next" type="button" data-lightbox-next aria-label="Próxima imagem">›</button>
  `;
  document.body.appendChild(modal);
  return modal;
}

function lightboxSources() {
  const urls = [];
  $$(".product-page .gallery-zoom").forEach(item => {
    const url = item.currentSrc || item.src;
    if (url && !urls.includes(url)) urls.push(url);
  });
  return urls;
}

function lightboxSrcFrom(target) {
  const img = target?.closest?.("img.gallery-zoom, .product-gallery img, .product-hero img");
  return img?.currentSrc || img?.src || "";
}

let lightboxOpenedAt = 0;

function showLightboxImage(src) {
  if (!src) return;
  const modal = getLightboxRoot();
  const photo = modal.querySelector(".image-lightbox-photo");
  const sources = lightboxSources();
  const index = sources.indexOf(src);
  photo.src = src;
  modal.dataset.index = String(index < 0 ? 0 : index);
  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  lightboxOpenedAt = Date.now();
  const many = sources.length > 1;
  modal.querySelector("[data-lightbox-prev]").hidden = !many;
  modal.querySelector("[data-lightbox-next]").hidden = !many;
}

function closeLightbox() {
  if (Date.now() - lightboxOpenedAt < 400) return;
  const modal = $("#imageLightbox");
  if (!modal || !modal.classList.contains("is-open")) return;
  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
  const photo = modal.querySelector(".image-lightbox-photo");
  if (photo) photo.src = "";
  if (!$(".form-host:not([hidden])") && !$("#detailsModal:not([hidden])") && !$("#interestModal:not([hidden])") && !$("#crmNotice:not([hidden])")) {
    document.body.classList.remove("modal-open");
  }
}

function stepLightbox(delta) {
  const sources = lightboxSources();
  if (sources.length < 2) return;
  const modal = $("#imageLightbox");
  const current = Number(modal?.dataset.index || 0);
  const next = (current + delta + sources.length) % sources.length;
  showLightboxImage(sources[next]);
}

function openGalleryLightbox(event) {
  const img = event.currentTarget?.closest?.("img") || event.target?.closest?.("img");
  const src = img?.currentSrc || img?.src;
  if (!src) return;
  event.preventDefault();
  event.stopPropagation();
  showLightboxImage(src);
}

window.__fsLightbox = openGalleryLightbox;

function bindTemplateGalleryClicks(root = document) {
  root.querySelectorAll(".product-gallery img, .product-hero img, img.gallery-zoom").forEach(img => {
    img.classList.add("gallery-zoom");
    img.setAttribute("role", "button");
    img.setAttribute("tabindex", "0");
    img.setAttribute("aria-label", img.getAttribute("aria-label") || "Ampliar imagem");
    img.setAttribute("onclick", "window.__fsLightbox && window.__fsLightbox(event)");
    if (img.dataset.zoomBound === "1") return;
    img.dataset.zoomBound = "1";
    img.addEventListener("click", openGalleryLightbox);
    img.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") openGalleryLightbox(event);
    });
  });
}

function initImageLightbox() {
  getLightboxRoot();
  bindTemplateGalleryClicks(document);

  if (document.body.dataset.lightboxReady) return;
  document.body.dataset.lightboxReady = "1";

  document.addEventListener("click", event => {
    const modal = $("#imageLightbox");
    if (modal?.classList.contains("is-open")) {
      const closer = event.target.closest("[data-close-lightbox]");
      if (closer || event.target === modal) {
        closeLightbox();
        return;
      }
      if (event.target.closest("[data-lightbox-prev]")) {
        stepLightbox(-1);
        return;
      }
      if (event.target.closest("[data-lightbox-next]")) {
        stepLightbox(1);
        return;
      }
      return;
    }

    const src = lightboxSrcFrom(event.target);
    if (!src) return;
    event.preventDefault();
    showLightboxImage(src);
  }, true);

  document.addEventListener("keydown", event => {
    const modal = $("#imageLightbox");
    if (!modal?.classList.contains("is-open")) return;
    if (event.key === "Escape") closeLightbox();
    if (event.key === "ArrowLeft") stepLightbox(-1);
    if (event.key === "ArrowRight") stepLightbox(1);
  });
}

function publicTemplateArticleHtml(template) {
  const live = String(template.url || "").trim();
  const video = hasVideoLink(template.video) ? template.video : "";
  const docs = String(template.documentation || "").trim();
  const gallery = templateGalleryUrls(template);
  const printUrl = String(template.pagePrint || "").trim();
  const hero = printUrl ? "" : (gallery[0] || template.image || "");
  const extraImages = gallery.filter(url => url && url !== printUrl && url !== hero);
  const skipRows = new Set(["Imagem / preview", "Print completo da landing"]);

  const blocks = getTemplatePublicDetailSections(template).map(section => {
    const rows = (section.rows || [])
      .filter(([label, value]) => String(value || "").trim() && !skipRows.has(label))
      .map(([label, value]) => {
        const text = String(value).trim();
        const body = /^(https?:\/\/|\/)/i.test(text)
          ? `<a href="${escapeHtml(text)}" target="_blank" rel="noopener">${escapeHtml(text)}</a>`
          : escapeHtml(text).replace(/\n/g, "<br>");
        return `<div class="product-row"><dt>${escapeHtml(label)}</dt><dd>${body}</dd></div>`;
      })
      .join("");
    if (!rows) return "";
    return `<section class="product-block"><h2>${escapeHtml(section.title)}</h2><dl>${rows}</dl></section>`;
  }).join("");

  return `
    <nav class="breadcrumb" aria-label="Trilha de navegação">
      <ol>
        <li><a href="index.html">Catálogo</a></li>
        <li>${escapeHtml(template.category || "Categoria")}</li>
        <li aria-current="page">${escapeHtml(template.subcategory || template.name || "Template")}</li>
      </ol>
    </nav>
    <article class="product-layout" itemscope itemtype="https://schema.org/Product">
      <div class="product-main">
        ${printUrl ? `<section class="page-scroll-preview">
          <div class="page-scroll-preview-chrome" aria-hidden="true"><span></span><span></span><span></span></div>
          <div class="page-scroll-preview-frame" tabindex="0">
            <img src="${escapeHtml(printUrl)}" alt="Print completo da landing ${escapeHtml(template.name || "")}">
          </div>
          <p class="page-scroll-preview-hint">Passe o mouse ou encoste na tela para percorrer a página</p>
        </section>` : ""}
        ${hero ? `<figure class="product-hero"><img class="gallery-zoom" src="${escapeHtml(hero)}" alt="Preview do template ${escapeHtml(template.name || "")}" itemprop="image" role="button" tabindex="0" aria-label="Ampliar preview" onclick="window.__fsLightbox && window.__fsLightbox(event)"></figure>` : ""}
        ${extraImages.length ? `<div class="product-gallery">${extraImages.map((url, index) => `<figure><img class="gallery-zoom" src="${escapeHtml(url)}" alt="Imagem ${index + 2} do template ${escapeHtml(template.name || "")}" role="button" tabindex="0" aria-label="Ampliar imagem ${index + 2}" onclick="window.__fsLightbox && window.__fsLightbox(event)"></figure>`).join("")}</div>` : ""}
        <p class="eyebrow">${escapeHtml([template.serviceType, template.category].filter(Boolean).join(" · "))}</p>
        <h1 itemprop="name">${escapeHtml(template.name || "Template")}</h1>
        <p class="product-lead" itemprop="description">${escapeHtml(template.description || "")}</p>
        ${blocks}
      </div>
      <aside class="product-aside">
        <p class="product-kicker">Especialidade</p>
        <p class="product-specialty">${escapeHtml(template.subcategory || template.category || "Template")}</p>
        ${template.deliveryTime ? `<p class="product-meta">Prazo: ${escapeHtml(template.deliveryTime)}</p>` : ""}
        ${template.pages ? `<p class="product-meta">${escapeHtml(String(template.pages))} páginas · ${escapeHtml(template.technology || "")}</p>` : ""}
        <div class="template-actions">
          <button class="btn btn-primary btn-full" type="button" data-interest-template="${escapeHtml(template.id || "")}">Tenho interesse</button>
          ${live ? `<a class="btn btn-outline btn-full" href="${escapeHtml(live)}" target="_blank" rel="noopener">Ver ao vivo</a>` : ""}
          ${video ? `<a class="btn btn-outline btn-full" href="${escapeHtml(video)}" target="_blank" rel="noopener">Ver vídeo</a>` : ""}
          ${docs ? `<a class="btn btn-outline btn-full" href="${escapeHtml(docs)}" target="_blank" rel="noopener">Documentação</a>` : ""}
        </div>
      </aside>
    </article>
  `;
}

async function initTemplateDetailPage() {
  const root = $("#templateDetailRoot");
  if (!root) return false;

  const id = new URLSearchParams(location.search).get("id");
  if (!id) {
    root.innerHTML = `<div class="empty"><strong>Template não informado</strong><p>Volte ao catálogo e escolha um modelo.</p></div>`;
    return false;
  }

  const template = await fetchTemplateById(id);
  if (!template) {
    root.innerHTML = `<div class="empty"><strong>Template não encontrado</strong><p>Esse cadastro pode ter sido excluído.</p></div>`;
    return false;
  }

  document.title = `${template.name || "Template"} | firestep TEMPLATES`;
  root.innerHTML = publicTemplateArticleHtml(template);
  initImageLightbox();
  bindTemplateGalleryClicks(root);
  return true;
}

document.addEventListener(
  "DOMContentLoaded",
  async () => {
    seedCompleteTemplates();
    seedCompleteCompanies();
    seedCompleteBriefings();
    await hydrateTemplatesFromCloud();
    await hydrateCategoriesFromCloud();
    fillCategoryDatalist();

    if (document.body.dataset.page === "admin") {
      const allowed = await initAdminAuth();
      if (!allowed) return;
      startAdminApp();
    } else if (document.body.dataset.page === "catalog") {
      initInterestLead();
      initCatalog();
      initSupportChat();
      initCrmNotice();
    } else if (document.body.dataset.page === "template") {
      initImageLightbox();
      await initTemplateDetailPage();
      initInterestLead();
      initSupportChat();
      initPageScrollPreview();
    }
  }
);