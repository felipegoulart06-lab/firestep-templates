const { loadEnv } = require("../load-env");
loadEnv(require("path").join(__dirname, ".."));

const r2 = require("../lib/r2");

const SUPABASE_URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;

function isSupabaseMedia(url) {
  return /supabase\.co\/storage\/v1\/object\/public\/template-media\//i.test(String(url || ""));
}

function storagePathFromUrl(url) {
  const match = String(url).match(/\/object\/public\/template-media\/(.+)$/i);
  return match ? decodeURIComponent(match[1]) : "";
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
  const text = await res.text();
  if (!res.ok) return { ok: false, status: res.status, text };
  return { ok: true, items: JSON.parse(text || "[]") };
}

async function collectStorageFiles(prefix = "") {
  const listed = await listStorage(prefix);
  if (!listed.ok) return listed;
  const files = [];
  for (const item of listed.items || []) {
    const name = item.name;
    const path = prefix ? `${prefix}${name}` : name;
    if (item.id === null && !item.metadata) {
      const nested = await collectStorageFiles(`${path}/`);
      if (nested.ok) files.push(...nested.files);
    } else {
      files.push(path);
    }
  }
  return { ok: true, files };
}

(async () => {
  const templates = await fetchTemplates();
  console.log("templates", templates.length);
  const urls = [];
  for (const row of templates) {
    const p = row.payload && typeof row.payload === "object" ? row.payload : {};
    const gallery = Array.isArray(p.gallery) ? p.gallery : String(p.gallery || "").split(/\n/).map(s => s.trim()).filter(Boolean);
    [p.image, p.pagePrint, row.image, ...gallery].forEach(url => {
      if (isSupabaseMedia(url)) urls.push({ id: row.id, url });
    });
  }
  console.log("supabase-urls", urls.length);
  const listed = await collectStorageFiles("");
  console.log("storage-list", listed.ok ? listed.files.length : `fail ${listed.status} ${String(listed.text).slice(0, 180)}`);
  if (listed.ok) console.log("storage-sample", listed.files.slice(0, 8).join(" | "));
})().catch(err => {
  console.error(err);
  process.exit(1);
});
