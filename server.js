const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { loadEnv } = require("./load-env");
const { publishTemplates, writeTemplatePage, loadSeededTemplates } = require("./generate-template-pages");

loadEnv(__dirname);

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 8787;
const PEDIDOS_FILE = path.join(ROOT, "data", "pedidos.json");
let currentRequest = null;

function requestPath(request) {
  try {
    return new URL(request.url || "/", "http://127.0.0.1").pathname;
  } catch {
    return String(request.url || "/").split("?")[0];
  }
}

function readPedidosFile() {
  try {
    const parsed = JSON.parse(fs.readFileSync(PEDIDOS_FILE, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writePedidosFile(list) {
  fs.mkdirSync(path.dirname(PEDIDOS_FILE), { recursive: true });
  fs.writeFileSync(PEDIDOS_FILE, JSON.stringify(list, null, 2));
}

function upsertPedido(lead) {
  if (!lead || !lead.id) return readPedidosFile();
  const list = readPedidosFile();
  const index = list.findIndex(item => item.id === lead.id);
  if (index >= 0) {
    list[index] = { ...list[index], ...lead };
  } else {
    list.unshift(lead);
  }
  writePedidosFile(list);
  return list;
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon"
};

function corsHeaders() {
  const origin = currentRequest?.headers?.origin || "";
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    return {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      Vary: "Origin"
    };
  }
  return {};
}

function send(response, status, body, headers = {}) {
  response.writeHead(status, {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    ...corsHeaders(),
    ...headers
  });
  response.end(body);
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    request.on("data", chunk => {
      size += chunk.length;
      if (size > 20_000_000) {
        reject(new Error("Payload grande demais"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });

    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

function safeJoin(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const relative = decoded.replace(/^\/+/, "");
  const full = path.normalize(path.join(ROOT, relative));
  if (!full.startsWith(ROOT)) return null;
  return full;
}

function isBlocked(filePath) {
  const relative = path.relative(ROOT, filePath).replace(/\\/g, "/");
  if (relative.startsWith("..")) return true;
  const parts = relative.split("/");
  if (parts.some(part => part === ".git" || part === "node_modules")) return true;
  const name = path.basename(filePath);
  return [
    ".env",
    ".env.example",
    ".env.local",
    ".gitignore",
    "server.js",
    "load-env.js",
    "write-config.js"
  ].includes(name);
}

function serveStatic(request, response) {
  let filePath = safeJoin(request.url || "/");
  if (!filePath) {
    send(response, 403, "Forbidden");
    return;
  }

  if (request.url === "/" || request.url === "") {
    filePath = path.join(ROOT, "index.html");
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, "index.html");
  }

  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile() || isBlocked(filePath)) {
    send(response, 404, "Página não encontrada", { "Content-Type": "text/plain; charset=utf-8" });
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const type = MIME[ext] || "application/octet-stream";
  send(response, 200, fs.readFileSync(filePath), { "Content-Type": type });
}

const server = http.createServer(async (request, response) => {
  currentRequest = request;
  if (request.method === "OPTIONS") {
    send(response, 204, "");
    return;
  }

  try {
    if (request.method === "POST" && request.url === "/api/upload-image") {
      const payload = JSON.parse(await readBody(request) || "{}");
      const match = String(payload.dataUrl || "").match(/^data:(image\/(?:png|jpeg|jpg|webp|gif));base64,(.+)$/i);
      if (!match) {
        send(response, 400, JSON.stringify({ ok: false, error: "Imagem inválida" }), {
          "Content-Type": "application/json"
        });
        return;
      }

      const mime = match[1].toLowerCase();
      const ext = mime.includes("png") ? ".png" : mime.includes("webp") ? ".webp" : mime.includes("gif") ? ".gif" : ".jpg";
      const dir = path.join(ROOT, "uploads", "templates");
      fs.mkdirSync(dir, { recursive: true });
      const fileName = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}${ext}`;
      fs.writeFileSync(path.join(dir, fileName), Buffer.from(match[2], "base64"));
      send(response, 200, JSON.stringify({ ok: true, url: `/uploads/templates/${fileName}` }), {
        "Content-Type": "application/json"
      });
      return;
    }

    if (request.method === "POST" && request.url === "/api/publish-template") {
      const template = JSON.parse(await readBody(request) || "{}");
      const href = writeTemplatePage(template);
      send(response, 200, JSON.stringify({ ok: true, href }), { "Content-Type": "application/json" });
      return;
    }

    if (request.method === "POST" && request.url === "/api/publish-templates") {
      const payload = JSON.parse(await readBody(request) || "{}");
      const templates = Array.isArray(payload.templates) ? payload.templates : [];
      const hrefs = publishTemplates(templates.length ? templates : loadSeededTemplates());
      send(response, 200, JSON.stringify({ ok: true, hrefs }), { "Content-Type": "application/json" });
      return;
    }

    const pathname = requestPath(request);

    if (pathname === "/api/pedidos" && request.method === "GET") {
      send(response, 200, JSON.stringify({ ok: true, pedidos: readPedidosFile() }), {
        "Content-Type": "application/json"
      });
      return;
    }

    if (pathname === "/api/pedidos" && (request.method === "POST" || request.method === "PATCH")) {
      const lead = JSON.parse(await readBody(request) || "{}");
      const pedidos = upsertPedido(lead);
      send(response, 200, JSON.stringify({ ok: true, pedidos }), {
        "Content-Type": "application/json"
      });
      return;
    }

    if (request.method === "GET") {
      serveStatic(request, response);
      return;
    }

    send(response, 405, "Method not allowed");
  } catch (error) {
    console.error(error);
    send(response, 500, JSON.stringify({ ok: false, error: error.message }), {
      "Content-Type": "application/json"
    });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  publishTemplates(loadSeededTemplates());
  console.log(`firestep TEMPLATES em http://127.0.0.1:${PORT}`);
});
