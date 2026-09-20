const crypto = require("crypto");
const { loadEnv } = require("../load-env");
const path = require("path");

loadEnv(path.join(__dirname, ".."));

const ACCOUNT_ID = process.env.R2_ACCOUNT_ID || "97ffef1ae71def38ec8915c7c530fbd8";
const BUCKET = process.env.R2_BUCKET || "templates";
const ENDPOINT =
  process.env.R2_ENDPOINT ||
  `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`;
const REGION = "auto";
const SERVICE = "s3";

function r2Config() {
  const accessKeyId = process.env.R2_ACCESS_KEY_ID || "";
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || "";
  return {
    accessKeyId,
    secretAccessKey,
    accountId: ACCOUNT_ID,
    bucket: BUCKET,
    endpoint: ENDPOINT.replace(/\/$/, ""),
    publicBase: String(process.env.R2_PUBLIC_BASE_URL || "").replace(/\/$/, "")
  };
}

function r2Ready() {
  const cfg = r2Config();
  return Boolean(cfg.accessKeyId && cfg.secretAccessKey);
}

function hmac(key, value) {
  return crypto.createHmac("sha256", key).update(value).digest();
}

function sha256Hex(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function amzDateNow() {
  return new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function signingKey(secret, dateStamp) {
  const kDate = hmac(`AWS4${secret}`, dateStamp);
  const kRegion = hmac(kDate, REGION);
  const kService = hmac(kRegion, SERVICE);
  return hmac(kService, "aws4_request");
}

function encodeKey(key) {
  return String(key)
    .split("/")
    .map(part => encodeURIComponent(part))
    .join("/");
}

function canonicalQuery(params) {
  return Object.keys(params)
    .sort()
    .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
    .join("&");
}

function hostFromEndpoint(endpoint) {
  return new URL(endpoint).host;
}

function sanitizeTemplateId(value) {
  const id = String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9._-]/g, "")
    .slice(0, 80);
  if (!id) throw new Error("ID do template inválido.");
  return id;
}

function sanitizeKind(value) {
  const kind = String(value || "gallery").toLowerCase();
  if (kind === "cover" || kind === "print" || kind === "gallery") return kind;
  return "gallery";
}

function objectKey(templateId, kind, ext) {
  const id = sanitizeTemplateId(templateId);
  const safeExt = String(ext || "jpg").replace(/[^a-z0-9]/gi, "").toLowerCase() || "jpg";
  const stamp = `${Date.now().toString(36)}-${crypto.randomBytes(4).toString("hex")}`;
  return `${id}/${sanitizeKind(kind)}-${stamp}.${safeExt}`;
}

function folderKey(templateId) {
  return `${sanitizeTemplateId(templateId)}/.keep`;
}

function publicUrlFor(key) {
  const cfg = r2Config();
  if (cfg.publicBase) return `${cfg.publicBase}/${encodeKey(key)}`;
  return `/api/r2?key=${encodeURIComponent(key)}`;
}

function authorization({ method, canonicalUri, query, headers, payloadHash, amzDate }) {
  const cfg = r2Config();
  const dateStamp = amzDate.slice(0, 8);
  const signedHeaderNames = Object.keys(headers)
    .map(name => name.toLowerCase())
    .sort();
  const canonicalHeaders = signedHeaderNames
    .map(name => `${name}:${headers[name].trim()}\n`)
    .join("");
  const signedHeaders = signedHeaderNames.join(";");
  const canonicalRequest = [
    method,
    canonicalUri,
    query,
    canonicalHeaders,
    signedHeaders,
    payloadHash
  ].join("\n");
  const scope = `${dateStamp}/${REGION}/${SERVICE}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    sha256Hex(canonicalRequest)
  ].join("\n");
  const signature = hmac(signingKey(cfg.secretAccessKey, dateStamp), stringToSign).toString("hex");
  return {
    authorization: `AWS4-HMAC-SHA256 Credential=${cfg.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    signedHeaders,
    signature,
    scope
  };
}

async function signedFetch({ method, key, body, contentType, extraHeaders = {} }) {
  const cfg = r2Config();
  if (!r2Ready()) throw new Error("R2 sem R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY.");

  const host = hostFromEndpoint(cfg.endpoint);
  const encoded = encodeKey(key);
  const canonicalUri = `/${cfg.bucket}/${encoded}`;
  const url = `${cfg.endpoint}${canonicalUri}`;
  const amzDate = amzDateNow();
  const payload = body || Buffer.alloc(0);
  const payloadHash = sha256Hex(payload);
  const headers = {
    host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
    ...extraHeaders
  };
  if (contentType) headers["content-type"] = contentType;

  const headerMap = {};
  Object.keys(headers).forEach(name => {
    headerMap[name.toLowerCase()] = String(headers[name]);
  });

  const auth = authorization({
    method,
    canonicalUri,
    query: "",
    headers: headerMap,
    payloadHash,
    amzDate
  });

  const requestHeaders = {
    Authorization: auth.authorization,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
    ...extraHeaders
  };
  if (contentType) requestHeaders["Content-Type"] = contentType;

  return fetch(url, { method, headers: requestHeaders, body: method === "GET" || method === "HEAD" ? undefined : payload });
}

async function putObject(key, body, contentType) {
  const response = await signedFetch({
    method: "PUT",
    key,
    body,
    contentType: contentType || "application/octet-stream"
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Falha ao gravar no R2 (${response.status}): ${text.slice(0, 240)}`);
  }
}

async function getObject(key) {
  const response = await signedFetch({ method: "GET", key });
  return response;
}

async function ensureTemplateFolder(templateId) {
  await putObject(folderKey(templateId), Buffer.from(""), "application/x-directory");
}

function presignedPutUrl(key, contentType, expires = 300) {
  const cfg = r2Config();
  if (!r2Ready()) throw new Error("R2 sem R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY.");

  const host = hostFromEndpoint(cfg.endpoint);
  const encoded = encodeKey(key);
  const canonicalUri = `/${cfg.bucket}/${encoded}`;
  const amzDate = amzDateNow();
  const dateStamp = amzDate.slice(0, 8);
  const credential = `${cfg.accessKeyId}/${dateStamp}/${REGION}/${SERVICE}/aws4_request`;
  const params = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": credential,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(expires),
    "X-Amz-SignedHeaders": "content-type;host",
    "X-Amz-Content-Sha256": "UNSIGNED-PAYLOAD"
  };
  const query = canonicalQuery(params);
  const headers = {
    "content-type": contentType,
    host
  };
  const auth = authorization({
    method: "PUT",
    canonicalUri,
    query,
    headers,
    payloadHash: "UNSIGNED-PAYLOAD",
    amzDate
  });
  return `${cfg.endpoint}${canonicalUri}?${query}&X-Amz-Signature=${auth.signature}`;
}

async function putBucketCors() {
  const originSite = process.env.SITE_ORIGIN || "https://templates.firestep.cloud";
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<CORSConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
  <CORSRule>
    <AllowedOrigin>${originSite}</AllowedOrigin>
    <AllowedOrigin>http://127.0.0.1:8787</AllowedOrigin>
    <AllowedOrigin>http://localhost:8787</AllowedOrigin>
    <AllowedMethod>GET</AllowedMethod>
    <AllowedMethod>PUT</AllowedMethod>
    <AllowedMethod>HEAD</AllowedMethod>
    <AllowedHeader>*</AllowedHeader>
    <ExposeHeader>ETag</ExposeHeader>
    <MaxAgeSeconds>3600</MaxAgeSeconds>
  </CORSRule>
</CORSConfiguration>`;
  const body = Buffer.from(xml, "utf8");
  const cfg = r2Config();
  const host = hostFromEndpoint(cfg.endpoint);
  const canonicalUri = `/${cfg.bucket}`;
  const url = `${cfg.endpoint}${canonicalUri}?cors`;
  const amzDate = amzDateNow();
  const payloadHash = sha256Hex(body);
  const md5 = crypto.createHash("md5").update(body).digest("base64");
  const headers = {
    host,
    "content-md5": md5,
    "content-type": "application/xml",
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate
  };
  const auth = authorization({
    method: "PUT",
    canonicalUri,
    query: "cors=",
    headers,
    payloadHash,
    amzDate
  });
  const response = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: auth.authorization,
      "Content-MD5": md5,
      "Content-Type": "application/xml",
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate
    },
    body
  });
  if (!response.ok && response.status !== 204) {
    const text = await response.text();
    throw new Error(`CORS do R2: ${response.status} ${text.slice(0, 200)}`);
  }
}

module.exports = {
  r2Ready,
  r2Config,
  sanitizeTemplateId,
  sanitizeKind,
  objectKey,
  publicUrlFor,
  ensureTemplateFolder,
  presignedPutUrl,
  putObject,
  getObject,
  putBucketCors
};
