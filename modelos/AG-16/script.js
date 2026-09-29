const WEBHOOK_URL = "";
const KEY = "ag16_bookings";
const CLOSED = new Set([0, 6]);
const OPEN = 9 * 60;
const CLOSE = 18 * 60;
const STEP = 30;
const SERVICES = [
  { name: "Alongamento", price: 45, minutes: 30 },
  { name: "Avaliação", price: 80, minutes: 60 },
  { name: "Fortalecimento", price: 260, minutes: 120 }
];
const today = new Date();
today.setHours(0, 0, 0, 0);
let selected = SERVICES[1];
let cursor = new Date(today);
let selectedStart = null;

function money(v) { return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
function ymd(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
function fmt(min) { return String(Math.floor(min / 60)).padStart(2, "0") + ":" + String(min % 60).padStart(2, "0"); }
function taken(key, start) { let n = 0; const s = key + start; for (let i = 0; i < s.length; i++) n += s.charCodeAt(i); return n % 4 === 0; }
function slotsFor(date, service) {
  const key = ymd(date);
  const now = new Date();
  const out = [];
  if (date < today || CLOSED.has(date.getDay())) return out;
  for (let start = OPEN; start + service.minutes <= CLOSE; start += STEP) {
    const slot = new Date(date.getFullYear(), date.getMonth(), date.getDate(), Math.floor(start / 60), start % 60);
    if (date.getTime() === today.getTime() && slot <= now) continue;
    if (taken(key, String(start))) continue;
    out.push(start);
  }
  return out;
}
function firstOpen() {
  let d = new Date(today);
  for (let i = 0; i < 40; i++) {
    if (slotsFor(d, selected).length) return d;
    d = addDays(d, 1);
  }
  return today;
}
function move(dir) {
  let d = addDays(cursor, dir);
  for (let i = 0; i < 40; i++) {
    if (d < today) return;
    if (slotsFor(d, selected).length) { cursor = d; selectedStart = null; paint(); return; }
    d = addDays(d, dir);
  }
}
function paintServices() {
  const box = document.getElementById("services");
  box.innerHTML = "";
  SERVICES.forEach((service) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "svc" + (service.name === selected.name ? " on" : "");
    const width = Math.round((service.minutes / 120) * 100);
    b.innerHTML = "<b>" + service.name + "</b><span>" + service.minutes + " min · " + money(service.price) + "</span><span class='track'><i style='width:" + width + "%'></i></span>";
    b.addEventListener("click", () => {
      selected = service;
      selectedStart = null;
      if (!slotsFor(cursor, selected).length) cursor = firstOpen();
      paintServices();
      paint();
    });
    box.appendChild(b);
  });
}
function paint() {
  document.getElementById("dayTitle").textContent = cursor.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
  document.getElementById("prev").disabled = ymd(cursor) === ymd(firstOpen());
  const box = document.getElementById("slots");
  box.innerHTML = "";
  const slots = slotsFor(cursor, selected);
  if (!slots.length) { box.innerHTML = "<p>Este serviço não cabe neste dia.</p>"; return; }
  slots.forEach((start) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "slot" + (selectedStart === start ? " on" : "");
    b.textContent = fmt(start) + " – " + fmt(start + selected.minutes);
    b.addEventListener("click", () => { selectedStart = start; document.getElementById("msg").textContent = ""; paint(); });
    box.appendChild(b);
  });
}
document.getElementById("prev").addEventListener("click", () => move(-1));
document.getElementById("next").addEventListener("click", () => move(1));
document.getElementById("phone").addEventListener("input", () => {
  const input = document.getElementById("phone");
  const d = input.value.replace(/\D/g, "").slice(0, 11);
  if (!d) input.value = "";
  else if (d.length <= 2) input.value = "(" + d;
  else if (d.length <= 7) input.value = "(" + d.slice(0, 2) + ") " + d.slice(2);
  else if (d.length <= 10) input.value = "(" + d.slice(0, 2) + ") " + d.slice(2, 6) + "-" + d.slice(6);
  else input.value = "(" + d.slice(0, 2) + ") " + d.slice(2, 7) + "-" + d.slice(7);
});
document.getElementById("form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const msg = document.getElementById("msg");
  msg.textContent = "";
  const name = document.getElementById("name").value.trim();
  const phone = document.getElementById("phone").value.trim();
  if (selectedStart == null) { msg.textContent = "Escolha um intervalo livre."; return; }
  if (name.length < 2) { msg.textContent = "Escreva seu nome."; return; }
  if (phone.replace(/\D/g, "").length < 10) { msg.textContent = "WhatsApp precisa ter DDD e número."; return; }
  const label = fmt(selectedStart) + "–" + fmt(selectedStart + selected.minutes);
  const data = { event: "novo_agendamento", origem: "encaixe", nome: name, whatsapp: phone, servico: selected.name, minutos: selected.minutes, valor: selected.price, data: ymd(cursor), horario: label, enviado_em: new Date().toISOString() };
  const all = JSON.parse(localStorage.getItem(KEY) || "[]");
  all.push(data);
  localStorage.setItem(KEY, JSON.stringify(all));
  if (WEBHOOK_URL) {
    try {
      const res = await fetch(WEBHOOK_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      if (!res.ok) throw new Error("webhook");
    } catch (error) { msg.textContent = "Você agenda avaliação, retorno ou orientação de movimento."; }
  }
  document.getElementById("work").hidden = true;
  document.querySelector("header").hidden = true;
  document.getElementById("done").hidden = false;
  document.getElementById("doneTitle").textContent = selected.name;
  document.getElementById("doneMeta").textContent = cursor.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" }) + " · " + label + " · " + name;
});
document.getElementById("again").addEventListener("click", () => {
  selectedStart = null;
  document.getElementById("form").reset();
  document.getElementById("done").hidden = true;
  document.getElementById("work").hidden = false;
  document.querySelector("header").hidden = false;
  paintServices();
  paint();
});
cursor = firstOpen();
paintServices();
paint();
