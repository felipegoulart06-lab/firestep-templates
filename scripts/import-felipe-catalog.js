const fs = require("fs");
const path = require("path");
async function uploadPng(sku, kind, filePath) {
  const dest = path.join(ROOT, "modelos", sku, `${kind}.png`);
  fs.copyFileSync(filePath, dest);
  return `${SITE}/modelos/${sku}/${kind}.png`;
}

const SOURCE = path.join(__dirname, "..", "..", "felipe");
const ROOT = path.join(__dirname, "..");
const SITE = "https://templates.firestep.cloud";

const LABELS = {
  "Tipo de serviço": "serviceType",
  "Categoria da empresa": "category",
  "Subcategoria": "subcategory",
  "Nome do template": "name",
  "Código interno / SKU": "sku",
  "Status": "status",
  "Quantidade de páginas": "pages",
  "Versão": "version",
  "Como funciona": "description",
  "Lista de páginas": "pageList",
  "Seções principais": "sections",
  "Recursos e funcionalidades": "features",
  "Campos editáveis pelo cliente": "editableFields",
  "Tecnologia principal": "technology",
  "Hospedagem recomendada": "hosting",
  "Dependências / bibliotecas": "dependencies",
  "Integrações compatíveis": "integrations",
  "Banco de dados necessário?": "databaseRequired",
  "Tipo de banco": "databaseType",
  SEO: "seoReady",
  Responsivo: "responsive",
  "Dark mode": "darkMode",
  "Nível de performance": "performance",
  "Nível de personalização": "customizationLevel",
  "Preço base sugerido": "basePrice",
  "Prazo médio de implantação": "deliveryTime",
  Complexidade: "complexity",
  "Prioridade comercial": "priority",
  Tags: "tags",
  "Observações internas": "internalNotes"
};

function parseCadastro(text) {
  const data = {};
  String(text || "").split(/\r?\n/).forEach(line => {
    const splitAt = line.indexOf(": ");
    if (splitAt < 1) return;
    const label = line.slice(0, splitAt).trim();
    const value = line.slice(splitAt + 2).trim();
    if (label.startsWith("Link ") && /ver ao vivo/i.test(label)) data.url = value;
    else if (label.startsWith("Link ") && /vídeo|video/i.test(label)) data.video = value;
    else if (label.startsWith("Link ") && /documenta/i.test(label)) data.documentation = value;
    else if (LABELS[label]) data[LABELS[label]] = value;
  });
  return data;
}

function httpOrEmpty(value) {
  return /^https?:\/\/\S+/i.test(String(value || "").trim()) ? String(value).trim() : "";
}

function copySite(folder, sku) {
  const dest = path.join(ROOT, "modelos", sku);
  fs.mkdirSync(dest, { recursive: true });
  ["index.html", "style.css", "script.js"].forEach(file => {
    fs.copyFileSync(path.join(folder, file), path.join(dest, file));
  });
}

async function pool(items, limit, worker) {
  const queue = [...items];
  const runners = Array.from({ length: limit }, async () => {
    while (queue.length) {
      const item = queue.shift();
      await worker(item);
    }
  });
  await Promise.all(runners);
}

async function main() {
  if (!fs.existsSync(SOURCE)) throw new Error(`Pasta não encontrada: ${SOURCE}`);
  const folders = fs.readdirSync(SOURCE, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && /^(LANDING PAGE|AGENDADOR|LINK NA BIO) \d+$/.test(entry.name))
    .map(entry => entry.name);

  const templates = [];
  const jobs = [];

  folders.forEach(name => {
    const folder = path.join(SOURCE, name);
    const cadastroPath = path.join(folder, "cadastro-do-template.txt");
    if (!fs.existsSync(cadastroPath)) throw new Error(`Sem cadastro: ${name}`);
    const parsed = parseCadastro(fs.readFileSync(cadastroPath, "utf8"));
    if (!parsed.sku || !parsed.name) throw new Error(`Cadastro incompleto: ${name}`);
    const pngs = fs.readdirSync(folder).filter(file => file.toLowerCase().endsWith(".png"));
    const cover = pngs.find(file => file.toUpperCase().startsWith("CAPA"));
    const print = pngs.find(file => file !== cover);
    if (!cover || !print) throw new Error(`Imagens faltando em ${name}: ${pngs.join(", ")}`);

    const id = `TMP-${parsed.sku}`;
    const now = new Date().toISOString();
    const template = {
      id,
      serviceType: parsed.serviceType || "",
      category: parsed.category || "",
      subcategory: parsed.subcategory || "",
      name: parsed.name,
      sku: parsed.sku,
      status: parsed.status || "Ativo",
      pages: parsed.pages || "1",
      version: parsed.version || "1.0",
      url: `${SITE}/modelos/${parsed.sku}/`,
      image: "",
      pagePrint: "",
      video: httpOrEmpty(parsed.video),
      documentation: httpOrEmpty(parsed.documentation),
      description: parsed.description || "",
      pageList: parsed.pageList || "",
      sections: parsed.sections || "",
      features: parsed.features || "",
      editableFields: parsed.editableFields || "",
      technology: parsed.technology || "",
      hosting: parsed.hosting || "",
      dependencies: parsed.dependencies || "",
      integrations: parsed.integrations || "",
      databaseRequired: parsed.databaseRequired || "Não",
      databaseType: parsed.databaseType || "",
      seoReady: parsed.seoReady || "",
      responsive: parsed.responsive || "",
      darkMode: parsed.darkMode || "",
      performance: parsed.performance || "",
      customizationLevel: parsed.customizationLevel || "",
      basePrice: parsed.basePrice || "",
      deliveryTime: parsed.deliveryTime || "",
      complexity: parsed.complexity || "",
      priority: parsed.priority || "",
      tags: parsed.tags || "",
      internalNotes: parsed.internalNotes || "",
      gallery: [],
      createdAt: now,
      updatedAt: now
    };
    copySite(folder, parsed.sku);
    templates.push(template);
    jobs.push({ template, cover: path.join(folder, cover), print: path.join(folder, print) });
  });

  let done = 0;
  await pool(jobs, 4, async job => {
    job.template.image = await uploadPng(job.template.sku, "cover", job.cover);
    job.template.pagePrint = await uploadPng(job.template.sku, "print", job.print);
    done += 1;
    if (done % 10 === 0 || done === jobs.length) console.log(`imagens ${done}/${jobs.length}`);
  });

  templates.sort((a, b) => a.sku.localeCompare(b.sku, "pt-BR", { numeric: true }));
  const seedPath = path.join(ROOT, "catalog-seed.json");
  fs.writeFileSync(seedPath, JSON.stringify(templates));
  console.log("seed", templates.length, seedPath);

  const missing = templates.filter(item => !item.image || !item.pagePrint || !item.name);
  if (missing.length) throw new Error(`Cadastros incompletos: ${missing.map(item => item.sku).join(", ")}`);

  const cachePath = path.join(__dirname, ".live-config-cache.json");
  if (!fs.existsSync(cachePath)) {
    console.log("banco: sem chave de escrita, catálogo público usará catalog-seed.json");
    return;
  }
  const cache = JSON.parse(fs.readFileSync(cachePath, "utf8"));
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const key = serviceKey || cache.key;
  let inserted = 0;
  let denied = 0;
  for (const template of templates) {
    const row = {
      id: template.id,
      name: template.name,
      sku: template.sku,
      status: template.status,
      service_type: template.serviceType,
      category: template.category,
      subcategory: template.subcategory,
      payload: template,
      updated_at: template.updatedAt
    };
    const response = await fetch(`${cache.url}/rest/v1/firestep_templates`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal"
      },
      body: JSON.stringify(row)
    });
    if (response.ok) inserted += 1;
    else {
      denied += 1;
      if (denied === 1) console.log("banco", response.status, (await response.text()).slice(0, 180));
      else await response.text();
    }
  }
  console.log("banco inseridos", inserted, "recusados", denied);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
