const {
  r2Ready,
  objectKey,
  publicUrlFor,
  ensureTemplateFolder,
  presignedPutUrl,
  putBucketCors
} = require("../lib/r2");
const { verifyAdmin, bearer, sendJson, readJson } = require("../lib/admin-auth");

function extFromType(type, fileName) {
  const fromName = String(fileName || "").split(".").pop() || "";
  if (/^(png|jpe?g|webp|gif)$/i.test(fromName)) {
    return fromName.toLowerCase() === "jpeg" ? "jpg" : fromName.toLowerCase();
  }
  const mime = String(type || "").toLowerCase();
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("gif")) return "gif";
  return "jpg";
}

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end("");
    return;
  }
  if (req.method !== "POST") {
    sendJson(res, 405, { ok: false, error: "Method not allowed" });
    return;
  }

  try {
    if (!r2Ready()) {
      sendJson(res, 503, {
        ok: false,
        error: "R2 não configurado. Defina R2_ACCESS_KEY_ID e R2_SECRET_ACCESS_KEY."
      });
      return;
    }

    const token = bearer(req);
    if (!(await verifyAdmin(token))) {
      sendJson(res, 401, { ok: false, error: "Faça login no admin para enviar mídia." });
      return;
    }

    const payload = await readJson(req);
    const templateId = payload.templateId;
    const kind = payload.kind || "gallery";
    const contentType = String(payload.contentType || "image/jpeg");
    const allowed = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"];
    if (!allowed.includes(contentType.toLowerCase())) {
      sendJson(res, 400, { ok: false, error: "Envie PNG, JPG, WEBP ou GIF." });
      return;
    }

    await ensureTemplateFolder(templateId);
    try {
      await putBucketCors();
    } catch {
      // CORS pode já existir; o PUT do arquivo segue.
    }

    const key = objectKey(templateId, kind, extFromType(contentType, payload.fileName));
    const uploadUrl = presignedPutUrl(key, contentType, 300);
    sendJson(res, 200, {
      ok: true,
      key,
      uploadUrl,
      publicUrl: publicUrlFor(key)
    });
  } catch (error) {
    sendJson(res, 500, { ok: false, error: error.message || "Falha no R2" });
  }
};
