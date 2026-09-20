const { getObject, r2Config } = require("../lib/r2");
const { sendJson } = require("../lib/admin-auth");

module.exports = async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    sendJson(res, 405, { ok: false, error: "Method not allowed" });
    return;
  }

  try {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    const key = url.searchParams.get("key") || "";
    if (!/^[A-Z0-9._-]+\/[A-Za-z0-9._-]+$/.test(key)) {
      sendJson(res, 400, { ok: false, error: "Chave inválida" });
      return;
    }

    const pub = r2Config().publicBase;
    if (pub) {
      res.statusCode = 302;
      res.setHeader("Location", `${pub}/${key}`);
      res.setHeader("Cache-Control", "public, max-age=300");
      res.end("");
      return;
    }

    const upstream = await getObject(key);
    if (upstream.status === 404) {
      res.statusCode = 404;
      res.end("Not found");
      return;
    }
    if (!upstream.ok) {
      res.statusCode = 502;
      res.end("R2 error");
      return;
    }

    const type = upstream.headers.get("content-type") || "application/octet-stream";
    res.statusCode = 200;
    res.setHeader("Content-Type", type);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    if (req.method === "HEAD") {
      res.end("");
      return;
    }
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.end(buf);
  } catch (error) {
    sendJson(res, 500, { ok: false, error: error.message || "Falha ao ler o R2" });
  }
};
