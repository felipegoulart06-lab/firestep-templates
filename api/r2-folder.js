const { ensureTemplateFolder, r2Ready } = require("../lib/r2");
const { verifyAdmin, bearer, sendJson, readJson } = require("../lib/admin-auth");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { ok: false, error: "Method not allowed" });
    return;
  }
  try {
    if (!r2Ready()) {
      sendJson(res, 503, { ok: false, error: "R2 não configurado." });
      return;
    }
    const token = bearer(req);
    if (!(await verifyAdmin(token))) {
      sendJson(res, 401, { ok: false, error: "Faça login no admin." });
      return;
    }
    const payload = await readJson(req);
    await ensureTemplateFolder(payload.templateId);
    sendJson(res, 200, { ok: true });
  } catch (error) {
    sendJson(res, 500, { ok: false, error: error.message || "Falha ao criar pasta" });
  }
};
