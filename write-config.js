const fs = require("fs");
const path = require("path");
const { loadEnv } = require("./load-env");

loadEnv(__dirname);

const onVercel = Boolean(process.env.VERCEL);
const config = {
  supabaseUrl: process.env.SUPABASE_URL || "",
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || "",
  templateWebhook: process.env.TEMPLATE_WEBHOOK || "",
  briefingWebhook: process.env.BRIEFING_WEBHOOK || "",
  interestWebhook: process.env.INTEREST_WEBHOOK || "",
  supportWhatsapp: process.env.SUPPORT_WHATSAPP || "",
  publishApi: onVercel ? "" : process.env.PUBLISH_API || "http://127.0.0.1:8787"
};

const body = `window.FIRESTEP_CONFIG = Object.freeze(${JSON.stringify(config, null, 2)});\n`;
fs.writeFileSync(path.join(__dirname, "config.js"), body);
