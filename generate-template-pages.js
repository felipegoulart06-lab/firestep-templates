const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { loadEnv } = require("./load-env");

loadEnv(__dirname);

const ROOT = __dirname;
const SITE_ORIGIN = resolveSiteOrigin();

function resolveSiteOrigin() {
  const fromEnv = process.env.SITE_ORIGIN || "";
  if (fromEnv) return fromEnv.replace(/\/$/, "");

  const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL || "";
  if (vercelHost) {
    return `https://${vercelHost.replace(/^https?:\/\//, "")}`;
  }

  return "https://templates.firestep.cloud";
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

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[character]));
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
  return `${templateSeoDir(template)}/index.html`;
}

function hasVideoLink(value) {
  return /^https?:\/\/\S+/i.test(String(value || "").trim());
}

function pageAsset(url) {
  const value = String(url || "");
  if (value.startsWith("/uploads/")) return `../..${value}`;
  return value;
}

function templateGalleryUrls(template = {}) {
  const urls = [];
  const cover = String(template.image || "").trim();
  const extra = Array.isArray(template.gallery)
    ? template.gallery
    : String(template.gallery || "").split(/\n|,/).map(item => item.trim());

  extra.forEach(url => {
    if (url && !urls.includes(url)) urls.push(url);
  });

  if (cover && !urls.includes(cover)) urls.unshift(cover);
  return urls;
}

function loadSeededTemplates() {
  const source = fs.readFileSync(path.join(ROOT, "seed-data.js"), "utf8");
  const context = { console };
  vm.createContext(context);
  vm.runInContext(`${source}\nthis.SEEDED_TEMPLATES = SEEDED_TEMPLATES;`, context);
  return context.SEEDED_TEMPLATES || [];
}

function row(label, value, { link = false } = {}) {
  const text = String(value || "").trim();
  if (!text) return "";
  const body = link && /^https?:\/\//i.test(text)
    ? `<a href="${escapeHtml(text)}" rel="noopener">${escapeHtml(text)}</a>`
    : escapeHtml(text).replace(/\n/g, "<br>");
  return `<div class="product-row"><dt>${escapeHtml(label)}</dt><dd>${body}</dd></div>`;
}

function section(title, rows) {
  const html = rows.filter(Boolean).join("");
  if (!html) return "";
  return `<section class="product-block"><h2>${escapeHtml(title)}</h2><dl>${html}</dl></section>`;
}

function jsonLd(template, pageUrl) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE_ORIGIN}/#organization`,
        name: "firestep TEMPLATES",
        url: SITE_ORIGIN
      },
      {
        "@type": "WebPage",
        "@id": `${pageUrl}#webpage`,
        url: pageUrl,
        name: `${template.name} | ${template.category} | firestep TEMPLATES`,
        description: template.description || template.name,
        isPartOf: { "@id": `${SITE_ORIGIN}/#website` },
        about: { "@id": `${pageUrl}#product` },
        inLanguage: "pt-BR"
      },
      {
        "@type": "Product",
        "@id": `${pageUrl}#product`,
        name: template.name,
        description: template.description || "",
        image: templateGalleryUrls(template)
          .map(url => url.startsWith("/") ? `${SITE_ORIGIN}${url}` : url)
          .filter(Boolean),
        sku: template.sku || undefined,
        category: template.category || undefined,
        brand: { "@type": "Brand", name: "firestep TEMPLATES" }
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Catálogo", item: `${SITE_ORIGIN}/` },
          { "@type": "ListItem", position: 2, name: template.category || "Categoria", item: `${SITE_ORIGIN}/#${slugify(template.category || "")}` },
          { "@type": "ListItem", position: 3, name: template.subcategory || template.name, item: pageUrl }
        ]
      }
    ]
  };
}

function interestModal() {
  return `
  <div id="interestModal" class="details-modal" hidden>
    <div class="details-backdrop" data-close-interest></div>
    <aside class="details-panel interest-panel" role="dialog" aria-modal="true" aria-labelledby="interestTitle">
      <header class="details-head">
        <div>
          <span class="eyebrow">TENHO INTERESSE</span>
          <h2 id="interestTitle">Fale com a equipe</h2>
          <p class="interest-template">Template: <strong id="interestTemplateName">—</strong></p>
        </div>
        <button class="btn btn-outline btn-small" type="button" data-close-interest aria-label="Fechar">Fechar</button>
      </header>
      <form id="interestForm" class="form interest-form">
        <input id="interestTemplateId" type="hidden">
        <label>Nome completo *<input id="interestName" name="nomeCompleto" type="text" autocomplete="name" required placeholder="Seu nome completo"></label>
        <label>WhatsApp *<input id="interestWhatsapp" name="whatsapp" type="tel" inputmode="tel" autocomplete="tel" required placeholder="(47) 99999-9999"></label>
        <label>E-mail *<input id="interestEmail" name="email" type="email" autocomplete="email" required placeholder="voce@email.com"></label>
        <button id="interestSubmit" class="btn btn-primary btn-full" type="submit">Enviar</button>
      </form>
    </aside>
  </div>`;
}

function buildPage(template) {
  const seoPath = templateSeoPath(template);
  const pageUrl = `${SITE_ORIGIN.replace(/\/$/, "")}/${seoPath}`;
  const title = `${template.name} | ${template.category}${template.subcategory ? " · " + template.subcategory : ""} | firestep TEMPLATES`;
  const description = String(template.description || `${template.name} para ${template.category}.`).slice(0, 160);
  const live = template.url || "";
  const video = hasVideoLink(template.video) ? template.video : "";
  const docs = template.documentation || "";
  const gallery = templateGalleryUrls(template);
  const printUrl = String(template.pagePrint || "").trim();
  const hero = printUrl ? "" : (gallery[0] || template.image || "");
  const extraImages = gallery.filter(url => url && url !== printUrl && url !== hero);

  const blocks = [
    section("Identificação", [
      row("Tipo de serviço", template.serviceType),
      row("Categoria da empresa", template.category),
      row("Especialidade", template.subcategory),
      row("Código / SKU", template.sku),
      row("Quantidade de páginas", template.pages),
      row("Versão", template.version)
    ]),
    section("Estrutura e conteúdo", [
      row("Como funciona", template.description),
      row("Lista de páginas", template.pageList),
      row("Seções principais", template.sections),
      row("Recursos e funcionalidades", template.features),
      row("Campos editáveis pelo cliente", template.editableFields)
    ]),
    section("Tecnologia e integração", [
      row("Tecnologia principal", template.technology),
      row("Hospedagem recomendada", template.hosting),
      row("Dependências / bibliotecas", template.dependencies),
      row("Integrações compatíveis", template.integrations),
      row("Banco de dados necessário?", template.databaseRequired),
      row("Tipo de banco", template.databaseType)
    ]),
    section("SEO, performance e personalização", [
      row("SEO", template.seoReady),
      row("Responsivo", template.responsive),
      row("Dark mode", template.darkMode),
      row("Nível de performance", template.performance),
      row("Nível de personalização", template.customizationLevel)
    ]),
    section("Comercial", [
      row("Prazo médio de implantação", template.deliveryTime),
      row("Complexidade", template.complexity),
      row("Tags", template.tags)
    ]),
    section("Links", [
      row("Ver ao vivo", live, { link: true }),
      row("Vídeo demonstrativo", video, { link: true }),
      row("Documentação", docs, { link: true })
    ])
  ].join("");

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="robots" content="index,follow">
  <link rel="canonical" href="${escapeHtml(pageUrl)}">
  <meta property="og:type" content="product">
  <meta property="og:locale" content="pt_BR">
  <meta property="og:site_name" content="firestep TEMPLATES">
  <meta property="og:title" content="${escapeHtml(template.name || "")}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${escapeHtml(pageUrl)}">
  ${template.image ? `<meta property="og:image" content="${escapeHtml(template.image)}">` : ""}
  <meta name="twitter:card" content="summary_large_image">
  <link rel="icon" href="../../favicon.svg" type="image/svg+xml">
  <link rel="icon" href="../../favicon.png" type="image/png">
  <link rel="apple-touch-icon" href="../../apple-touch-icon.png">
  <meta name="theme-color" content="#1b365d">
  <link rel="stylesheet" href="../../style.css">
  <script type="application/ld+json">${JSON.stringify(jsonLd(template, pageUrl))}</script>
</head>
<body data-page="template">
  <header class="topbar">
    <a class="brand" href="../../index.html">
      <div>
        <strong>firestep TEMPLATES</strong>
        <small>Catálogo de plataformas</small>
      </div>
    </a>
    <a class="btn btn-outline" href="../../index.html">Voltar ao catálogo</a>
  </header>

  <main class="product-page container">
    <nav class="breadcrumb" aria-label="Trilha de navegação">
      <ol>
        <li><a href="../../index.html">Catálogo</a></li>
        <li>${escapeHtml(template.category || "Categoria")}</li>
        <li aria-current="page">${escapeHtml(template.subcategory || template.name || "Template")}</li>
      </ol>
    </nav>

    <article class="product-layout" itemscope itemtype="https://schema.org/Product">
      <div class="product-main">
        ${printUrl ? `<section class="page-scroll-preview">
          <div class="page-scroll-preview-chrome" aria-hidden="true"><span></span><span></span><span></span></div>
          <div class="page-scroll-preview-frame" tabindex="0">
            <img src="${escapeHtml(pageAsset(printUrl))}" alt="Print completo da landing ${escapeHtml(template.name || "")}">
          </div>
          <p class="page-scroll-preview-hint">Passe o mouse ou encoste na tela para percorrer a página</p>
        </section>` : ""}
        ${hero ? `<figure class="product-hero"><button type="button" class="gallery-zoom" data-lightbox="${escapeHtml(pageAsset(hero))}" aria-label="Ampliar preview"><img src="${escapeHtml(pageAsset(hero))}" alt="Preview do template ${escapeHtml(template.name || "")}" itemprop="image" width="1200" height="750"></button></figure>` : ""}
        ${extraImages.length ? `<div class="product-gallery">${extraImages.map((url, index) => `<figure><button type="button" class="gallery-zoom" data-lightbox="${escapeHtml(pageAsset(url))}" aria-label="Ampliar imagem ${index + 2}"><img src="${escapeHtml(pageAsset(url))}" alt="Imagem ${index + 2} do template ${escapeHtml(template.name || "")}"></button></figure>`).join("")}</div>` : ""}
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
  </main>
  ${interestModal()}
  <script src="../../config.js"></script>
  <script src="../../seed-data.js"></script>
  <script src="../../script.js"></script>
</body>
</html>
`;
}

function updateIndexFooter(templates) {
  const indexPath = path.join(ROOT, "index.html");
  let html = fs.readFileSync(indexPath, "utf8");
  const grouped = {};
  templates.forEach(template => {
    const category = template.category || "Outros";
    grouped[category] = grouped[category] || [];
    grouped[category].push(template);
  });

  const inner = Object.keys(grouped)
    .sort((a, b) => a.localeCompare(b, "pt-BR"))
    .map(category => {
      const links = grouped[category]
        .map(template => `<li><a href="${escapeHtml(templateSeoHref(template))}">${escapeHtml(template.name)} — ${escapeHtml(template.subcategory || template.category)}</a></li>`)
        .join("");
      return `<div class="seo-group"><h3>${escapeHtml(category)}</h3><ul>${links}</ul></div>`;
    })
    .join("");

  const block = `<!-- SEO-TEMPLATE-INDEX:START -->\n        <div class="seo-index">${inner}</div>\n        <!-- SEO-TEMPLATE-INDEX:END -->`;

  if (html.includes("SEO-TEMPLATE-INDEX:START")) {
    html = html.replace(/<!-- SEO-TEMPLATE-INDEX:START -->[\s\S]*?<!-- SEO-TEMPLATE-INDEX:END -->/, block);
  }

  const noscript = templates
    .map(template => `<li><a href="${escapeHtml(templateSeoHref(template))}">${escapeHtml(template.name)}</a></li>`)
    .join("");

  if (html.includes("SEO-NOSCRIPT:START")) {
    html = html.replace(
      /<!-- SEO-NOSCRIPT:START -->[\s\S]*?<!-- SEO-NOSCRIPT:END -->/,
      `<!-- SEO-NOSCRIPT:START -->\n  <noscript><h2>Templates</h2><ul>${noscript}</ul></noscript>\n  <!-- SEO-NOSCRIPT:END -->`
    );
  }

  html = html
    .replace(/(<link rel="canonical" href=")[^"]*(")/, `$1${SITE_ORIGIN}/$2`)
    .replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${SITE_ORIGIN}/$2`)
    .replace(/("url":\s*")https?:\/\/[^"]*(")/g, `$1${SITE_ORIGIN}/$2`);

  fs.writeFileSync(indexPath, html);
}

function writeSitemap(templates) {
  const urls = [
    { loc: `${SITE_ORIGIN}/`, priority: "1.0" },
    ...templates.map(template => ({
      loc: `${SITE_ORIGIN.replace(/\/$/, "")}/${templateSeoPath(template)}`,
      lastmod: String(template.updatedAt || "").slice(0, 10),
      priority: "0.8"
    }))
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(item => `  <url>
    <loc>${item.loc}</loc>
    ${item.lastmod ? `<lastmod>${item.lastmod}</lastmod>` : ""}
    <changefreq>weekly</changefreq>
    <priority>${item.priority}</priority>
  </url>`)
  .join("\n")}
</urlset>
`;
  fs.writeFileSync(path.join(ROOT, "sitemap.xml"), xml);
}

function writeRobots() {
  fs.writeFileSync(
    path.join(ROOT, "robots.txt"),
    `User-agent: *
Allow: /
Disallow: /admin

Sitemap: ${SITE_ORIGIN.replace(/\/$/, "")}/sitemap.xml
`
  );
}

function writeTemplatePage(template) {
  const dir = path.join(ROOT, templateSeoDir(template));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "index.html"), buildPage(template));
  return templateSeoHref(template);
}

function removeStaleTemplatePages(keepTemplates) {
  const keep = new Set((keepTemplates || []).map(template => templateSeoDir(template).replace(/\\/g, "/")));
  const protectedDirs = new Set([".git", ".vercel", "node_modules", "supabase", "data", "uploads"]);

  fs.readdirSync(ROOT, { withFileTypes: true }).forEach(entry => {
    if (!entry.isDirectory() || protectedDirs.has(entry.name)) return;

    const categoryDir = path.join(ROOT, entry.name);
    fs.readdirSync(categoryDir, { withFileTypes: true }).forEach(child => {
      if (!child.isDirectory()) return;
      const rel = `${entry.name}/${child.name}`;
      const indexFile = path.join(categoryDir, child.name, "index.html");
      if (!fs.existsSync(indexFile) || keep.has(rel)) return;
      fs.rmSync(path.join(categoryDir, child.name), { recursive: true, force: true });
    });

    if (!fs.readdirSync(categoryDir).length) {
      fs.rmSync(categoryDir, { recursive: true, force: true });
    }
  });
}

function publishTemplates(templates) {
  const publicTemplates = (templates || []).filter(
    template => template.status !== "Arquivado" && template.status !== "Rascunho"
  );

  removeStaleTemplatePages(publicTemplates);
  publicTemplates.forEach(writeTemplatePage);
  updateIndexFooter(publicTemplates);
  writeSitemap(publicTemplates);
  writeRobots();
  return publicTemplates.map(templateSeoHref);
}

module.exports = {
  writeTemplatePage,
  publishTemplates,
  loadSeededTemplates,
  templateSeoHref,
  templateSeoPath,
  templateSeoDir
};

if (require.main === module) {
  const hrefs = publishTemplates(loadSeededTemplates());
  console.log(`${hrefs.length} páginas de template geradas.`);
}
