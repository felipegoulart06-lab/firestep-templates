const WEBHOOK_URL = "";
const KEY = "ag17_bookings";
const CLOSED = new Set();
const TIMES = ["10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00"];
const SERVICES = [
  { name: "Alongamento", price: 60, minutes: 40 },
  { name: "Reabilitação", price: 45, minutes: 45 },
  { name: "Fortalecimento", price: 50, minutes: 40 },
  { name: "Combo", price: 95, minutes: 80 }
];
const WEEK = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];
const today = new Date();
today.setHours(0, 0, 0, 0);
let selected = SERVICES[0];
let selectedDate = "";
let selectedTime = "";

function money(v) { return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
function ymd(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
function parseYmd(key) { const [y, m, d] = key.split("-").map(Number); return new Date(y, m - 1, d); }
function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
function taken(key, time) { let n = 0; const s = key + time; for (let i = 0; i < s.length; i++) n += s.charCodeAt(i); return n % 8 === 0; }
function slotsFor(date) {
  const key = ymd(date); const now = new Date();
  return TIMES.filter((time) => {
    if (taken(key, time)) return false;
    const [h, mi] = time.split(":").map(Number);
    const slot = new Date(date.getFullYear(), date.getMonth(), date.getDate(), h, mi);
    if (date.getTime() === today.getTime()) return slot > now;
    return date > today;
  });
}
function nextDays() {
  const out = [];
  let d = new Date(today);
  for (let i = 0; i < 20 && out.length < 7; i++) {
    if (!CLOSED.has(d.getDay()) && slotsFor(d).length) out.push(new Date(d));
    d = addDays(d, 1);
  }
  return out;
}
function paintServices() {
  const box = document.getElementById("services");
  box.innerHTML = "";
  SERVICES.forEach((service) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "svc" + (service.name === selected.name ? " on" : "");
    b.innerHTML = service.name + "<small>" + money(service.price) + " · " + service.minutes + " min</small>";
    b.addEventListener("click", () => { selected = service; paintServices(); });
    box.appendChild(b);
  });
}
function paintDays() {
  const days = nextDays();
  if (!selectedDate || !days.some((d) => ymd(d) === selectedDate)) { selectedDate = days.length ? ymd(days[0]) : ""; selectedTime = ""; }
  const box = document.getElementById("days");
  box.innerHTML = "";
  days.forEach((date) => {
    const key = ymd(date);
    const b = document.createElement("button");
    b.type = "button";
    b.className = "day" + (key === selectedDate ? " on" : "");
    b.innerHTML = "<small>" + WEEK[date.getDay()] + "</small><b>" + date.getDate() + "</b>";
    b.addEventListener("click", () => { selectedDate = key; selectedTime = ""; paintDays(); paintSlots(); });
    box.appendChild(b);
  });
}
function paintSlots() {
  const box = document.getElementById("slots");
  box.innerHTML = "";
  if (!selectedDate) return;
  slotsFor(parseYmd(selectedDate)).forEach((time) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "slot" + (time === selectedTime ? " on" : "");
    b.textContent = time;
    b.addEventListener("click", () => { selectedTime = time; paintSlots(); document.getElementById("msg").textContent = ""; });
    box.appendChild(b);
  });
}
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
  if (!selectedTime) { msg.textContent = "Toque em um horário."; return; }
  if (name.length < 2) { msg.textContent = "Escreva seu nome."; return; }
  if (phone.replace(/\D/g, "").length < 10) { msg.textContent = "WhatsApp precisa ter DDD e número."; return; }
  const code = "M" + selectedDate.slice(8) + selectedTime.replace(":", "");
  const data = { event: "novo_agendamento", origem: "quiosque_mar", senha: code, nome: name, whatsapp: phone, servico: selected.name, minutos: selected.minutes, valor: selected.price, data: selectedDate, horario: selectedTime, enviado_em: new Date().toISOString() };
  const all = JSON.parse(localStorage.getItem(KEY) || "[]");
  all.push(data);
  localStorage.setItem(KEY, JSON.stringify(all));
  if (WEBHOOK_URL) {
    try {
      const res = await fetch(WEBHOOK_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      if (!res.ok) throw new Error("webhook");
    } catch (error) { msg.textContent = "Escolha o tipo de sessão, a data e o horário disponível."; }
  }
  document.getElementById("work").hidden = true;
  document.getElementById("done").hidden = false;
  document.getElementById("doneCode").textContent = code;
  document.getElementById("doneTitle").textContent = selected.name;
  document.getElementById("doneMeta").textContent = parseYmd(selectedDate).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" }) + " às " + selectedTime + " · " + name;
});
document.getElementById("again").addEventListener("click", () => {
  selectedTime = "";
  document.getElementById("form").reset();
  document.getElementById("done").hidden = true;
  document.getElementById("work").hidden = false;
  paintServices(); paintDays(); paintSlots();
});
paintServices(); paintDays(); paintSlots();
