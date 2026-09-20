const { verifyAdmin, bearer, sendJson } = require("../lib/admin-auth");
const { publicUrlFor } = require("../lib/r2");

function isSupabaseMedia(url) {
  return /supabase\.co\/storage\/v1\/object\/public\/template-media\//i.test(String(url || ""));
}

function rewriteUrl(url, templateId) {
  const raw = String(url || "").trim();
  if (!isSupabaseMedia(raw) && !/\/api\/r2\?key=/i.test(raw)) return raw;
  let folder = templateId || "_orphan";
  let fileName = "";
  if (isSupabaseMedia(raw)) {
    fileName = decodeURIComponent(raw.split("/template-media/")[1].split("?")[0].split("/").pop());
  } else {
    const key = decodeURIComponent((raw.match(/[?&]key=([^&]+)/i) || [])[1] || "");
    const parts = key.split("/");
    folder = parts[0] || folder;
    fileName = parts.slice(1).join("/");
  }
  if (!fileName) return raw;
  return publicUrlFor(`${folder}/${fileName}`);
}

function rewritePayload(payload, id) {
  const next = { ...payload, id };
  next.image = rewriteUrl(next.image, id);
  next.pagePrint = rewriteUrl(next.pagePrint, id);
  if (Array.isArray(next.gallery)) next.gallery = next.gallery.map(url => rewriteUrl(url, id));
  return next;
}

async function sb(path, { method = "GET", token, body, json = true } = {}) {
  const res = await fetch(`${process.env.SUPABASE_URL}${path}`, {
    method,
    headers: {
      apikey: process.env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      ...(json ? { "Content-Type": "application/json" } : {})
    },
    body: body && json ? JSON.stringify(body) : body
  });
  const text = await res.text();
  return { status: res.status, text, data: text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : null };
}

async function listAll(prefix, token) {
  const res = await sb("/storage/v1/object/list/template-media", {
    method: "POST",
    token,
    body: { prefix, limit: 1000, offset: 0 }
  });
  const items = Array.isArray(res.data) ? res.data : [];
  const files = [];
  for (const item of items) {
    const pathName = prefix ? `${prefix}${item.name}` : item.name;
    const isFolder = item.id == null && !item.metadata;
    if (isFolder) files.push(...await listAll(`${pathName}/`, token));
    else files.push(pathName);
  }
  return files;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { ok: false, error: "Method not allowed" });
    return;
  }
  try {
    const token = bearer(req);
    if (!(await verifyAdmin(token))) {
      sendJson(res, 401, { ok: false, error: "Admin necessário" });
      return;
    }

    const listed = await sb("/rest/v1/firestep_templates?select=*", { token });
    const templates = Array.isArray(listed.data) ? listed.data : [];
    let patched = 0;
    for (const row of templates) {
      const payload = row.payload && typeof row.payload === "object" ? row.payload : {};
      const next = rewritePayload(payload, row.id);
      const still = isSupabaseMedia(payload.image) || isSupabaseMedia(payload.pagePrint);
      if (!still && JSON.stringify(payload) === JSON.stringify(next)) continue;
      const upd = await sb(`/rest/v1/firestep_templates?id=eq.${encodeURIComponent(row.id)}`, {
        method: "PATCH",
        token,
        body: { payload: next, updated_at: new Date().toISOString() }
      });
      if (upd.status < 300) patched += 1;
    }

    let deleted = 0;
    let deleteErrors = 0;
    try {
      const files = await listAll("", token);
      for (const file of files) {
        const del = await sb(`/storage/v1/object/template-media/${file}`, { method: "DELETE", token, json: false });
        if (del.status < 300) deleted += 1;
        else deleteErrors += 1;
      }
    } catch (error) {
      deleteErrors += 1;
    }

    sendJson(res, 200, { ok: true, templates: templates.length, patched, deleted, deleteErrors });
  } catch (error) {
    sendJson(res, 500, { ok: false, error: error.message || "Falha ao limpar o Supabase" });
  }
};
