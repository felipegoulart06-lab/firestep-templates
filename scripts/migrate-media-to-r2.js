const { loadEnv } = require("../load-env");
const path = require("path");
loadEnv(path.join(__dirname, ".."));

const r2 = require("../lib/r2");

const SUPABASE_URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;

function isSupabaseMedia(url) {
  return /supabase\.co\/storage\/v1\/object\/public\/template-media\//i.test(String(url || ""));
}

function basenameFromUrl(url) {
  const match = String(url).match(/\/template-media\/(.+?)(?:\?|$)/i);
  if (!match) return "";
  return decodeURIComponent(match[1].split("/").pop());
}

function publicUrl(key) {
  return r2.publicUrlFor(key);
}

function rewritePayload(payload, id, urlMap) {
  const next = { ...payload, id };
  const swap = value => urlMap.get(String(value || "").split("?")[0]) || value;
  if (next.image) next.image = swap(next.image);
  if (next.pagePrint) next.pagePrint = swap(next.pagePrint);
  if (Array.isArray(next.gallery)) next.gallery = next.gallery.map(swap);
  else if (typeof next.gallery === "string" && next.gallery.trim()) {
    next.gallery = next.gallery.split(/\n/).map(item => swap(item.trim())).filter(Boolean);
  }
  return next;
}

async function fetchTemplates() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/firestep_templates?select=*`, {
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}` }
  });
  if (!res.ok) throw new Error(`templates ${res.status} ${await res.text()}`);
  return res.json();
}

async function listStorage(prefix = "") {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/list/template-media`, {
    method: "POST",
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${ANON}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ prefix, limit: 1000, offset: 0 })
  });
  if (!res.ok) throw new Error(`list ${res.status} ${await res.text()}`);
  return res.json();
}

async function collectStorageFiles(prefix = "") {
  const items = await listStorage(prefix);
  const files = [];
  for (const item of items || []) {
    const pathName = prefix ? `${prefix}${item.name}` : item.name;
    const isFolder = item.id == null && (!item.metadata || item.metadata === null);
    if (isFolder) files.push(...await collectStorageFiles(`${pathName}/`));
    else files.push(pathName);
  }
  return files;
}

async function downloadStorage(objectPath) {
  const url = `${SUPABASE_URL}/storage/v1/object/public/template-media/${objectPath}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${objectPath} ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const type = res.headers.get("content-type") || "application/octet-stream";
  return { buf, type };
}

async function deleteStorage(paths) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/template-media`, {
    method: "DELETE",
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${ANON}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ prefixes: paths })
  });
  return { status: res.status, text: await res.text() };
}

async function patchTemplate(row) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/firestep_templates?id=eq.${encodeURIComponent(row.id)}`, {
    method: "PATCH",
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${ANON}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal"
    },
    body: JSON.stringify({
      payload: row.payload,
      updated_at: new Date().toISOString()
    })
  });
  return { id: row.id, status: res.status, text: await res.text() };
}

(async () => {
  if (!r2.r2Ready()) throw new Error("R2 sem chaves");
  const templates = await fetchTemplates();
  const files = await collectStorageFiles("");
  console.log("templates", templates.length, "storage-files", files.length);

  const ownerByPath = new Map();
  for (const row of templates) {
    const p = row.payload && typeof row.payload === "object" ? row.payload : {};
    const gallery = Array.isArray(p.gallery)
      ? p.gallery
      : String(p.gallery || "").split(/\n/).map(s => s.trim()).filter(Boolean);
    const urls = [p.image, p.pagePrint, ...gallery].filter(isSupabaseMedia);
    urls.forEach(url => {
      const objectPath = String(url).split("/template-media/")[1].split("?")[0];
      const decoded = decodeURIComponent(objectPath);
      if (!ownerByPath.has(decoded)) ownerByPath.set(decoded, row.id);
    });
  }

  const urlMap = new Map();
  let copied = 0;
  for (const objectPath of files) {
    const templateId = ownerByPath.get(objectPath) || "_orphan";
    const base = objectPath.split("/").pop();
    const key = `${templateId}/${base}`;
    const { buf, type } = await downloadStorage(objectPath);
    await r2.ensureTemplateFolder(templateId);
    await r2.putObject(key, buf, type);
    const oldUrl = `${SUPABASE_URL}/storage/v1/object/public/template-media/${objectPath}`;
    urlMap.set(oldUrl, publicUrl(key));
    copied += 1;
    if (copied % 10 === 0) console.log("copied", copied, "/", files.length);
  }
  console.log("copied-total", copied);

  let patched = 0;
  let patchFail = 0;
  for (const row of templates) {
    const payload = row.payload && typeof row.payload === "object" ? row.payload : {};
    const next = rewritePayload(payload, row.id, urlMap);
    const result = await patchTemplate({ id: row.id, payload: next });
    if (result.status >= 200 && result.status < 300) patched += 1;
    else {
      patchFail += 1;
      console.log("patch-fail", row.id, result.status, String(result.text).slice(0, 120));
    }
  }
  console.log("patched", patched, "patch-fail", patchFail);

  const removed = await deleteStorage(files);
  console.log("delete-storage", removed.status, String(removed.text).slice(0, 200));
})().catch(err => {
  console.error(err);
  process.exit(1);
});
